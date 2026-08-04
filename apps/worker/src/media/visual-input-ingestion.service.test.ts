import assert from "node:assert/strict";
import test from "node:test";

import type { MediaAssetRecord } from "@aramayo/domain";
import sharp from "sharp";

import type { UploadMediaCommand } from "./media-lifecycle.service.ts";
import { VisualInputIngestionService } from "./visual-input-ingestion.service.ts";
import { SharpVisualInputPreparer } from "./visual-input-preparer.ts";

const organizationId = "org-aramayo";
const ownerMembershipId = "membership-1";

class FakeMediaUploader {
  readonly calls: UploadMediaCommand[] = [];

  upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
    this.calls.push(command);
    return Promise.resolve({
      createdAt: "2026-08-03T12:00:00.000Z",
      id: command.mediaAssetId,
      organizationId: command.organizationId,
      origin: command.origin,
      originalFileName: command.originalFileName,
      ownerMembershipId: command.ownerMembershipId,
      status: "available",
      storageProvider: "cloudinary",
      updatedAt: "2026-08-03T12:00:00.000Z",
    });
  }
}

async function photograph(width: number, height: number): Promise<Uint8Array> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let index = 0; index < raw.length; index += 1) {
    raw[index] = (index * 37) % 256;
  }
  return new Uint8Array(
    await sharp(raw, { raw: { channels, height, width } }).jpeg().toBuffer(),
  );
}

function serviceWith(uploader: FakeMediaUploader): VisualInputIngestionService {
  return new VisualInputIngestionService(
    new SharpVisualInputPreparer(),
    uploader,
  );
}

function command(
  bytes: Uint8Array,
): Parameters<VisualInputIngestionService["ingest"]>[0] {
  return {
    bytes,
    organizationId,
    ownerMembershipId,
    ownerOrganizationId: organizationId,
    role: "mascot_photo",
  };
}

test("una foto grande persiste original y derivado por separado", async () => {
  const uploader = new FakeMediaUploader();
  const result = await serviceWith(uploader).ingest(
    command(await photograph(4000, 3000)),
  );

  assert.equal(result.status, "ingested");
  assert.equal(uploader.calls.length, 2);
  assert.notEqual(result.original.id, result.reference.id);
  // El derivado no puede pisar al original: son dos archivos distintos.
  assert.notEqual(uploader.calls[0]?.bytes, uploader.calls[1]?.bytes);
  assert.match(String(uploader.calls[0]?.originalFileName), /-original-/u);
  assert.match(String(uploader.calls[1]?.originalFileName), /-referencia-/u);
});

test("una foto que no supera el tope no se sube dos veces", async () => {
  const uploader = new FakeMediaUploader();
  const result = await serviceWith(uploader).ingest(
    command(await photograph(960, 1280)),
  );

  assert.equal(result.status, "ingested");
  assert.equal(uploader.calls.length, 1);
  assert.equal(result.original.id, result.reference.id);
});

test("la misma foto ingresada dos veces cae sobre los mismos activos", async () => {
  const source = await photograph(4000, 3000);
  const first = new FakeMediaUploader();
  const second = new FakeMediaUploader();
  const a = await serviceWith(first).ingest(command(source));
  const b = await serviceWith(second).ingest(command(source));

  assert.equal(a.status, "ingested");
  assert.equal(b.status, "ingested");
  assert.equal(a.original.id, b.original.id);
  assert.equal(a.reference.id, b.reference.id);
});

test("dos fotos distintas no comparten identificador", async () => {
  const uploader = new FakeMediaUploader();
  const service = serviceWith(uploader);
  const a = await service.ingest(command(await photograph(1200, 1600)));
  const b = await service.ingest(command(await photograph(1600, 1200)));

  assert.equal(a.status, "ingested");
  assert.equal(b.status, "ingested");
  assert.notEqual(a.original.id, b.original.id);
});

test("una entrada rechazada no llega a almacenamiento", async () => {
  const uploader = new FakeMediaUploader();
  const result = await serviceWith(uploader).ingest(
    command(await photograph(300, 400)),
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.rejection.code, "resolution-insufficient");
  assert.equal(uploader.calls.length, 0);
});

test("el nombre almacenado declara una extensión que coincide con el contenido", async () => {
  const uploader = new FakeMediaUploader();
  await serviceWith(uploader).ingest(command(await photograph(1200, 1600)));

  for (const call of uploader.calls) {
    assert.equal(call.declaredMimeType, "image/jpeg");
    assert.match(call.originalFileName, /\.jpg$/u);
  }
});
