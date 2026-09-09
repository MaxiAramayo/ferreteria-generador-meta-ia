import type {
  LocationDayOverrideImpactResponse,
  LocationDayOverrideListResponse,
  LocationDayOverrideMutationResponse,
  LocationDayOverridePreviewResponse,
  LocationDayOverrideResponse,
} from "@aramayo/contracts";

/** Una excepción se envía por fecha civil; la zona la resuelve la sucursal. */
export type LocationDayOverrideSubmission =
  | Readonly<{
      expectedVersion?: number;
      localDate: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
    }>
  | Readonly<{
      expectedVersion?: number;
      localDate: string;
      sourceLabel: string;
      status: "closed";
    }>;

export type DayOverrideActionResult<Value> =
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; value: Value }>;

const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/u;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function civilDate(value: unknown): value is string {
  return typeof value === "string" && civilDatePattern.test(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function override(value: unknown): LocationDayOverrideResponse | null {
  const candidate = record(value);
  if (
    candidate === null ||
    typeof candidate["id"] !== "string" ||
    !civilDate(candidate["localDate"]) ||
    typeof candidate["locationId"] !== "string" ||
    typeof candidate["sourceLabel"] !== "string" ||
    !nonNegativeInteger(candidate["version"])
  ) {
    return null;
  }
  if (candidate["status"] === "closed") {
    return Object.freeze({
      id: candidate["id"],
      localDate: candidate["localDate"],
      locationId: candidate["locationId"],
      sourceLabel: candidate["sourceLabel"],
      status: "closed",
      version: candidate["version"],
    });
  }
  return candidate["status"] === "open" &&
    typeof candidate["openingHours"] === "string"
    ? Object.freeze({
        id: candidate["id"],
        localDate: candidate["localDate"],
        locationId: candidate["locationId"],
        openingHours: candidate["openingHours"],
        sourceLabel: candidate["sourceLabel"],
        status: "open",
        version: candidate["version"],
      })
    : null;
}

function impact(value: unknown): LocationDayOverrideImpactResponse | null {
  const candidate = record(value);
  return candidate !== null &&
    nonNegativeInteger(candidate["affectedStoryCount"]) &&
    civilDate(candidate["localDate"]) &&
    typeof candidate["timeZone"] === "string" &&
    typeof candidate["willBlockHoursSensitiveStories"] === "boolean" &&
    typeof candidate["willRequireHumanApproval"] === "boolean"
    ? Object.freeze({
        affectedStoryCount: candidate["affectedStoryCount"],
        localDate: candidate["localDate"],
        timeZone: candidate["timeZone"],
        willBlockHoursSensitiveStories:
          candidate["willBlockHoursSensitiveStories"],
        willRequireHumanApproval: candidate["willRequireHumanApproval"],
      })
    : null;
}

function list(value: unknown): LocationDayOverrideListResponse | null {
  const candidate = record(value);
  const overrides = candidate?.["overrides"];
  if (
    candidate === null ||
    !civilDate(candidate["endDate"]) ||
    typeof candidate["locationId"] !== "string" ||
    !civilDate(candidate["startDate"]) ||
    !Array.isArray(overrides)
  ) {
    return null;
  }
  const parsed: LocationDayOverrideResponse[] = [];
  for (const entry of overrides) {
    const parsedOverride = override(entry);
    if (parsedOverride === null) return null;
    parsed.push(parsedOverride);
  }
  return Object.freeze({
    endDate: candidate["endDate"],
    locationId: candidate["locationId"],
    overrides: Object.freeze(parsed),
    startDate: candidate["startDate"],
  });
}

function preview(value: unknown): LocationDayOverridePreviewResponse | null {
  const parsed = impact(record(value)?.["impact"]);
  return parsed === null ? null : Object.freeze({ impact: parsed });
}

function mutation(value: unknown): LocationDayOverrideMutationResponse | null {
  const candidate = record(value);
  const parsedImpact = impact(candidate?.["impact"]);
  if (candidate === null || parsedImpact === null) {
    return null;
  }
  if (candidate["override"] === undefined) {
    return Object.freeze({ impact: parsedImpact });
  }
  const parsedOverride = override(candidate["override"]);
  return parsedOverride === null
    ? null
    : Object.freeze({ impact: parsedImpact, override: parsedOverride });
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  const response = record(body);
  return typeof response?.["message"] === "string"
    ? response["message"]
    : fallback;
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

function overridePath(locationId: string): string {
  return `organization/configuration/locations/${locationId}/day-overrides`;
}

export async function loadLocationDayOverrides(
  apiBaseUrl: string,
  locationId: string,
  range: Readonly<{ endDate: string; startDate: string }>,
): Promise<DayOverrideActionResult<LocationDayOverrideListResponse>> {
  try {
    const url = new URL(overridePath(locationId), apiBaseUrl);
    url.searchParams.set("startDate", range.startDate);
    url.searchParams.set("endDate", range.endDate);
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    const parsed = list(body);
    return response.ok && parsed !== null
      ? { kind: "ready", value: parsed }
      : {
          kind: "error",
          message: errorMessage(
            body,
            "Las excepciones recibidas no tienen un formato utilizable.",
          ),
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudieron cargar las excepciones de la sucursal.",
    };
  }
}

async function overrideMutation<Value>(
  apiBaseUrl: string,
  path: string,
  method: "DELETE" | "POST",
  body: unknown,
  parse: (value: unknown) => Value | null,
  fallback: string,
): Promise<DayOverrideActionResult<Value>> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(new URL(path, apiBaseUrl), {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(body === undefined
          ? {}
          : { "content-type": "application/json" as const }),
        "x-csrf-token": csrf,
      },
      method,
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    if (response.status === 409) return { kind: "conflict" };
    const responseBody = await payload(response);
    const parsed = parse(responseBody);
    return response.ok && parsed !== null
      ? { kind: "ready", value: parsed }
      : { kind: "error", message: errorMessage(responseBody, fallback) };
  } catch {
    return { kind: "error", message: fallback };
  }
}

export function previewLocationDayOverride(
  apiBaseUrl: string,
  locationId: string,
  submission: LocationDayOverrideSubmission,
): Promise<DayOverrideActionResult<LocationDayOverridePreviewResponse>> {
  return overrideMutation(
    apiBaseUrl,
    `${overridePath(locationId)}/preview`,
    "POST",
    requestBody(submission, false),
    preview,
    "No se pudo calcular el impacto de la excepción.",
  );
}

export function saveLocationDayOverride(
  apiBaseUrl: string,
  locationId: string,
  submission: LocationDayOverrideSubmission,
): Promise<DayOverrideActionResult<LocationDayOverrideMutationResponse>> {
  return overrideMutation(
    apiBaseUrl,
    overridePath(locationId),
    "POST",
    requestBody(submission, true),
    mutation,
    "No se pudo guardar la excepción. Recargá antes de intentar de nuevo.",
  );
}

export function deleteLocationDayOverride(
  apiBaseUrl: string,
  locationId: string,
  localDate: string,
  expectedVersion: number,
): Promise<DayOverrideActionResult<LocationDayOverrideMutationResponse>> {
  return overrideMutation(
    apiBaseUrl,
    `${overridePath(locationId)}/${localDate}?expectedVersion=${String(expectedVersion)}`,
    "DELETE",
    undefined,
    mutation,
    "No se pudo quitar la excepción. Recargá antes de intentar de nuevo.",
  );
}

function requestBody(
  submission: LocationDayOverrideSubmission,
  withExpectedVersion: boolean,
): Readonly<Record<string, number | string>> {
  const expectedVersion =
    withExpectedVersion && submission.expectedVersion !== undefined
      ? { expectedVersion: submission.expectedVersion }
      : {};
  return submission.status === "closed"
    ? {
        ...expectedVersion,
        localDate: submission.localDate,
        sourceLabel: submission.sourceLabel,
        status: "closed",
      }
    : {
        ...expectedVersion,
        localDate: submission.localDate,
        openingHours: submission.openingHours,
        sourceLabel: submission.sourceLabel,
        status: "open",
      };
}
