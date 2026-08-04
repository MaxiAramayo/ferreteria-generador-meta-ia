import { createHash } from "node:crypto";

import type {
  IngestKnowledgeDocumentCommand,
  KnowledgeDocumentRepository,
  KnowledgeDocumentVersionRecord,
  KnowledgeFileAttributes,
  KnowledgeSyncFailureCode,
  KnowledgeVectorStoreFile,
  KnowledgeVectorStorePort,
} from "@aramayo/domain";
import { validateKnowledgeDocument } from "@aramayo/domain";

import { OpenAIFileSearchError } from "./openai-file-search.adapter.ts";

export type KnowledgeIngestionStatus = "activated" | "duplicate";

export interface KnowledgeIngestionResult {
  readonly cleanupPending: boolean;
  readonly record: KnowledgeDocumentVersionRecord;
  readonly status: KnowledgeIngestionStatus;
}

export type KnowledgeReconciliationResult =
  | Readonly<{
      readonly record: KnowledgeDocumentVersionRecord;
      readonly status: "activated" | "retired";
    }>
  | Readonly<{
      readonly record: KnowledgeDocumentVersionRecord;
      readonly status: "needs-source-content" | "pending";
    }>
  | Readonly<{ readonly status: "not-found" }>;

export class KnowledgeIngestionError extends Error {
  readonly code: KnowledgeSyncFailureCode;
  readonly retryable: boolean;
  readonly versionId: string;

  constructor(
    code: KnowledgeSyncFailureCode,
    retryable: boolean,
    versionId: string,
  ) {
    super("La sincronización del documento aprobado no pudo completarse.");
    this.code = code;
    this.name = "KnowledgeIngestionError";
    this.retryable = retryable;
    this.versionId = versionId;
  }
}

interface KnowledgeIngestionDependencies {
  readonly maximumPollAttempts?: number;
  readonly now?: () => Date;
  readonly pollIntervalMilliseconds?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function unixSeconds(timestamp: string | null): number {
  return timestamp === null
    ? 253_402_300_799
    : Math.floor(Date.parse(timestamp) / 1_000);
}

function attributesFor(
  record: KnowledgeDocumentVersionRecord,
  status: KnowledgeFileAttributes["status"],
): KnowledgeFileAttributes {
  return Object.freeze({
    brand: record.brand,
    content_hash: record.contentHash,
    document_type: record.documentType,
    effective_from: unixSeconds(record.effectiveFrom),
    effective_until: unixSeconds(record.effectiveUntil),
    location_ids:
      record.locationIds.length === 0
        ? "*"
        : `|${record.locationIds.join("|")}|`,
    organization_id: record.organizationId,
    sensitivity: record.sensitivity,
    source_owner: record.sourceOwner,
    status,
    version: record.version,
  });
}

function failureFrom(cause: unknown): Readonly<{
  code: KnowledgeSyncFailureCode;
  retryable: boolean;
}> {
  if (cause instanceof OpenAIFileSearchError) {
    return Object.freeze({
      code: cause.code,
      retryable: cause.retryable,
    });
  }
  if (cause instanceof KnowledgeIngestionError) {
    return Object.freeze({
      code: cause.code,
      retryable: cause.retryable,
    });
  }
  return Object.freeze({ code: "provider-error", retryable: false });
}

export class KnowledgeIngestionService {
  readonly #maximumPollAttempts: number;
  readonly #now: () => Date;
  readonly #pollIntervalMilliseconds: number;
  readonly #repository: KnowledgeDocumentRepository;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #vectorStore: KnowledgeVectorStorePort;
  readonly #vectorStoreId: string;

  constructor(
    repository: KnowledgeDocumentRepository,
    vectorStore: KnowledgeVectorStorePort,
    vectorStoreId: string,
    dependencies: KnowledgeIngestionDependencies = {},
  ) {
    this.#maximumPollAttempts = dependencies.maximumPollAttempts ?? 120;
    this.#now = dependencies.now ?? ((): Date => new Date());
    this.#pollIntervalMilliseconds =
      dependencies.pollIntervalMilliseconds ?? 1_000;
    this.#repository = repository;
    this.#sleep = dependencies.sleep ?? defaultSleep;
    this.#vectorStore = vectorStore;
    this.#vectorStoreId = vectorStoreId;
  }

