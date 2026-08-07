import type {
  BrandThemeId,
  GenerationPolicyResponse,
  LocationConfigurationResponse,
  OrganizationConfigurationResponse,
} from "@aramayo/contracts";

export type ConfigurationLoadResult =
  | Readonly<{
      canEdit: boolean;
      configuration: OrganizationConfigurationResponse;
      generationPolicy: GenerationPolicyResponse | null;
      kind: "ready";
    }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ConfigurationSaveResult =
  | Readonly<{
      configuration: OrganizationConfigurationResponse;
      kind: "saved";
    }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type GenerationPolicySaveResult =
  | Readonly<{ generationPolicy: GenerationPolicyResponse; kind: "saved" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

const themeIds: ReadonlySet<string> = new Set([
  "taller",
  "claro",
  "promo",
  "lubricentro",
]);

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function isLocation(value: unknown): value is LocationConfigurationResponse {
  const record = objectRecord(value);
  return (
    record !== null &&
    typeof record["addressLine"] === "string" &&
    typeof record["city"] === "string" &&
    typeof record["id"] === "string" &&
    typeof record["isActive"] === "boolean" &&
    typeof record["name"] === "string" &&
    typeof record["openingHours"] === "string" &&
    (record["phone"] === undefined || typeof record["phone"] === "string") &&
    typeof record["province"] === "string" &&
    typeof record["timeZone"] === "string" &&
    typeof record["version"] === "number" &&
    (record["whatsapp"] === undefined || typeof record["whatsapp"] === "string")
  );
}

function isConfiguration(
  value: unknown,
): value is OrganizationConfigurationResponse {
  const record = objectRecord(value);
  const brand = objectRecord(record?.["brand"]);
  return (
    record !== null &&
    brand !== null &&
    typeof brand["claim"] === "string" &&
    typeof brand["handle"] === "string" &&
    typeof brand["id"] === "string" &&
    typeof brand["name"] === "string" &&
    typeof brand["shortName"] === "string" &&
    typeof brand["themeId"] === "string" &&
    themeIds.has(brand["themeId"]) &&
    typeof brand["version"] === "number" &&
    typeof record["displayName"] === "string" &&
    typeof record["id"] === "string" &&
    typeof record["legalName"] === "string" &&
    Array.isArray(record["locations"]) &&
    record["locations"].every(isLocation) &&
    typeof record["version"] === "number"
  );
}

function isGenerationUsage(value: unknown): boolean {
  const record = objectRecord(value);
  return (
    record !== null &&
    typeof record["alertActive"] === "boolean" &&
    typeof record["committedMicrousd"] === "number" &&
    typeof record["monthlyBudgetMicrousd"] === "number" &&
    typeof record["monthUtc"] === "string" &&
    typeof record["organizationAttemptsRemaining"] === "number" &&
    typeof record["reservedMicrousd"] === "number" &&
    typeof record["settledMicrousd"] === "number" &&
    typeof record["unconfirmedMicrousd"] === "number" &&
    typeof record["userAttemptsRemaining"] === "number"
  );
}

function isGenerationPolicy(value: unknown): value is GenerationPolicyResponse {
  const record = objectRecord(value);
  return (
    record !== null &&
    typeof record["enabled"] === "boolean" &&
    typeof record["generatedOrphanRetentionHours"] === "number" &&
    typeof record["monthlyBudgetMicrousd"] === "number" &&
    typeof record["organizationDailyAttemptLimit"] === "number" &&
    typeof record["organizationId"] === "string" &&
    typeof record["originalRetentionDays"] === "number" &&
    typeof record["referenceRetentionDays"] === "number" &&
    record["timeZone"] === "UTC" &&
    typeof record["updatedAt"] === "string" &&
    isGenerationUsage(record["usage"]) &&
    typeof record["userDailyAttemptLimit"] === "number" &&
    typeof record["version"] === "number" &&
    typeof record["warningThresholdPercent"] === "number"
  );
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function loadConfiguration(
  apiBaseUrl: string,
): Promise<ConfigurationLoadResult> {
  try {
    const configurationRequest = fetch(
      new URL("organization/configuration", apiBaseUrl),
      {
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    const sessionResponse = await fetch(new URL("auth/session", apiBaseUrl), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    const sessionPayload = await responsePayload(sessionResponse);
    const session = objectRecord(sessionPayload);
    const actor = objectRecord(session?.["actor"]);
    const roles = actor?.["roles"];
    if (
      sessionResponse.status === 401 ||
      !sessionResponse.ok ||
      !Array.isArray(roles) ||
      !roles.every((role) => typeof role === "string")
    ) {
      await configurationRequest;
      return sessionResponse.status === 401
        ? { kind: "forbidden" }
        : {
            kind: "error",
            message: "La API devolvió una sesión que no se puede usar.",
          };
    }
    const canEdit = roles.includes("admin");
    const policyRequest = canEdit
      ? fetch(new URL("organization/generation-policy", apiBaseUrl), {
          credentials: "include",
          headers: { accept: "application/json" },
        })
      : null;
    const [configurationResponse, policyResponse] = await Promise.all([
      configurationRequest,
      policyRequest,
    ]);
    if (
      configurationResponse.status === 401 ||
      policyResponse?.status === 401 ||
      policyResponse?.status === 403
    ) {
      return { kind: "forbidden" };
    }
    if (configurationResponse.status === 404) {
      return { kind: "empty" };
    }
    const [configurationPayload, policyPayload] = await Promise.all([
      responsePayload(configurationResponse),
      policyResponse === null ? null : responsePayload(policyResponse),
    ]);
    if (
      !configurationResponse.ok ||
      !isConfiguration(configurationPayload) ||
      (policyResponse !== null &&
        (!policyResponse.ok || !isGenerationPolicy(policyPayload)))
    ) {
      return {
        kind: "error",
        message: "La API devolvió una configuración que no se puede usar.",
      };
    }
    return {
      canEdit,
      configuration: configurationPayload,
      generationPolicy:
        policyResponse === null || !isGenerationPolicy(policyPayload)
          ? null
          : policyPayload,
      kind: "ready",
    };
  } catch {
    return {
      kind: "error",
      message: "No se pudo conectar con la API. Revisá el entorno y reintentá.",
    };
  }
}

export async function saveGenerationPolicy(
  apiBaseUrl: string,
  generationPolicy: GenerationPolicyResponse,
  fields: Readonly<{
    enabled: boolean;
    generatedOrphanRetentionHours: number;
    monthlyBudgetMicrousd: number;
    organizationDailyAttemptLimit: number;
    originalRetentionDays: number;
    referenceRetentionDays: number;
    userDailyAttemptLimit: number;
    warningThresholdPercent: number;
  }>,
): Promise<GenerationPolicySaveResult> {
  try {
    const csrfToken = await issueCsrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL("organization/generation-policy", apiBaseUrl),
      {
        body: JSON.stringify({
          ...fields,
          expectedVersion: generationPolicy.version,
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        method: "PATCH",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    if (response.status === 409) return { kind: "conflict" };
    const payload = await responsePayload(response);
    return response.ok && isGenerationPolicy(payload)
      ? { generationPolicy: payload, kind: "saved" }
      : {
          kind: "error",
          message: "La política no se guardó. Revisá límites y retenciones.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. La política no cambió.",
    };
  }
}

async function issueCsrf(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = objectRecord(await responsePayload(response));
  return response.ok && typeof payload?.["csrfToken"] === "string"
    ? payload["csrfToken"]
    : null;
}

async function save(
  apiBaseUrl: string,
  path: string,
  body: Readonly<Record<string, boolean | number | string>>,
): Promise<ConfigurationSaveResult> {
  try {
    const csrfToken = await issueCsrf(apiBaseUrl);
    if (csrfToken === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(new URL(path, apiBaseUrl), {
      body: JSON.stringify(body),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      method: "PATCH",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    if (response.status === 409) {
      return { kind: "conflict" };
    }
    const payload = await responsePayload(response);
    return response.ok && isConfiguration(payload)
      ? { configuration: payload, kind: "saved" }
      : {
          kind: "error",
          message: "La configuración no se guardó. Revisá los campos.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió al guardar. Los cambios no se confirmaron.",
    };
  }
}

export function saveBrandConfiguration(
  apiBaseUrl: string,
  configuration: OrganizationConfigurationResponse,
  fields: Readonly<{
    claim: string;
    displayName: string;
    handle: string;
    legalName: string;
    name: string;
    shortName: string;
    themeId: BrandThemeId;
  }>,
): Promise<ConfigurationSaveResult> {
  return save(apiBaseUrl, "organization/configuration/brand", {
    ...fields,
    brandVersion: configuration.brand.version,
    organizationVersion: configuration.version,
  });
}

export function saveLocationConfiguration(
  apiBaseUrl: string,
  location: LocationConfigurationResponse,
  fields: Readonly<{
    addressLine: string;
    city: string;
    isActive: boolean;
    name: string;
    openingHours: string;
    phone: string;
    province: string;
    timeZone: string;
    whatsapp: string;
  }>,
): Promise<ConfigurationSaveResult> {
  const phone = fields.phone.trim();
  const whatsapp = fields.whatsapp.trim();
  return save(
    apiBaseUrl,
    `organization/configuration/locations/${location.id}`,
    {
      addressLine: fields.addressLine,
      city: fields.city,
      isActive: fields.isActive,
      name: fields.name,
      openingHours: fields.openingHours,
      ...(phone.length === 0 ? {} : { phone }),
      province: fields.province,
      timeZone: fields.timeZone,
      version: location.version,
      ...(whatsapp.length === 0 ? {} : { whatsapp }),
    },
  );
}
