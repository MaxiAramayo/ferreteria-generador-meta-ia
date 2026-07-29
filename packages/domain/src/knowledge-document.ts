export const supportedKnowledgeMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
] as const;

export type SupportedKnowledgeMimeType =
  (typeof supportedKnowledgeMimeTypes)[number];

export type KnowledgeDocumentSensitivity =
  "confidential" | "internal" | "public";

export type KnowledgeDocumentVersionStatus =
  | "active"
  | "indexing"
  | "pending_upload"
  | "retired"
  | "retiring"
  | "superseded"
  | "sync_failed"
  | "uploaded";

export type KnowledgeRemoteStatus =
  | "completed"
  | "detached"
  | "failed"
  | "in_progress"
  | "not_uploaded"
  | "uploaded";

export type KnowledgeSyncFailureCode =
  | "provider-error"
  | "provider-not-found"
  | "remote-indexing-failed"
  | "timeout";

export interface KnowledgeDocumentMetadata {
  readonly approvalReference: string;
  readonly approvedAt: string;
  readonly brand: string;
  readonly documentType: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly locationIds: readonly string[];
  readonly organizationId: string;
  readonly sensitivity: KnowledgeDocumentSensitivity;
  readonly sourceKey: string;
  readonly sourceOwner: string;
  readonly title: string;
}

export interface IngestKnowledgeDocumentCommand extends KnowledgeDocumentMetadata {
  readonly approvalStatus: "approved" | "draft" | "rejected";
  readonly content: Uint8Array;
  readonly filename: string;
  readonly mimeType: SupportedKnowledgeMimeType;
}

export interface ValidatedKnowledgeDocument extends KnowledgeDocumentMetadata {
  readonly byteSize: number;
  readonly content: Uint8Array;
  readonly contentHash: string;
  readonly filename: string;
  readonly mimeType: SupportedKnowledgeMimeType;
}

export interface KnowledgeDocumentVersionRecord extends KnowledgeDocumentMetadata {
  readonly activatedAt: string | null;
  readonly byteSize: number;
  readonly contentHash: string;
  readonly documentId: string;
  readonly failureCode: KnowledgeSyncFailureCode | null;
  readonly failureMessage: string | null;
  readonly failureRetryable: boolean | null;
  readonly filename: string;
  readonly id: string;
  readonly mimeType: SupportedKnowledgeMimeType;
  readonly providerFileId: string | null;
  readonly providerVectorStoreId: string;
  readonly remoteStatus: KnowledgeRemoteStatus;
  readonly retiredAt: string | null;
  readonly status: KnowledgeDocumentVersionStatus;
  readonly version: number;
}

export interface ReserveKnowledgeDocumentVersionInput extends KnowledgeDocumentMetadata {
  readonly byteSize: number;
  readonly contentHash: string;
  readonly filename: string;
  readonly mimeType: SupportedKnowledgeMimeType;
  readonly providerVectorStoreId: string;
}

export type ReserveKnowledgeDocumentVersionResult =
  | Readonly<{
      readonly record: KnowledgeDocumentVersionRecord;
      readonly status: "duplicate";
    }>
  | Readonly<{
      readonly record: KnowledgeDocumentVersionRecord;
      readonly status: "reserved";
    }>;

export interface KnowledgeSyncFailureInput {
  readonly code: KnowledgeSyncFailureCode;
  readonly message: string;
  readonly organizationId: string;
  readonly retryable: boolean;
  readonly versionId: string;
}

export interface KnowledgeActivationResult {
  readonly active: KnowledgeDocumentVersionRecord;
  readonly superseded: KnowledgeDocumentVersionRecord | null;
}

