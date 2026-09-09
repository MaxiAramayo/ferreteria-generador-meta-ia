/**
 * Perfil factual que queda dentro del snapshot aprobado.
 *
 * La aprobación inmoviliza el contenido, pero algunos hechos pueden cambiar
 * antes de que el worker llegue a Meta. Este perfil no guarda respuestas crudas
 * ni secretos: conserva solamente la identidad de la fuente y el valor que el
 * revalidador necesita comparar de nuevo justo antes de publicar.
 */

import {
  detectClaimSignals,
  type ContentBrief,
  type ContentBriefEvidenceEntry,
  type FactualClaimKind,
} from "./content-brief.ts";
import type { RecurringStorySourceSnapshot } from "./recurring-story.ts";

export const approvalPrePublishProfileSchemaVersion = 1 as const;

export const prePublishDynamicClaimKinds = Object.freeze([
  "business_hours",
  "price",
  "promotion",
  "stock",
] as const satisfies readonly FactualClaimKind[]);

export type PrePublishDynamicClaimKind =
  (typeof prePublishDynamicClaimKinds)[number];

export interface PrePublishFactualClaim {
  readonly claimKind: PrePublishDynamicClaimKind;
  readonly evidenceId: string;
  /** Producto comercial al que aplica precio o stock, cuando corresponde. */
  readonly externalProductId?: string;
  /** Redacción exacta que aprobó la persona; se compara con la lectura actual. */
  readonly statement: string;
}

export interface ApprovalPrePublishProfile {
  readonly factualClaims: readonly PrePublishFactualClaim[];
  readonly recurringStorySource?: RecurringStorySourceSnapshot;
  /** Tipos que el snapshot no puede publicar sin volver a comprobar. */
  readonly requiredClaims: readonly PrePublishDynamicClaimKind[];
  readonly schemaVersion: typeof approvalPrePublishProfileSchemaVersion;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDynamicClaim(value: unknown): value is PrePublishDynamicClaimKind {
  return (
    typeof value === "string" &&
    (prePublishDynamicClaimKinds as readonly string[]).includes(value)
  );
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function normalizedStrings(value: unknown): readonly string[] | null {
  if (!isUnknownArray(value)) return null;
  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    normalized.push(entry.trim());
  }
  return Object.freeze(normalized);
}

export function readRecurringStorySourceSnapshot(
  value: unknown,
): RecurringStorySourceSnapshot | null {
  if (!isRecord(value)) return null;
  const requiredText = [
    "address",
    "capturedAt",
    "hours",
    "localDate",
    "locationId",
    "locationName",
    "sourceLabel",
  ] as const;
  if (
    requiredText.some(
      (field) => typeof value[field] !== "string" || value[field].trim() === "",
    ) ||
    !Number.isSafeInteger(value["locationVersion"]) ||
    !Number.isSafeInteger(value["sourceVersion"]) ||
    (value["sourceKind"] !== "daily-override" &&
      value["sourceKind"] !== "location-configuration")
  ) {
    return null;
  }
  return Object.freeze({
    address: value["address"] as string,
    capturedAt: value["capturedAt"] as string,
    hours: value["hours"] as string,
    localDate: value["localDate"] as string,
    locationId: value["locationId"] as string,
    locationName: value["locationName"] as string,
    locationVersion: value["locationVersion"] as number,
    sourceKind: value["sourceKind"],
    sourceLabel: value["sourceLabel"] as string,
    sourceVersion: value["sourceVersion"] as number,
  });
}

/**
 * Lee el perfil sin asumir que un JSON histórico o corrupto tiene la forma
 * actual. `missing` se diferencia de `invalid` para poder informar una causa
 * accionable: ambos bloquean el envío, pero una forma parcialmente escrita es
 * corrupción y un snapshot histórico requiere una nueva aprobación factual.
 */
export function readApprovalPrePublishProfile(
  snapshot: unknown,
):
  | Readonly<{ status: "invalid" }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ profile: ApprovalPrePublishProfile; status: "valid" }> {
  if (!isRecord(snapshot)) return Object.freeze({ status: "invalid" });
  const raw = snapshot["prePublishProfile"];
  if (raw === undefined) return Object.freeze({ status: "missing" });
  if (
    !isRecord(raw) ||
    raw["schemaVersion"] !== approvalPrePublishProfileSchemaVersion ||
    !Array.isArray(raw["factualClaims"])
  ) {
    return Object.freeze({ status: "invalid" });
  }
  const requiredClaims = normalizedStrings(raw["requiredClaims"]);
  if (
    requiredClaims === null ||
    !requiredClaims.every(isDynamicClaim) ||
    new Set(requiredClaims).size !== requiredClaims.length
  ) {
    return Object.freeze({ status: "invalid" });
  }
  const factualClaims: PrePublishFactualClaim[] = [];
  for (const candidate of raw["factualClaims"]) {
    if (
      !isRecord(candidate) ||
      !isDynamicClaim(candidate["claimKind"]) ||
      typeof candidate["evidenceId"] !== "string" ||
      candidate["evidenceId"].trim() === "" ||
      typeof candidate["statement"] !== "string" ||
      candidate["statement"].trim() === "" ||
      (candidate["externalProductId"] !== undefined &&
        typeof candidate["externalProductId"] !== "string")
    ) {
      return Object.freeze({ status: "invalid" });
    }
    factualClaims.push(
      Object.freeze({
        claimKind: candidate["claimKind"],
        evidenceId: candidate["evidenceId"].trim(),
        ...(candidate["externalProductId"] === undefined
          ? {}
          : { externalProductId: candidate["externalProductId"] }),
        statement: candidate["statement"].trim(),
      }),
    );
  }
  const source = raw["recurringStorySource"];
  const parsedSource =
    source === undefined ? undefined : readRecurringStorySourceSnapshot(source);
  if (parsedSource === null) {
    return Object.freeze({ status: "invalid" });
  }
  return Object.freeze({
    profile: Object.freeze({
      factualClaims: Object.freeze(factualClaims),
      ...(parsedSource === undefined
        ? {}
        : { recurringStorySource: parsedSource }),
      requiredClaims: Object.freeze(requiredClaims),
      schemaVersion: approvalPrePublishProfileSchemaVersion,
    }),
    status: "valid",
  });
}

