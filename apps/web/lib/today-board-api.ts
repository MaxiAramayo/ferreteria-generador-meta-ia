import type {
  MetaConnectionResponse,
  PublicationOperationalAlertResponse,
  PublicationStatusResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";

import { loadMetaConnections } from "./meta-connections-api.ts";
import { loadOperationalAlerts } from "./publication-operational-alert-api.ts";
import { loadPublishingReadiness } from "./publication-publishing-api.ts";
import { loadPublicationScheduleCalendar } from "./publication-schedule-api.ts";
import {
  sumCounts,
  upcomingOutings,
  type Loadable,
  type UpcomingOuting,
} from "./today-board-presentation.ts";

/**
 * Lecturas de «Para hoy». Cada una se resuelve por separado y ninguna lanza:
 * si falla una fuente, su tarjeta lo dice y el resto del tablero sigue.
 */

const dayMilliseconds = 24 * 60 * 60 * 1000;

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
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

function publicationsUrl(
  apiBaseUrl: string,
  query: Readonly<Record<string, string>>,
): URL {
  const url = new URL("publications", apiBaseUrl);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }
  return url;
}

/** Cuántas piezas hay en un estado. Pide una sola fila: sólo importa `total`. */
export async function countPublications(
  apiBaseUrl: string,
  status: PublicationStatusResponse,
): Promise<Loadable<number>> {
  try {
    const response = await fetch(
      publicationsUrl(apiBaseUrl, { limit: "1", page: "1", status }),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return {
        kind: "error",
        message: "Tu sesión no puede leer estas piezas.",
      };
    }
    const total = objectRecord(await payload(response))?.["total"];
    return response.ok &&
      typeof total === "number" &&
      Number.isSafeInteger(total) &&
      total >= 0
      ? { kind: "ready", value: total }
      : {
          kind: "error",
          message: "La API devolvió un conteo que el panel no puede usar.",
        };
  } catch {
    return { kind: "error", message: "No se pudo consultar la API." };
  }
}

/** Piezas con datos faltantes, validación fallida o imagen que no se generó. */
export async function countPublicationsNeedingAttention(
  apiBaseUrl: string,
): Promise<Loadable<number>> {
  return sumCounts(
    await Promise.all([
      countPublications(apiBaseUrl, "missing_information"),
      countPublications(apiBaseUrl, "validation_failed"),
      countPublications(apiBaseUrl, "generation_failed"),
    ]),
  );
}

/**
 * Títulos para nombrar las salidas: el calendario sólo trae el id de la pieza.
 *
 * Lee las 100 piezas más recientes. Una salida de una pieza más vieja se
 * nombra de forma genérica en vez de pedir cada pieza por separado.
 */
export async function loadPublicationTitles(
  apiBaseUrl: string,
): Promise<ReadonlyMap<string, string>> {
  const titles = new Map<string, string>();
  try {
    const response = await fetch(
      publicationsUrl(apiBaseUrl, { limit: "100", page: "1" }),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    const items = objectRecord(await payload(response))?.["items"];
    if (!response.ok || !Array.isArray(items)) return titles;
    const entries: readonly unknown[] = items;
    for (const entry of entries) {
      const publication = objectRecord(entry);
      const id = publication?.["id"];
      const title = publication?.["title"];
      if (typeof id === "string" && typeof title === "string") {
        titles.set(id, title);
      }
    }
  } catch {
    // Sin títulos, cada salida se nombra de forma genérica.
  }
  return titles;
}

export async function loadUpcomingOutings(
  apiBaseUrl: string,
  now: Date,
  days: number,
  limit: number,
): Promise<Loadable<readonly UpcomingOuting[]>> {
  const [calendar, titles] = await Promise.all([
    loadPublicationScheduleCalendar(apiBaseUrl, {
      from: now.toISOString(),
      to: new Date(now.getTime() + days * dayMilliseconds).toISOString(),
    }),
    loadPublicationTitles(apiBaseUrl),
  ]);
  switch (calendar.kind) {
    case "ready":
      return {
        kind: "ready",
        value: upcomingOutings(calendar.value, titles, now, limit),
      };
    case "forbidden":
      return {
        kind: "error",
        message: "Tu sesión no puede leer el calendario.",
      };
    case "error":
      return { kind: "error", message: calendar.message };
  }
}

export async function loadOpenAlerts(
  apiBaseUrl: string,
): Promise<Loadable<readonly PublicationOperationalAlertResponse[]>> {
  const result = await loadOperationalAlerts(apiBaseUrl);
  switch (result.kind) {
    case "ready":
      return { kind: "ready", value: result.alerts };
    case "forbidden":
      return { kind: "error", message: "Tu sesión no puede leer las alertas." };
    case "error":
      return { kind: "error", message: result.message };
  }
}

/** `null` si no se pudo confirmar: el tablero lo dice en vez de suponer. */
export async function loadPublishingState(
  apiBaseUrl: string,
): Promise<Loadable<PublishingReadinessResponse | null>> {
  return { kind: "ready", value: await loadPublishingReadiness(apiBaseUrl) };
}

export async function loadMetaConnectionState(
  apiBaseUrl: string,
): Promise<Loadable<readonly MetaConnectionResponse[]>> {
  const result = await loadMetaConnections(apiBaseUrl);
  switch (result.kind) {
    case "ready":
      return { kind: "ready", value: result.connections };
    case "forbidden":
      return {
        kind: "error",
        message: "Tu sesión no puede leer las conexiones.",
      };
    case "error":
      return { kind: "error", message: result.message };
  }
}
