import assert from "node:assert/strict";
import test from "node:test";

import type {
  IngestKnowledgeDocumentCommand,
  KnowledgeActivationResult,
  KnowledgeDocumentRepository,
  KnowledgeDocumentVersionRecord,
  KnowledgeFileAttributes,
  KnowledgeSyncFailureInput,
  KnowledgeVectorStoreFile,
  KnowledgeVectorStorePort,
  ReserveKnowledgeDocumentVersionInput,
  ReserveKnowledgeDocumentVersionResult,
  UploadKnowledgeFileInput,
} from "@aramayo/domain";

import {
  KnowledgeIngestionError,
  KnowledgeIngestionService,
} from "./knowledge-ingestion.service.ts";
import { OpenAIFileSearchError } from "./openai-file-search.adapter.ts";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const LOCATION_ID = "10000000-0000-4000-8000-000000000004";

function mutableRecord(
  record: KnowledgeDocumentVersionRecord,
): KnowledgeDocumentVersionRecord {
  return { ...record, locationIds: [...record.locationIds] };
}

class FakeKnowledgeRepository implements KnowledgeDocumentRepository {
  readonly activeByDocument = new Map<string, string>();
  readonly records = new Map<string, KnowledgeDocumentVersionRecord>();
  #nextDocument = 1;
  #nextVersion = 1;

  reserveVersion(
    input: ReserveKnowledgeDocumentVersionInput,
  ): Promise<ReserveKnowledgeDocumentVersionResult> {
    const duplicate = [...this.records.values()].find(
      (record) =>
        record.organizationId === input.organizationId &&
        record.sourceKey === input.sourceKey &&
        record.contentHash === input.contentHash,
    );
    if (duplicate !== undefined) {
      return Promise.resolve({
        record: mutableRecord(duplicate),
        status: "duplicate",
      });
    }
    const sameSource = [...this.records.values()].filter(
      (record) =>
        record.organizationId === input.organizationId &&
        record.sourceKey === input.sourceKey,
    );
    const documentId =
      sameSource[0]?.documentId ?? `document-${this.#nextDocument++}`;
    const version =
      sameSource.reduce(
        (maximum, record) => Math.max(maximum, record.version),
        0,
      ) + 1;
    const id = `version-${this.#nextVersion++}`;
    const record: KnowledgeDocumentVersionRecord = {
      ...input,
      activatedAt: null,
      documentId,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      id,
      providerFileId: null,
      remoteStatus: "not_uploaded",
      retiredAt: null,
      status: "pending_upload",
      version,
    };
    this.records.set(id, record);
    return Promise.resolve({
      record: mutableRecord(record),
      status: "reserved",
    });
  }

