/**
 * Reglas del brief de contenido.
 *
 * El modelo propone; el servidor decide. La única evidencia admisible es la que
 * el caso de uso recolectó antes de generar: documentos recuperados con cita y
 * observaciones comerciales con timestamp. El modelo cita esos identificadores
 * y nunca puede introducir una fuente propia.
 *
 * La validación es la frontera: si algo no cierra, no existe brief. No hay
 * brief parcial, degradado ni "mejor esfuerzo".
 */

import type { OrganizationScope } from "./persistence.ts";
import type { PaginatedRecords } from "./publication-draft.ts";
import type { GenerationTokenUsage } from "./text-generation.ts";

export const contentBriefLimits = Object.freeze({
  callToActionLabelMaximum: 60,
  callToActionLabelMinimum: 3,
  captionMaximum: 2_200,
  captionMinimum: 40,
  creativeProposalMaximum: 600,
  factStatementMaximum: 240,
  factStatementMinimum: 8,
  factsMaximum: 12,
  missingDetailMaximum: 200,
  missingDetailMinimum: 8,
  missingInformationMaximum: 8,
  productLabelMaximum: 160,
  productLabelMinimum: 2,
  productsMaximum: 8,
  requestMaximum: 600,
  requestMinimum: 8,
  subtitleMaximum: 120,
  subtitleMinimum: 4,
  titleMaximum: 70,
  titleMinimum: 4,
});

/**
 * Frescura aprobada por el negocio el 2026-07-29: precio 15 minutos, stock 5.
 * `clockSkewSeconds` tolera un desfase menor entre el reloj comercial y el
 * nuestro; más allá de eso la observación se considera inutilizable.
 */
export const contentBriefFreshnessPolicy = Object.freeze({
  clockSkewSeconds: 60,
  priceMaximumAgeSeconds: 900,
  stockMaximumAgeSeconds: 300,
});

export const contentObjectives = [
  "product",
  "promotion",
  "informative",
  "daily_story",
] as const;

export const brandVariants = ["ferreteria", "lubricentro"] as const;

export const visualDirections = [
  "deterministic_template",
  "clean_product",
  "workshop_context",
  "construction_context",
  "lubricentro_context",
  "seasonal_promotion",
] as const;

export const factualClaimKinds = [
  "business_hours",
  "location",
  "price",
  "product_attribute",
  "promotion",
  "service",
  "stock",
] as const;

export const callToActionKinds = [
  "ask_in_store",
  "call_phone",
  "visit_store",
  "whatsapp",
] as const;

export const missingInformationKinds = [
  "conflicting_sources",
  "no_approved_source",
  "stale_observation",
  "tool_unavailable",
] as const;

export type ContentObjective = (typeof contentObjectives)[number];
export type BrandVariant = (typeof brandVariants)[number];
export type VisualDirection = (typeof visualDirections)[number];
export type FactualClaimKind = (typeof factualClaimKinds)[number];
export type CallToActionKind = (typeof callToActionKinds)[number];
export type MissingInformationKind = (typeof missingInformationKinds)[number];

export interface ContentBriefFact {
  readonly claimKind: FactualClaimKind;
  readonly evidenceId: string;
  readonly statement: string;
}

export interface ContentBriefProduct {
  readonly evidenceId: string;
  readonly externalProductId: string;
  readonly label: string;
}

export interface ContentBriefCallToAction {
  readonly kind: CallToActionKind;
  readonly label: string;
}

export interface ContentBriefMissingInformation {
  readonly detail: string;
  readonly kind: MissingInformationKind;
  readonly subject: FactualClaimKind;
}

export interface ContentBrief {
  readonly brand: BrandVariant;
  readonly callToAction: ContentBriefCallToAction;
  readonly caption: string;
  readonly creativeProposal: string;
  readonly missingInformation: readonly ContentBriefMissingInformation[];
  readonly objective: ContentObjective;
  readonly products: readonly ContentBriefProduct[];
  readonly requiresHumanApproval: boolean;
  readonly subtitle: string | null;
  readonly title: string;
  readonly verifiedFacts: readonly ContentBriefFact[];
  readonly visualDirection: VisualDirection;
}

