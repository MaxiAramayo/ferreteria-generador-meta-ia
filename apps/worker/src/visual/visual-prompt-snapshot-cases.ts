/**
 * Briefs representativos y su plan visual.
 *
 * Los briefs no se escriben como objetos literales: se validan con la misma
 * autoridad que valida un brief real. Un fixture que dejara de ser un brief
 * válido invalidaría el snapshot sin que nadie lo note, y acá el snapshot es la
 * evidencia de qué se le pide al proveedor.
 *
 * Cubren el catálogo inicial completo —una campaña por perfil— y los tres
 * caminos que terminan en render determinista.
 */

import {
  validateContentBrief,
  type ContentBrief,
  type ContentBriefEvidenceEntry,
  type VisualPromptReference,
} from "@aramayo/domain";

import { resolveVisualReferences } from "./visual-asset-policy.ts";
import {
  buildVisualPrompt,
  visualPromptInstructionsHash,
  visualPromptVersion,
} from "./visual-prompt-builder.ts";

/**
 * Instante fijo del fixture. La frescura se mide contra él, así que el snapshot
 * no depende de cuándo se ejecute la prueba.
 */
const observedAt = "2026-08-03T12:00:00.000Z";

const evidence: readonly ContentBriefEvidenceEntry[] = Object.freeze([
  Object.freeze({
    citationId: "C1",
    externalProductId: "odoo-product-101",
    kind: "commercial" as const,
    observedAt,
    reference: "odoo:product.product/101",
    supportedClaims: Object.freeze([
      "price" as const,
      "product_attribute" as const,
      "stock" as const,
    ]),
  }),
  Object.freeze({
    citationId: "C2",
    externalProductId: "odoo-product-202",
    kind: "commercial" as const,
    observedAt,
    reference: "odoo:product.product/202",
    supportedClaims: Object.freeze([
      "price" as const,
      "product_attribute" as const,
      "stock" as const,
    ]),
  }),
  Object.freeze({
    citationId: "K1",
    externalProductId: null,
    kind: "document" as const,
    observedAt: null,
    reference: "knowledge:servicios/lubricentro#3",
    supportedClaims: Object.freeze([
      "business_hours" as const,
      "location" as const,
      "service" as const,
    ]),
  }),
]);

interface BriefDraft {
  readonly brand: "ferreteria" | "lubricentro";
  readonly creativeProposal: string;
  readonly objective: "daily_story" | "informative" | "product" | "promotion";
  readonly products: readonly Readonly<{
    evidenceId: string;
    externalProductId: string;
    label: string;
  }>[];
  readonly requiresHumanApproval: boolean;
  readonly title: string;
  readonly visualDirection: ContentBrief["visualDirection"];
}

function brief(draft: BriefDraft): ContentBrief {
  return validateContentBrief({
    candidate: {
      brand: draft.brand,
      callToAction: { kind: "whatsapp", label: "Consultanos por WhatsApp" },
      caption:
        "Pasá por el local y consultanos cuál te sirve para el trabajo que tenés entre manos.",
      creativeProposal: draft.creativeProposal,
      missingInformation: [],
      objective: draft.objective,
      products: draft.products.map((product) => ({ ...product })),
      requiresHumanApproval: draft.requiresHumanApproval,
      subtitle: null,
      title: draft.title,
      verifiedFacts: [],
      visualDirection: draft.visualDirection,
    },
    evidence,
    validatedAt: observedAt,
  });
}

const perforadora = Object.freeze({
  evidenceId: "C1",
  externalProductId: "odoo-product-101",
  label: "Perforadora percutora 650 W",
});

const aceite = Object.freeze({
  evidenceId: "C2",
  externalProductId: "odoo-product-202",
  label: "Aceite mineral para motor nafta 20W-50",
});

const tarugos = Object.freeze({
  evidenceId: "C1",
  externalProductId: "odoo-product-101",
  label: "Tarugos de expansión con tornillo",
});

const productPhoto: readonly VisualPromptReference[] = resolveVisualReferences([
  { assetId: "stock-herramientas-electricas", role: "product_photo" },
]);

const lubricantPhoto: readonly VisualPromptReference[] =
  resolveVisualReferences([
    { assetId: "brand/lubricentro-filtros", role: "store_context" },
  ]);

export interface VisualPromptSnapshotRow {
  readonly format: string | null;
  readonly id: string;
  readonly instructionsHash: string;
  readonly kind: string;
  readonly negativeGuidance: readonly string[];
  readonly profileId: string | null;
  readonly profileVersion: string | null;
  readonly prompt: string | null;
  readonly promptHash: string | null;
  readonly promptVersion: string;
  readonly reason: string | null;
  readonly reservedSpace: string | null;
}

interface SnapshotCase {
  readonly brief: ContentBrief;
  readonly format?: Parameters<typeof buildVisualPrompt>[0]["format"];
  readonly generationEnabled: boolean;
  readonly id: string;
  readonly references: readonly VisualPromptReference[];
  readonly subjectKind?: Parameters<typeof buildVisualPrompt>[0]["subjectKind"];
}

