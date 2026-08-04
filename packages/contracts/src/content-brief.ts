/**
 * Contrato público del brief de contenido.
 *
 * El brief es la única entrada estructurada que el motor visual y la revisión
 * humana consumen. Separa tres cosas que nunca deben mezclarse: los hechos
 * verificados —cada uno atado a una evidencia recolectada por el servidor—, la
 * propuesta creativa y la información que falta. El modelo no declara evidencia
 * propia: sólo puede citar identificadores que el servidor ya emitió.
 */

export type ContentObjective =
  "product" | "promotion" | "informative" | "daily_story";

export type BrandVariant = "ferreteria" | "lubricentro";

export type VisualDirection =
  | "deterministic_template"
  | "clean_product"
  | "workshop_context"
  | "construction_context"
  | "lubricentro_context"
  | "seasonal_promotion";

/**
 * Clase de afirmación. Determina qué evidencia puede sustentarla y, para los
 * datos volátiles, qué frescura exige la política aprobada.
 */
export type FactualClaimKind =
  | "business_hours"
  | "location"
  | "price"
  | "product_attribute"
  | "promotion"
  | "service"
  | "stock";

/** Acción concreta que la ferretería puede atender hoy. */
export type CallToActionKind =
  "ask_in_store" | "call_phone" | "visit_store" | "whatsapp";

/** Motivo por el que un dato quedó fuera del brief. */
export type MissingInformationKind =
  | "conflicting_sources"
  | "no_approved_source"
  | "stale_observation"
  | "tool_unavailable";

export type ContentBriefFact = {
  claimKind: FactualClaimKind;
  /** Identificador emitido por el servidor: `K1`… documental, `C1`… comercial. */
  evidenceId: string;
  statement: string;
};

export type ContentBriefProduct = {
  /** Evidencia comercial que prueba que el producto existe en el catálogo. */
  evidenceId: string;
  externalProductId: string;
  label: string;
};

export type ContentBriefCallToAction = {
  kind: CallToActionKind;
  label: string;
};

export type ContentBriefMissingInformation = {
  detail: string;
  kind: MissingInformationKind;
  subject: FactualClaimKind;
};

export type ContentBrief = {
  brand: BrandVariant;
  callToAction: ContentBriefCallToAction;
  caption: string;
  /** Texto propuesto por el modelo; nunca se presenta como hecho verificado. */
  creativeProposal: string;
  missingInformation: readonly ContentBriefMissingInformation[];
  objective: ContentObjective;
  products: readonly ContentBriefProduct[];
  requiresHumanApproval: boolean;
  subtitle: string | null;
  title: string;
  verifiedFacts: readonly ContentBriefFact[];
  visualDirection: VisualDirection;
};