  markUploaded(
    organizationId: string,
    versionId: string,
    providerFileId: string,
  ): Promise<KnowledgeDocumentVersionRecord> {
    return Promise.resolve(
      this.#update(organizationId, versionId, {
        failureCode: null,
        failureMessage: null,
        failureRetryable: null,
        providerFileId,
        remoteStatus: "uploaded",
        status: "uploaded",
      }),
    );
  }

  markIndexing(
    organizationId: string,
    versionId: string,
    remoteStatus: "completed" | "failed" | "in_progress",
  ): Promise<KnowledgeDocumentVersionRecord> {
    return Promise.resolve(
      this.#update(organizationId, versionId, {
        remoteStatus,
        status: "indexing",
      }),
    );
  }

  activateVersion(
    organizationId: string,
    versionId: string,
    activatedAt: string,
  ): Promise<KnowledgeActivationResult> {
    const candidate = this.#required(organizationId, versionId);
    const previousId = this.activeByDocument.get(candidate.documentId);
    const superseded =
      previousId === undefined
        ? null
        : this.#update(organizationId, previousId, {
            status: "superseded",
          });
    const active = this.#update(organizationId, versionId, {
      activatedAt,
      failureCode: null,
      failureMessage: null,
      failureRetryable: null,
      status: "active",
    });
    this.activeByDocument.set(candidate.documentId, versionId);
    return Promise.resolve({ active, superseded });
  }

  beginRetirement(
    organizationId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null> {
    const activeId = this.activeByDocument.get(documentId);
    if (activeId === undefined) {
      const retryable = [...this.records.values()].find(
        (record) =>
          record.organizationId === organizationId &&
          record.documentId === documentId &&
          record.status === "retiring",
      );
      return Promise.resolve(
        retryable === undefined ? null : mutableRecord(retryable),
      );
    }
    this.activeByDocument.delete(documentId);
    return Promise.resolve(
      this.#update(organizationId, activeId, { status: "retiring" }),
    );
  }

  completeRetirement(
    organizationId: string,
    versionId: string,
    retiredAt: string,
  ): Promise<KnowledgeDocumentVersionRecord> {
    return Promise.resolve(
      this.#update(organizationId, versionId, {
        remoteStatus: "detached",
        retiredAt,
        status: "retired",
      }),
    );
  }

  findVersion(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null> {
    const record = this.records.get(versionId);
    return Promise.resolve(
      record?.organizationId === organizationId ? mutableRecord(record) : null,
    );
  }

  markFailure(
    input: KnowledgeSyncFailureInput,
  ): Promise<KnowledgeDocumentVersionRecord> {
    const current = this.#required(input.organizationId, input.versionId);
    return Promise.resolve(
      this.#update(input.organizationId, input.versionId, {
        failureCode: input.code,
        failureMessage: input.message,
        failureRetryable: input.retryable,
        status: current.status === "retiring" ? "retiring" : "sync_failed",
      }),
    );
  }

  #required(
    organizationId: string,
    versionId: string,
  ): KnowledgeDocumentVersionRecord {
    const record = this.records.get(versionId);
    if (record === undefined || record.organizationId !== organizationId) {
      throw new Error("not-found");
    }
    return record;
  }

  #update(
    organizationId: string,
    versionId: string,
    changes: Partial<KnowledgeDocumentVersionRecord>,
  ): KnowledgeDocumentVersionRecord {
    const updated = {
      ...this.#required(organizationId, versionId),
      ...changes,
    };
    this.records.set(versionId, updated);
    return mutableRecord(updated);
  }
}

class FakeVectorStore implements KnowledgeVectorStorePort {
  readonly attributes = new Map<string, KnowledgeFileAttributes>();
  readonly detached = new Set<string>();
  readonly files = new Map<
    string,
    { polls: number; status: KnowledgeVectorStoreFile["status"] }
  >();
  failNextAttributeUpdate = false;
  uploadCount = 0;

  uploadFile(input: UploadKnowledgeFileInput): Promise<string> {
    void input;
    this.uploadCount += 1;
    return Promise.resolve(`file-${this.uploadCount}`);
  }

