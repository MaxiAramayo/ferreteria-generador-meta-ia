import {
  validateMediaUpload,
  type MediaAssetOrigin,
  type MediaAssetRecord,
  type MediaAssetRepository,
  type MediaInspector,
  type MediaStorage,
  type StoredMediaObject,
  type ValidatedMediaUpload,
} from "@aramayo/domain";

import { MediaLifecycleError } from "./media.errors.ts";

export interface UploadMediaCommand {
  readonly bytes: Uint8Array;
  readonly declaredMimeType: string;
  readonly mediaAssetId: string;
  readonly organizationId: string;
  readonly origin: MediaAssetOrigin;
  readonly originalFileName: string;
  readonly ownerMembershipId: string;
  readonly retentionUntil?: string;
}

export interface DeleteMediaCommand {
  readonly mediaAssetId: string;
  readonly organizationId: string;
  readonly requestedAt: string;
}

function isMatchingReservation(
  asset: MediaAssetRecord,
  command: UploadMediaCommand,
): boolean {
  return (
    asset.organizationId === command.organizationId &&
    asset.ownerMembershipId === command.ownerMembershipId &&
    asset.origin === command.origin &&
    asset.originalFileName === command.originalFileName.trim() &&
    asset.storageProvider === "cloudinary"
  );
}

function storedObjectMatches(
  storedObject: StoredMediaObject,
  validatedUpload: ValidatedMediaUpload,
): boolean {
  return (
    storedObject.byteSize === validatedUpload.byteSize &&
    storedObject.height === validatedUpload.height &&
    storedObject.mimeType === validatedUpload.mimeType &&
    storedObject.width === validatedUpload.width
  );
}

export class MediaLifecycleService {
  readonly #inspector: MediaInspector;
  readonly #repository: MediaAssetRepository;
  readonly #storage: MediaStorage;

  constructor(
    repository: MediaAssetRepository,
    inspector: MediaInspector,
    storage: MediaStorage,
  ) {
    this.#repository = repository;
    this.#inspector = inspector;
    this.#storage = storage;
  }

