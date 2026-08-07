/**
 * Dataset sintético de P4-T08.
 *
 * Los valores no representan precio ni stock reales de Aramayo. Sirven para
 * detectar que la capa determinista conserva exactamente el snapshot factual
 * y para revisar, por separado, estética y fidelidad visual.
 */

import {
  type ContentBrief,
  type ImageQualityFactualSnapshot,
  type VisualFormatId,
  type VisualProfileId,
  type VisualReferenceRole,
} from "@aramayo/domain";

import {
  compositionBackgrounds,
  type CompositionBackground,
} from "../visual/composition-snapshot-cases.ts";

export const imageQualityDatasetVersion = "image-quality/2026-08-07.2";

export const imageQualityEvaluationFormats = [
  "feed",
  "cuadrado",
  "historia",
] as const satisfies readonly VisualFormatId[];

export type ImageQualityCategory =
  "filter" | "institutional" | "lubricant" | "offer" | "tool";

export interface ImageQualityDatasetEntry {
  readonly background: CompositionBackground;
  readonly brief: ContentBrief;
  readonly caseId: string;
  readonly category: ImageQualityCategory;
  readonly expected: ImageQualityFactualSnapshot;
  readonly format: (typeof imageQualityEvaluationFormats)[number];
  readonly profileId: VisualProfileId;
  readonly reference: ImageQualityReferenceRequirement;
}

export interface ImageQualityReferenceRequirement {
  readonly assetId: string | null;
  readonly role: VisualReferenceRole;
  readonly source: "brand-library" | "provided-file";
  readonly status: "available" | "missing";
}

interface ProfileFixture {
  readonly brief: ContentBrief;
  readonly category: ImageQualityCategory;
  readonly expected: ImageQualityFactualSnapshot;
  readonly profileId: VisualProfileId;
  readonly reference: ImageQualityReferenceRequirement;
}

function snapshot(
  input: ImageQualityFactualSnapshot,
): ImageQualityFactualSnapshot {
  return Object.freeze({
    ...input,
    productExternalIds: Object.freeze([...input.productExternalIds]),
    stockStatements: Object.freeze([...input.stockStatements]),
  });
}

const toolBrief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Consultanos por WhatsApp",
  }),
  caption:
    "Perforadora percutora para trabajos de taller. Consultanos por WhatsApp antes de acercarte.",
  creativeProposal:
    "Herramienta nítida sobre una superficie simple, con espacio inferior libre.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "TOOL-1",
      externalProductId: "synthetic-tool-101",
      label: "Perforadora percutora 650 W",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Para trabajos de taller",
  title: "Perforadora 650 W",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price",
      evidenceId: "TOOL-1",
      statement: "El precio de prueba es $ 24.500.",
    }),
    Object.freeze({
      claimKind: "stock",
      evidenceId: "TOOL-2",
      statement: "Hay 4 unidades de prueba en Casa central.",
    }),
  ]),
  visualDirection: "clean_product",
});

const lubricantBrief: ContentBrief = Object.freeze({
  brand: "lubricentro",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Pedilo por WhatsApp",
  }),
  caption:
    "Lubricante sintético de prueba para revisar una composición de producto sin afirmar disponibilidad real.",
  creativeProposal:
    "Superficie limpia preparada para componer encima la foto real del envase.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "LUBE-1",
      externalProductId: "synthetic-lubricant-201",
      label: "Lubricante sintético 5W-30",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Envase de referencia obligatorio",
  title: "Lubricante 5W-30",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price",
      evidenceId: "LUBE-1",
      statement: "El precio de prueba es $ 31.900.",
    }),
    Object.freeze({
      claimKind: "stock",
      evidenceId: "LUBE-2",
      statement: "Hay 7 unidades de prueba en el Lubricentro.",
    }),
  ]),
  visualDirection: "clean_product",
});

const wegaFilterBrief: ContentBrief = Object.freeze({
  brand: "lubricentro",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Consultanos por WhatsApp",
  }),
  caption:
    "Filtro Wega FCI 1101C. Consultanos por WhatsApp para confirmar la aplicación correcta antes de comprar.",
  creativeProposal:
    "Presentar el filtro Wega FCI 1101C de la foto aprobada, sin confundirlo con los otros códigos visibles en la toma.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "FILTER-1",
      externalProductId: "evaluation-wega-fci-1101c",
      label: "Filtro Wega FCI 1101C",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Confirmá la aplicación para tu vehículo",
  title: "Filtro Wega FCI 1101C",
  verifiedFacts: Object.freeze([]),
  visualDirection: "clean_product",
});