  attachFile(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<KnowledgeVectorStoreFile> {
    void vectorStoreId;
    this.attributes.set(fileId, attributes);
    this.files.set(fileId, { polls: 0, status: "in_progress" });
    return Promise.resolve({
      fileId,
      lastErrorCode: null,
      status: "in_progress",
    });
  }

  getFile(
    vectorStoreId: string,
    fileId: string,
  ): Promise<KnowledgeVectorStoreFile> {
    void vectorStoreId;
    const state = this.files.get(fileId);
    if (state === undefined) {
      return Promise.reject(
        new OpenAIFileSearchError("provider-not-found", false),
      );
    }
    state.polls += 1;
    if (state.polls >= 2) {
      state.status = "completed";
    }
    return Promise.resolve({
      fileId,
      lastErrorCode: null,
      status: state.status,
    });
  }

  updateFileAttributes(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<void> {
    void vectorStoreId;
    if (this.failNextAttributeUpdate) {
      this.failNextAttributeUpdate = false;
      return Promise.reject(new OpenAIFileSearchError("timeout", true));
    }
    this.attributes.set(fileId, attributes);
    return Promise.resolve();
  }

  detachFile(vectorStoreId: string, fileId: string): Promise<void> {
    void vectorStoreId;
    this.detached.add(fileId);
    this.files.delete(fileId);
    return Promise.resolve();
  }
}

function command(
  content = "# Aramayo\n\nLa respuesta factual es cuarenta y dos.",
): IngestKnowledgeDocumentCommand {
  return Object.freeze({
    approvalReference: "approval-2026-07-29",
    approvalStatus: "approved",
    approvedAt: "2026-07-29T12:00:00.000Z",
    brand: "Aramayo",
    content: new TextEncoder().encode(content),
    documentType: "faq",
    effectiveFrom: "2026-07-29T12:00:00.000Z",
    effectiveUntil: null,
    filename: "faq.md",
    locationIds: [LOCATION_ID],
    mimeType: "text/markdown",
    organizationId: ORGANIZATION_ID,
    sensitivity: "internal",
    sourceKey: "marca.faq",
    sourceOwner: "Responsable de negocio",
    title: "Preguntas frecuentes",
  });
}

function fixture(): {
  repository: FakeKnowledgeRepository;
  service: KnowledgeIngestionService;
  vectorStore: FakeVectorStore;
} {
  const repository = new FakeKnowledgeRepository();
  const vectorStore = new FakeVectorStore();
  const service = new KnowledgeIngestionService(
    repository,
    vectorStore,
    "vs_staging",
    {
      maximumPollAttempts: 3,
      now: (): Date => new Date("2026-07-29T13:00:00.000Z"),
      pollIntervalMilliseconds: 0,
      sleep: (): Promise<void> => Promise.resolve(),
    },
  );
  return { repository, service, vectorStore };
}

test("indexes and activates only after the remote file completes", async () => {
  const { service, vectorStore } = fixture();

  const result = await service.ingest(command());

  assert.equal(result.status, "activated");
  assert.equal(result.record.status, "active");
  assert.equal(result.record.remoteStatus, "completed");
  assert.equal(vectorStore.attributes.get("file-1")?.status, "approved");
});

test("deduplicates the same logical source by SHA-256", async () => {
  const { service, vectorStore } = fixture();

  const first = await service.ingest(command());
  const duplicate = await service.ingest(command());

  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.record.id, first.record.id);
  assert.equal(vectorStore.uploadCount, 1);
});

test("replaces the active version and excludes the previous remote metadata", async () => {
  const { service, vectorStore } = fixture();

  const first = await service.ingest(command());
  const second = await service.ingest(command("# Aramayo\n\nNueva versión."));

  assert.equal(second.record.version, 2);
  assert.equal(second.record.status, "active");
  assert.equal(vectorStore.attributes.get("file-1")?.status, "superseded");
  assert.equal(vectorStore.attributes.get("file-2")?.status, "approved");
  assert.notEqual(first.record.contentHash, second.record.contentHash);
});

test("reconciles an interruption after remote indexing", async () => {
  const { repository, service, vectorStore } = fixture();
  vectorStore.failNextAttributeUpdate = true;

  await assert.rejects(
    service.ingest(command()),
    (cause: unknown) =>
      cause instanceof KnowledgeIngestionError &&
      cause.code === "timeout" &&
      cause.retryable,
  );
  const interrupted = [...repository.records.values()][0];
  if (interrupted === undefined) {
    assert.fail("La versión interrumpida debía quedar registrada.");
  }
  assert.equal(interrupted.status, "sync_failed");
  assert.equal(interrupted.remoteStatus, "completed");

  const reconciled = await service.reconcile(ORGANIZATION_ID, interrupted.id);
  assert.equal(reconciled.status, "activated");
  assert.equal(reconciled.record.status, "active");
  assert.equal(vectorStore.uploadCount, 1);
});

test("retirement removes the active source before detaching it", async () => {
  const { repository, service, vectorStore } = fixture();
  const active = await service.ingest(command());

  const retired = await service.retire(
    ORGANIZATION_ID,
    active.record.documentId,
  );

  assert.equal(retired?.status, "retired");
  assert.equal(retired.remoteStatus, "detached");
  assert.equal(
    repository.activeByDocument.has(active.record.documentId),
    false,
  );
  assert.equal(vectorStore.detached.has("file-1"), true);
});
