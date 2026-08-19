import assert from "node:assert/strict";
import test from "node:test";

import {
  facebookMediaPolicy,
  instagramMediaPolicy,
  validateFacebookCopy,
  validateFacebookDelivery,
  validateFacebookGeometry,
  type FacebookMediaDecision,
} from "./index.ts";

const imageUrl =
  "https://res.cloudinary.com/m73l9k4c/image/upload/v3/pieza.jpg";

function rejectionOf(decision: FacebookMediaDecision): string {
  assert.equal(decision.status, "rejected");
  return decision.rejection.code;
}

test("una pieza JPEG entregada por HTTPS se acepta", () => {
  assert.equal(
    validateFacebookGeometry({ height: 1350, url: imageUrl, width: 1080 })
      .status,
    "accepted",
  );
  assert.equal(
    validateFacebookDelivery({ byteSize: 900_000, mimeType: "image/jpeg" })
      .status,
    "accepted",
  );
});

test("la Page no impone proporción y acepta los tres formatos del catálogo", () => {
  for (const [width, height] of [
    [1080, 1350],
    [1080, 1080],
    [1080, 1920],
    [1640, 624],
  ] as const) {
    assert.equal(
      validateFacebookGeometry({ height, url: imageUrl, width }).status,
      "accepted",
      `${String(width)}×${String(height)}`,
    );
  }
});

test("una URL que Meta no puede descargar se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateFacebookGeometry({
        height: 1350,
        url: "https://localhost/pieza.jpg",
        width: 1080,
      }),
    ),
    "url-not-public",
  );
});

test("una pieza sin medidas o más angosta que el mínimo se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateFacebookGeometry({ height: 0, url: imageUrl, width: 0 }),
    ),
    "resolution-insufficient",
  );
  assert.equal(
    rejectionOf(
      validateFacebookGeometry({ height: 400, url: imageUrl, width: 319 }),
    ),
    "resolution-insufficient",
  );
});

test("Facebook admite más formatos que Instagram", () => {
  for (const mimeType of facebookMediaPolicy.mimeTypes) {
    assert.equal(
      validateFacebookDelivery({ byteSize: 900_000, mimeType }).status,
      "accepted",
      mimeType,
    );
  }
  assert.equal(
    rejectionOf(
      validateFacebookDelivery({ byteSize: 900_000, mimeType: "image/webp" }),
    ),
    "type-not-allowed",
  );
});

test("una pieza válida para Instagram puede pesar demasiado para Facebook", () => {
  // El tope de la Page es la mitad. La diferencia es real y hay que respetarla:
  // dar por buena la validación del otro destino publicaría un rechazo.
  assert.ok(
    facebookMediaPolicy.maximumByteSize < instagramMediaPolicy.maximumByteSize,
  );
  const between = facebookMediaPolicy.maximumByteSize + 1;
  assert.ok(between <= instagramMediaPolicy.maximumByteSize);
  assert.equal(
    rejectionOf(
      validateFacebookDelivery({ byteSize: between, mimeType: "image/jpeg" }),
    ),
    "file-too-large",
  );
});

test("una publicación de Page exige texto", () => {
  assert.equal(rejectionOf(validateFacebookCopy("")), "copy-empty");
  assert.equal(rejectionOf(validateFacebookCopy("   \n ")), "copy-empty");
  assert.equal(
    validateFacebookCopy("Filtros Wega en stock. Consultanos.").status,
    "accepted",
  );
});

test("un texto más largo que el máximo se rechaza", () => {
  assert.equal(
    rejectionOf(
      validateFacebookCopy(
        "a".repeat(facebookMediaPolicy.copyMaximumLength + 1),
      ),
    ),
    "copy-too-long",
  );
  assert.equal(
    validateFacebookCopy("a".repeat(facebookMediaPolicy.copyMaximumLength))
      .status,
    "accepted",
  );
});