function dynamicClaimKindsFromText(
  text: string,
): readonly PrePublishDynamicClaimKind[] {
  return Object.freeze(
    detectClaimSignals(text).filter(
      (claim): claim is PrePublishDynamicClaimKind =>
        (prePublishDynamicClaimKinds as readonly string[]).includes(claim),
    ),
  );
}

/** Construye el mínimo perfil necesario sin conservar el ledger completo. */
export function createApprovalPrePublishProfile(
  input: Readonly<{
    brief?: ContentBrief;
    /** Texto aprobado aun cuando la pieza no nació de un ContentBrief. */
    contentText?: readonly string[];
    evidence: readonly ContentBriefEvidenceEntry[];
    recurringStorySource?: RecurringStorySourceSnapshot;
  }>,
): ApprovalPrePublishProfile {
  const evidenceByCitation = new Map(
    input.evidence.map((entry) => [entry.citationId, entry]),
  );
  const factualClaims: PrePublishFactualClaim[] = [];
  const required = new Set<PrePublishDynamicClaimKind>();
  if (input.brief !== undefined) {
    for (const fact of input.brief.verifiedFacts) {
      if (!isDynamicClaim(fact.claimKind)) continue;
      required.add(fact.claimKind);
      const entry = evidenceByCitation.get(fact.evidenceId);
      factualClaims.push(
        Object.freeze({
          claimKind: fact.claimKind,
          evidenceId: fact.evidenceId,
          ...(entry?.externalProductId === null || entry === undefined
            ? {}
            : { externalProductId: entry.externalProductId }),
          statement: fact.statement,
        }),
      );
    }
    const text = [
      input.brief.caption,
      input.brief.creativeProposal,
      input.brief.subtitle ?? "",
      input.brief.title,
      input.brief.callToAction.label,
    ].join("\n");
    for (const kind of dynamicClaimKindsFromText(text)) required.add(kind);
  }
  for (const text of input.contentText ?? []) {
    for (const kind of dynamicClaimKindsFromText(text)) required.add(kind);
  }
  if (input.recurringStorySource !== undefined) {
    required.add("business_hours");
  }
  return Object.freeze({
    factualClaims: Object.freeze(factualClaims),
    ...(input.recurringStorySource === undefined
      ? {}
      : { recurringStorySource: input.recurringStorySource }),
    requiredClaims: Object.freeze([...required].toSorted()),
    schemaVersion: approvalPrePublishProfileSchemaVersion,
  });
}