export interface KnowledgeDocumentRepository {
  activateVersion(
    organizationId: string,
    versionId: string,
    activatedAt: string,
  ): Promise<KnowledgeActivationResult>;
  beginRetirement(
    organizationId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null>;
  completeRetirement(
    organizationId: string,
    versionId: string,
    retiredAt: string,
  ): Promise<KnowledgeDocumentVersionRecord>;
  findVersion(
    organizationId: string,
    versionId: string,
  ): Promise<KnowledgeDocumentVersionRecord | null>;
  markFailure(
    input: KnowledgeSyncFailureInput,
  ): Promise<KnowledgeDocumentVersionRecord>;
  markIndexing(
    organizationId: string,
    versionId: string,
    remoteStatus: "completed" | "failed" | "in_progress",
  ): Promise<KnowledgeDocumentVersionRecord>;
  markUploaded(
    organizationId: string,
    versionId: string,
    providerFileId: string,
  ): Promise<KnowledgeDocumentVersionRecord>;
  reserveVersion(
    input: ReserveKnowledgeDocumentVersionInput,
  ): Promise<ReserveKnowledgeDocumentVersionResult>;
}

export interface KnowledgeFileAttributes {
  readonly brand: string;
  readonly content_hash: string;
  readonly document_type: string;
  readonly effective_from: number;
  readonly effective_until: number;
  readonly location_ids: string;
  readonly organization_id: string;
  readonly sensitivity: KnowledgeDocumentSensitivity;
  readonly source_owner: string;
  readonly status: "approved" | "candidate" | "superseded";
  readonly version: number;
}

export interface UploadKnowledgeFileInput {
  readonly content: Uint8Array;
  readonly filename: string;
  readonly mimeType: SupportedKnowledgeMimeType;
}

export interface KnowledgeVectorStoreFile {
  readonly fileId: string;
  readonly lastErrorCode: string | null;
  readonly status: "completed" | "failed" | "in_progress";
}

export interface KnowledgeVectorStorePort {
  attachFile(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<KnowledgeVectorStoreFile>;
  detachFile(vectorStoreId: string, fileId: string): Promise<void>;
  getFile(
    vectorStoreId: string,
    fileId: string,
  ): Promise<KnowledgeVectorStoreFile>;
  updateFileAttributes(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<void>;
  uploadFile(input: UploadKnowledgeFileInput): Promise<string>;
}

export type KnowledgeDocumentValidationErrorCode =
  | "approval-required"
  | "content-empty"
  | "content-invalid"
  | "content-too-large"
  | "filename-invalid"
  | "metadata-invalid"
  | "mime-type-not-allowed";

export class KnowledgeDocumentValidationError extends Error {
  readonly code: KnowledgeDocumentValidationErrorCode;

  constructor(code: KnowledgeDocumentValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "KnowledgeDocumentValidationError";
  }
}

const maximumKnowledgeBytes = 10 * 1024 * 1024;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SAFE_SOURCE_KEY = /^[a-z0-9][a-z0-9._-]{1,158}[a-z0-9]$/u;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const expectedExtensions: Readonly<
  Record<SupportedKnowledgeMimeType, readonly string[]>
> = Object.freeze({
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/markdown": [".md", ".markdown"],
  "text/plain": [".txt"],
});

function invalidMetadata(message: string): never {
  throw new KnowledgeDocumentValidationError("metadata-invalid", message);
}

function isSupportedMimeType(
  mimeType: string,
): mimeType is SupportedKnowledgeMimeType {
  return supportedKnowledgeMimeTypes.some(
    (supportedMimeType) => supportedMimeType === mimeType,
  );
}

function validateContent(
  content: Uint8Array,
  mimeType: SupportedKnowledgeMimeType,
): void {
  if (content.byteLength === 0) {
    throw new KnowledgeDocumentValidationError(
      "content-empty",
      "El documento aprobado no contiene información.",
    );
  }
  if (content.byteLength > maximumKnowledgeBytes) {
    throw new KnowledgeDocumentValidationError(
      "content-too-large",
      "El documento supera el límite local de 10 MiB.",
    );
  }
  if (mimeType === "application/pdf") {
    const signature = new TextDecoder("ascii").decode(content.slice(0, 5));
    if (signature !== "%PDF-") {
      throw new KnowledgeDocumentValidationError(
        "content-invalid",
        "El contenido no corresponde a un PDF válido.",
      );
    }
    return;
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (
      content[0] !== 0x50 ||
      content[1] !== 0x4b ||
      content[2] !== 0x03 ||
      content[3] !== 0x04
    ) {
      throw new KnowledgeDocumentValidationError(
        "content-invalid",
        "El contenido no corresponde a un DOCX válido.",
      );
    }
    return;
  }
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
    if (decoded.trim().length === 0 || decoded.includes("\u0000")) {
      throw new Error("invalid-text");
    }
  } catch {
    throw new KnowledgeDocumentValidationError(
      "content-invalid",
      "El documento de texto debe ser UTF-8 y contener texto legible.",
    );
  }
}

export function validateKnowledgeDocument(
  command: IngestKnowledgeDocumentCommand,
  contentHash: string,
): ValidatedKnowledgeDocument {
  if (command.approvalStatus !== "approved") {
    throw new KnowledgeDocumentValidationError(
      "approval-required",
      "Solo se pueden ingerir documentos aprobados.",
    );
  }
  if (!isSupportedMimeType(command.mimeType)) {
    throw new KnowledgeDocumentValidationError(
      "mime-type-not-allowed",
      "El formato del documento no está permitido.",
    );
  }
  const filename = command.filename.trim();
  const lowerFilename = filename.toLowerCase();
  if (
    filename.length < 3 ||
    filename.length > 255 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !expectedExtensions[command.mimeType].some((extension) =>
      lowerFilename.endsWith(extension),
    )
  ) {
    throw new KnowledgeDocumentValidationError(
      "filename-invalid",
      "El nombre y la extensión no corresponden al formato aprobado.",
    );
  }
  validateContent(command.content, command.mimeType);
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
    invalidMetadata("El hash SHA-256 del documento no es válido.");
  }
  if (!SAFE_SOURCE_KEY.test(command.sourceKey)) {
    invalidMetadata("La clave lógica de la fuente no es válida.");
  }
  for (const [label, field, maximum] of [
    ["título", command.title, 180],
    ["tipo documental", command.documentType, 80],
    ["marca", command.brand, 120],
    ["propietario", command.sourceOwner, 120],
    ["referencia de aprobación", command.approvalReference, 160],
  ] as const) {
    if (field.trim().length === 0 || field.length > maximum) {
      invalidMetadata(`El campo ${label} no es válido.`);
    }
  }
  if (
    !UUID.test(command.organizationId) ||
    command.locationIds.length > 20 ||
    command.locationIds.some((locationId) => !UUID.test(locationId)) ||
    new Set(command.locationIds).size !== command.locationIds.length
  ) {
    invalidMetadata("El ámbito de organización o sucursales no es válido.");
  }
  if (
    !ISO_DATE_TIME.test(command.approvedAt) ||
    !ISO_DATE_TIME.test(command.effectiveFrom) ||
    (command.effectiveUntil !== null &&
      !ISO_DATE_TIME.test(command.effectiveUntil))
  ) {
    invalidMetadata("Las fechas deben ser timestamps ISO UTC.");
  }
  if (
    command.effectiveUntil !== null &&
    Date.parse(command.effectiveUntil) <= Date.parse(command.effectiveFrom)
  ) {
    invalidMetadata("La vigencia final debe ser posterior a la inicial.");
  }

  return Object.freeze({
    approvalReference: command.approvalReference.trim(),
    approvedAt: command.approvedAt,
    brand: command.brand.trim(),
    byteSize: command.content.byteLength,
    content: command.content,
    contentHash,
    documentType: command.documentType.trim(),
    effectiveFrom: command.effectiveFrom,
    effectiveUntil: command.effectiveUntil,
    filename,
    locationIds: Object.freeze([...command.locationIds]),
    mimeType: command.mimeType,
    organizationId: command.organizationId,
    sensitivity: command.sensitivity,
    sourceKey: command.sourceKey,
    sourceOwner: command.sourceOwner.trim(),
    title: command.title.trim(),
  });
}
