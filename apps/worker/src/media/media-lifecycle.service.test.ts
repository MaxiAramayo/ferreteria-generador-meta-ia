import assert from "node:assert/strict";
import test from "node:test";

import type {
  BeginMediaDeletionResult,
  CompleteMediaUploadInput,
  FailMediaUploadInput,
  MediaAssetRecord,
  MediaAssetRepository,
  MediaInspection,
  MediaInspector,
  MediaStateMutationResult,
  MediaStorage,
  MediaUploadReservation,
  StoredMediaObject,
} from "@aramayo/domain";

import { MediaLifecycleError } from "./media.errors.ts";
import {
  MediaLifecycleService,
  type UploadMediaCommand,
} from "./media-lifecycle.service.ts";

const inspection: MediaInspection = {
  byteSize: 1024,
  checksumSha256: "a".repeat(64),
  detectedMimeType: "image/png",
  height: 1080,
  width: 1080,
};

function asset(
  status: MediaAssetRecord["status"] = "pending_upload",
): MediaAssetRecord {
  return {
    createdAt: "2026-07-28T12:00:00.000Z",
    id: "media-1",
    organizationId: "organization-1",
    origin: "uploaded",
    originalFileName: "producto.png",
    ownerMembershipId: "membership-1",
    status,
    storageProvider: "cloudinary",
    updatedAt: "2026-07-28T12:00:00.000Z",
    ...(status === "available"
      ? {
          byteSize: "1024",
          checksumSha256: inspection.checksumSha256,
          height: 1080,
          mimeType: "image/png",
          secureUrl:
            "https://res.cloudinary.com/test/image/upload/v1/producto.png",
          storageKey: "organization-1/media-1",
          storageVersion: 1,
          width: 1080,
        }
      : {}),
  };
}

class FakeMediaInspector implements MediaInspector {
  inspect(): Promise<MediaInspection> {
    return Promise.resolve(inspection);
  }
}

class FakeMediaStorage implements MediaStorage {
  deleteCalls = 0;
  storeCalls = 0;
  storeError: MediaLifecycleError | undefined;

  delete(): Promise<"deleted" | "not-found"> {
    this.deleteCalls += 1;
    return Promise.resolve("deleted");
  }

  deliveryUrl(): string {
    return "https://res.cloudinary.com/test/image/upload/v1/producto.png";
  }

  store(): Promise<StoredMediaObject> {
    this.storeCalls += 1;
    return this.storeError === undefined
      ? Promise.resolve({
          byteSize: 1024,
          height: 1080,
          mimeType: "image/png",
          secureUrl:
            "https://res.cloudinary.com/test/image/upload/v1/producto.png",
          storageKey: "organization-1/media-1",
          storageVersion: 1,
          width: 1080,
        })
      : Promise.reject(this.storeError);
  }
}

class FakeMediaRepository implements MediaAssetRepository {
  beginDeletionResult: BeginMediaDeletionResult = {
    asset: { ...asset("available"), status: "pending_deletion" },
    status: "ready",
  };
  completeDeletionResult: MediaStateMutationResult = {
    asset: {
      ...asset("available"),
      deletedAt: "2026-07-28T13:00:00.000Z",
      status: "deleted",
    },
    status: "updated",
  };
  completeUploadInput: CompleteMediaUploadInput | undefined;
  failUploadInput: FailMediaUploadInput | undefined;
  reservation: MediaUploadReservation = {
    asset: asset(),
    status: "reserved",
  };

  beginDeletion(): Promise<BeginMediaDeletionResult> {
    return Promise.resolve(this.beginDeletionResult);
  }

  completeDeletion(): Promise<MediaStateMutationResult> {
    return Promise.resolve(this.completeDeletionResult);
  }

  completeUpload(
    input: CompleteMediaUploadInput,
  ): Promise<MediaStateMutationResult> {
    this.completeUploadInput = input;
    return Promise.resolve({
      asset: asset("available"),
      status: "updated",
    });
  }

  failUpload(input: FailMediaUploadInput): Promise<MediaStateMutationResult> {
    this.failUploadInput = input;
    return Promise.resolve({
      asset: {
        ...asset(),
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        status: "failed",
      },
      status: "updated",
    });
  }

  findById(): Promise<MediaAssetRecord | null> {
    return Promise.resolve(null);
  }

  findAvailableByIds(): Promise<readonly MediaAssetRecord[]> {
    return Promise.resolve(Object.freeze([]));
  }

  reserveUpload(): Promise<MediaUploadReservation> {
    return Promise.resolve(this.reservation);
  }
}

function uploadCommand(): UploadMediaCommand {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    declaredMimeType: "image/png",
    mediaAssetId: "media-1",
    organizationId: "organization-1",
    origin: "uploaded" as const,
    originalFileName: "producto.png",
    ownerMembershipId: "membership-1",
  };
}

test("la carga valida, reserva, almacena y confirma metadatos locales", async () => {
  const repository = new FakeMediaRepository();
  const storage = new FakeMediaStorage();
  const service = new MediaLifecycleService(
    repository,
    new FakeMediaInspector(),
    storage,
  );

  const result = await service.upload(uploadCommand());

  assert.equal(result.status, "available");
  assert.equal(storage.storeCalls, 1);
  assert.equal(repository.completeUploadInput?.checksumSha256, "a".repeat(64));
});

test("repetir una carga disponible devuelve el activo sin subir de nuevo", async () => {
  const repository = new FakeMediaRepository();
  repository.reservation = {
    asset: asset("available"),
    status: "existing",
  };
  const storage = new FakeMediaStorage();
  const service = new MediaLifecycleService(
    repository,
    new FakeMediaInspector(),
    storage,
  );

  assert.equal((await service.upload(uploadCommand())).status, "available");
  assert.equal(storage.storeCalls, 0);
});

test("un fallo remoto deja error seguro persistido y reintentable", async () => {
  const repository = new FakeMediaRepository();
  const storage = new FakeMediaStorage();
  storage.storeError = new MediaLifecycleError(
    "provider-failed",
    "Cloudinary no respondió.",
    true,
  );
  const service = new MediaLifecycleService(
    repository,
    new FakeMediaInspector(),
    storage,
  );

  await assert.rejects(
    service.upload(uploadCommand()),
    (cause: unknown) => cause instanceof MediaLifecycleError && cause.retryable,
  );
  assert.equal(repository.failUploadInput?.failureCode, "provider-failed");
});

test("un activo referenciado se rechaza antes de llamar al proveedor", async () => {
  const repository = new FakeMediaRepository();
  repository.beginDeletionResult = { status: "in-use" };
  const storage = new FakeMediaStorage();
  const service = new MediaLifecycleService(
    repository,
    new FakeMediaInspector(),
    storage,
  );

  await assert.rejects(
    service.delete({
      mediaAssetId: "media-1",
      organizationId: "organization-1",
      requestedAt: "2026-07-28T13:00:00.000Z",
    }),
    (cause: unknown) =>
      cause instanceof MediaLifecycleError && cause.code === "asset-in-use",
  );
  assert.equal(storage.deleteCalls, 0);
});

test("la eliminación remota ausente igual confirma el estado local", async () => {
  const repository = new FakeMediaRepository();
  const storage = new FakeMediaStorage();
  const service = new MediaLifecycleService(
    repository,
    new FakeMediaInspector(),
    storage,
  );

  const deleted = await service.delete({
    mediaAssetId: "media-1",
    organizationId: "organization-1",
    requestedAt: "2026-07-28T13:00:00.000Z",
  });

  assert.equal(deleted.status, "deleted");
  assert.equal(storage.deleteCalls, 1);
});
