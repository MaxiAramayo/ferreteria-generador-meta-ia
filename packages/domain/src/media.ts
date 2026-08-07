import type { OrganizationScope } from "./persistence.ts";

export const supportedMediaMimeTypes = ["image/jpeg", "image/png"] as const;

export type SupportedMediaMimeType = (typeof supportedMediaMimeTypes)[number];

export const mediaUploadPolicy = Object.freeze({
  maximumByteSize: 8 * 1024 * 1024,
  maximumDimension: 8192,
  maximumPixels: 40_000_000,
});

export type MediaAssetOrigin =
  "approved_library" | "commercial_system" | "generated" | "uploaded";

export type MediaAssetStatus =
  "available" | "deleted" | "failed" | "pending_deletion" | "pending_upload";

export type MediaStorageProvider = "brand_library" | "cloudinary";

export interface MediaAssetRecord {
  readonly byteSize?: string;
  readonly checksumSha256?: string;
  readonly createdAt: string;
  readonly deletedAt?: string;
  readonly failureCode?: string;
  readonly failureMessage?: string;
  readonly height?: number;
  readonly id: string;
  readonly mimeType?: string;
  readonly organizationId: string;
  readonly origin: MediaAssetOrigin;
  readonly originalFileName: string;
  readonly ownerMembershipId: string;
  readonly retentionUntil?: string;
  readonly secureUrl?: string;
  readonly status: MediaAssetStatus;
  readonly storageKey?: string;
  readonly storageProvider: MediaStorageProvider;
  readonly storageVersion?: number;
  readonly updatedAt: string;
  readonly width?: number;
}

export interface MediaInspection {
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly detectedMimeType: string;
  readonly height: number;
  readonly width: number;
}

export interface ValidatedMediaUpload {
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mimeType: SupportedMediaMimeType;
  readonly originalFileName: string;
  readonly width: number;
}

export type MediaValidationErrorCode =
  | "checksum-invalid"
  | "dimensions-invalid"
  | "extension-mismatch"
  | "file-empty"
  | "file-name-invalid"
  | "file-too-large"
  | "mime-mismatch"
  | "pixel-limit-exceeded"
  | "type-not-allowed";

export class MediaValidationError extends Error {
  readonly code: MediaValidationErrorCode;

  constructor(code: MediaValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "MediaValidationError";
  }
}

const supportedMimeTypeSet: ReadonlySet<string> = new Set(
  supportedMediaMimeTypes,
);

function isSupportedMediaMimeType(
  mimeType: string,
): mimeType is SupportedMediaMimeType {
  return supportedMimeTypeSet.has(mimeType);
}

function normalizeFileName(originalFileName: string): string {
  const normalized = originalFileName.trim();
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
  if (
    normalized.length === 0 ||
    normalized.length > 255 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    containsControlCharacter
  ) {
    throw new MediaValidationError(
      "file-name-invalid",
      "El nombre del archivo no es válido.",
    );
  }
  return normalized;
}

function extensionMimeType(
  originalFileName: string,
): SupportedMediaMimeType | null {
  const extension = originalFileName.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case undefined:
      return null;
    default:
      return null;
  }
}

export function validateMediaUpload(
  originalFileName: string,
  declaredMimeType: string,
  inspection: MediaInspection,
): ValidatedMediaUpload {
  const normalizedFileName = normalizeFileName(originalFileName);
  if (inspection.byteSize < 1) {
    throw new MediaValidationError("file-empty", "El archivo está vacío.");
  }
  if (inspection.byteSize > mediaUploadPolicy.maximumByteSize) {
    throw new MediaValidationError(
      "file-too-large",
      "La imagen supera el límite de 8 MiB.",
    );
  }
  if (!isSupportedMediaMimeType(inspection.detectedMimeType)) {
    throw new MediaValidationError(
      "type-not-allowed",
      "El contenido debe ser una imagen PNG o JPEG.",
    );
  }
  if (declaredMimeType !== inspection.detectedMimeType) {
    throw new MediaValidationError(
      "mime-mismatch",
      "El tipo declarado no coincide con el contenido del archivo.",
    );
  }
  if (extensionMimeType(normalizedFileName) !== inspection.detectedMimeType) {
    throw new MediaValidationError(
      "extension-mismatch",
      "La extensión no coincide con el contenido del archivo.",
    );
  }
  if (
    !Number.isSafeInteger(inspection.width) ||
    !Number.isSafeInteger(inspection.height) ||
    inspection.width < 1 ||
    inspection.height < 1 ||
    inspection.width > mediaUploadPolicy.maximumDimension ||
    inspection.height > mediaUploadPolicy.maximumDimension
  ) {
    throw new MediaValidationError(
      "dimensions-invalid",
      "Las dimensiones de la imagen no son válidas.",
    );
  }
  if (inspection.width * inspection.height > mediaUploadPolicy.maximumPixels) {
    throw new MediaValidationError(
      "pixel-limit-exceeded",
      "La imagen supera el límite de píxeles permitido.",
    );
  }
  if (!/^[a-f0-9]{64}$/u.test(inspection.checksumSha256)) {
    throw new MediaValidationError(
      "checksum-invalid",
      "El checksum de la imagen no es válido.",
    );
  }

  return Object.freeze({
    byteSize: inspection.byteSize,
    checksumSha256: inspection.checksumSha256,
    height: inspection.height,
    mimeType: inspection.detectedMimeType,
    originalFileName: normalizedFileName,
    width: inspection.width,
  });
}

