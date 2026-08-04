import assert from "node:assert/strict";
import test from "node:test";

import {
  ContentBriefValidationError,
  parseContentBriefJson,
  validateContentBrief,
  type ContentBriefEvidenceEntry,
  type ContentBriefValidationErrorCode,
} from "./content-brief.ts";

const VALIDATED_AT = "2026-07-30T12:00:00.000Z";
const CAPTION =
  "Pasá por el local y consultanos cuál te sirve para el trabajo que tenés entre manos.";

function minutesBefore(minutes: number): string {
  return new Date(Date.parse(VALIDATED_AT) - minutes * 60_000).toISOString();
}

const documentEvidence: ContentBriefEvidenceEntry = Object.freeze({
  citationId: "K1",
  externalProductId: null,
  kind: "document",
  observedAt: null,
  reference: "operacion.horarios@2",
  supportedClaims: Object.freeze([
    "business_hours" as const,
    "location" as const,
    "product_attribute" as const,
    "service" as const,
  ]),
});

function priceEvidence(observedAt: string): ContentBriefEvidenceEntry {
  return Object.freeze({
    citationId: "C1",
    externalProductId: "odoo-product-42",
    kind: "commercial",
    observedAt,
    reference: "odoo:price:42",
    supportedClaims: Object.freeze(["price" as const]),
  });
}

function stockEvidence(observedAt: string): ContentBriefEvidenceEntry {
  return Object.freeze({
    citationId: "C3",
    externalProductId: "odoo-product-42",
    kind: "commercial",
    observedAt,
    reference: "odoo:stock:42",
    supportedClaims: Object.freeze(["stock" as const]),
  });
}

const productEvidence: ContentBriefEvidenceEntry = Object.freeze({
  citationId: "C2",
  externalProductId: "odoo-product-42",
  kind: "commercial",
  observedAt: minutesBefore(1),
  reference: "odoo:product:42",
  supportedClaims: Object.freeze(["product_attribute" as const]),
});

function candidate(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    brand: "ferreteria",
    callToAction: { kind: "whatsapp", label: "Consultanos por WhatsApp" },
    caption: CAPTION,
    creativeProposal: "Tono directo, foco en el uso real de la herramienta.",
    missingInformation: [],
    objective: "product",
    products: [
      {
        evidenceId: "C2",
        externalProductId: "odoo-product-42",
        label: "Taladro percutor",
      },
    ],
    requiresHumanApproval: false,
    subtitle: null,
    title: "Taladro percutor para tu obra",
    verifiedFacts: [
      {
        claimKind: "product_attribute",
        evidenceId: "C2",
        statement: "El taladro percutor está activo en el catálogo.",
      },
    ],
    visualDirection: "clean_product",
    ...overrides,
  };
}

function expectRejection(
  input: Parameters<typeof validateContentBrief>[0],
  code: ContentBriefValidationErrorCode,
): ContentBriefValidationError {
  try {
    validateContentBrief(input);
  } catch (cause: unknown) {
    assert.ok(cause instanceof ContentBriefValidationError);
    assert.equal(cause.code, code);
    return cause;
  }
  throw new assert.AssertionError({
    message: `Se esperaba el rechazo ${code}.`,
  });
}

test("acepta un brief cuyos hechos citan evidencia vigente del tipo correcto", () => {
  const brief = validateContentBrief({
    candidate: candidate(),
    evidence: [documentEvidence, productEvidence],
    validatedAt: VALIDATED_AT,
  });

  assert.equal(brief.title, "Taladro percutor para tu obra");
  assert.equal(brief.products[0]?.evidenceId, "C2");
  assert.equal(brief.verifiedFacts[0]?.claimKind, "product_attribute");
  assert.equal(brief.requiresHumanApproval, false);
});

