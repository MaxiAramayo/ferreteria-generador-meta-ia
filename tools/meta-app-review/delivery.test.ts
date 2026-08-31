import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readMetaAppReviewDelivery } from "./delivery.ts";
import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";

test("la entrega rechaza otro tenant, otro cloud, URLs transformadas y bytes distintos", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meta-delivery-test-"));
  const path = join(directory, "receipt.json");
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const storageKey = `aramayo-posts/staging/${organizationId}/${metaAppReviewIds.mediaAssetId}`;
  const receipt = {
    organizationId,
    storageKey,
    storageVersion: 100,
    secureUrl: `https://res.cloudinary.com/m73l9k4c/image/upload/v100/${storageKey}.png`,
    checksumSha256: metaAppReviewPackage.sha256,
    width: 1080,
    height: 1350,
    mimeType: "image/png",
  };
  try {
    await writeFile(path, JSON.stringify(receipt));
    assert.equal(
      (await readMetaAppReviewDelivery(path)).storageKey,
      storageKey,
    );
    for (const changed of [
      { organizationId: "20000000-0000-4000-8000-000000000001" },
      { secureUrl: receipt.secureUrl.replace("m73l9k4c", "other") },
      { secureUrl: receipt.secureUrl.replace("/v100/", "/c_crop/v100/") },
      { checksumSha256: "a".repeat(64) },
      { storageVersion: 0 },
      { height: 1080 },
      { mimeType: "image/jpeg" },
    ]) {
      await writeFile(path, JSON.stringify({ ...receipt, ...changed }));
      await assert.rejects(
        readMetaAppReviewDelivery(path),
        /original aprobado/u,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