export type ContentBriefEvidenceKind = "commercial" | "document";

/**
 * Entrada del ledger de evidencia. `observedAt` es nulo para conocimiento
 * documental, que es estable y ya fue validado por vigencia al recuperarse;
 * una observación comercial siempre lleva el instante en que se leyó.
 */
export interface ContentBriefEvidenceEntry {
  readonly citationId: string;
  readonly externalProductId: string | null;
  readonly kind: ContentBriefEvidenceKind;
  readonly observedAt: string | null;
  readonly reference: string;
  readonly supportedClaims: readonly FactualClaimKind[];
}

export type ContentBriefValidationErrorCode =
  | "duplicate-product"
  | "evidence-stale"
  | "evidence-unknown"
  | "evidence-unsupported-claim"
  | "invalid-json"
  | "missing-approval"
  | "product-not-evidenced"
  | "schema-mismatch"
  | "unsupported-claim-in-copy";

export class ContentBriefValidationError extends Error {
  readonly code: ContentBriefValidationErrorCode;
  readonly field: string;

  constructor(
    code: ContentBriefValidationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = "ContentBriefValidationError";
  }
}

export interface ValidateContentBriefInput {
  readonly candidate: unknown;
  readonly evidence: readonly ContentBriefEvidenceEntry[];
  readonly validatedAt: string;
}

export type ContentBriefRequestErrorCode =
  | "invalid-actor"
  | "invalid-location"
  | "invalid-organization"
  | "invalid-request"
  | "invalid-timestamp";

/** Rechazo del pedido antes de gastar una sola llamada al proveedor. */
export class ContentBriefRequestError extends Error {
  readonly code: ContentBriefRequestErrorCode;

  constructor(code: ContentBriefRequestErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ContentBriefRequestError";
  }
}

/**
 * Marcas textuales que obligan a un hecho verificado del tipo correspondiente.
 * No pretenden entender el texto: detectan las tres afirmaciones que el negocio
 * no admite sin fuente y que tienen una firma inequívoca en el copy.
 */
const copyClaimSignals: readonly Readonly<{
  claimKind: FactualClaimKind;
  pattern: RegExp;
}>[] = Object.freeze([
  Object.freeze({
    claimKind: "price" as const,
    pattern: /\$\s*\d|\d[\d.,]*\s*pesos\b/iu,
  }),
  Object.freeze({
    claimKind: "promotion" as const,
    pattern: /\d\s*%|\bdescuento\b|\b\dx\d\b/iu,
  }),
  Object.freeze({
    claimKind: "business_hours" as const,
    pattern: /\b\d{1,2}[:.]\d{2}\b/u,
  }),
]);

function schemaFailure(field: string, message: string): never {
  throw new ContentBriefValidationError("schema-mismatch", field, message);
}

