import assert from "node:assert/strict";
import test from "node:test";

import type { LocationConfigurationResponse } from "@aramayo/contracts";

import { firstThatFits, fitWithin } from "./opening-photo.ts";
import { openingStoryPreviewDocument } from "./opening-story-preview.ts";

const central: LocationConfigurationResponse = {
  addressLine: "República de Siria 365",
  city: "Frías",
  id: "location-central",
  isActive: true,
  name: "Casa Central",
  openingHours: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  province: "Santiago del Estero",
  timeZone: "America/Argentina/Cordoba",
  version: 3,
};
const rivadavia: LocationConfigurationResponse = {
  ...central,
  addressLine: "Rivadavia 673",
  id: "location-rivadavia",
  name: "Sucursal",
};
const photo = {
  alt: "Nuestra gata en el mostrador",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
  focusY: 40,
};

test("la vista previa compone el mismo documento que el borrador real", () => {
  const preview = openingStoryPreviewDocument({
    accent: "verde",
    designVariant: "cartel",
    localDate: "2026-09-19",
    localTime: "08:30",
    locationId: null,
    locations: [central, rivadavia],
    photo,
    theme: "promo",
  });

  assert.equal(preview.kind, "ready");
  const { document } = preview;
  assert.equal(document.layout, "historia-apertura-cartel");
  assert.equal(document.theme, "promo");
  assert.equal(document.content.accent, "verde");
  assert.equal(document.content.title, "¡Ya abrimos!");
  assert.equal(document.content.greeting, "Buen día, Frías");
  assert.equal(
    document.content.validity,
    "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  );
  assert.deepEqual(document.content.items, [
    "Casa Central · República de Siria 365",
    "Sucursal · Rivadavia 673",
  ]);
  assert.deepEqual(document.media[0]?.reference, {
    dataUrl: photo.dataUrl,
    source: "inline",
  });
});

test("sin foto propia la vista previa usa la foto del local", () => {
  const preview = openingStoryPreviewDocument({
    accent: "marca",
    designVariant: "horario",
    localDate: "2026-09-19",
    localTime: "16:30",
    locationId: central.id,
    locations: [central, rivadavia],
    photo: null,
    theme: "taller",
  });

  assert.equal(preview.kind, "ready");
  assert.equal(preview.document.content.greeting, "Buenas tardes, Frías");
  assert.deepEqual(preview.document.media[0]?.reference, {
    assetId: "brand/interior-herramientas",
    source: "brand-library",
  });
});

test("la imagen propia sin imagen y una sucursal sin horario no inventan una historia", () => {
  assert.deepEqual(
    openingStoryPreviewDocument({
      accent: "marca",
      designVariant: "imagen",
      localDate: "2026-09-19",
      localTime: "08:30",
      locationId: null,
      locations: [central],
      photo: null,
      theme: "promo",
    }),
    { kind: "needs-photo" },
  );

  const blocked = openingStoryPreviewDocument({
    accent: "marca",
    designVariant: "cartel",
    localDate: "2026-09-19",
    localTime: "08:30",
    locationId: null,
    locations: [{ ...central, openingHours: " " }],
    photo: null,
    theme: "promo",
  });
  assert.equal(blocked.kind, "blocked");
});

test("una foto se achica sin deformarse y nunca se agranda", () => {
  assert.deepEqual(fitWithin(3024, 4032), { height: 1440, width: 1080 });
  assert.deepEqual(fitWithin(4032, 3024), { height: 810, width: 1080 });
  assert.deepEqual(fitWithin(1080, 1920), { height: 1920, width: 1080 });
  assert.deepEqual(fitWithin(600, 800), { height: 800, width: 600 });
});

test("se elige la mejor calidad que entra en el límite", () => {
  const sizes = new Map([
    [0.86, 5_000],
    [0.74, 3_000],
    [0.62, 1_000],
  ]);
  const encode = (quality: number): string =>
    "x".repeat(sizes.get(quality) ?? 0);

  assert.equal(firstThatFits(encode, 3_500)?.length, 3_000);
  assert.equal(firstThatFits(encode, 500), null);
});
