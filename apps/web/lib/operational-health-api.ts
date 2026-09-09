import type {
  OperationalHealthReasonResponse,
  OperationalHealthResponse,
  OperationalHealthSignalsResponse,
} from "@aramayo/contracts";

export type OperationalHealthLoadResult =
  | Readonly<{ health: OperationalHealthResponse; kind: "ready" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

const reasonCodes = new Set<OperationalHealthReasonResponse["code"]>([
  "ambiguous-targets",
  "dead-letter-messages",
  "generation-budget",
  "occurrence-backlog",
  "occurrence-delay",
  "open-alerts",
  "outbox-age",
  "outbox-backlog",
  "partial-publications",
]);

const signalFields: readonly (keyof OperationalHealthSignalsResponse)[] = [
  "ambiguousTargets",
  "deadLetterMessages",
  "generationBudgetMicrousd",
  "generationCommittedMicrousd",
  "maximumOccurrenceDelayMinutes",
  "oldestPendingOutboxMinutes",
  "openAttentionAlerts",
  "openUrgentAlerts",
  "overdueOccurrences",
  "partialPublications",
  "pendingOutboxMessages",
];

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function counter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function reason(value: unknown): OperationalHealthReasonResponse | null {
  const record = objectRecord(value);
  if (
    record === null ||
    typeof record["code"] !== "string" ||
    !reasonCodes.has(
      record["code"] as OperationalHealthReasonResponse["code"],
    ) ||
    !counter(record["measured"]) ||
    !counter(record["threshold"]) ||
    (record["severity"] !== "attention" && record["severity"] !== "urgent")
  ) {
    return null;
  }
  return Object.freeze({
    code: record["code"] as OperationalHealthReasonResponse["code"],
    measured: record["measured"],
    severity: record["severity"],
    threshold: record["threshold"],
  });
}

function signals(value: unknown): OperationalHealthSignalsResponse | null {
  const record = objectRecord(value);
  if (
    record === null ||
    !signalFields.every((field) => counter(record[field]))
  ) {
    return null;
  }
  return Object.freeze(
    Object.fromEntries(
      signalFields.map((field) => [field, record[field] as number]),
    ) as unknown as OperationalHealthSignalsResponse,
  );
}

/** Proyecta el contrato aceptado: nada inesperado sale de acá hacia la pantalla. */
function health(value: unknown): OperationalHealthResponse | null {
  const record = objectRecord(value);
  const parsedSignals = signals(record?.["signals"]);
  const rawReasons = record?.["reasons"];
  if (
    record === null ||
    parsedSignals === null ||
    !Array.isArray(rawReasons) ||
    !counter(record["generationBudgetPercent"]) ||
    typeof record["observedAt"] !== "string" ||
    Number.isNaN(Date.parse(record["observedAt"])) ||
    (record["severity"] !== "attention" &&
      record["severity"] !== "healthy" &&
      record["severity"] !== "urgent")
  ) {
    return null;
  }
  const parsedReasons: OperationalHealthReasonResponse[] = [];
  for (const entry of rawReasons) {
    const parsed = reason(entry);
    if (parsed === null) return null;
    parsedReasons.push(parsed);
  }
  return Object.freeze({
    generationBudgetPercent: record["generationBudgetPercent"],
    observedAt: record["observedAt"],
    reasons: Object.freeze(parsedReasons),
    severity: record["severity"],
    signals: parsedSignals,
  });
}

export async function loadOperationalHealth(
  apiBaseUrl: string,
): Promise<OperationalHealthLoadResult> {
  try {
    const response = await fetch(new URL("operational-health", apiBaseUrl), {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const parsed = response.ok ? health(body) : null;
    return parsed === null
      ? {
          kind: "error",
          message: "El tablero recibió una respuesta no verificable.",
        }
      : { health: parsed, kind: "ready" };
  } catch {
    return {
      kind: "error",
      message: "No se pudo consultar la salud operativa.",
    };
  }
}