  async upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
    const inspection = await this.#inspector.inspect({ bytes: command.bytes });
    const validatedUpload = validateMediaUpload(
      command.originalFileName,
      command.declaredMimeType,
      inspection,
    );
    const reservation = await this.#repository.reserveUpload({
      id: command.mediaAssetId,
      organizationId: command.organizationId,
      origin: command.origin,
      originalFileName: validatedUpload.originalFileName,
      ownerMembershipId: command.ownerMembershipId,
      ...(command.retentionUntil === undefined
        ? {}
        : { retentionUntil: command.retentionUntil }),
      storageProvider: "cloudinary",
    });
    if (reservation.status === "not-found") {
      throw new MediaLifecycleError(
        "not-found",
        "No se encontró el propietario del activo.",
        false,
      );
    }
    if (!isMatchingReservation(reservation.asset, command)) {
      throw new MediaLifecycleError(
        "idempotency-conflict",
        "El identificador de medio ya corresponde a otra solicitud.",
        false,
      );
    }
    if (reservation.asset.status === "available") {
      if (reservation.asset.checksumSha256 === validatedUpload.checksumSha256) {
        return reservation.asset;
      }
      throw new MediaLifecycleError(
        "idempotency-conflict",
        "El identificador de medio ya contiene otro archivo.",
        false,
      );
    }
    if (reservation.asset.status !== "pending_upload") {
      throw new MediaLifecycleError(
        "invalid-state",
        "El activo no admite una carga en su estado actual.",
        false,
      );
    }

    let storedObject: StoredMediaObject;
    try {
      storedObject = await this.#storage.store({
        bytes: command.bytes,
        mediaAssetId: command.mediaAssetId,
        mimeType: validatedUpload.mimeType,
        organizationId: command.organizationId,
      });
    } catch (cause: unknown) {
      await this.#recordUploadFailure(
        command,
        cause instanceof MediaLifecycleError ? cause.code : "provider-failed",
        cause instanceof MediaLifecycleError
          ? cause.message
          : "El proveedor no confirmó la carga.",
      );
      throw cause instanceof MediaLifecycleError
        ? cause
        : new MediaLifecycleError(
            "provider-failed",
            "El proveedor no confirmó la carga.",
            true,
          );
    }
    if (!storedObjectMatches(storedObject, validatedUpload)) {
      await this.#recordUploadFailure(
        command,
        "provider-contract-invalid",
        "El proveedor devolvió metadatos diferentes del archivo validado.",
      );
      throw new MediaLifecycleError(
        "provider-contract-invalid",
        "El proveedor devolvió metadatos diferentes del archivo validado.",
        true,
      );
    }

    const completed = await this.#repository.completeUpload({
      byteSize: String(validatedUpload.byteSize),
      checksumSha256: validatedUpload.checksumSha256,
      height: validatedUpload.height,
      mediaAssetId: command.mediaAssetId,
      mimeType: validatedUpload.mimeType,
      organizationId: command.organizationId,
      secureUrl: storedObject.secureUrl,
      storageKey: storedObject.storageKey,
      storageVersion: storedObject.storageVersion,
      width: validatedUpload.width,
    });
    if (completed.status === "updated") {
      return completed.asset;
    }
    const current = await this.#repository.findById(
      { organizationId: command.organizationId },
      command.mediaAssetId,
    );
    if (
      current?.status === "available" &&
      current.checksumSha256 === validatedUpload.checksumSha256
    ) {
      return current;
    }
    throw new MediaLifecycleError(
      completed.status === "not-found" ? "not-found" : "state-conflict",
      "La carga remota existe, pero su estado local no pudo confirmarse.",
      true,
    );
  }

  async delete(command: DeleteMediaCommand): Promise<MediaAssetRecord> {
    const deletion = await this.#repository.beginDeletion({
      mediaAssetId: command.mediaAssetId,
      organizationId: command.organizationId,
      requestedAt: command.requestedAt,
    });
    switch (deletion.status) {
      case "already-deleted":
        return deletion.asset;
      case "in-use":
        throw new MediaLifecycleError(
          "asset-in-use",
          "El activo está referenciado y no se puede eliminar.",
          false,
        );
      case "retained":
        throw new MediaLifecycleError(
          "asset-retained",
          `El activo debe conservarse hasta ${deletion.retentionUntil}.`,
          false,
        );
      case "invalid-state":
        throw new MediaLifecycleError(
          "invalid-state",
          "El activo no admite eliminación en su estado actual.",
          false,
        );
      case "not-found":
        throw new MediaLifecycleError(
          "not-found",
          "No se encontró el activo.",
          false,
        );
      case "ready":
        break;
    }
    const storageKey = deletion.asset.storageKey;
    if (storageKey === undefined) {
      throw new MediaLifecycleError(
        "invalid-state",
        "El activo no conserva una clave remota.",
        false,
      );
    }

    await this.#storage.delete(storageKey);
    const completed = await this.#repository.completeDeletion({
      deletedAt: command.requestedAt,
      mediaAssetId: command.mediaAssetId,
      organizationId: command.organizationId,
    });
    if (completed.status === "updated") {
      return completed.asset;
    }
    const current = await this.#repository.findById(
      { organizationId: command.organizationId },
      command.mediaAssetId,
    );
    if (current?.status === "deleted") {
      return current;
    }
    throw new MediaLifecycleError(
      completed.status === "not-found" ? "not-found" : "state-conflict",
      "La eliminación remota terminó, pero el estado local no pudo confirmarse.",
      true,
    );
  }

  async #recordUploadFailure(
    command: UploadMediaCommand,
    failureCode: string,
    failureMessage: string,
  ): Promise<void> {
    const failed = await this.#repository.failUpload({
      failureCode: failureCode.slice(0, 80),
      failureMessage: failureMessage.slice(0, 300),
      mediaAssetId: command.mediaAssetId,
      organizationId: command.organizationId,
    });
    if (failed.status === "not-found") {
      throw new MediaLifecycleError(
        "not-found",
        "La carga falló y su reserva ya no existe.",
        true,
      );
    }
    if (failed.status === "conflict") {
      throw new MediaLifecycleError(
        "state-conflict",
        "La carga falló y otro proceso cambió el estado de la reserva.",
        true,
      );
    }
  }
}
