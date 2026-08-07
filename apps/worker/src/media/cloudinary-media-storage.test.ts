import assert from "node:assert/strict";
import test from "node:test";

import {
  SecretValue,
  type CloudinaryCredentials,
} from "@aramayo/configuration";

import {
  CloudinaryMediaStorage,
  type CloudinaryGateway,
} from "./cloudinary-media-storage.ts";
import { MediaLifecycleError } from "./media.errors.ts";

const credentials: CloudinaryCredentials = {
  apiKey: new SecretValue("placeholder-key"),
  apiSecret: new SecretValue("placeholder-secret"),
  cloudName: "aramayo-test",
  folder: "content/staging",
};

class FakeCloudinaryGateway implements CloudinaryGateway {
  deleteResponse: unknown = { result: "ok" };
  downloadResponse = new Uint8Array([1, 2, 3]);
  downloadedUrl: string | undefined;
  uploadedPublicId: string | undefined;
  uploadResponse: unknown = {
    bytes: 1024,
    format: "png",
    height: 1080,
    public_id: "content/staging/organization-1/media-1",
    secure_url:
      "https://res.cloudinary.com/aramayo-test/image/upload/v7/content/staging/organization-1/media-1.png",
    version: 7,
    width: 1080,
  };

  buildUrl(
    publicId: string,
    options: Readonly<Record<string, unknown>>,
  ): string {
    return `https://res.cloudinary.com/aramayo-test/${publicId}?${String(options["fetch_format"] ?? options["format"])}`;
  }

  destroy(): Promise<unknown> {
    return Promise.resolve(this.deleteResponse);
  }

  download(url: string): Promise<Uint8Array> {
    this.downloadedUrl = url;
    return Promise.resolve(this.downloadResponse);
  }

  upload(_bytes: Uint8Array, publicId: string): Promise<unknown> {
    this.uploadedPublicId = publicId;
    return Promise.resolve(this.uploadResponse);
  }
}

test("Cloudinary usa una clave determinista y valida toda la respuesta", async () => {
  const gateway = new FakeCloudinaryGateway();
  const storage = new CloudinaryMediaStorage(credentials, gateway);

  const stored = await storage.store({
    bytes: new Uint8Array([1, 2, 3]),
    mediaAssetId: "media-1",
    mimeType: "image/png",
    organizationId: "organization-1",
  });

  assert.equal(
    gateway.uploadedPublicId,
    "content/staging/organization-1/media-1",
  );
  assert.deepEqual(stored, {
    byteSize: 1024,
    height: 1080,
    mimeType: "image/png",
    secureUrl:
      "https://res.cloudinary.com/aramayo-test/image/upload/v7/content/staging/organization-1/media-1.png",
    storageKey: "content/staging/organization-1/media-1",
    storageVersion: 7,
    width: 1080,
  });
  assert.match(storage.deliveryUrl(stored, "editor-preview"), /\?auto$/u);
});

test("Cloudinary lee la versión original exacta del activo", async () => {
  const gateway = new FakeCloudinaryGateway();
  const storage = new CloudinaryMediaStorage(credentials, gateway);

  const bytes = await storage.read({
    mimeType: "image/png",
    storageKey: "content/staging/organization-1/media-1",
    storageVersion: 7,
  });

  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.match(gateway.downloadedUrl ?? "", /\?png$/u);
});

test("Cloudinary rechaza URLs ajenas y resultados de borrado desconocidos", async () => {
  const gateway = new FakeCloudinaryGateway();
  const storage = new CloudinaryMediaStorage(credentials, gateway);
  gateway.uploadResponse = {
    bytes: 1024,
    format: "png",
    height: 1080,
    public_id: "content/staging/organization-1/media-1",
    secure_url: "https://example.invalid/asset.png",
    version: 7,
    width: 1080,
  };

  await assert.rejects(
    storage.store({
      bytes: new Uint8Array([1]),
      mediaAssetId: "media-1",
      mimeType: "image/png",
      organizationId: "organization-1",
    }),
    (cause: unknown) =>
      cause instanceof MediaLifecycleError &&
      cause.code === "provider-contract-invalid",
  );

  gateway.deleteResponse = { result: "unexpected" };
  await assert.rejects(
    storage.delete("content/staging/organization-1/media-1"),
    (cause: unknown) =>
      cause instanceof MediaLifecycleError &&
      cause.code === "provider-contract-invalid",
  );
});

test("borrar un recurso ya ausente es éxito idempotente", async () => {
  const gateway = new FakeCloudinaryGateway();
  gateway.deleteResponse = { result: "not found" };
  const storage = new CloudinaryMediaStorage(credentials, gateway);

  assert.equal(
    await storage.delete("content/staging/organization-1/media-1"),
    "not-found",
  );
});