  async ingest(
    command: IngestKnowledgeDocumentCommand,
  ): Promise<KnowledgeIngestionResult> {
    const contentHash = createHash("sha256")
      .update(command.content)
      .digest("hex");
    const validated = validateKnowledgeDocument(command, contentHash);
    const reservation = await this.#repository.reserveVersion({
      approvalReference: validated.approvalReference,
      approvedAt: validated.approvedAt,
      brand: validated.brand,
      byteSize: validated.byteSize,
      contentHash: validated.contentHash,
      documentType: validated.documentType,
      effectiveFrom: validated.effectiveFrom,
      effectiveUntil: validated.effectiveUntil,
      filename: validated.filename,
      locationIds: validated.locationIds,
      mimeType: validated.mimeType,
      organizationId: validated.organizationId,
      providerVectorStoreId: this.#vectorStoreId,
      sensitivity: validated.sensitivity,
      sourceKey: validated.sourceKey,
      sourceOwner: validated.sourceOwner,
      title: validated.title,
    });
    if (
      reservation.status === "duplicate" &&
      ["active", "retired", "superseded"].includes(reservation.record.status)
    ) {
      return Object.freeze({
        cleanupPending: reservation.record.failureCode !== null,
        record: reservation.record,
        status: "duplicate",
      });
    }