test("rechaza una cita de evidencia que el servidor nunca emitió", () => {
  expectRejection(
    {
      candidate: candidate({
        verifiedFacts: [
          {
            claimKind: "price",
            evidenceId: "C9",
            statement: "El precio vigente sale $ 10.",
          },
        ],
      }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "evidence-unknown",
  );
});

test("un documento no puede sustentar precio ni stock", () => {
  for (const claimKind of ["price", "stock"]) {
    expectRejection(
      {
        candidate: candidate({
          verifiedFacts: [
            {
              claimKind,
              evidenceId: "K1",
              statement: "Un documento afirma un dato volátil.",
            },
          ],
        }),
        evidence: [documentEvidence, productEvidence],
        validatedAt: VALIDATED_AT,
      },
      "evidence-unsupported-claim",
    );
  }
});

test("un precio leído hace más de quince minutos deja de ser publicable", () => {
  const facts = [
    {
      claimKind: "price",
      evidenceId: "C1",
      statement: "El precio vigente está informado por el sistema comercial.",
    },
  ];

  const fresh = validateContentBrief({
    candidate: candidate({ verifiedFacts: facts }),
    evidence: [priceEvidence(minutesBefore(14)), productEvidence],
    validatedAt: VALIDATED_AT,
  });
  assert.equal(fresh.verifiedFacts[0]?.claimKind, "price");

  expectRejection(
    {
      candidate: candidate({ verifiedFacts: facts }),
      evidence: [priceEvidence(minutesBefore(16)), productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "evidence-stale",
  );
});

test("un stock leído hace más de cinco minutos deja de ser publicable", () => {
  const facts = [
    {
      claimKind: "stock",
      evidenceId: "C3",
      statement: "Hay unidades disponibles en la sucursal consultada.",
    },
  ];

  const fresh = validateContentBrief({
    candidate: candidate({ verifiedFacts: facts }),
    evidence: [stockEvidence(minutesBefore(4)), productEvidence],
    validatedAt: VALIDATED_AT,
  });
  assert.equal(fresh.verifiedFacts[0]?.claimKind, "stock");

  expectRejection(
    {
      candidate: candidate({ verifiedFacts: facts }),
      evidence: [stockEvidence(minutesBefore(6)), productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "evidence-stale",
  );
});

test("un producto debe citar la observación comercial que le corresponde", () => {
  expectRejection(
    {
      candidate: candidate({
        products: [
          {
            evidenceId: "C2",
            externalProductId: "odoo-product-99",
            label: "Otro producto",
          },
        ],
      }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "product-not-evidenced",
  );
});

test("un producto no puede sustentarse en evidencia documental", () => {
  expectRejection(
    {
      candidate: candidate({
        products: [
          {
            evidenceId: "K1",
            externalProductId: "odoo-product-42",
            label: "Taladro percutor",
          },
        ],
      }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "product-not-evidenced",
  );
});

test("rechaza el mismo producto repetido", () => {
  expectRejection(
    {
      candidate: candidate({
        products: [
          {
            evidenceId: "C2",
            externalProductId: "odoo-product-42",
            label: "Taladro percutor",
          },
          {
            evidenceId: "C2",
            externalProductId: "odoo-product-42",
            label: "Taladro percutor 650W",
          },
        ],
      }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "duplicate-product",
  );
});

test("un importe en el copy exige un hecho de precio", () => {
  expectRejection(
    {
      candidate: candidate({
        caption: `${CAPTION} Lo tenés a $ 45.900.`,
      }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "unsupported-claim-in-copy",
  );
});

test("un descuento en el copy exige un hecho de promoción", () => {
  for (const caption of [
    `${CAPTION} Llevalo con 20% off.`,
    `${CAPTION} Aprovechá el descuento de esta semana.`,
  ]) {
    expectRejection(
      {
        candidate: candidate({ caption }),
        evidence: [documentEvidence, productEvidence],
        validatedAt: VALIDATED_AT,
      },
      "unsupported-claim-in-copy",
    );
  }
});

test("un horario en el copy exige un hecho de horario", () => {
  expectRejection(
    {
      candidate: candidate({ caption: `${CAPTION} Abrimos 08:30.` }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "unsupported-claim-in-copy",
  );

  const supported = validateContentBrief({
    candidate: candidate({
      caption: `${CAPTION} Abrimos 08:30.`,
      verifiedFacts: [
        {
          claimKind: "business_hours",
          evidenceId: "K1",
          statement: "El local abre a las 08:30 según el documento aprobado.",
        },
      ],
    }),
    evidence: [documentEvidence, productEvidence],
    validatedAt: VALIDATED_AT,
  });
  assert.equal(supported.verifiedFacts[0]?.claimKind, "business_hours");
});

test("declarar un faltante obliga a pedir aprobación humana", () => {
  const missingInformation = [
    {
      detail: "Falta confirmar el precio vigente con el responsable.",
      kind: "no_approved_source",
      subject: "price",
    },
  ];

  expectRejection(
    {
      candidate: candidate({ missingInformation }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "missing-approval",
  );

  const approved = validateContentBrief({
    candidate: candidate({ missingInformation, requiresHumanApproval: true }),
    evidence: [documentEvidence, productEvidence],
    validatedAt: VALIDATED_AT,
  });
  assert.equal(approved.missingInformation.length, 1);
});

test("una promoción siempre exige aprobación humana", () => {
  expectRejection(
    {
      candidate: candidate({ objective: "promotion" }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "missing-approval",
  );
});

test("rechaza propiedades desconocidas, enums inválidos y longitudes fuera de rango", () => {
  expectRejection(
    {
      candidate: candidate({ tone: "urgente" }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "schema-mismatch",
  );
  expectRejection(
    {
      candidate: candidate({ visualDirection: "cinematic" }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "schema-mismatch",
  );
  expectRejection(
    {
      candidate: candidate({ title: "Ok" }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "schema-mismatch",
  );
  expectRejection(
    {
      candidate: candidate({ caption: "Muy corto." }),
      evidence: [documentEvidence, productEvidence],
      validatedAt: VALIDATED_AT,
    },
    "schema-mismatch",
  );
});

test("una salida que no es JSON no produce candidato", () => {
  assert.throws(
    () => parseContentBriefJson("Lo siento, no puedo ayudarte con eso."),
    (cause: unknown) =>
      cause instanceof ContentBriefValidationError &&
      cause.code === "invalid-json",
  );
});
