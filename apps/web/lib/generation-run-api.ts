import type {
  GenerationRunListResponse,
  GenerationRunResponse,
} from "@aramayo/contracts";

export type GenerationRunLoadResult =
  | Readonly<{ kind: "ready"; run: GenerationRunResponse }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type GenerationRunHistoryResult =
  | Readonly<{ history: GenerationRunListResponse; kind: "ready" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type GenerationMutationResult =
  | Readonly<{ kind: "accepted"; runId: string }>
  | Readonly<{ kind: "selected"; runId: string; selectionVersion: number }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "conflict"; message: string }>
  | Readonly<{ kind: "error"; message: string }>;

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

function nullableText(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function validVariant(value: unknown): boolean {
  const variant = record(value);
  const composition = record(variant?.["composition"]);
  const failure = record(variant?.["failure"]);
  return (
    variant !== null &&
    typeof variant["id"] === "string" &&
    typeof variant["index"] === "number" &&
    typeof variant["source"] === "string" &&
    typeof variant["status"] === "string" &&
    (composition === null ||
      (typeof composition["compositionHash"] === "string" &&
        typeof composition["mediaAssetId"] === "string" &&
        typeof composition["previewUrl"] === "string" &&
        typeof composition["width"] === "number" &&
        typeof composition["height"] === "number")) &&
    (failure === null ||
      (typeof failure["code"] === "string" &&
        typeof failure["correction"] === "string"))
  );
}

export function isGenerationRunResponse(
  value: unknown,
): value is GenerationRunResponse {
  const run = record(value);
  const progress = record(run?.["progress"]);
  const usage = record(run?.["usage"]);
  return (
    run !== null &&
    typeof run["contentBriefRunId"] === "string" &&
    typeof run["format"] === "string" &&
    typeof run["id"] === "string" &&
    typeof run["lineageRootId"] === "string" &&
    nullableText(run["selectedAt"]) &&
    nullableText(run["selectedByMembershipId"]) &&
    nullableText(run["selectedVariantId"]) &&
    typeof run["selectionVersion"] === "number" &&
    typeof run["status"] === "string" &&
    progress !== null &&
    typeof progress["total"] === "number" &&
    usage !== null &&
    (usage["estimatedCostUsd"] === null ||
      typeof usage["estimatedCostUsd"] === "number") &&
    Array.isArray(run["variants"]) &&
    run["variants"].every(validVariant)
  );
}

function isHistory(value: unknown): value is GenerationRunListResponse {
  const history = record(value);
  return (
    history !== null &&
    Array.isArray(history["items"]) &&
    history["items"].every(isGenerationRunResponse) &&
    typeof history["limit"] === "number" &&
    typeof history["page"] === "number" &&
    typeof history["total"] === "number"
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

async function mutation(
  apiBaseUrl: string,
  path: string,
  body: Readonly<Record<string, unknown>>,
  idempotencyKey: string,
): Promise<GenerationMutationResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(new URL(path, apiBaseUrl), {
      body: JSON.stringify(body),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-csrf-token": csrf,
      },
      method: "POST",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const responseBody = record(await payload(response));
    if (response.status === 409) {
      return {
        kind: "conflict",
        message:
          typeof responseBody?.["message"] === "string"
            ? responseBody["message"]
            : "El estado cambió. Actualizá el historial.",
      };
    }
    const runId = responseBody?.["runId"];
    if (!response.ok || typeof runId !== "string") {
      return { kind: "error", message: "La acción no pudo confirmarse." };
    }
    const selectionVersion = responseBody?.["selectionVersion"];
    return typeof selectionVersion === "number"
      ? { kind: "selected", runId, selectionVersion }
      : { kind: "accepted", runId };
  } catch {
    return { kind: "error", message: "La API no confirmó la acción." };
  }
}

export function requestGenerationRun(
  apiBaseUrl: string,
  input: Readonly<{
    contentBriefRunId: string;
    format: string;
    idempotencyKey: string;
    subjectKind: string;
    variants: number;
  }>,
): Promise<GenerationMutationResult> {
  return mutation(
    apiBaseUrl,
    "generation-runs",
    {
      contentBriefRunId: input.contentBriefRunId,
      format: input.format,
      subjectKind: input.subjectKind,
      variants: input.variants,
    },
    input.idempotencyKey,
  );
}

export function requestGenerationEdit(
  apiBaseUrl: string,
  input: Readonly<{
    contentBriefRunId?: string;
    idempotencyKey: string;
    instruction: string;
    kind: "factual" | "visual";
    parentRunId: string;
    parentVariantId: string;
    variants: number;
  }>,
): Promise<GenerationMutationResult> {
  return mutation(
    apiBaseUrl,
    `generation-runs/${input.parentRunId}/edits`,
    {
      ...(input.contentBriefRunId === undefined
        ? {}
        : { contentBriefRunId: input.contentBriefRunId }),
      instruction: input.instruction,
      kind: input.kind,
      parentVariantId: input.parentVariantId,
      variants: input.variants,
    },
    input.idempotencyKey,
  );
}

export function selectGenerationVariant(
  apiBaseUrl: string,
  input: Readonly<{
    expectedSelectionVersion: number;
    idempotencyKey: string;
    runId: string;
    variantId: string;
  }>,
): Promise<GenerationMutationResult> {
  return mutation(
    apiBaseUrl,
    `generation-runs/${input.runId}/selection`,
    {
      expectedSelectionVersion: input.expectedSelectionVersion,
      variantId: input.variantId,
    },
    input.idempotencyKey,
  );
}

export async function loadGenerationRun(
  apiBaseUrl: string,
  runId: string,
): Promise<GenerationRunLoadResult> {
  try {
    const response = await fetch(
      new URL(`generation-runs/${runId}`, apiBaseUrl),
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
    return response.ok && isGenerationRunResponse(body)
      ? { kind: "ready", run: body }
      : { kind: "error", message: "La API devolvió un lote ilegible." };
  } catch {
    return { kind: "error", message: "No se pudo consultar el lote." };
  }
}

export async function loadGenerationLineage(
  apiBaseUrl: string,
  lineageRootId: string,
): Promise<GenerationRunHistoryResult> {
  const query = new URLSearchParams({
    limit: "50",
    lineageRootId,
    page: "1",
  });
  try {
    const response = await fetch(
      new URL(`generation-runs?${query.toString()}`, apiBaseUrl),
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
      : { kind: "error", message: "La API devolvió un historial ilegible." };
  } catch {
    return { kind: "error", message: "No se pudo cargar la genealogía." };
  }
}

export function shouldPollGenerationRun(run: GenerationRunResponse): boolean {
  return run.status === "pending" || run.status === "running";
}
