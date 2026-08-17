import type {
  MetaConnectionAssetResponse,
  MetaConnectionResponse,
  MetaOAuthStartResponse,
} from "@aramayo/contracts";

export type MetaConnectionsLoadResult =
  | Readonly<{
      connections: readonly MetaConnectionResponse[];
      kind: "ready";
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type MetaConnectionActionResult =
  | Readonly<{ connection: MetaConnectionResponse; kind: "updated" }>
  | Readonly<{ authorizationUrl: string; kind: "authorization-required" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return Object.fromEntries(Object.entries(value));
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isAsset(value: unknown): value is MetaConnectionAssetResponse {
  const asset = objectRecord(value);
  return (
    asset !== null &&
    typeof asset["id"] === "string" &&
    (asset["kind"] === "page" || asset["kind"] === "instagram_business") &&
    typeof asset["name"] === "string" &&
    typeof asset["providerAssetId"] === "string" &&
    (asset["status"] === "active" || asset["status"] === "removed") &&
    (asset["username"] === undefined || typeof asset["username"] === "string")
  );
}

function isConnection(value: unknown): value is MetaConnectionResponse {
  const connection = objectRecord(value);
  return (
    connection !== null &&
    typeof connection["accountName"] === "string" &&
    Array.isArray(connection["assets"]) &&
    connection["assets"].every(isAsset) &&
    typeof connection["canPublish"] === "boolean" &&
    typeof connection["createdAt"] === "string" &&
    (connection["expiresAt"] === undefined ||
      typeof connection["expiresAt"] === "string") &&
    isStringArray(connection["grantedPermissions"]) &&
    (connection["health"] === "asset_removed" ||
      connection["health"] === "healthy" ||
      connection["health"] === "permission_revoked" ||
      connection["health"] === "revoked" ||
      connection["health"] === "token_expired") &&
    typeof connection["id"] === "string" &&
    typeof connection["lastCheckedAt"] === "string" &&
    isStringArray(connection["missingPermissions"]) &&
    connection["provider"] === "meta" &&
    (connection["revokedAt"] === undefined ||
      typeof connection["revokedAt"] === "string") &&
    typeof connection["updatedAt"] === "string" &&
    typeof connection["version"] === "number"
  );
}

function projectedConnection(
  value: MetaConnectionResponse,
): MetaConnectionResponse {
  return Object.freeze({
    accountName: value.accountName,
    assets: Object.freeze(
      value.assets.map((asset) =>
        Object.freeze({
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          providerAssetId: asset.providerAssetId,
          status: asset.status,
          ...(asset.username === undefined ? {} : { username: asset.username }),
        }),
      ),
    ),
    canPublish: value.canPublish,
    createdAt: value.createdAt,
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
    grantedPermissions: Object.freeze([...value.grantedPermissions]),
    health: value.health,
    id: value.id,
    lastCheckedAt: value.lastCheckedAt,
    missingPermissions: Object.freeze([...value.missingPermissions]),
    provider: "meta",
    ...(value.revokedAt === undefined ? {} : { revokedAt: value.revokedAt }),
    updatedAt: value.updatedAt,
    version: value.version,
  });
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
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

export async function loadMetaConnections(
  apiBaseUrl: string,
): Promise<MetaConnectionsLoadResult> {
  try {
    const response = await fetch(new URL("connections/meta", apiBaseUrl), {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    return response.ok && Array.isArray(body) && body.every(isConnection)
      ? {
          connections: Object.freeze(body.map(projectedConnection)),
          kind: "ready",
        }
      : {
          kind: "error",
          message: "La API devolvió conexiones Meta que no se pueden usar.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo consultar el estado de Meta.",
    };
  }
}

export async function startMetaOAuth(
  apiBaseUrl: string,
): Promise<MetaConnectionActionResult> {
  try {
    const csrfToken = await csrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL("connections/meta/oauth", apiBaseUrl),
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
    const start: MetaOAuthStartResponse | null =
      body !== null &&
      typeof body["authorizationUrl"] === "string" &&
      typeof body["expiresAt"] === "string" &&
      body["provider"] === "meta"
        ? {
            authorizationUrl: body["authorizationUrl"],
            expiresAt: body["expiresAt"],
            provider: "meta",
          }
        : null;
    return response.ok && start !== null
      ? {
          authorizationUrl: start.authorizationUrl,
          kind: "authorization-required",
        }
      : { kind: "error", message: "No se pudo iniciar la autorización Meta." };
  } catch {
    return {
      kind: "error",
      message: "No se pudo iniciar la autorización Meta.",
    };
  }
}

async function mutate(
  apiBaseUrl: string,
  connectionId: string,
  action: "health" | "renewal" | "revoke",
): Promise<MetaConnectionActionResult> {
  try {
    const csrfToken = await csrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const suffix = action === "revoke" ? "" : `/${action}`;
    const response = await fetch(
      new URL(`connections/meta/${connectionId}${suffix}`, apiBaseUrl),
      {
        credentials: "include",
        headers: {
          accept: "application/json",
          "x-csrf-token": csrfToken,
        },
        method: action === "revoke" ? "DELETE" : "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    return response.ok && isConnection(body)
      ? { connection: projectedConnection(body), kind: "updated" }
      : { kind: "error", message: "Meta no confirmó la operación." };
  } catch {
    return { kind: "error", message: "La operación Meta no pudo completarse." };
  }
}

export const checkMetaConnection = (
  apiBaseUrl: string,
  connectionId: string,
): Promise<MetaConnectionActionResult> =>
  mutate(apiBaseUrl, connectionId, "health");

export const renewMetaConnection = (
  apiBaseUrl: string,
  connectionId: string,
): Promise<MetaConnectionActionResult> =>
  mutate(apiBaseUrl, connectionId, "renewal");

export const revokeMetaConnection = (
  apiBaseUrl: string,
  connectionId: string,
): Promise<MetaConnectionActionResult> =>
  mutate(apiBaseUrl, connectionId, "revoke");