export interface ReserveMediaUploadInput extends OrganizationScope {
  readonly id: string;
  readonly origin: MediaAssetOrigin;
  readonly originalFileName: string;
  readonly ownerMembershipId: string;
  readonly retentionUntil?: string;
  readonly storageProvider: MediaStorageProvider;
}

export interface ExpiredMediaAssetCandidate {
  readonly id: string;
  readonly organizationId: string;
}

export type MediaUploadReservation =
  | Readonly<{ asset: MediaAssetRecord; status: "existing" }>
  | Readonly<{ asset: MediaAssetRecord; status: "reserved" }>
  | Readonly<{ status: "not-found" }>;

export interface CompleteMediaUploadInput extends OrganizationScope {
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: SupportedMediaMimeType;
  readonly secureUrl: string;
  readonly storageKey: string;
  readonly storageVersion: number;
  readonly width: number;
}

export interface FailMediaUploadInput extends OrganizationScope {
  readonly failureCode: string;
  readonly failureMessage: string;
  readonly mediaAssetId: string;
}

export type MediaStateMutationResult =
  | Readonly<{ asset: MediaAssetRecord; status: "updated" }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>;

export interface BeginMediaDeletionInput extends OrganizationScope {
  readonly mediaAssetId: string;
  readonly requestedAt: string;
}

export type BeginMediaDeletionResult =
  | Readonly<{ asset: MediaAssetRecord; status: "ready" }>
  | Readonly<{ asset: MediaAssetRecord; status: "already-deleted" }>
  | Readonly<{ status: "in-use" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ retentionUntil: string; status: "retained" }>;

export interface CompleteMediaDeletionInput extends OrganizationScope {
  readonly deletedAt: string;
  readonly mediaAssetId: string;
}

export interface MediaAssetRepository {
  auditRetention(input: {
    readonly at: string;
    readonly mediaAssetId: string;
    readonly organizationId: string;
    readonly outcome: "deleted" | "failed" | "skipped";
    readonly reason: string;
  }): Promise<void>;
  beginDeletion(
    input: BeginMediaDeletionInput,
  ): Promise<BeginMediaDeletionResult>;
  completeDeletion(
    input: CompleteMediaDeletionInput,
  ): Promise<MediaStateMutationResult>;
  completeUpload(
    input: CompleteMediaUploadInput,
  ): Promise<MediaStateMutationResult>;
  failUpload(input: FailMediaUploadInput): Promise<MediaStateMutationResult>;
  findById(
    scope: OrganizationScope,
    mediaAssetId: string,
  ): Promise<MediaAssetRecord | null>;
  findAvailableByIds(
    scope: OrganizationScope,
    mediaAssetIds: readonly string[],
  ): Promise<readonly MediaAssetRecord[]>;
  findExpiredUnreferenced(input: {
    readonly expiredBefore: string;
    readonly limit: number;
  }): Promise<readonly ExpiredMediaAssetCandidate[]>;
  reserveUpload(
    input: ReserveMediaUploadInput,
  ): Promise<MediaUploadReservation>;
}

export interface InspectMediaInput {
  readonly bytes: Uint8Array;
}

export interface MediaInspector {
  inspect(input: InspectMediaInput): Promise<MediaInspection>;
}

export interface StoreMediaInput {
  readonly bytes: Uint8Array;
  readonly mediaAssetId: string;
  readonly mimeType: SupportedMediaMimeType;
  readonly organizationId: string;
}

export interface StoredMediaObject {
  readonly byteSize: number;
  readonly height: number;
  readonly mimeType: SupportedMediaMimeType;
  readonly secureUrl: string;
  readonly storageKey: string;
  readonly storageVersion: number;
  readonly width: number;
}

export type MediaDeliveryVariant = "editor-preview" | "meta-feed" | "original";

export interface ReadMediaObjectInput {
  readonly mimeType: SupportedMediaMimeType;
  readonly storageKey: string;
  readonly storageVersion: number;
}

export interface MediaStorage {
  delete(storageKey: string): Promise<"deleted" | "not-found">;
  deliveryUrl(
    object: Readonly<{
      mimeType: SupportedMediaMimeType;
      storageKey: string;
      storageVersion: number;
    }>,
    variant: MediaDeliveryVariant,
  ): string;
  read(input: ReadMediaObjectInput): Promise<Uint8Array>;
  store(input: StoreMediaInput): Promise<StoredMediaObject>;
}
