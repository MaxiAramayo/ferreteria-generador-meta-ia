/**
 * Cliente del brief conversacional.
 *
 * La API no genera al pedir: acepta el pedido y devuelve una ejecución que hay
 * que consultar. Por eso acá conviven un comando que encola y una lectura que
 * el compositor repite mientras la ejecución siga pendiente.
 *
 * Ninguna respuesta se da por buena por venir tipada: se valida en runtime y,
 * si no cumple, el panel informa en lugar de renderizar algo a medias.
 */

import type {
  ContentBriefRunListResponse,
  ContentBriefRunResponse,
  ContentBriefRunStatusResponse,
} from "@aramayo/contracts";

export type ContentBriefRequestResult =
  | Readonly<{ kind: "accepted"; runId: string }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ContentBriefRunResult =
  | Readonly<{ kind: "ready"; run: ContentBriefRunResponse }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ContentBriefHistoryResult =
  | Readonly<{ history: ContentBriefRunListResponse; kind: "ready" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ContentBriefCancellationResult =
  | Readonly<{ kind: "resolved"; status: ContentBriefRunStatusResponse }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ContentBriefAcceptanceResult =
  | Readonly<{
      kind: "accepted";
      publication: Readonly<{ id: string; title: string }>;
    }>
  | Readonly<{ kind: "forbidden" }>
  /** La ejecución no produjo un brief aceptable; reintentar no lo arregla. */
  | Readonly<{ kind: "conflict"; message: string }>
  | Readonly<{ kind: "error"; message: string }>;

const runStatuses: ReadonlySet<string> = new Set([
  "cancelled",
  "generated",
  "pending",
  "rejected",
]);

function isRunStatus(value: unknown): value is ContentBriefRunStatusResponse {
  return typeof value === "string" && runStatuses.has(value);
}

const evidenceKinds: ReadonlySet<string> = new Set(["commercial", "document"]);

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isEvidence(value: unknown): boolean {
  const entry = record(value);
  return (
    entry !== null &&
    typeof entry["citationId"] === "string" &&
    typeof entry["kind"] === "string" &&
    evidenceKinds.has(entry["kind"]) &&
    isNullableText(entry["observedAt"]) &&
    typeof entry["reference"] === "string"
  );
}

function isToolInvocation(value: unknown): boolean {
  const entry = record(value);
  return (
    entry !== null &&
    (entry["outcome"] === "failure" || entry["outcome"] === "success") &&
    typeof entry["toolName"] === "string"
  );
}

function isRejection(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const rejection = record(value);
  return (
    rejection !== null &&
    typeof rejection["code"] === "string" &&
    typeof rejection["message"] === "string"
  );
}

function isUsage(value: unknown): boolean {
  const usage = record(value);
  return (
    usage !== null &&
    (usage["estimatedCostUsd"] === null ||
      typeof usage["estimatedCostUsd"] === "number") &&
    typeof usage["latencyMilliseconds"] === "number" &&
    typeof usage["totalTokens"] === "number"
  );
}

/**
 * El brief viaja como estructura opaca: el panel muestra su copy y sus hechos,
 * y confía en que el servidor ya lo validó contra la evidencia. Acá sólo se
 * comprueba lo que la vista lee de forma directa.
 */
function isBrief(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const brief = record(value);
  return (
    brief !== null &&
    typeof brief["caption"] === "string" &&
    Array.isArray(brief["missingInformation"]) &&
    Array.isArray(brief["products"]) &&
    typeof brief["requiresHumanApproval"] === "boolean" &&
    isNullableText(brief["subtitle"]) &&
    typeof brief["title"] === "string" &&
    Array.isArray(brief["verifiedFacts"])
  );
}

function isRun(value: unknown): value is ContentBriefRunResponse {
  const run = record(value);
  return (
    run !== null &&
    isBrief(run["brief"]) &&
    isNullableText(run["cancelledAt"]) &&
    isNullableText(run["completedAt"]) &&
    Array.isArray(run["evidence"]) &&
    run["evidence"].every(isEvidence) &&
    typeof run["id"] === "string" &&
    typeof run["knowledgeStatus"] === "string" &&
    isNullableText(run["locationId"]) &&
    isNullableText(run["model"]) &&
    isNullableText(run["promptVersion"]) &&
    isRejection(run["rejection"]) &&
    typeof run["request"] === "string" &&
    typeof run["requestedAt"] === "string" &&
    isNullableText(run["schemaVersion"]) &&
    isRunStatus(run["status"]) &&
    Array.isArray(run["toolInvocations"]) &&
    run["toolInvocations"].every(isToolInvocation) &&
    isUsage(run["usage"])
  );
}

function isHistory(value: unknown): value is ContentBriefRunListResponse {
  const page = record(value);
  return (
    page !== null &&
    Array.isArray(page["items"]) &&
    page["items"].every(isRun) &&
    typeof page["limit"] === "number" &&
    typeof page["page"] === "number" &&
    typeof page["total"] === "number"
  );
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

export async function requestContentBrief(
  apiBaseUrl: string,
  input: Readonly<{
    idempotencyKey: string;
    locationId?: string;
    request: string;
  }>,
): Promise<ContentBriefRequestResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(new URL("content-briefs", apiBaseUrl), {
      body: JSON.stringify({
        ...(input.locationId === undefined
          ? {}
          : { locationId: input.locationId }),
        request: input.request,
      }),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
        "x-csrf-token": csrf,
      },
      method: "POST",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = record(await payload(response));
    const runId = body?.["runId"];
    return response.ok && typeof runId === "string"
      ? { kind: "accepted", runId }
      : {
          kind: "error",
          message: "El pedido no fue aceptado. Revisalo y reintentá.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. El pedido no fue confirmado.",
    };
  }
}

export async function loadContentBriefRun(
  apiBaseUrl: string,
  runId: string,
): Promise<ContentBriefRunResult> {
  try {
    const response = await fetch(
      new URL(`content-briefs/${runId}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    return response.ok && isRun(body)
      ? { kind: "ready", run: body }
      : {
          kind: "error",
          message: "La API devolvió una ejecución que el panel no puede leer.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo consultar el estado de la generación.",
    };
  }
}

export async function loadContentBriefHistory(
  apiBaseUrl: string,
  input: Readonly<{ limit: number; mine: boolean; page: number }>,
): Promise<ContentBriefHistoryResult> {
  const query = new URLSearchParams({
    limit: String(input.limit),
    mine: String(input.mine),
    page: String(input.page),
  });
  try {
    const response = await fetch(
      new URL(`content-briefs?${query.toString()}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    return response.ok && isHistory(body)
      ? { history: body, kind: "ready" }
      : {
          kind: "error",
          message: "La API devolvió un historial que el panel no puede leer.",
        };
  } catch {
    return { kind: "error", message: "No se pudo cargar el historial." };
  }
}

export async function cancelContentBriefRun(
  apiBaseUrl: string,
  runId: string,
): Promise<ContentBriefCancellationResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(
      new URL(`content-briefs/${runId}/cancel`, apiBaseUrl),
      {
        credentials: "include",
        headers: {
          accept: "application/json",
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = record(await payload(response));
    const status = body?.["status"];
    // Cancelar informa el estado real: si la generación ya había terminado, el
    // resultado sigue vigente y el panel no debe decir que se canceló.
    return response.ok && isRunStatus(status)
      ? { kind: "resolved", status }
      : { kind: "error", message: "No se pudo cancelar la generación." };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. La cancelación no fue confirmada.",
    };
  }
}

/**
 * Aceptar sólo envía la presentación. El título del diseño es el que se ve en
 * la pieza y por eso viaja acá, pero el copy —título, epígrafe y productos— lo
 * toma el servidor del brief guardado y el body no puede cambiarlo.
 */
export async function acceptContentBrief(
  apiBaseUrl: string,
  input: Readonly<{
    designTitle: string;
    idempotencyKey: string;
    runId: string;
  }>,
): Promise<ContentBriefAcceptanceResult> {
  const { designTitle, idempotencyKey, runId } = input;
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(
      new URL(`content-briefs/${runId}/acceptance`, apiBaseUrl),
      {
        body: JSON.stringify({
          design: {
            content: {
              callToAction: "Consultanos por WhatsApp",
              title: designTitle.slice(0, 240),
            },
            format: "historia",
            layout: "historia-tip",
            media: [],
            schemaVersion: 1,
            slug: "historia-tip-editorial",
            theme: "taller",
          },
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    if (response.status === 409) {
      return {
        kind: "conflict",
        message: "Esta ejecución no produjo un brief que se pueda aceptar.",
      };
    }
    const body = record(await payload(response));
    const id = body?.["id"];
    const title = body?.["title"];
    return response.ok && typeof id === "string" && typeof title === "string"
      ? { kind: "accepted", publication: { id, title } }
      : {
          kind: "error",
          message: "El brief no se convirtió en revisión. Reintentá.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. La aceptación no fue confirmada.",
    };
  }
}
