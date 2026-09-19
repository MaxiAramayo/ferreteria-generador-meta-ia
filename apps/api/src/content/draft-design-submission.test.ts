import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestException } from "@nestjs/common";

import { draftDesignSubmission } from "./draft-design-submission.ts";
import type { PublicationDraftDesignDto } from "./dto/publication-draft.dto.ts";

function design(
  media: PublicationDraftDesignDto["media"],
): PublicationDraftDesignDto {
  return {
    content: { title: "¡Ya abrimos!" },
    format: "historia",
    layout: "historia-apertura-cartel",
    media,
    schemaVersion: 1,
    slug: "story-0f5ee2d4-20260908",
    theme: "promo",
  };
}

test("cada medio conserva su único origen", () => {
  const submission = draftDesignSubmission(
    design([
      {
        alt: "Pared de herramientas",
        brandAssetId: "brand/interior-herramientas",
      },
      { alt: "Gata", dataUrl: "data:image/jpeg;base64,/9j/4AAQ" },
      { alt: "Taladro", mediaAssetId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11" },
    ] as PublicationDraftDesignDto["media"]),
  );

  assert.deepEqual(
    submission.media.map((media) => Object.keys(media).sort()),
    [
      ["alt", "brandAssetId"],
      ["alt", "dataUrl"],
      ["alt", "mediaAssetId"],
    ],
  );
});

test("un medio sin origen o con dos orígenes se rechaza", () => {
  for (const media of [
    { alt: "Sin origen" },
    {
      alt: "Dos orígenes",
      dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
      mediaAssetId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    },
  ]) {
    assert.throws(
      () =>
        draftDesignSubmission(
          design([media] as PublicationDraftDesignDto["media"]),
        ),
      BadRequestException,
    );
  }
});
