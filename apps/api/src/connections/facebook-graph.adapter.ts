import type { MetaCredentials } from "@aramayo/configuration";
import { metaRequiredPermissions } from "@aramayo/domain";

import {
  MetaGraphError,
  MetaGraphUnavailableError,
  MetaIntegrationDisabledError,
  type MetaGraphPort,
  type MetaRemoteCredential,
  type MetaRemoteDiscovery,
} from "./meta-graph.port.ts";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const maximumResponseBytes = 64 * 1024;
const requestTimeoutMilliseconds = 10_000;

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MetaGraphUnavailableError(
      `Meta devolvió ${field} con una forma inválida.`,
    );
  }
  return Object.fromEntries(Object.entries(value));
}

function stringValue(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new MetaGraphUnavailableError(`Meta no devolvió ${field}.`);
  }
  return value;
}

function optionalString(
  object: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = object[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dataArray(object: Record<string, unknown>): readonly unknown[] {
  const value = object["data"];
  if (!Array.isArray(value)) {
    throw new MetaGraphUnavailableError(
      "Meta devolvió una colección inválida.",
    );
  }
  return value;
}

function metaErrorFromPayload(
  status: number,
  payload: Record<string, unknown>,
): MetaGraphError | MetaGraphUnavailableError {
  const errorValue = payload["error"];
  if (typeof errorValue === "object" && errorValue !== null) {
    const error = objectValue(errorValue, "error");
    const code = error["code"];
    const subcode = error["error_subcode"];
    if (
      code === 190 ||
      subcode === 458 ||
      subcode === 459 ||
      subcode === 460 ||
      subcode === 463 ||
      subcode === 467
    ) {
      return new MetaGraphError(
        "token_expired",
        "La credencial Meta venció o dejó de ser válida.",
      );
    }
    if (code === 10 || code === 200 || code === 299) {
      return new MetaGraphError(
        "permission_revoked",
        "Meta rechazó los permisos de la conexión.",
      );
    }
  }
  return status === 403
    ? new MetaGraphError(
        "permission_revoked",
        "Meta rechazó los permisos de la conexión.",
      )
    : new MetaGraphUnavailableError(
        "Meta no pudo completar la operación solicitada.",
      );
}

export class DisabledMetaGraphAdapter implements MetaGraphPort {
  authorizationUrl(): string {
    throw new MetaIntegrationDisabledError();
  }

  discover(): Promise<MetaRemoteDiscovery> {
    return Promise.reject(new MetaIntegrationDisabledError());
  }

  exchangeCode(): Promise<MetaRemoteCredential> {
    return Promise.reject(new MetaIntegrationDisabledError());
  }

  renew(): Promise<MetaRemoteCredential> {
    return Promise.reject(new MetaIntegrationDisabledError());
  }

  revoke(): Promise<void> {
    return Promise.reject(new MetaIntegrationDisabledError());
  }
}

export class FacebookGraphAdapter implements MetaGraphPort {
  readonly #credentials: MetaCredentials;
  readonly #fetch: FetchLike;

  constructor(credentials: MetaCredentials, fetcher: FetchLike = fetch) {
    this.#credentials = credentials;
    this.#fetch = fetcher;
  }

  authorizationUrl(state: string): string {
    const url = new URL(
      `${this.#credentials.graphApiVersion}/dialog/oauth`,
      "https://www.facebook.com/",
    );
    url.searchParams.set("client_id", this.#credentials.appId);
    url.searchParams.set("redirect_uri", this.#credentials.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      [...metaRequiredPermissions].sort().join(","),
    );
    url.searchParams.set("state", state);
    return url.toString();
  }

  async discover(accessToken: string): Promise<MetaRemoteDiscovery> {
    const [accountPayload, permissionsPayload, pagesPayload] =
      await Promise.all([
        this.#get("me", accessToken, { fields: "id,name" }),
        this.#get("me/permissions", accessToken, { limit: "100" }),
        this.#get("me/accounts", accessToken, {
          fields:
            "id,name,access_token,instagram_business_account{id,username}",
          limit: "100",
        }),
      ]);

    const grantedPermissions = dataArray(permissionsPayload).flatMap(
      (entry) => {
        const permission = objectValue(entry, "permission");
        return permission["status"] === "granted"
          ? [stringValue(permission, "permission")]
          : [];
      },
    );

    const assets = dataArray(pagesPayload).flatMap((entry) => {
      const page = objectValue(entry, "page");
      const pageId = stringValue(page, "id");
      const pageName = stringValue(page, "name");
      const pageToken = optionalString(page, "access_token");
      const pageAsset = Object.freeze({
        ...(pageToken === undefined ? {} : { accessToken: pageToken }),
        kind: "page" as const,
        name: pageName,
        providerAssetId: pageId,
      });
      const instagramValue = page["instagram_business_account"];
      if (instagramValue === undefined || instagramValue === null) {
        return [pageAsset];
      }
      const instagram = objectValue(
        instagramValue,
        "instagram_business_account",
      );
      const username = optionalString(instagram, "username");
      return [
        pageAsset,
        Object.freeze({
          kind: "instagram_business" as const,
          name: username === undefined ? pageName : `@${username}`,
          providerAssetId: stringValue(instagram, "id"),
          ...(username === undefined ? {} : { username }),
        }),
      ];
    });

    return Object.freeze({
      accountName: stringValue(accountPayload, "name"),
      assets: Object.freeze(assets),
      grantedPermissions: Object.freeze(grantedPermissions.sort()),
      providerAccountId: stringValue(accountPayload, "id"),
    });
  }

  async exchangeCode(code: string): Promise<MetaRemoteCredential> {
    return this.#credential(
      await this.#get("oauth/access_token", undefined, {
        client_id: this.#credentials.appId,
        client_secret: this.#credentials.appSecret.reveal(),
        code,
        redirect_uri: this.#credentials.redirectUri,
      }),
    );
  }

  async renew(accessToken: string): Promise<MetaRemoteCredential> {
    return this.#credential(
      await this.#get("oauth/access_token", undefined, {
        client_id: this.#credentials.appId,
        client_secret: this.#credentials.appSecret.reveal(),
        fb_exchange_token: accessToken,
        grant_type: "fb_exchange_token",
      }),
    );
  }

  async revoke(accessToken: string): Promise<void> {
    await this.#request(
      "me/permissions",
      accessToken,
      {},
      { method: "DELETE" },
    );
  }

  #credential(payload: Record<string, unknown>): MetaRemoteCredential {
    const expiresIn = payload["expires_in"];
    return Object.freeze({
      accessToken: stringValue(payload, "access_token"),
      ...(typeof expiresIn === "number" && Number.isFinite(expiresIn)
        ? {
            expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
          }
        : {}),
    });
  }

  #get(
    path: string,
    accessToken: string | undefined,
    parameters: Readonly<Record<string, string>>,
  ): Promise<Record<string, unknown>> {
    return this.#request(path, accessToken, parameters, { method: "GET" });
  }

  async #request(
    path: string,
    accessToken: string | undefined,
    parameters: Readonly<Record<string, string>>,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const url = new URL(
      `${this.#credentials.graphApiVersion}/${path}`,
      "https://graph.facebook.com/",
    );
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
    if (accessToken !== undefined) {
      url.searchParams.set("access_token", accessToken);
    }

    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
    } catch {
      throw new MetaGraphUnavailableError(
        "No se pudo contactar a Meta de forma segura.",
      );
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maximumResponseBytes) {
      throw new MetaGraphUnavailableError(
        "Meta devolvió una respuesta demasiado grande.",
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new MetaGraphUnavailableError(
        "Meta devolvió una respuesta ilegible.",
      );
    }
    const object = objectValue(payload, "respuesta");
    if (!response.ok) throw metaErrorFromPayload(response.status, object);
    return object;
  }
}
