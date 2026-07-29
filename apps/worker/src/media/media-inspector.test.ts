import assert from "node:assert/strict";
import test from "node:test";

import { MediaValidationError } from "@aramayo/domain";

import { SharpMediaInspector } from "./media-inspector.ts";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("Sharp fuerza decodificación y devuelve metadatos derivados del contenido", async () => {
  const inspector = new SharpMediaInspector();

  const inspection = await inspector.inspect({ bytes: onePixelPng });

  assert.equal(inspection.detectedMimeType, "image/png");
  assert.equal(inspection.byteSize, onePixelPng.byteLength);
  assert.equal(inspection.width, 1);
  assert.equal(inspection.height, 1);
  assert.match(inspection.checksumSha256, /^[a-f0-9]{64}$/u);
});

test("Sharp rechaza una cabecera truncada y no confía en la extensión", async () => {
  const inspector = new SharpMediaInspector();

  await assert.rejects(
    inspector.inspect({
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
    (cause: unknown) =>
      cause instanceof MediaValidationError &&
      cause.message.includes("corrupta"),
  );
});