function plainObject(
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    schemaFailure(field, `El campo ${field} debe ser un objeto.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  source: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  field: string,
): void {
  const actual = Object.keys(source).toSorted();
  const wanted = [...expected].toSorted();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    schemaFailure(
      field,
      `El campo ${field} declara propiedades no permitidas.`,
    );
  }
}

function boundedText(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    schemaFailure(field, `El campo ${field} debe ser texto.`);
  }
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    schemaFailure(field, `El campo ${field} no cumple la longitud permitida.`);
  }
  return normalized;
}

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    schemaFailure(field, `El campo ${field} no es un valor permitido.`);
  }
  return value as T;
}

function boundedList(
  value: unknown,
  field: string,
  maximum: number,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    schemaFailure(field, `El campo ${field} debe ser una lista.`);
  }
  if (value.length > maximum) {
    schemaFailure(field, `El campo ${field} supera la cantidad permitida.`);
  }
  return value;
}

function epochMilliseconds(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(parsed)) {
    schemaFailure(field, `El campo ${field} requiere un timestamp ISO válido.`);
  }
  return parsed;
}

/** Sólo precio y stock caducan; el resto se apoya en fuentes estables. */
function maximumAgeSeconds(claimKind: FactualClaimKind): number | null {
  switch (claimKind) {
    case "price":
      return contentBriefFreshnessPolicy.priceMaximumAgeSeconds;
    case "stock":
      return contentBriefFreshnessPolicy.stockMaximumAgeSeconds;
    case "business_hours":
    case "location":
    case "product_attribute":
    case "promotion":
    case "service":
      return null;
  }
}

function assertFreshEvidence(
  entry: ContentBriefEvidenceEntry,
  claimKind: FactualClaimKind,
  validatedAtMilliseconds: number,
  field: string,
): void {
  const limitSeconds = maximumAgeSeconds(claimKind);
  if (limitSeconds === null) {
    return;
  }
  if (entry.observedAt === null) {
    throw new ContentBriefValidationError(
      "evidence-stale",
      field,
      `La evidencia ${entry.citationId} no registra el instante de lectura.`,
    );
  }
  const observedAtMilliseconds = epochMilliseconds(
    entry.observedAt,
    `${field}.observedAt`,
  );
  const ageSeconds = (validatedAtMilliseconds - observedAtMilliseconds) / 1_000;
  if (
    ageSeconds > limitSeconds ||
    ageSeconds < -contentBriefFreshnessPolicy.clockSkewSeconds
  ) {
    throw new ContentBriefValidationError(
      "evidence-stale",
      field,
      `La evidencia ${entry.citationId} está fuera de la ventana de frescura.`,
    );
  }
}

function parseFact(
  value: unknown,
  index: number,
  ledger: ReadonlyMap<string, ContentBriefEvidenceEntry>,
  validatedAtMilliseconds: number,
): ContentBriefFact {
  const field = `verifiedFacts[${String(index)}]`;
  const source = plainObject(value, field);
  exactKeys(source, ["claimKind", "evidenceId", "statement"], field);
  const claimKind = member(
    source["claimKind"],
    factualClaimKinds,
    `${field}.claimKind`,
  );
  const evidenceId = boundedText(
    source["evidenceId"],
    `${field}.evidenceId`,
    2,
    12,
  );
  const entry = ledger.get(evidenceId);
  if (entry === undefined) {
    throw new ContentBriefValidationError(
      "evidence-unknown",
      `${field}.evidenceId`,
      `El brief cita una evidencia inexistente: ${evidenceId}.`,
    );
  }
  if (!entry.supportedClaims.includes(claimKind)) {
    throw new ContentBriefValidationError(
      "evidence-unsupported-claim",
      `${field}.claimKind`,
      `La evidencia ${evidenceId} no sustenta una afirmación de tipo ${claimKind}.`,
    );
  }
  assertFreshEvidence(entry, claimKind, validatedAtMilliseconds, field);
  return Object.freeze({
    claimKind,
    evidenceId,
    statement: boundedText(
      source["statement"],
      `${field}.statement`,
      contentBriefLimits.factStatementMinimum,
      contentBriefLimits.factStatementMaximum,
    ),
  });
}

function parseProduct(
  value: unknown,
  index: number,
  ledger: ReadonlyMap<string, ContentBriefEvidenceEntry>,
): ContentBriefProduct {
  const field = `products[${String(index)}]`;
  const source = plainObject(value, field);
  exactKeys(source, ["evidenceId", "externalProductId", "label"], field);
  const evidenceId = boundedText(
    source["evidenceId"],
    `${field}.evidenceId`,
    2,
    12,
  );
  const entry = ledger.get(evidenceId);
  if (entry === undefined) {
    throw new ContentBriefValidationError(
      "evidence-unknown",
      `${field}.evidenceId`,
      `El producto cita una evidencia inexistente: ${evidenceId}.`,
    );
  }
  const externalProductId = boundedText(
    source["externalProductId"],
    `${field}.externalProductId`,
    3,
    80,
  );
  if (
    entry.kind !== "commercial" ||
    entry.externalProductId !== externalProductId
  ) {
    throw new ContentBriefValidationError(
      "product-not-evidenced",
      `${field}.externalProductId`,
      `La evidencia ${evidenceId} no corresponde al producto declarado.`,
    );
  }
  return Object.freeze({
    evidenceId,
    externalProductId,
    label: boundedText(
      source["label"],
      `${field}.label`,
      contentBriefLimits.productLabelMinimum,
      contentBriefLimits.productLabelMaximum,
    ),
  });
}

function parseMissingInformation(
  value: unknown,
  index: number,
): ContentBriefMissingInformation {
  const field = `missingInformation[${String(index)}]`;
  const source = plainObject(value, field);
  exactKeys(source, ["detail", "kind", "subject"], field);
  return Object.freeze({
    detail: boundedText(
      source["detail"],
      `${field}.detail`,
      contentBriefLimits.missingDetailMinimum,
      contentBriefLimits.missingDetailMaximum,
    ),
    kind: member(source["kind"], missingInformationKinds, `${field}.kind`),
    subject: member(source["subject"], factualClaimKinds, `${field}.subject`),
  });
}

function parseCallToAction(value: unknown): ContentBriefCallToAction {
  const source = plainObject(value, "callToAction");
  exactKeys(source, ["kind", "label"], "callToAction");
  return Object.freeze({
    kind: member(source["kind"], callToActionKinds, "callToAction.kind"),
    label: boundedText(
      source["label"],
      "callToAction.label",
      contentBriefLimits.callToActionLabelMinimum,
      contentBriefLimits.callToActionLabelMaximum,
    ),
  });
}

function assertCopyIsSupported(brief: ContentBrief): void {
  const provenClaims = new Set(
    brief.verifiedFacts.map((fact) => fact.claimKind),
  );
  const surfaces: readonly Readonly<{ field: string; text: string }>[] = [
    { field: "title", text: brief.title },
    { field: "subtitle", text: brief.subtitle ?? "" },
    { field: "caption", text: brief.caption },
    { field: "creativeProposal", text: brief.creativeProposal },
    { field: "callToAction.label", text: brief.callToAction.label },
    ...brief.verifiedFacts.map((fact, index) => ({
      field: `verifiedFacts[${String(index)}].statement`,
      text: fact.statement,
    })),
  ];

  for (const surface of surfaces) {
    for (const signal of copyClaimSignals) {
      if (
        signal.pattern.test(surface.text) &&
        !provenClaims.has(signal.claimKind)
      ) {
        throw new ContentBriefValidationError(
          "unsupported-claim-in-copy",
          surface.field,
          `El texto afirma ${signal.claimKind} sin un hecho verificado que lo sustente.`,
        );
      }
    }
  }
}

/** Convierte la salida cruda del modelo en JSON sin asumir que es válida. */
export function parseContentBriefJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch {
    throw new ContentBriefValidationError(
      "invalid-json",
      "output",
      "La salida del modelo no es JSON válido.",
    );
  }
}

export function validateContentBrief(
  input: ValidateContentBriefInput,
): ContentBrief {
  const validatedAtMilliseconds = epochMilliseconds(
    input.validatedAt,
    "validatedAt",
  );
  const ledger = new Map(
    input.evidence.map((entry) => [entry.citationId, entry]),
  );
  const source = plainObject(input.candidate, "brief");
  exactKeys(
    source,
    [
      "brand",
      "callToAction",
      "caption",
      "creativeProposal",
      "missingInformation",
      "objective",
      "products",
      "requiresHumanApproval",
      "subtitle",
      "title",
      "verifiedFacts",
      "visualDirection",
    ],
    "brief",
  );

  if (typeof source["requiresHumanApproval"] !== "boolean") {
    schemaFailure(
      "requiresHumanApproval",
      "El campo requiresHumanApproval debe ser booleano.",
    );
  }

  const rawSubtitle = source["subtitle"];
  const products = boundedList(
    source["products"],
    "products",
    contentBriefLimits.productsMaximum,
  ).map((entry, index) => parseProduct(entry, index, ledger));
  const seenProducts = new Set<string>();
  for (const product of products) {
    if (seenProducts.has(product.externalProductId)) {
      throw new ContentBriefValidationError(
        "duplicate-product",
        "products",
        "El brief repite un producto.",
      );
    }
    seenProducts.add(product.externalProductId);
  }

  const objective = member(source["objective"], contentObjectives, "objective");
  const missingInformation = boundedList(
    source["missingInformation"],
    "missingInformation",
    contentBriefLimits.missingInformationMaximum,
  ).map((entry, index) => parseMissingInformation(entry, index));
  const requiresHumanApproval = source["requiresHumanApproval"];

  const brief: ContentBrief = Object.freeze({
    brand: member(source["brand"], brandVariants, "brand"),
    callToAction: parseCallToAction(source["callToAction"]),
    caption: boundedText(
      source["caption"],
      "caption",
      contentBriefLimits.captionMinimum,
      contentBriefLimits.captionMaximum,
    ),
    creativeProposal: boundedText(
      source["creativeProposal"],
      "creativeProposal",
      1,
      contentBriefLimits.creativeProposalMaximum,
    ),
    missingInformation: Object.freeze(missingInformation),
    objective,
    products: Object.freeze(products),
    requiresHumanApproval,
    subtitle:
      rawSubtitle === null
        ? null
        : boundedText(
            rawSubtitle,
            "subtitle",
            contentBriefLimits.subtitleMinimum,
            contentBriefLimits.subtitleMaximum,
          ),
    title: boundedText(
      source["title"],
      "title",
      contentBriefLimits.titleMinimum,
      contentBriefLimits.titleMaximum,
    ),
    verifiedFacts: Object.freeze(
      boundedList(
        source["verifiedFacts"],
        "verifiedFacts",
        contentBriefLimits.factsMaximum,
      ).map((entry, index) =>
        parseFact(entry, index, ledger, validatedAtMilliseconds),
      ),
    ),
    visualDirection: member(
      source["visualDirection"],
      visualDirections,
      "visualDirection",
    ),
  });

  assertCopyIsSupported(brief);

  // Una promoción y cualquier faltante declarado exigen decisión humana: el
  // sistema no puede resolverlos por su cuenta ni presentarlos como cerrados.
  if (
    !brief.requiresHumanApproval &&
    (brief.objective === "promotion" || brief.missingInformation.length > 0)
  ) {
    throw new ContentBriefValidationError(
      "missing-approval",
      "requiresHumanApproval",
      "El brief omite la aprobación humana que su contenido exige.",
    );
  }

  return brief;
}

/**
 * Ciclo de vida de una ejecución.
 *
 * `pending` existe porque la generación es asíncrona: el editor pide, la API
 * reserva la ejecución y el worker la resuelve. Los tres estados finales son
 * terminales y una fila nunca vuelve atrás; reintentar crea otra ejecución.
 */
export const contentBriefRunStatuses = [
  "pending",
  "generated",
  "rejected",
  "cancelled",
] as const;

export type ContentBriefRunStatus = (typeof contentBriefRunStatuses)[number];

const contentBriefRunTransitions: Readonly<
  Record<ContentBriefRunStatus, readonly ContentBriefRunStatus[]>
> = Object.freeze({
  cancelled: [],
  generated: [],
  pending: ["generated", "rejected", "cancelled"],
  rejected: [],
});

export function isContentBriefRunTransitionAllowed(
  from: ContentBriefRunStatus,
  to: ContentBriefRunStatus,
): boolean {
  return contentBriefRunTransitions[from].includes(to);
}

export interface ContentBriefRunEvidence {
  readonly citationId: string;
  readonly kind: ContentBriefEvidenceKind;
  readonly observedAt: string | null;
  readonly reference: string;
}

export interface ContentBriefRunToolInvocation {
  readonly callId: string;
  readonly outcome: "failure" | "success";
  readonly toolName: string;
}

export interface ContentBriefRunRejection {
  readonly code: string;
  readonly message: string;
}

/**
 * Tópico que la API encola y el worker consume.
 *
 * El pedido y la ejecución están separados a propósito: la API no puede
 * generar —la IA vive en el worker— y el editor necesita ver el pedido
 * aceptado antes de que el modelo empiece a trabajar.
 */
export const contentBriefGenerationTopic = "content.brief.generation-requested";

/** Lo que se conoce al pedir el brief, antes de ejecutarlo. */
export interface ContentBriefRunReservation {
  readonly actorMembershipId: string;
  readonly id: string;
  readonly locationId: string | null;
  readonly organizationId: string;
  readonly promptHash: string;
  readonly promptVersion: string;
  readonly request: string;
  readonly requestHash: string;
  readonly requestedAt: string;
  readonly schemaVersion: string;
}

/** Lo que agrega la ejecución cuando termina. */
export interface ContentBriefRunCompletion {
  readonly attempts: number;
  readonly brief: ContentBrief | null;
  readonly estimatedCostUsd: number | null;
  readonly evidence: readonly ContentBriefRunEvidence[];
  readonly id: string;
  readonly knowledgeStatus: string;
  readonly latencyMilliseconds: number;
  readonly model: string;
  readonly organizationId: string;
  readonly rejection: ContentBriefRunRejection | null;
  readonly requestId: string | null;
  readonly responseId: string | null;
  readonly status: "generated" | "rejected";
  readonly toolInvocations: readonly ContentBriefRunToolInvocation[];
  readonly toolNames: readonly string[];
  readonly usage: GenerationTokenUsage;
}

export interface ContentBriefRunRecord
  extends
    ContentBriefRunReservation,
    Omit<ContentBriefRunCompletion, "status"> {
  readonly cancelledAt: string | null;
  readonly completedAt: string | null;
  readonly status: ContentBriefRunStatus;
}

/**
 * Resultado de intentar cerrar una ejecución.
 *
 * `discarded` es el caso que protege el invariante de cancelación: el worker
 * terminó, pero el editor ya había cancelado y el resultado tardío no puede
 * quedar vigente.
 */
export type ContentBriefRunCompletionOutcome =
  | Readonly<{ status: "completed" }>
  | Readonly<{ reason: "cancelled" | "not-pending"; status: "discarded" }>
  | Readonly<{ status: "not-found" }>;

export type ContentBriefRunCancellationOutcome =
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      resolvedStatus: ContentBriefRunStatus;
      status: "already-resolved";
    }>;

export interface ContentBriefRunListFilter extends OrganizationScope {
  readonly actorMembershipId?: string;
  readonly limit: number;
  readonly page: number;
}

export interface ContentBriefRunRepository {
  cancel(input: {
    readonly id: string;
    readonly cancelledAt: string;
    readonly organizationId: string;
  }): Promise<ContentBriefRunCancellationOutcome>;
  complete(
    completion: ContentBriefRunCompletion,
    completedAt: string,
  ): Promise<ContentBriefRunCompletionOutcome>;
  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null>;
  list(
    filter: ContentBriefRunListFilter,
  ): Promise<PaginatedRecords<ContentBriefRunRecord>>;
  reserve(reservation: ContentBriefRunReservation): Promise<void>;
}

/**
 * Resultado del caso de uso. Un rechazo no expone brief: la única forma de
 * obtener uno es la variante `generated`.
 */
export type ContentBriefGenerationResult =
  | Readonly<{
      brief: ContentBrief;
      runId: string;
      status: "generated";
    }>
  | Readonly<{
      code: string;
      message: string;
      runId: string;
      status: "rejected";
    }>
  /** El editor canceló mientras se ejecutaba; el resultado no queda vigente. */
  | Readonly<{
      runId: string;
      status: "discarded";
    }>;