const wegaFilterExpected = snapshot({
  callToAction: "Consultanos por WhatsApp",
  disclaimer: null,
  price: null,
  productExternalIds: ["evaluation-wega-fci-1101c"],
  stockStatements: [],
});

const workshopBrief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "visit_store",
    label: "Visitá la ferretería",
  }),
  caption:
    "Una escena institucional de taller para comunicar acompañamiento y oficio sin datos comerciales variables.",
  creativeProposal:
    "Banco de trabajo ordenado, herramienta en uso y banda superior despejada.",
  missingInformation: Object.freeze([]),
  objective: "informative",
  products: Object.freeze([]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Herramientas para tu oficio",
  verifiedFacts: Object.freeze([]),
  visualDirection: "workshop_context",
});

const constructionBrief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "ask_in_store",
    label: "Consultá en el local",
  }),
  caption:
    "Material de obra de prueba para evaluar lectura, jerarquía y exactitud de una pieza de producto.",
  creativeProposal:
    "Material de obra en primer plano, entorno seguro y tercio inferior despejado.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "BUILD-1",
      externalProductId: "synthetic-tool-301",
      label: "Disco diamantado 115 mm",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Para cortes en obra",
  title: "Disco diamantado 115 mm",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price",
      evidenceId: "BUILD-1",
      statement: "El precio de prueba es $ 8.750.",
    }),
    Object.freeze({
      claimKind: "stock",
      evidenceId: "BUILD-2",
      statement: "Hay 12 unidades de prueba en Casa central.",
    }),
  ]),
  visualDirection: "construction_context",
});

const serviceBrief: ContentBrief = Object.freeze({
  brand: "lubricentro",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Consultanos por WhatsApp",
  }),
  caption:
    "Escena institucional del lubricentro para revisar la representación segura y legible del servicio.",
  creativeProposal:
    "Servicio en curso, vehículo genérico y banda superior libre de elementos.",
  missingInformation: Object.freeze([]),
  objective: "informative",
  products: Object.freeze([]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Cuidamos tu vehículo",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "service",
      evidenceId: "SERVICE-1",
      statement: "El lubricentro realiza cambios de aceite.",
    }),
  ]),
  visualDirection: "lubricentro_context",
});

const offerBrief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Reservalo por WhatsApp",
  }),
  caption:
    "Oferta sintética para evaluar precio, stock, vigencia y CTA sin representar una promoción comercial real.",
  creativeProposal:
    "Bodegón estacional sobrio con el círculo central libre para la capa determinista.",
  missingInformation: Object.freeze([]),
  objective: "promotion",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "OFFER-1",
      externalProductId: "synthetic-offer-401",
      label: "Kit de herramientas de prueba",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: "Oferta sintética de evaluación",
  title: "Kit para tu taller",
  verifiedFacts: Object.freeze([
    Object.freeze({
      claimKind: "price",
      evidenceId: "OFFER-1",
      statement: "El precio de prueba es $ 49.900.",
    }),
    Object.freeze({
      claimKind: "stock",
      evidenceId: "OFFER-2",
      statement: "Hay 3 unidades de prueba en Casa central.",
    }),
    Object.freeze({
      claimKind: "promotion",
      evidenceId: "OFFER-3",
      statement: "La promoción de prueba rige hasta el sábado.",
    }),
  ]),
  visualDirection: "seasonal_promotion",
});

