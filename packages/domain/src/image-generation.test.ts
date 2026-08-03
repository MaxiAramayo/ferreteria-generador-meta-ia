import assert from "node:assert/strict";
import test from "node:test";

import {
  assertImageRequestSupported,
  imageGenerationLimits,
  ImageGenerationError,
  imageSizeForFormat,
  visualFormatIds,
  type EditImageCommand,
  type GenerateImageCommand,
  type ImageReferenceInput,
} from "./index.ts";

const reference: ImageReferenceInput = Object.freeze({
  bytes: new Uint8Array([1, 2, 3]),
  mimeType: "image/png",
  name: "referencia.png",
});

function generateCommand(
  overrides: Partial<GenerateImageCommand> = {},
): GenerateImageCommand {
  return Object.freeze({
    background: "opaque",
    kind: "generate",
    negativeGuidance: [],
    prompt: "una escena",
    quality: "medium",
    size: "1024x1024",
    ...overrides,
  });
}

function editCommand(
  overrides: Partial<EditImageCommand> = {},
): EditImageCommand {
  return Object.freeze({
    background: "opaque",
    kind: "edit",
    negativeGuidance: [],
    prompt: "una escena",
    quality: "medium",
    references: [reference] as EditImageCommand["references"],
    size: "1024x1024",
    ...overrides,
  });
}

function failureCode(run: () => unknown): string {
  try {
    run();
  } catch (cause: unknown) {
    assert.ok(cause instanceof ImageGenerationError);
    assert.equal(cause.retryable, false);
    return cause.code;
  }
  assert.fail("Se esperaba un rechazo.");
}

test("cada formato resuelve a un tamaño que el proveedor admite", () => {
  for (const format of visualFormatIds) {
    const size = imageSizeForFormat(format);
    assert.ok(["1024x1024", "1024x1536", "1536x1024"].includes(size));
  }
});

test("el tamaño elegido es el de proporción más cercana", () => {
  // Los cuadrados coinciden exacto.
  assert.equal(imageSizeForFormat("cuadrado"), "1024x1024");
  assert.equal(imageSizeForFormat("destacada"), "1024x1024");
  // Vertical: feed 4:5 e historia 9:16 van al vertical del proveedor.
  assert.equal(imageSizeForFormat("feed"), "1024x1536");
  assert.equal(imageSizeForFormat("historia"), "1024x1536");
  // El banner es apaisado y no hay nada más ancho que 3:2.
  assert.equal(imageSizeForFormat("banner-fb"), "1536x1024");
});

test("un pedido válido no se rechaza", () => {
  assertImageRequestSupported(generateCommand());
  assertImageRequestSupported(editCommand());
});

test("un tamaño o una calidad que el proveedor no admite frenan la llamada", () => {
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(
        generateCommand({ size: "2048x2048" as never }),
      );
    }),
    "unsupported-parameter",
  );
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(
        generateCommand({ quality: "ultra" as never }),
      );
    }),
    "unsupported-parameter",
  );
});

test("un prompt vacío o desmedido frena la llamada", () => {
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(generateCommand({ prompt: "" }));
    }),
    "unsupported-parameter",
  );
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(
        generateCommand({
          prompt: "a".repeat(imageGenerationLimits.promptMaximum + 1),
        }),
      );
    }),
    "unsupported-parameter",
  );
});

test("una edición con demasiadas referencias frena la llamada", () => {
  const many = Array.from(
    { length: imageGenerationLimits.referencesMaximum + 1 },
    () => reference,
  ) as unknown as EditImageCommand["references"];
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(editCommand({ references: many }));
    }),
    "unsupported-parameter",
  );
});

test("una edición no puede prometer un fondo transparente que no va a tener", () => {
  assert.equal(
    failureCode(() => {
      assertImageRequestSupported(editCommand({ background: "transparent" }));
    }),
    "unsupported-parameter",
  );
  // Generar sí puede: no hay referencia opaca que lo impida.
  assertImageRequestSupported(generateCommand({ background: "transparent" }));
});

test("el fallo no reproduce nada del pedido en su mensaje", () => {
  try {
    assertImageRequestSupported(
      generateCommand({ prompt: "", size: "9x9" as never }),
    );
    assert.fail("Se esperaba un rechazo.");
  } catch (cause: unknown) {
    assert.ok(cause instanceof ImageGenerationError);
    assert.equal(cause.message, "La generación de imagen no pudo completarse.");
  }
});
