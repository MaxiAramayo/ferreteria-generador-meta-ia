import type {
  DependencyReport,
  ReadinessResponse,
} from "@aramayo/contracts";

/**
 * Estado observable de la API desde el panel.
 *
 * Este módulo se ejecuta únicamente en el servidor: lo consumen componentes de
 * servidor y nunca se importa desde un componente marcado con `"use client"`.
 *
 * `unreachable` no es un fallo silencioso: la pantalla lo representa como un
 * estado explícito y distinto de `not_ready`, porque una API caída y una API
 * viva con dependencias caídas requieren acciones diferentes.
 */
export type ApiStatus =
  | { readonly kind: "ready"; readonly readiness: ReadinessResponse }
  | { readonly kind: "not_ready"; readonly readiness: ReadinessResponse }
  | { readonly kind: "unreachable" };

const requestTimeoutMs = 2_000;

function isDependencyReport(value: unknown): value is DependencyReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate["dependency"] === "postgres" ||
      candidate["dependency"] === "redis") &&
    (candidate["status"] === "up" || candidate["status"] === "down") &&
    typeof candidate["latencyMs"] === "number"
  );
}

function isReadinessResponse(value: unknown): value is ReadinessResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    (candidate["process"] === "api" || candidate["process"] === "worker") &&
    (candidate["status"] === "ready" || candidate["status"] === "not_ready") &&
    typeof candidate["checkedAt"] === "string" &&
    Array.isArray(candidate["dependencies"]) &&
    candidate["dependencies"].every(isDependencyReport)
  );
}

export async function readApiStatus(apiBaseUrl: string): Promise<ApiStatus> {
  let payload: unknown;

  try {
    const response = await fetch(new URL("ready", apiBaseUrl), {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    payload = await response.json();
  } catch {
    return { kind: "unreachable" };
  }

  if (!isReadinessResponse(payload)) {
    return { kind: "unreachable" };
  }

  return payload.status === "ready"
    ? { kind: "ready", readiness: payload }
    : { kind: "not_ready", readiness: payload };
}
