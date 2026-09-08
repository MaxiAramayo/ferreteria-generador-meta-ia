import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalPrePublishProfileSchemaVersion,
  createApprovalPrePublishProfile,
  readApprovalPrePublishProfile,
} from "./pre-publish-validation.ts";
import type { ContentBrief } from "./content-brief.ts";

const priceEvidence = Object.freeze({
  citationId: "price-1",
  externalProductId: "product-1",
  kind: "commercial" as const,
  observedAt: "2026-09-07T12:00:00.000Z",
  reference: "catalog:price:product-1",
  supportedClaims: Object.freeze(["price" as const]),
});

function brief(): ContentBrief {
  return Object.freeze({
    brand: "ferreteria",
    callToAction: Object.freeze({ kind: "whatsapp", label: "Consultanos" }),
    caption: "20% de descuento: $ 123.456,00.",
    creativeProposal: "Producto destacado sobre fondo limpio.",
    missingInformation: Object.freeze([]),
    objective: "promotion",
    products: Object.freeze([]),
    requiresHumanApproval: true,
    subtitle: null,
    title: "Oferta vigente",
    verifiedFacts: Object.freeze([
      Object.freeze({
        claimKind: "price" as const,
        evidenceId: "price-1",
        statement: "$ 123.456,00",
      }),
    ]),
    visualDirection: "clean_product",
  });
}

test("el perfil aprobado conserva sólo la identidad necesaria para revalidar", () => {
  const profile = createApprovalPrePublishProfile({
    brief: brief(),
    evidence: Object.freeze([priceEvidence]),
  });

  assert.deepEqual(profile.requiredClaims, ["price", "promotion"]);
  assert.deepEqual(profile.factualClaims, [
    {
      claimKind: "price",
      evidenceId: "price-1",
      externalProductId: "product-1",
      statement: "$ 123.456,00",
    },
  ]);
});

test("un perfil incompleto no se interpreta como evidencia vigente", () => {
  assert.deepEqual(
    readApprovalPrePublishProfile({
      prePublishProfile: {
        factualClaims: [],
        requiredClaims: ["price", "price"],
        schemaVersion: approvalPrePublishProfileSchemaVersion,
      },
    }),
    { status: "invalid" },
  );
});

test("el texto de una pieza manual también exige evidencia revalidable", () => {
  const profile = createApprovalPrePublishProfile({
    contentText: Object.freeze(["Precio contado: $ 50.000,00"]),
    evidence: Object.freeze([]),
  });

  assert.deepEqual(profile.requiredClaims, ["price"]);
  assert.deepEqual(profile.factualClaims, []);
});
