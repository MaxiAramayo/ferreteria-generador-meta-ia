import type {
  PublicationOperationalAlertListResponse,
  PublicationOperationalAlertResolutionResponse,
  PublicationOperationalAlertResponse,
} from "@aramayo/contracts";

export type OperationalAlertListLoadResult =
  | Readonly<{
      alerts: PublicationOperationalAlertListResponse["items"];
      kind: "ready";
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type OperationalAlertResolutionResult =
  | Readonly<{
      alert: PublicationOperationalAlertResponse;
      kind: "resolved";
      status: PublicationOperationalAlertResolutionResponse["status"];
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

const alertKinds = new Set<PublicationOperationalAlertResponse["kind"]>([
  "connection-degraded",
  "occurrence-stuck",
  "publication-manual-action",
]);
const alertCauses = new Set<PublicationOperationalAlertResponse["cause"]>([
  "attempts-exhausted",
  "connection-not-publishable",
  "dispatch-not-requested",
  "execution-not-completed",
  "outcome-unresolved",
  "permanent-failure",
]);
const safeActions = new Set<PublicationOperationalAlertResponse["safeAction"]>([
  "inspect-queue",
  "reconcile",
  "reconnect-meta",
  "retry",
]);
const severities = new Set<PublicationOperationalAlertResponse["severity"]>([
  "attention",
  "urgent",
]);
const publicationTargets = new Set<
  NonNullable<PublicationOperationalAlertResponse["publicationTarget"]>
>(["facebook_page", "instagram_feed", "instagram_story"]);

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isAlert(value: unknown): value is PublicationOperationalAlertResponse {
  const alert = objectRecord(value);
  return (
    alert !== null &&
    typeof alert["id"] === "string" &&
    typeof alert["firstObservedAt"] === "string" &&
    typeof alert["lastObservedAt"] === "string" &&
    typeof alert["observations"] === "number" &&
    Number.isSafeInteger(alert["observations"]) &&
    alert["observations"] > 0 &&
    typeof alert["kind"] === "string" &&
    alertKinds.has(
      alert["kind"] as PublicationOperationalAlertResponse["kind"],
    ) &&
    typeof alert["cause"] === "string" &&
    alertCauses.has(
      alert["cause"] as PublicationOperationalAlertResponse["cause"],
    ) &&
    typeof alert["safeAction"] === "string" &&
    safeActions.has(
      alert["safeAction"] as PublicationOperationalAlertResponse["safeAction"],
    ) &&
    typeof alert["severity"] === "string" &&
    severities.has(
      alert["severity"] as PublicationOperationalAlertResponse["severity"],
    ) &&
    isOptionalString(alert["metaConnectionId"]) &&
    isOptionalString(alert["publicationId"]) &&
    isOptionalString(alert["scheduleOccurrenceId"]) &&
    (alert["publicationTarget"] === undefined ||
      (typeof alert["publicationTarget"] === "string" &&
        publicationTargets.has(
          alert["publicationTarget"] as NonNullable<
            PublicationOperationalAlertResponse["publicationTarget"]
          >,
        )))
  );
}

/** Proyecta el contrato aceptado: atributos inesperados, incluso secretos, no salen de acá. */
function projectAlert(
  alert: PublicationOperationalAlertResponse,
): PublicationOperationalAlertResponse {
  return Object.freeze({
    cause: alert.cause,
    firstObservedAt: alert.firstObservedAt,
    id: alert.id,
    kind: alert.kind,
    lastObservedAt: alert.lastObservedAt,
    ...(alert.metaConnectionId === undefined
      ? {}
      : { metaConnectionId: alert.metaConnectionId }),
    observations: alert.observations,
    ...(alert.publicationId === undefined
      ? {}
      : { publicationId: alert.publicationId }),
    ...(alert.publicationTarget === undefined
      ? {}
      : { publicationTarget: alert.publicationTarget }),
    safeAction: alert.safeAction,
    ...(alert.scheduleOccurrenceId === undefined
      ? {}
      : { scheduleOccurrenceId: alert.scheduleOccurrenceId }),
    severity: alert.severity,
  });
}

function safeMessage(body: unknown, fallback: string): string {
  const record = objectRecord(body);
  return typeof record?.["message"] === "string" && record["message"].length > 0
    ? record["message"]
    : fallback;
}

async function csrf(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = objectRecord(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

export async function loadOperationalAlerts(
  apiBaseUrl: string,
): Promise<OperationalAlertListLoadResult> {
  try {
    const response = await fetch(new URL("operational-alerts", apiBaseUrl), {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    if (!response.ok || body === null || !Array.isArray(body["items"])) {
      return {
        kind: "error",
        message: "No se pudo leer la bandeja de alertas operativas.",
      };
    }
    if (!body["items"].every(isAlert)) {
      return {
        kind: "error",
        message: "La bandeja de alertas recibió una respuesta no verificable.",
      };
    }
    return {
      alerts: Object.freeze(body["items"].map(projectAlert)),
      kind: "ready",
    };
  } catch {
    return {
      kind: "error",
      message: "No se pudo consultar la bandeja de alertas operativas.",
    };
  }
}

/** Reconocer una alerta no reintenta ni modifica una publicación o Meta. */
export async function resolveOperationalAlert(
  apiBaseUrl: string,
  alertId: string,
): Promise<OperationalAlertResolutionResult> {
  try {
    const csrfToken = await csrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`operational-alerts/${alertId}/resolution`, apiBaseUrl),
      {
        credentials: "include",
        headers: {
          accept: "application/json",
          "x-csrf-token": csrfToken,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    const alert = body === null ? null : body["alert"];
    if (
      response.ok &&
      isAlert(alert) &&
      (body?.["status"] === "resolved" ||
        body?.["status"] === "already-resolved")
    ) {
      return {
        alert: projectAlert(alert),
        kind: "resolved",
        status: body["status"],
      };
    }
    return {
      kind: "error",
      message: safeMessage(
        body,
        "No se pudo registrar la revisión de esta alerta.",
      ),
    };
  } catch {
    return {
      kind: "error",
      message: "No se pudo registrar la revisión de esta alerta.",
    };
  }
}
