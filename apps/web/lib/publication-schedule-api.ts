import type {
  CreatePublicationScheduleResponse,
  PreviewPublicationScheduleUpdateResponse,
  PublicationScheduleCalendarResponse,
  PublicationScheduleOccurrenceResponse,
  PublicationSchedulePublicationResponse,
  PublicationScheduleResponse,
  PublicationScheduleTransitionResponse,
  UpdatePublicationScheduleResponse,
} from "@aramayo/contracts";

export type ScheduleRuleSubmission = Readonly<{
  effectiveFromLocalDate: string;
  effectiveUntilLocalDate?: string;
  gapPolicy: "next-valid" | "skip";
  lateToleranceMinutes: number;
  localTime: string;
  missedPolicy: "run-late" | "skip";
  monthDay?: number;
  monthDayOverflow?: "clamp" | "skip";
  recurrenceInterval?: number;
  recurrenceKind: "daily" | "monthly" | "once" | "weekly";
  targets: readonly ("facebook_page" | "instagram_feed" | "instagram_story")[];
  timeZone: string;
  weekdays?: readonly number[];
}>;

export type ScheduleActionResult<T> =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; value: T }>;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function date(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function target(
  value: unknown,
): value is "facebook_page" | "instagram_feed" | "instagram_story" {
  return (
    value === "facebook_page" ||
    value === "instagram_feed" ||
    value === "instagram_story"
  );
}

function recurrence(
  value: unknown,
): PublicationScheduleResponse["recurrence"] | null {
  const candidate = record(value);
  if (candidate === null || typeof candidate["kind"] !== "string") {
    return null;
  }
  switch (candidate["kind"]) {
    case "once":
      return Object.freeze({ kind: "once" });
    case "daily": {
      const interval = candidate["interval"];
      return positiveInteger(interval)
        ? Object.freeze({ interval, kind: "daily" })
        : null;
    }
    case "weekly": {
      const interval = candidate["interval"];
      const weekdays = candidate["weekdays"];
      if (!positiveInteger(interval) || !Array.isArray(weekdays)) return null;
      const parsedWeekdays: number[] = [];
      for (const weekday of weekdays) {
        if (!positiveInteger(weekday) || weekday > 7) return null;
        parsedWeekdays.push(weekday);
      }
      return Object.freeze({
        interval,
        kind: "weekly",
        weekdays: Object.freeze(parsedWeekdays),
      });
    }
    case "monthly": {
      const interval = candidate["interval"];
      const monthDay = candidate["monthDay"];
      const overflow = candidate["overflow"];
      return positiveInteger(interval) &&
        positiveInteger(monthDay) &&
        monthDay <= 31 &&
        (overflow === "clamp" || overflow === "skip")
        ? Object.freeze({ interval, kind: "monthly", monthDay, overflow })
        : null;
    }
    default:
      return null;
  }
}

function schedule(value: unknown): PublicationScheduleResponse | null {
  const candidate = record(value);
  const targets = candidate?.["targets"];
  if (
    candidate === null ||
    typeof candidate["approvalSnapshotId"] !== "string" ||
    !date(candidate["effectiveFrom"]) ||
    (candidate["effectiveUntil"] !== undefined &&
      !date(candidate["effectiveUntil"])) ||
    (candidate["gapPolicy"] !== "next-valid" &&
      candidate["gapPolicy"] !== "skip") ||
    typeof candidate["id"] !== "string" ||
    !nonNegativeInteger(candidate["lateToleranceMinutes"]) ||
    typeof candidate["localTime"] !== "string" ||
    (candidate["missedPolicy"] !== "run-late" &&
      candidate["missedPolicy"] !== "skip") ||
    typeof candidate["publicationId"] !== "string" ||
    !Array.isArray(targets) ||
    typeof candidate["timeZone"] !== "string" ||
    !positiveInteger(candidate["version"])
  ) {
    return null;
  }
  const parsedRecurrence = recurrence(candidate["recurrence"]);
  if (parsedRecurrence === null) return null;
  const parsedTargets: (
    "facebook_page" | "instagram_feed" | "instagram_story"
  )[] = [];
  for (const candidateTarget of targets) {
    if (!target(candidateTarget)) return null;
    parsedTargets.push(candidateTarget);
  }
  const status = candidate["status"];
  if (
    status !== "active" &&
    status !== "cancelled" &&
    status !== "completed" &&
    status !== "expired" &&
    status !== "paused"
  ) {
    return null;
  }
  return Object.freeze({
    approvalSnapshotId: candidate["approvalSnapshotId"],
    effectiveFrom: candidate["effectiveFrom"],
    ...(candidate["effectiveUntil"] === undefined
      ? {}
      : { effectiveUntil: candidate["effectiveUntil"] }),
    gapPolicy: candidate["gapPolicy"],
    id: candidate["id"],
    lateToleranceMinutes: candidate["lateToleranceMinutes"],
    localTime: candidate["localTime"],
    missedPolicy: candidate["missedPolicy"],
    publicationId: candidate["publicationId"],
    recurrence: parsedRecurrence,
    status,
    targets: Object.freeze(parsedTargets),
    timeZone: candidate["timeZone"],
    version: candidate["version"],
  });
}

function occurrence(
  value: unknown,
): PublicationScheduleOccurrenceResponse | null {
  const candidate = record(value);
  if (
    candidate === null ||
    (candidate["dispatchRequestedAt"] !== undefined &&
      !date(candidate["dispatchRequestedAt"])) ||
    typeof candidate["occurrenceKey"] !== "string" ||
    (candidate["publicationOrderId"] !== undefined &&
      typeof candidate["publicationOrderId"] !== "string") ||
    (candidate["resolution"] !== "ambiguous" &&
      candidate["resolution"] !== "exact" &&
      candidate["resolution"] !== "shifted") ||
    !date(candidate["scheduledAt"]) ||
    (candidate["status"] !== "cancelled" &&
      candidate["status"] !== "dispatched" &&
      candidate["status"] !== "planned" &&
      candidate["status"] !== "skipped")
  ) {
    return null;
  }
  return Object.freeze({
    ...(candidate["dispatchRequestedAt"] === undefined
      ? {}
      : { dispatchRequestedAt: candidate["dispatchRequestedAt"] }),
    occurrenceKey: candidate["occurrenceKey"],
    ...(candidate["publicationOrderId"] === undefined
      ? {}
      : { publicationOrderId: candidate["publicationOrderId"] }),
    resolution: candidate["resolution"],
    scheduledAt: candidate["scheduledAt"],
    status: candidate["status"],
  });
}

function calendar(value: unknown): PublicationScheduleCalendarResponse | null {
  const candidate = record(value);
  const entries = candidate?.["entries"];
  if (
    candidate === null ||
    !date(candidate["from"]) ||
    !date(candidate["to"]) ||
    !Array.isArray(entries)
  ) {
    return null;
  }
  const parsedEntries = [];
  for (const entry of entries) {
    const candidateEntry = record(entry);
    if (
      candidateEntry === null ||
      !Array.isArray(candidateEntry["occurrences"])
    ) {
      return null;
    }
    const parsedSchedule = schedule(candidateEntry["schedule"]);
    if (parsedSchedule === null) return null;
    const parsedOccurrences: PublicationScheduleOccurrenceResponse[] = [];
    for (const candidateOccurrence of candidateEntry["occurrences"]) {
      const parsedOccurrence = occurrence(candidateOccurrence);
      if (parsedOccurrence === null) return null;
      parsedOccurrences.push(parsedOccurrence);
    }
    parsedEntries.push(
      Object.freeze({
        occurrences: Object.freeze(parsedOccurrences),
        schedule: parsedSchedule,
      }),
    );
  }
  return Object.freeze({
    entries: Object.freeze(parsedEntries),
    from: candidate["from"],
    to: candidate["to"],
  });
}

function changeCounts(
  value: unknown,
  status: "preview" | "updated",
):
  | PreviewPublicationScheduleUpdateResponse
  | UpdatePublicationScheduleResponse
  | null {
  const candidate = record(value);
  if (
    candidate === null ||
    candidate["status"] !== status ||
    !nonNegativeInteger(candidate["cancelledOccurrenceCount"]) ||
    !nonNegativeInteger(candidate["createdOccurrenceCount"]) ||
    !nonNegativeInteger(candidate["frozenOccurrenceCount"]) ||
    !nonNegativeInteger(candidate["rescheduledOccurrenceCount"]) ||
    typeof candidate["scheduleId"] !== "string" ||
    !positiveInteger(candidate["version"])
  ) {
    return null;
  }
  const counts = {
    cancelledOccurrenceCount: candidate["cancelledOccurrenceCount"],
    createdOccurrenceCount: candidate["createdOccurrenceCount"],
    frozenOccurrenceCount: candidate["frozenOccurrenceCount"],
    rescheduledOccurrenceCount: candidate["rescheduledOccurrenceCount"],
    scheduleId: candidate["scheduleId"],
    version: candidate["version"],
  };
  return status === "preview"
    ? Object.freeze({ ...counts, status: "preview" })
    : Object.freeze({ ...counts, status: "updated" });
}

function creation(value: unknown): CreatePublicationScheduleResponse | null {
  const candidate = record(value);
  const publication = record(candidate?.["publication"]);
  if (
    candidate === null ||
    candidate["status"] !== "created" ||
    !nonNegativeInteger(candidate["materializedOccurrenceCount"]) ||
    typeof candidate["scheduleId"] !== "string" ||
    !positiveInteger(candidate["version"]) ||
    publication === null ||
    publication["status"] !== "scheduled" ||
    !positiveInteger(publication["version"])
  ) {
    return null;
  }
  return Object.freeze({
    materializedOccurrenceCount: candidate["materializedOccurrenceCount"],
    publication: Object.freeze({
      status: "scheduled",
      version: publication["version"],
    }),
    scheduleId: candidate["scheduleId"],
    status: "created",
    version: candidate["version"],
  });
}

function publicationStatus(
  value: unknown,
): PublicationSchedulePublicationResponse["status"] | null {
  switch (value) {
    case "approved":
    case "cancelled":
    case "draft":
    case "expired":
    case "generating_assets":
    case "generation_failed":
    case "missing_information":
    case "partially_published":
    case "publish_failed":
    case "published":
    case "publishing":
    case "ready_for_review":
    case "retrieving_context":
    case "scheduled":
    case "validation_failed":
      return value;
    default:
      return null;
  }
}

function transition(
  value: unknown,
): PublicationScheduleTransitionResponse | null {
  const candidate = record(value);
  const publication = record(candidate?.["publication"]);
  const parsedPublicationStatus = publicationStatus(publication?.["status"]);
  if (
    candidate === null ||
    candidate["status"] !== "updated" ||
    !nonNegativeInteger(candidate["cancelledOccurrenceCount"]) ||
    !nonNegativeInteger(candidate["dispatchedOccurrenceCount"]) ||
    typeof candidate["scheduleId"] !== "string" ||
    !positiveInteger(candidate["version"]) ||
    publication === null ||
    parsedPublicationStatus === null ||
    !positiveInteger(publication["version"])
  ) {
    return null;
  }
  return Object.freeze({
    cancelledOccurrenceCount: candidate["cancelledOccurrenceCount"],
    dispatchedOccurrenceCount: candidate["dispatchedOccurrenceCount"],
    publication: Object.freeze({
      status: parsedPublicationStatus,
      version: publication["version"],
    }),
    scheduleId: candidate["scheduleId"],
    status: "updated",
    version: candidate["version"],
  });
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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

function errorMessage(body: unknown, fallback: string): string {
  const response = record(body);
  return typeof response?.["message"] === "string"
    ? response["message"]
    : fallback;
}

function mutationHeaders(csrf: string, idempotencyKey?: string): HeadersInit {
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...(idempotencyKey === undefined
      ? {}
      : { "idempotency-key": idempotencyKey }),
    "x-csrf-token": csrf,
  };
}

export async function loadPublicationScheduleCalendar(
  apiBaseUrl: string,
  window: Readonly<{ from: string; to: string }>,
): Promise<ScheduleActionResult<PublicationScheduleCalendarResponse>> {
  try {
    const url = new URL("schedules", apiBaseUrl);
    url.searchParams.set("from", window.from);
    url.searchParams.set("to", window.to);
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const parsed = calendar(await payload(response));
    return response.ok && parsed !== null
      ? { kind: "ready", value: parsed }
      : {
          kind: "error",
          message: "El calendario recibido no tiene un formato utilizable.",
        };
  } catch {
    return { kind: "error", message: "No se pudo cargar el calendario." };
  }
}

async function scheduleMutation<T>(
  apiBaseUrl: string,
  path: string,
  method: "PATCH" | "POST",
  body: unknown,
  idempotencyKey: string | undefined,
  parse: (value: unknown) => T | null,
  fallback: string,
): Promise<ScheduleActionResult<T>> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(new URL(path, apiBaseUrl), {
      body: JSON.stringify(body),
      credentials: "include",
      headers: mutationHeaders(csrf, idempotencyKey),
      method,
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const responseBody = await payload(response);
    const parsed = parse(responseBody);
    return response.ok && parsed !== null
      ? { kind: "ready", value: parsed }
      : {
          kind: "error",
          message: errorMessage(responseBody, fallback),
        };
  } catch {
    return { kind: "error", message: fallback };
  }
}

export function createPublicationSchedule(
  apiBaseUrl: string,
  publicationId: string,
  expectedPublicationVersion: number,
  rule: ScheduleRuleSubmission,
  idempotencyKey: string,
): Promise<ScheduleActionResult<CreatePublicationScheduleResponse>> {
  return scheduleMutation(
    apiBaseUrl,
    `publications/${publicationId}/schedules`,
    "POST",
    { ...rule, expectedPublicationVersion },
    idempotencyKey,
    creation,
    "No se pudo crear la programación. Recargá antes de intentar de nuevo.",
  );
}

export function previewPublicationScheduleUpdate(
  apiBaseUrl: string,
  scheduleId: string,
  expectedVersion: number,
  rule: ScheduleRuleSubmission,
): Promise<ScheduleActionResult<PreviewPublicationScheduleUpdateResponse>> {
  return scheduleMutation(
    apiBaseUrl,
    `schedules/${scheduleId}/preview`,
    "POST",
    { ...rule, expectedVersion },
    undefined,
    (value) => {
      const parsed = changeCounts(value, "preview");
      return parsed?.status === "preview" ? parsed : null;
    },
    "No se pudo calcular el impacto del cambio.",
  );
}

export function updatePublicationSchedule(
  apiBaseUrl: string,
  scheduleId: string,
  expectedVersion: number,
  rule: ScheduleRuleSubmission,
  idempotencyKey: string,
): Promise<ScheduleActionResult<UpdatePublicationScheduleResponse>> {
  return scheduleMutation(
    apiBaseUrl,
    `schedules/${scheduleId}`,
    "PATCH",
    { ...rule, expectedVersion },
    idempotencyKey,
    (value) => {
      const parsed = changeCounts(value, "updated");
      return parsed?.status === "updated" ? parsed : null;
    },
    "No se pudo actualizar la programación. Recargá antes de intentar de nuevo.",
  );
}

export function transitionPublicationSchedule(
  apiBaseUrl: string,
  scheduleId: string,
  expectedVersion: number,
  type: "cancel" | "pause" | "resume",
  idempotencyKey: string,
): Promise<ScheduleActionResult<PublicationScheduleTransitionResponse>> {
  return scheduleMutation(
    apiBaseUrl,
    `schedules/${scheduleId}/transitions`,
    "POST",
    {
      expectedVersion,
      ...(type === "cancel" ? { reasonCode: "operator-cancelled" } : {}),
      type,
    },
    idempotencyKey,
    transition,
    "No se pudo aplicar la acción de calendario. Recargá antes de intentar de nuevo.",
  );
}