const fixtures: readonly ProfileFixture[] = Object.freeze([
  {
    brief: toolBrief,
    category: "tool",
    expected: snapshot({
      callToAction: "Consultanos por WhatsApp",
      disclaimer: null,
      price: "$ 24.500",
      productExternalIds: ["synthetic-tool-101"],
      stockStatements: ["Hay 4 unidades de prueba en Casa central."],
    }),
    profileId: "ferreteria-producto-limpio",
    reference: {
      assetId: "stock-herramientas-electricas",
      role: "product_photo",
      source: "brand-library",
      status: "available",
    },
  },
  {
    brief: lubricantBrief,
    category: "lubricant",
    expected: snapshot({
      callToAction: "Pedilo por WhatsApp",
      disclaimer: null,
      price: "$ 31.900",
      productExternalIds: ["synthetic-lubricant-201"],
      stockStatements: ["Hay 7 unidades de prueba en el Lubricentro."],
    }),
    profileId: "lubricentro-producto-limpio",
    reference: {
      assetId: null,
      role: "product_photo",
      source: "provided-file",
      status: "missing",
    },
  },
  {
    brief: workshopBrief,
    category: "institutional",
    expected: snapshot({
      callToAction: "Visitá la ferretería",
      disclaimer: null,
      price: null,
      productExternalIds: [],
      stockStatements: [],
    }),
    profileId: "ferreteria-taller",
    reference: {
      assetId: "brand/interior-herramientas",
      role: "store_context",
      source: "brand-library",
      status: "available",
    },
  },
  {
    brief: constructionBrief,
    category: "tool",
    expected: snapshot({
      callToAction: "Consultá en el local",
      disclaimer: null,
      price: "$ 8.750",
      productExternalIds: ["synthetic-tool-301"],
      stockStatements: ["Hay 12 unidades de prueba en Casa central."],
    }),
    profileId: "ferreteria-obra",
    reference: {
      assetId: "brand/frente-central",
      role: "store_context",
      source: "brand-library",
      status: "available",
    },
  },
  {
    brief: serviceBrief,
    category: "institutional",
    expected: snapshot({
      callToAction: "Consultanos por WhatsApp",
      disclaimer: null,
      price: null,
      productExternalIds: [],
      stockStatements: [],
    }),
    profileId: "lubricentro-servicio",
    reference: {
      assetId: "brand/lubricentro-fosa",
      role: "store_context",
      source: "brand-library",
      status: "available",
    },
  },
  {
    brief: offerBrief,
    category: "offer",
    expected: snapshot({
      callToAction: "Reservalo por WhatsApp",
      disclaimer: "hasta el sábado",
      price: "$ 49.900",
      productExternalIds: ["synthetic-offer-401"],
      stockStatements: ["Hay 3 unidades de prueba en Casa central."],
    }),
    profileId: "promocion-estacional",
    reference: {
      assetId: "stock-herramientas-electricas",
      role: "product_photo",
      source: "brand-library",
      status: "available",
    },
  },
]);

export function imageQualityDataset(): readonly ImageQualityDatasetEntry[] {
  return Object.freeze(
    fixtures.flatMap((fixture, profileIndex) =>
      imageQualityEvaluationFormats.map((format, formatIndex) => ({
        background:
          compositionBackgrounds[
            (profileIndex + formatIndex) % compositionBackgrounds.length
          ] ?? "claro",
        brief: fixture.brief,
        caseId: `${fixture.profileId}-${format}`,
        category: fixture.category,
        expected: fixture.expected,
        format,
        profileId: fixture.profileId,
        reference: fixture.reference,
      })),
    ),
  );
}

/** Dos formatos por perfil: variedad suficiente sin revelar el caso al revisor. */
export const imageQualityHumanSampleCaseIds: readonly string[] = Object.freeze(
  fixtures.flatMap(({ profileId }) => [
    `${profileId}-feed`,
    `${profileId}-historia`,
  ]),
);

/**
 * Casos que efectivamente ve la revisión humana.
 *
 * La matriz automática conserva el lubricante sintético exigido por la tarea.
 * Para el perfil de producto del Lubricentro, la muestra real usa en cambio el
 * producto que el negocio entregó y autorizó: Wega FCI 1101C. Mezclar esa foto
 * con el brief de lubricante haría imposible evaluar fidelidad de producto.
 */
export function imageQualityHumanReviewDataset(): readonly ImageQualityDatasetEntry[] {
  const sampleIds = new Set(imageQualityHumanSampleCaseIds);
  return Object.freeze(
    imageQualityDataset()
      .filter((entry) => sampleIds.has(entry.caseId))
      .map((entry) =>
        entry.profileId === "lubricentro-producto-limpio"
          ? Object.freeze({
              ...entry,
              brief: wegaFilterBrief,
              category: "filter" as const,
              expected: wegaFilterExpected,
              reference: Object.freeze({
                assetId: "tenant/wega-fci-1101c",
                role: "product_photo" as const,
                source: "provided-file" as const,
                status: "available" as const,
              }),
            })
          : entry,
      ),
  );
}
