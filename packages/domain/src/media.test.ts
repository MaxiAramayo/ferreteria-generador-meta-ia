import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaUploadPolicy,
  MediaValidationError,
  validateMediaUpload,
  type MediaInspection,
} from "./media.ts";

const jpegInspection: MediaInspection = {
  byteSize: 128_000,
  checksumSha256: "a".repeat(64),
  detectedMimeType: "image/jpeg",
  height: 1080,
  width: 1080,
};

test("acepta JPEG y PNG cuando contenido, declaración y extensión coinciden", () => {
  assert.deepEqual(
    validateMediaUpload(
      " producto principal.JPG ",
      "image/jpeg",
      jpegInspection,
    ),
    {
      byteSize: jpegInspection.byteSize,
      checksumSha256: jpegInspection.checksumSha256,
      height: jpegInspection.height,
      mimeType: "image/jpeg",
      originalFileName: "producto principal.JPG",
      width: jpegInspection.width,
    },
  );
  assert.equal(
    validateMediaUpload("producto.png", "image/png", {
      ...jpegInspection,
      detectedMimeType: "image/png",
    }).mimeType,
    "image/png",
  );
});

test("rechaza tipo declarado o extensión que intentan ocultar el contenido", () => {
  assert.throws(
    () => validateMediaUpload("producto.png", "image/png", jpegInspection),
    (cause: unknown) =>
      cause instanceof MediaValidationError && cause.code === "mime-mismatch",
  );
  assert.throws(
    () => validateMediaUpload("producto.png", "image/jpeg", jpegInspection),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.code === "extension-mismatch",
  );
});

test("rechaza nombre inseguro, tamaño excesivo y bombas de píxeles", () => {
  assert.throws(
    () => validateMediaUpload("../producto.jpg", "image/jpeg", jpegInspection),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.code === "file-name-invalid",
  );
  assert.throws(
    () =>
      validateMediaUpload("producto.jpg", "image/jpeg", {
        ...jpegInspection,
        byteSize: mediaUploadPolicy.maximumByteSize + 1,
      }),
    (cause: unknown) =>
      cause instanceof MediaValidationError && cause.code === "file-too-large",
  );
  assert.throws(
    () =>
      validateMediaUpload("producto.jpg", "image/jpeg", {
        ...jpegInspection,
        height: 5000,
        width: 8001,
      }),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.code === "pixel-limit-exceeded",
  );
});

test("rechaza formatos fuera de la política y checksum inválido", () => {
  assert.throws(
    () =>
      validateMediaUpload("producto.webp", "image/webp", {
        ...jpegInspection,
        detectedMimeType: "image/webp",
      }),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.code === "type-not-allowed",
  );
  assert.throws(
    () =>
      validateMediaUpload("producto.jpg", "image/jpeg", {
        ...jpegInspection,
        checksumSha256: "no-es-un-hash",
      }),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.code === "checksum-invalid",
  );
});