function snapshotCases(): readonly SnapshotCase[] {
  return Object.freeze([
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal:
          "Tono directo, foco en el uso real de la herramienta en el banco.",
        objective: "product" as const,
        products: [perforadora],
        requiresHumanApproval: false,
        title: "Perforadora para tu obra",
        visualDirection: "clean_product" as const,
      }),
      generationEnabled: true,
      id: "ferreteria-producto-limpio-feed",
      references: productPhoto,
    }),
    Object.freeze({
      brief: brief({
        brand: "lubricentro",
        creativeProposal:
          "Tono técnico y sobrio; el envase tiene que leerse de inmediato.",
        objective: "product" as const,
        products: [aceite],
        requiresHumanApproval: false,
        title: "Aceite para el service de tu auto",
        visualDirection: "clean_product" as const,
      }),
      generationEnabled: true,
      // La biblioteca congelada en `P1-T01` no tiene ninguna foto propia de
      // lubricante clasificada como material de producto: las de lubricentro
      // son fotos del local. El perfil existe y es correcto, pero hoy sólo
      // puede resolverse con render determinista. Queda así a propósito, como
      // evidencia del faltante que `P4-T02` tiene que cubrir con fotos propias.
      id: "lubricentro-producto-limpio-sin-foto-aprobada",
      references: lubricantPhoto,
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal:
          "Bodegón simple, el surtido a la vista y nada más en el cuadro.",
        objective: "product" as const,
        products: [tarugos],
        requiresHumanApproval: false,
        title: "Tarugos y tornillos por unidad",
        visualDirection: "clean_product" as const,
      }),
      generationEnabled: true,
      // Un tarugo no tiene marca que representar artículo por artículo, así que
      // el modelo puede dibujarlo sin foto de referencia.
      id: "ferreteria-generico-sin-foto",
      references: [],
      subjectKind: "generic" as const,
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal: "Mostrar el oficio en marcha, sin pose publicitaria.",
        objective: "informative" as const,
        products: [],
        requiresHumanApproval: false,
        title: "El banco de trabajo bien puesto",
        visualDirection: "workshop_context" as const,
      }),
      format: "historia" as const,
      generationEnabled: true,
      id: "ferreteria-taller-historia",
      references: [],
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal: "Material de obra en el lugar donde se usa.",
        objective: "product" as const,
        products: [perforadora],
        requiresHumanApproval: false,
        title: "Todo para la obra en curso",
        visualDirection: "construction_context" as const,
      }),
      generationEnabled: true,
      id: "ferreteria-obra-feed",
      references: [],
    }),
    Object.freeze({
      brief: brief({
        brand: "lubricentro",
        creativeProposal: "El servicio en curso, con el trabajo como centro.",
        objective: "daily_story" as const,
        products: [],
        requiresHumanApproval: false,
        title: "Turnos de service esta semana",
        visualDirection: "lubricentro_context" as const,
      }),
      generationEnabled: true,
      id: "lubricentro-servicio-historia",
      references: [],
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal: "Clima de temporada, sin representar la oferta.",
        objective: "promotion" as const,
        products: [perforadora],
        // Una promoción siempre exige decisión humana.
        requiresHumanApproval: true,
        title: "Preparate para la temporada",
        visualDirection: "seasonal_promotion" as const,
      }),
      generationEnabled: true,
      id: "promocion-estacional-historia",
      references: [],
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal: "Pieza tipográfica, sin fotografía.",
        objective: "informative" as const,
        products: [],
        requiresHumanApproval: false,
        title: "Estamos abiertos como siempre",
        visualDirection: "deterministic_template" as const,
      }),
      generationEnabled: true,
      id: "determinista-por-plantilla",
      references: [],
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal:
          "Tono directo, foco en el uso real de la herramienta en el banco.",
        objective: "product" as const,
        products: [perforadora],
        requiresHumanApproval: false,
        title: "Perforadora para tu obra",
        visualDirection: "clean_product" as const,
      }),
      generationEnabled: false,
      id: "determinista-por-generacion-deshabilitada",
      references: productPhoto,
    }),
    Object.freeze({
      brief: brief({
        brand: "ferreteria",
        creativeProposal:
          "Tono directo, foco en el uso real de la herramienta en el banco.",
        objective: "product" as const,
        products: [perforadora],
        requiresHumanApproval: false,
        title: "Perforadora para tu obra",
        visualDirection: "clean_product" as const,
      }),
      generationEnabled: true,
      id: "determinista-sin-referencia-aprobada",
      references: [],
    }),
  ]);
}

export function visualPromptSnapshots(): readonly VisualPromptSnapshotRow[] {
  return Object.freeze(
    snapshotCases().map((entry) => {
      const plan = buildVisualPrompt({
        brief: entry.brief,
        ...(entry.format === undefined ? {} : { format: entry.format }),
        generationEnabled: entry.generationEnabled,
        references: entry.references,
        ...(entry.subjectKind === undefined
          ? {}
          : { subjectKind: entry.subjectKind }),
      });
      const common = {
        id: entry.id,
        instructionsHash: visualPromptInstructionsHash,
        kind: plan.kind,
        profileId: plan.profileId,
        profileVersion: plan.profileVersion,
        promptVersion: visualPromptVersion,
      };
      return Object.freeze(
        plan.kind === "deterministic"
          ? {
              ...common,
              format: null,
              negativeGuidance: Object.freeze([]),
              prompt: null,
              promptHash: null,
              reason: plan.reason,
              reservedSpace: null,
            }
          : {
              ...common,
              format: plan.format,
              negativeGuidance: plan.negativeGuidance,
              prompt: plan.prompt,
              promptHash: plan.promptHash,
              reason: null,
              reservedSpace: plan.reservedSpace,
            },
      );
    }),
  );
}