    let record = reservation.record;
    try {
      if (record.providerFileId === null || record.remoteStatus === "failed") {
        const providerFileId = await this.#vectorStore.uploadFile({
          content: validated.content,
          filename: validated.filename,
          mimeType: validated.mimeType,
        });
        record = await this.#repository.markUploaded(
          record.organizationId,
          record.id,
          providerFileId,
        );
      }
      const completed = await this.#ensureIndexed(record);
      await this.#vectorStore.updateFileAttributes(
        completed.providerVectorStoreId,
        this.#requiredProviderFileId(completed),
        attributesFor(completed, "approved"),
      );
      const activation = await this.#repository.activateVersion(
        completed.organizationId,
        completed.id,
        this.#now().toISOString(),
      );
      let cleanupPending = false;
      if (
        activation.superseded !== null &&
        activation.superseded.providerFileId !== null
      ) {
        try {
          await this.#vectorStore.updateFileAttributes(
            activation.superseded.providerVectorStoreId,
            activation.superseded.providerFileId,
            attributesFor(activation.superseded, "superseded"),
          );
        } catch (cause: unknown) {
          cleanupPending = true;
          const failure = failureFrom(cause);
          await this.#repository.markFailure({
            code: failure.code,
            message:
              "La versión anterior quedó excluida localmente, pero falta actualizar sus metadatos remotos.",
            organizationId: activation.superseded.organizationId,
            retryable: failure.retryable,
            versionId: activation.superseded.id,
          });
        }
      }
      return Object.freeze({
        cleanupPending,
        record: activation.active,
        status: "activated",
      });
    } catch (cause: unknown) {
      const failure = failureFrom(cause);
      await this.#repository.markFailure({
        code: failure.code,
        message:
          "La sincronización quedó incompleta y puede reconciliarse con su registro local.",
        organizationId: record.organizationId,
        retryable: failure.retryable,
        versionId: record.id,
      });
      throw new KnowledgeIngestionError(
        failure.code,
        failure.retryable,
        record.id,
      );
    }
  }

  async reconcile(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeReconciliationResult> {
    const record = await this.#repository.findVersion(
      organizationId,
      versionId,
    );
    if (record === null) {
      return Object.freeze({ status: "not-found" });
    }
    if (record.status === "retiring") {
      if (record.providerFileId !== null) {
        await this.#vectorStore.detachFile(
          record.providerVectorStoreId,
          record.providerFileId,
        );
      }
      return Object.freeze({
        record: await this.#repository.completeRetirement(
          record.organizationId,
          record.id,
          this.#now().toISOString(),
        ),
        status: "retired",
      });
    }
    if (record.providerFileId === null) {
      return Object.freeze({ record, status: "needs-source-content" });
    }
    if (["active", "retired", "superseded"].includes(record.status)) {
      return Object.freeze({ record, status: "pending" });
    }
    try {
      const completed = await this.#ensureIndexed(record);
      await this.#vectorStore.updateFileAttributes(
        completed.providerVectorStoreId,
        this.#requiredProviderFileId(completed),
        attributesFor(completed, "approved"),
      );
      const activation = await this.#repository.activateVersion(
        completed.organizationId,
        completed.id,
        this.#now().toISOString(),
      );
      return Object.freeze({
        record: activation.active,
        status: "activated",
      });
    } catch (cause: unknown) {
      const failure = failureFrom(cause);
      const failed = await this.#repository.markFailure({
        code: failure.code,
        message:
          "La reconciliación confirmó que el estado remoto todavía no permite activar la versión.",
        organizationId: record.organizationId,
        retryable: failure.retryable,
        versionId: record.id,
      });
      return Object.freeze({ record: failed, status: "pending" });
    }
  }

  async retire(
    organizationId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null> {
    const retiring = await this.#repository.beginRetirement(
      organizationId,
      documentId,
    );
    if (retiring === null) {
      return null;
    }
    try {
      if (retiring.providerFileId !== null) {
        await this.#vectorStore.detachFile(
          retiring.providerVectorStoreId,
          retiring.providerFileId,
        );
      }
      return await this.#repository.completeRetirement(
        retiring.organizationId,
        retiring.id,
        this.#now().toISOString(),
      );
    } catch (cause: unknown) {
      const failure = failureFrom(cause);
      await this.#repository.markFailure({
        code: failure.code,
        message:
          "La fuente ya está excluida localmente, pero su retiro remoto requiere reintento.",
        organizationId: retiring.organizationId,
        retryable: failure.retryable,
        versionId: retiring.id,
      });
      throw new KnowledgeIngestionError(
        failure.code,
        failure.retryable,
        retiring.id,
      );
    }
  }

  async #ensureIndexed(
    initial: KnowledgeDocumentVersionRecord,
  ): Promise<KnowledgeDocumentVersionRecord> {
    const providerFileId = this.#requiredProviderFileId(initial);
    let remoteFile: KnowledgeVectorStoreFile;
    try {
      remoteFile = await this.#vectorStore.getFile(
        initial.providerVectorStoreId,
        providerFileId,
      );
    } catch (cause: unknown) {
      if (
        cause instanceof OpenAIFileSearchError &&
        cause.code === "provider-not-found"
      ) {
        remoteFile = await this.#vectorStore.attachFile(
          initial.providerVectorStoreId,
          providerFileId,
          attributesFor(initial, "candidate"),
        );
      } else {
        throw cause;
      }
    }
    let record = await this.#repository.markIndexing(
      initial.organizationId,
      initial.id,
      remoteFile.status,
    );
    for (
      let attempt = 0;
      remoteFile.status === "in_progress" &&
      attempt < this.#maximumPollAttempts;
      attempt += 1
    ) {
      await this.#sleep(this.#pollIntervalMilliseconds);
      remoteFile = await this.#vectorStore.getFile(
        initial.providerVectorStoreId,
        providerFileId,
      );
      record = await this.#repository.markIndexing(
        initial.organizationId,
        initial.id,
        remoteFile.status,
      );
    }
    if (remoteFile.status === "in_progress") {
      throw new KnowledgeIngestionError("timeout", true, initial.id);
    }
    if (remoteFile.status === "failed") {
      throw new KnowledgeIngestionError(
        "remote-indexing-failed",
        false,
        initial.id,
      );
    }
    return record;
  }

  #requiredProviderFileId(record: KnowledgeDocumentVersionRecord): string {
    if (record.providerFileId === null) {
      throw new KnowledgeIngestionError("provider-not-found", false, record.id);
    }
    return record.providerFileId;
  }
}
