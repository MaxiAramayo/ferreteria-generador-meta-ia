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

test("los rubros y los diferenciales de una historia recurrente viajan enteros", () => {
  const recurring = design([
    {
      alt: "Nuestra gata en el mostrador",
      dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
      focus: { x: 100, y: 0 },
      zoom: 1.4,
    },
  ]);
  recurring.content = {
    callToAction: "¿Buscás algo? Escribinos",
    features: [
      { icon: "herramientas", label: "Herramientas" },
      { icon: "sanitarios", label: "Sanitarios" },
    ],
    highlights: ["Asesoramiento personalizado"],
    items: ["Casa Central · República de Siria 365"],
    title: "¡Ya abrimos!",
  };
  recurring.layout = "historia-apertura-placa";
  const submission = draftDesignSubmission(recurring);

  assert.deepEqual(submission.content.features, [
    { icon: "herramientas", label: "Herramientas" },
    { icon: "sanitarios", label: "Sanitarios" },
  ]);
  assert.deepEqual(submission.content.highlights, [
    "Asesoramiento personalizado",
  ]);
  // El encuadre de la foto también: es lo que se vio en el panel.
  const [media] = submission.media;
  assert.ok(media);
  assert.deepEqual(media.focus, { x: 100, y: 0 });
  assert.equal(media.zoom, 1.4);
});

test("el precio de una historia de producto llega entero al caso de uso", () => {
  // El precio de estas piezas lo escribe quien publica y se dibuja en la
  // pieza, nunca en el caption (`ADR-031`). Si el transporte lo descartara,
  // la historia saldría sin el dato que le da sentido.
  const product = design([
    {
      alt: "Guantes de trabajo sobre el mostrador",
      dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
      fit: "cover",
      focus: { x: 50, y: 30 },
      zoom: 1.2,
    },
  ]);
  product.content = {
    badge: "Oferta",
    callToAction: "Consultanos",
    category: "Seguridad industrial",
    items: ["Talles 8 al 11", "Palma reforzada"],
    previousPrice: "$ 62.400",
    price: "$ 48.900",
    subtitle: "Con agarre reforzado",
    title: "Guantes de trabajo",
    validity: "Hasta el sábado",
  };
  product.layout = "historia-producto-etiqueta";
  const submission = draftDesignSubmission(product);

  assert.equal(submission.layout, "historia-producto-etiqueta");
  assert.equal(submission.content.price, "$ 48.900");
  assert.equal(submission.content.previousPrice, "$ 62.400");
  assert.equal(submission.content.badge, "Oferta");
  assert.equal(submission.content.validity, "Hasta el sábado");
  assert.deepEqual(submission.content.items, [
    "Talles 8 al 11",
    "Palma reforzada",
  ]);
  const [photo] = submission.media;
  assert.ok(photo);
  assert.equal(photo.fit, "cover");
  assert.deepEqual(photo.focus, { x: 50, y: 30 });
  assert.equal(photo.zoom, 1.2);
});
