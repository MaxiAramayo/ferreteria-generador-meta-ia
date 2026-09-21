import assert from "node:assert/strict";
import test from "node:test";

import type { LocationConfigurationResponse } from "@aramayo/contracts";

import { firstThatFits, fitWithin, framingAfterDrag } from "./opening-photo.ts";
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
  focusX: 50,
  focusY: 40,
  zoom: 100,
};

test("la vista previa compone el mismo documento que el borrador real", () => {
  const preview = openingStoryPreviewDocument({
    accent: "verde",
    designVariant: "cartel",
    kind: "apertura",
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

test("el lubricentro se ve con su marco, su paleta y el encuadre de la foto", () => {
  const preview = openingStoryPreviewDocument({
    accent: "marca",
    designVariant: "esquina",
    kind: "lubricentro",
    localDate: "2026-09-19",
    localTime: "08:30",
    locationId: central.id,
    locations: [central, rivadavia],
    photo: { ...photo, focusX: 100, focusY: 0, zoom: 140 },
    theme: "lubricentro",
  });

  assert.equal(preview.kind, "ready");
  const { document } = preview;
  assert.equal(document.layout, "historia-lubricentro-esquina");
  assert.equal(document.theme, "lubricentro");
  assert.equal(document.content.title, "¿Toca el service?");
  assert.equal(
    document.content.subtitle,
    "Cambio de aceite con fosa en República de Siria 365",
  );
  // El encuadre del panel llega tal cual al documento que se renderiza.
  const [framedMedia] = document.media;
  assert.ok(framedMedia);
  assert.deepEqual(framedMedia.focus, { x: 100, y: 0 });
  assert.equal(framedMedia.zoom, 1.4);
});

test("sin sucursal, el lubricentro no compone una historia de todas", () => {
  const preview = openingStoryPreviewDocument({
    accent: "marca",
    designVariant: "ventana",
    kind: "lubricentro",
    localDate: "2026-09-19",
    localTime: "08:30",
    locationId: null,
    locations: [],
    photo: null,
    theme: "lubricentro",
  });

  assert.equal(preview.kind, "blocked");
});

test("sin foto propia la vista previa usa la foto del local", () => {
  const preview = openingStoryPreviewDocument({
    accent: "marca",
    designVariant: "horario",
    kind: "apertura",
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
      kind: "apertura",
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
    kind: "apertura",
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
  // La foto se guarda un tercio más grande que la historia: acercarla sigue
  // mostrando píxeles de verdad.
  assert.deepEqual(fitWithin(3024, 4032), { height: 1920, width: 1440 });
  assert.deepEqual(fitWithin(4032, 3024), { height: 1080, width: 1440 });
  assert.deepEqual(fitWithin(1440, 2560), { height: 2560, width: 1440 });
  assert.deepEqual(fitWithin(600, 800), { height: 800, width: 600 });
});

test("se elige la mejor calidad que entra en el límite", () => {
  const sizes = new Map([
    [0.9, 5_000],
    [0.8, 3_000],
    [0.7, 2_000],
    [0.6, 1_000],
  ]);
  const encode = (quality: number): string =>
    "x".repeat(sizes.get(quality) ?? 0);

  assert.equal(firstThatFits(encode, 3_500)?.length, 3_000);
  assert.equal(firstThatFits(encode, 500), null);
});

test("arrastrar la foto mueve su encuadre hacia donde se la lleva", () => {
  // Una foto vertical dentro de la banda de la apertura: sobra alto para mover.
  const size = {
    boxHeight: 177,
    boxWidth: 320,
    naturalHeight: 1671,
    naturalWidth: 941,
  };
  const centered = { focusX: 50, focusY: 50, zoom: 150 };

  // Llevarla hacia arriba muestra una parte más baja de la foto.
  const up = framingAfterDrag(size, centered, { x: 0, y: -80 });
  assert.ok(up.focusY > 50, "Arrastrar hacia arriba tiene que subir el foco.");
  const down = framingAfterDrag(size, centered, { x: 0, y: 80 });
  assert.ok(down.focusY < 50);
  // El encuadre nunca se sale de sus límites, por lejos que se arrastre.
  assert.equal(
    framingAfterDrag(size, centered, { x: 0, y: -9_000 }).focusY,
    100,
  );
  assert.equal(framingAfterDrag(size, centered, { x: 0, y: 9_000 }).focusY, 0);

  // Una foto con la misma proporción que la historia no tiene sobrante: hay
  // que acercarla antes de poder moverla.
  const exact = framingAfterDrag(
    {
      boxHeight: 1920,
      boxWidth: 1080,
      naturalHeight: 1920,
      naturalWidth: 1080,
    },
    { focusX: 50, focusY: 50, zoom: 100 },
    { x: -120, y: -120 },
  );
  assert.deepEqual(exact, { focusX: 50, focusY: 50 });
  const zoomed = framingAfterDrag(
    {
      boxHeight: 1920,
      boxWidth: 1080,
      naturalHeight: 1920,
      naturalWidth: 1080,
    },
    { focusX: 50, focusY: 50, zoom: 150 },
    { x: -120, y: 0 },
  );
  assert.ok(zoomed.focusX > 50);
});
