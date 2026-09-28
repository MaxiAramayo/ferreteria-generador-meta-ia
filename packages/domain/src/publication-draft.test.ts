import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizePublicationDraftContent,
  PublicationDraftValidationError,
} from "./publication-draft.ts";

test("normaliza caption y referencias de producto sin perder el orden", () => {
  assert.deepEqual(
    normalizePublicationDraftContent({
      caption: "  Consultá disponibilidad. ",
      products: [
        { label: " Taladro 13 mm ", reference: "SKU:TA-13" },
        { label: " Mecha copa ", reference: "SKU:MC-20" },
      ],
    }),
    {
      caption: "Consultá disponibilidad.",
      products: [
        { label: "Taladro 13 mm", reference: "SKU:TA-13" },
        { label: "Mecha copa", reference: "SKU:MC-20" },
      ],
    },
  );
});

test("acepta caption vacío y rechaza uno largo y referencias inseguras", () => {
  // Una historia no publica texto: exigirlo era escribir algo que nadie lee.
  assert.deepEqual(
    normalizePublicationDraftContent({ caption: " ", products: [] }),
    { caption: "", products: [] },
  );
  assert.throws(
    () =>
      normalizePublicationDraftContent({
        caption: "a".repeat(2_201),
        products: [],
      }),
    (cause: unknown) =>
      cause instanceof PublicationDraftValidationError &&
      cause.code === "caption-invalid",
  );
  assert.throws(
    () =>
      normalizePublicationDraftContent({
        caption: "Consultá.",
        products: [{ label: "Producto", reference: "../producto" }],
      }),
    (cause: unknown) =>
      cause instanceof PublicationDraftValidationError &&
      cause.code === "product-reference-invalid",
  );
});

test("rechaza productos duplicados y listas fuera del límite", () => {
  assert.throws(
    () =>
      normalizePublicationDraftContent({
        caption: "Consultá.",
        products: [
          { label: "Producto A", reference: "SKU-1" },
          { label: "Producto B", reference: "SKU-1" },
        ],
      }),
    (cause: unknown) =>
      cause instanceof PublicationDraftValidationError &&
      cause.code === "duplicate-product",
  );
  assert.throws(
    () =>
      normalizePublicationDraftContent({
        caption: "Consultá.",
        products: Array.from({ length: 9 }, (_, index) => ({
          label: `Producto ${String(index)}`,
          reference: `SKU-${String(index)}`,
        })),
      }),
    (cause: unknown) =>
      cause instanceof PublicationDraftValidationError &&
      cause.code === "too-many-products",
  );
});
