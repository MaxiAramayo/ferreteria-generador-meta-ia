import type {
  LocationConfigurationResponse,
  RecurringStoryApprovalPolicyResponse,
  RecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
} from "@aramayo/contracts";

export interface RecurringStoryRuleSubmission {
  readonly approvalPolicy: RecurringStoryApprovalPolicyResponse;
  readonly effectiveFromLocalDate: string;
  readonly idempotencyKey: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  readonly locationId: string;
  readonly name: string;
  readonly weekdays: readonly number[];
}

export type RecurringStoryWorkspaceResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; workspace: RecurringStoryWorkspaceResponse }>;

export type RecurringStorySaveResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "saved"; rule: RecurringStoryRuleResponse }>;

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

function location(value: unknown): LocationConfigurationResponse | null {
  const candidate = record(value);
  if (
    candidate === null ||
    typeof candidate["addressLine"] !== "string" ||
    typeof candidate["city"] !== "string" ||
    typeof candidate["id"] !== "string" ||
    typeof candidate["isActive"] !== "boolean" ||
    typeof candidate["name"] !== "string" ||
    typeof candidate["openingHours"] !== "string" ||
    typeof candidate["province"] !== "string" ||
    typeof candidate["timeZone"] !== "string" ||
    typeof candidate["version"] !== "number"
  ) {
    return null;
  }
  return {
    addressLine: candidate["addressLine"],
    city: candidate["city"],
    id: candidate["id"],
    isActive: candidate["isActive"],
    name: candidate["name"],
    openingHours: candidate["openingHours"],
    ...(typeof candidate["phone"] === "string"
      ? { phone: candidate["phone"] }
      : {}),
    province: candidate["province"],
    timeZone: candidate["timeZone"],
    version: candidate["version"],
    ...(typeof candidate["whatsapp"] === "string"
      ? { whatsapp: candidate["whatsapp"] }
      : {}),
  };
}

function rule(value: unknown): RecurringStoryRuleResponse | null {
  const candidate = record(value);
  const weekdays = candidate?.["weekdays"];
  return candidate !== null &&
    (candidate["approvalPolicy"] === "human-each-cycle" ||
      candidate["approvalPolicy"] === "automatic-routine") &&
    typeof candidate["effectiveFrom"] === "string" &&
    typeof candidate["id"] === "string" &&
    typeof candidate["leadTimeMinutes"] === "number" &&
    typeof candidate["localTime"] === "string" &&
    typeof candidate["locationId"] === "string" &&
    typeof candidate["name"] === "string" &&
    (candidate["status"] === "active" ||
      candidate["status"] === "paused" ||
      candidate["status"] === "cancelled") &&
    typeof candidate["timeZone"] === "string" &&
    typeof candidate["version"] === "number" &&
    Array.isArray(weekdays) &&
    weekdays.every(
      (weekday) => typeof weekday === "number" && weekday >= 1 && weekday <= 7,
    )
    ? {
        approvalPolicy: candidate["approvalPolicy"],
        effectiveFrom: candidate["effectiveFrom"],
        id: candidate["id"],
        leadTimeMinutes: candidate["leadTimeMinutes"],
        localTime: candidate["localTime"],
        locationId: candidate["locationId"],
        name: candidate["name"],
        status: candidate["status"],
        timeZone: candidate["timeZone"],
        version: candidate["version"],
        weekdays,
      }
    : null;
}

function workspace(value: unknown): RecurringStoryWorkspaceResponse | null {
  const candidate = record(value);
  const locations = candidate?.["locations"];
  const rules = candidate?.["rules"];
  if (
    candidate === null ||
    typeof candidate["canUseAutomaticApproval"] !== "boolean" ||
    !Array.isArray(locations) ||
    !Array.isArray(rules)
  ) {
    return null;
  }
  const parsedLocations = locations.map(location);
  const parsedRules = rules.map(rule);
  if (
    parsedLocations.some((entry) => entry === null) ||
    parsedRules.some((entry) => entry === null)
  ) {
    return null;
  }
  return {
    canUseAutomaticApproval: candidate["canUseAutomaticApproval"],
    locations: parsedLocations.filter(
      (entry): entry is LocationConfigurationResponse => entry !== null,
    ),
    rules: parsedRules.filter(
      (entry): entry is RecurringStoryRuleResponse => entry !== null,
    ),
  };
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

export async function loadRecurringStoryWorkspace(
  apiBaseUrl: string,
): Promise<RecurringStoryWorkspaceResult> {
  try {
    const response = await fetch(
      new URL("scheduling/recurring-stories", apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const parsed = workspace(await payload(response));
    return response.ok && parsed !== null
      ? { kind: "ready", workspace: parsed }
      : {
          kind: "error",
          message:
            "La API devolvió reglas recurrentes que el panel no puede usar.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudieron cargar las reglas recurrentes.",
    };
  }
}

export async function saveRecurringStoryRule(
  apiBaseUrl: string,
  submission: RecurringStoryRuleSubmission,
): Promise<RecurringStorySaveResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL("scheduling/recurring-stories", apiBaseUrl),
      {
        body: JSON.stringify({
          approvalPolicy: submission.approvalPolicy,
          effectiveFromLocalDate: submission.effectiveFromLocalDate,
          leadTimeMinutes: submission.leadTimeMinutes,
          localTime: submission.localTime,
          locationId: submission.locationId,
          name: submission.name,
          weekdays: submission.weekdays,
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": submission.idempotencyKey,
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = record(await payload(response));
    const parsed = rule(body?.["rule"]);
    return response.ok && body?.["status"] === "created" && parsed !== null
      ? { kind: "saved", rule: parsed }
      : {
          kind: "error",
          message:
            typeof body?.["message"] === "string"
              ? body["message"]
              : "No se pudo guardar la regla recurrente.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo conectar con la API para guardar la regla.",
    };
  }
}
