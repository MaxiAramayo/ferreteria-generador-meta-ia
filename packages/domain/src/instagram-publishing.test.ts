import assert from "node:assert/strict";
import test from "node:test";

import {
  instagramMediaPolicy,
  validateInstagramCaption,
  validateInstagramMedia,
  type InstagramMediaCandidate,
  type InstagramMediaDecision,
} from "./index.ts";

function candidate(
  overrides: Partial<InstagramMediaCandidate> = {},
): InstagramMediaCandidate {
  return Object.freeze({
    byteSize: 900_000,
    height: 1350,
    mimeType: "image/jpeg",
    url: "https://res.cloudinary.com/m73l9k4c/image/upload/v3/pieza.jpg",
    width: 1080,
    ...overrides,
  });
}

function rejectionOf(decision: InstagramMediaDecision): string {
  assert.equal(decision.status, "rejected");
  return decision.rejection.code;
}

test("una pieza de feed 4:5 en JPEG se acepta", () => {
  const decision = validateInstagramMedia("instagram_feed", candidate());
  assert.equal(decision.status, "accepted");
});

test("una pieza cuadrada entra en el rango del feed", () => {
  const decision = validateInstagramMedia(
    "instagram_feed",
    candidate({ height: 1080 }),
  );
  assert.equal(decision.status, "accepted");
});

test("una historia 9:16 se acepta aunque la entrega la haya reducido", () => {
  // La variante de entrega limita el lado largo a 1440 px: 1080×1920 sale como
  // 810×1440 y la proporción se conserva.
  const decision = validateInstagramMedia(
    "instagram_story",
    candidate({ height: 1440, width: 810 }),
  );
  assert.equal(decision.status, "accepted");
});

test("una pieza de historia no entra en el feed", () => {
  assert.equal(
    rejectionOf(
      validateInstagramMedia(
        "instagram_feed",
        candidate({ height: 1920, width: 1080 }),
      ),
    ),
    "aspect-ratio-unsupported",
  );
});

test("una pieza de feed no entra en una historia", () => {
  assert.equal(
    rejectionOf(validateInstagramMedia("instagram_story", candidate())),
    "aspect-ratio-unsupported",
  );
});

test("el PNG que produce el render se rechaza antes de llamar a Meta", () => {
  assert.equal(
    rejectionOf(
      validateInstagramMedia(
        "instagram_feed",
        candidate({ mimeType: "image/png" }),
      ),
    ),
    "type-not-allowed",
  );
});

test("una pieza que supera el peso admitido se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateInstagramMedia(
        "instagram_feed",
        candidate({ byteSize: instagramMediaPolicy.maximumByteSize + 1 }),
      ),
    ),
    "file-too-large",
  );
});

test("una pieza más angosta que el mínimo se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateInstagramMedia(
        "instagram_feed",
        candidate({ height: 400, width: 319 }),
      ),
    ),
    "resolution-insufficient",
  );
});

test("una pieza sin medidas utilizables se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateInstagramMedia(
        "instagram_feed",
        candidate({ height: 0, width: 0 }),
      ),
    ),
    "resolution-insufficient",
  );
});

test("la URL se valida antes que cualquier medida", () => {
  // El candidato incumple además el tipo y el peso; igual se rechaza por URL,
  // porque una dirección que Meta no descarga vuelve irrelevante lo demás.
  for (const url of [
    "http://res.cloudinary.com/m73l9k4c/pieza.jpg",
    "https://localhost/pieza.jpg",
    "https://127.0.0.1/pieza.jpg",
    "https://192.168.1.10/pieza.jpg",
    "https://10.0.0.4/pieza.jpg",
    "https://172.16.9.9/pieza.jpg",
    "https://almacenamiento.local/pieza.jpg",
    "https://usuario:clave@res.cloudinary.com/pieza.jpg",
    "no-es-una-url",
  ]) {
    assert.equal(
      rejectionOf(
        validateInstagramMedia(
          "instagram_feed",
          candidate({ byteSize: 900_000_000, mimeType: "image/png", url }),
        ),
      ),
      "url-not-public",
      url,
    );
  }
});

test("un pie normal del feed se acepta", () => {
  const decision = validateInstagramCaption(
    "instagram_feed",
    "Filtros Wega en stock. Consultanos por WhatsApp. #ferreteria @ferreteria_aramayo",
  );
  assert.equal(decision.status, "accepted");
});

test("una historia no publica pie y se rechaza en vez de ignorarlo", () => {
  assert.equal(
    rejectionOf(validateInstagramCaption("instagram_story", "Texto")),
    "caption-unsupported",
  );
});

test("una historia sin pie se acepta", () => {
  assert.equal(
    validateInstagramCaption("instagram_story", undefined).status,
    "accepted",
  );
  assert.equal(
    validateInstagramCaption("instagram_story", "").status,
    "accepted",
  );
});

test("un pie más largo que el máximo se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateInstagramCaption(
        "instagram_feed",
        "a".repeat(instagramMediaPolicy.captionMaximumLength + 1),
      ),
    ),
    "caption-too-long",
  );
});

test("las etiquetas se cuentan sin confundirlas con parte de una palabra", () => {
  const withinLimit = Array.from(
    { length: instagramMediaPolicy.captionMaximumHashtags },
    (_unused, index) => `#etiqueta${String(index)}`,
  ).join(" ");
  assert.equal(
    validateInstagramCaption("instagram_feed", `${withinLimit} color#rojo`)
      .status,
    "accepted",
  );
  assert.equal(
    rejectionOf(
      validateInstagramCaption("instagram_feed", `${withinLimit} #una-mas`),
    ),
    "hashtags-exceeded",
  );
});

test("las menciones se cuentan y su exceso se rechaza", () => {
  const mentions = Array.from(
    { length: instagramMediaPolicy.captionMaximumMentions + 1 },
    (_unused, index) => `@cuenta${String(index)}`,
  ).join(" ");
  assert.equal(
    rejectionOf(validateInstagramCaption("instagram_feed", mentions)),
    "mentions-exceeded",
  );
});
