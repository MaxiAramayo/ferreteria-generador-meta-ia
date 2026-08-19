/**
 * Adaptador de publicación en Instagram sobre Graph API.
 *
 * Traduce las tres llamadas de la publicación —crear contenedor, consultar su
 * estado y publicarlo— y una cuarta que evita gastarlas: la cuota vigente de la
 * cuenta. Su otra responsabilidad, la que justifica que exista en vez de llamar
 * a `fetch` desde el caso de uso, es convertir la respuesta de Meta en la
 * taxonomía del dominio. «Falló» no alcanza: un token vencido pide reconectar,
 * un límite pide esperar, una pieza inválida pide corregirla y un corte pide
 * reintentar. Colapsarlos haría que el sistema reintente lo que nunca va a
 * andar y abandone lo que sí.
 *
 * El token viaja en el encabezado `Authorization` y no en la cadena de consulta:
 * una URL termina en mensajes de error y en registros intermedios, y el token de
 * Page publica. El adaptador de OAuth sí usa la cadena de consulta porque los
 * extremos de intercambio de código no aceptan otra cosa.
 *
 * Los códigos y subcódigos provienen de la referencia oficial de errores
 * consultada el 2026-08-19 y están citados en `docs/integrations/META.md`. Un
 * código desconocido no se adivina: cae en `provider-error`, que reintenta con
 * espera en vez de declarar un diagnóstico que no se tiene.
 */

import {
  InstagramPublishingError,
  type InstagramContainerReport,
  type InstagramContainerRequest,
  type InstagramContainerState,
  type InstagramCreatedContainer,
  type InstagramPublishRequest,
  type InstagramPublishedMedia,
  type InstagramPublishingPort,
  type InstagramPublishingQuota,
  type PublicMediaProbePort,
  type PublicMediaProbeResult,
} from "@aramayo/domain";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const graphOrigin = "https://graph.facebook.com/";
const maximumResponseBytes = 64 * 1024;
const requestTimeoutMilliseconds = 15_000;
const probeTimeoutMilliseconds = 8_000;

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InstagramPublishingError(
      "provider-error",
      "Meta devolvió una respuesta con una forma inesperada.",
      true,
    );
  }
  return Object.fromEntries(Object.entries(value));
}

function stringValue(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new InstagramPublishingError(
      "provider-error",
      `Meta no devolvió ${field}.`,
      true,
    );
  }
  return value;
}

function integerValue(object: Record<string, unknown>, field: string): number {
  const value = object[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InstagramPublishingError(
      "provider-error",
      `Meta no devolvió ${field} como entero.`,
      true,
    );
  }
  return value;
}

/** Subcódigos de publicación de contenido. Cada uno describe un caso distinto. */
const subcodeFailures: ReadonlyMap<
  number,
  Readonly<{
    code: InstagramPublishingError["code"];
    detail: string;
    retryable: boolean;
  }>
> = new Map([
  [
    2_207_003,
    {
      code: "media-unreachable" as const,
      detail: "Meta tardó demasiado en descargar la pieza.",
      retryable: true,
    },
  ],
  [
    2_207_004,
    {
      code: "media-invalid" as const,
      detail: "La pieza supera el tamaño que Instagram admite.",
      retryable: false,
    },
  ],
  [
    2_207_005,
    {
      code: "media-invalid" as const,
      detail: "Instagram no admite el formato de la pieza.",
      retryable: false,
    },
  ],
  [
    2_207_006,
    {
      code: "permission-denied" as const,
      detail: "Meta no expone esa publicación a esta conexión.",
      retryable: false,
    },
  ],
  [
    2_207_008,
    {
      code: "container-expired" as const,
      detail: "El contenedor de la pieza ya no existe.",
      retryable: true,
    },
  ],
  [
    2_207_009,
    {
      code: "media-invalid" as const,
      detail: "La proporción de la pieza queda fuera de lo que admite el feed.",
      retryable: false,
    },
  ],
  [
    2_207_020,
    {
      code: "container-expired" as const,
      detail: "El contenedor de la pieza venció.",
      retryable: true,
    },
  ],
  [
    2_207_042,
    {
      code: "publishing-limit-reached" as const,
      detail: "La cuenta agotó su cuota diaria de publicaciones.",
      retryable: false,
    },
  ],
  [
    2_207_052,
    {
      code: "media-unreachable" as const,
      detail: "Meta no pudo descargar la pieza desde su dirección pública.",
      retryable: true,
    },
  ],
]);

/**
 * Códigos de nivel superior de Graph.
 *
 * `4`, `17`, `32`, `341` y `613` son las variantes de límite de tasa; `190` y
 * `102` son credencial; `10` y la familia `200-299` son permiso.
 */
function topLevelFailure(code: number): InstagramPublishingError | null {
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 341 ||
    code === 613
  ) {
    return new InstagramPublishingError(
      "rate-limit",
      "Meta está limitando las llamadas de esta aplicación.",
      true,
    );
  }
  if (code === 102 || code === 190) {
    return new InstagramPublishingError(
      "token-expired",
      "La credencial de la conexión venció o dejó de ser válida.",
      false,
    );
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new InstagramPublishingError(
      "permission-denied",
      "Meta rechazó los permisos de la conexión.",
      false,
    );
  }
  return null;
}

function failureFrom(
  status: number,
  payload: Record<string, unknown>,
): InstagramPublishingError {
  const errorValue = payload["error"];
  if (typeof errorValue === "object" && errorValue !== null) {
    const error = objectValue(errorValue);
    const subcode = error["error_subcode"];
    if (typeof subcode === "number") {
      const mapped = subcodeFailures.get(subcode);
      if (mapped !== undefined) {
        return new InstagramPublishingError(
          mapped.code,
          mapped.detail,
          mapped.retryable,
        );
      }
    }
    const code = error["code"];
    if (typeof code === "number") {
      const mapped = topLevelFailure(code);
      if (mapped !== null) return mapped;
    }
  }
  if (status === 429) {
    return new InstagramPublishingError(
      "rate-limit",
      "Meta está limitando las llamadas de esta aplicación.",
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new InstagramPublishingError(
      "permission-denied",
      "Meta rechazó los permisos de la conexión.",
      false,
    );
  }
  return new InstagramPublishingError(
    "provider-error",
    status >= 500
      ? "Meta no pudo responder la operación solicitada."
      : "Meta rechazó la operación y no informó una causa reconocida.",
    status >= 500,
  );
}

/** `status_code` de Graph, normalizado. Un valor desconocido no se interpreta. */
function containerStateFrom(value: unknown): InstagramContainerState {
  switch (value) {
    case "ERROR":
      return "error";
    case "EXPIRED":
      return "expired";
    case "FINISHED":
      return "finished";
    case "IN_PROGRESS":
      return "in_progress";
    case "PUBLISHED":
      return "published";
    default:
      throw new InstagramPublishingError(
        "provider-error",
        "Meta informó un estado de contenedor que la plataforma no conoce.",
        false,
      );
  }
}

export class InstagramGraphAdapter implements InstagramPublishingPort {
  readonly #fetch: FetchLike;
  readonly #graphApiVersion: string;

  constructor(graphApiVersion: string, fetcher: FetchLike = fetch) {
    if (!/^v\d+\.\d+$/u.test(graphApiVersion)) {
      throw new RangeError(
        "La versión de Graph API debe estar fijada explícitamente.",
      );
    }
    this.#fetch = fetcher;
    this.#graphApiVersion = graphApiVersion;
  }

  async createContainer(
    request: InstagramContainerRequest,
    accessToken: string,
  ): Promise<InstagramCreatedContainer> {
    const payload = await this.#post(
      `${request.instagramAssetId}/media`,
      accessToken,
      {
        image_url: request.imageUrl,
        ...(request.caption === undefined || request.caption.length === 0
          ? {}
          : { caption: request.caption }),
        // El feed no declara `media_type`: es el valor implícito de la API.
        ...(request.target === "instagram_story"
          ? { media_type: "STORIES" }
          : {}),
      },
    );
    return Object.freeze({ containerId: stringValue(payload, "id") });
  }

  async readContainer(
    containerId: string,
    accessToken: string,
  ): Promise<InstagramContainerReport> {
    const payload = await this.#get(containerId, accessToken, {
      fields: "status_code",
    });
    return Object.freeze({
      state: containerStateFrom(payload["status_code"]),
    });
  }

  async publishContainer(
    request: InstagramPublishRequest,
    accessToken: string,
  ): Promise<InstagramPublishedMedia> {
    const payload = await this.#post(
      `${request.instagramAssetId}/media_publish`,
      accessToken,
      { creation_id: request.containerId },
    );
    return Object.freeze({ mediaId: stringValue(payload, "id") });
  }

  async readPublishingQuota(
    instagramAssetId: string,
    accessToken: string,
  ): Promise<InstagramPublishingQuota> {
    const payload = await this.#get(
      `${instagramAssetId}/content_publishing_limit`,
      accessToken,
      { fields: "config,quota_usage" },
    );
    const entries = payload["data"];
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new InstagramPublishingError(
        "provider-error",
        "Meta no informó la cuota de publicación de la cuenta.",
        true,
      );
    }
    const entry = objectValue(entries[0]);
    const config = objectValue(entry["config"]);
    return Object.freeze({
      quotaDurationSeconds: integerValue(config, "quota_duration"),
      quotaTotal: integerValue(config, "quota_total"),
      quotaUsage: integerValue(entry, "quota_usage"),
    });
  }

  #get(
    path: string,
    accessToken: string,
    parameters: Readonly<Record<string, string>>,
  ): Promise<Record<string, unknown>> {
    const url = this.#url(path);
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
    return this.#request(url, accessToken, { method: "GET" });
  }

  #post(
    path: string,
    accessToken: string,
    body: Readonly<Record<string, string>>,
  ): Promise<Record<string, unknown>> {
    return this.#request(this.#url(path), accessToken, {
      body: new URLSearchParams(body).toString(),
      method: "POST",
    });
  }

  #url(path: string): URL {
    return new URL(`${this.#graphApiVersion}/${path}`, graphOrigin);
  }

  async #request(
    url: URL,
    accessToken: string,
    init: Readonly<{ body?: string; method: "GET" | "POST" }>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...(init.body === undefined ? {} : { body: init.body }),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/x-www-form-urlencoded" }),
        },
        method: init.method,
        redirect: "error",
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
    } catch (cause: unknown) {
      throw new InstagramPublishingError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "request-timeout"
          : "provider-error",
        "No se pudo contactar a Meta de forma segura.",
        true,
      );
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maximumResponseBytes) {
      throw new InstagramPublishingError(
        "provider-error",
        "Meta devolvió una respuesta demasiado grande.",
        false,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new InstagramPublishingError(
        "provider-error",
        "Meta devolvió una respuesta ilegible.",
        response.status >= 500,
      );
    }
    const payload = objectValue(parsed);
    if (!response.ok) throw failureFrom(response.status, payload);
    return payload;
  }
}

/**
 * Sonda HTTP de la pieza publicable.
 *
 * Pide solo encabezados. Si el servidor no admite `HEAD` cae a un `GET` de un
 * byte, que es lo mínimo que permite leer tipo y tamaño sin descargar la pieza.
 * Una redirección se trata como no alcanzable: la plataforma le entrega a Meta
 * la dirección original, y no está documentado que Meta la siga.
 */
export class HttpPublicMediaProbe implements PublicMediaProbePort {
  readonly #fetch: FetchLike;

  constructor(fetcher: FetchLike = fetch) {
    this.#fetch = fetcher;
  }

  async probe(url: string): Promise<PublicMediaProbeResult> {
    const head = await this.#send(url, "HEAD");
    if (head !== null && head.status !== 405 && head.status !== 501) {
      return describe(head);
    }
    const ranged = await this.#send(url, "GET", "bytes=0-0");
    return ranged === null
      ? Object.freeze({ status: "unreachable" as const })
      : describe(ranged);
  }

  async #send(
    url: string,
    method: "GET" | "HEAD",
    range?: string,
  ): Promise<Response | null> {
    try {
      return await this.#fetch(url, {
        headers: range === undefined ? {} : { range },
        method,
        redirect: "error",
        signal: AbortSignal.timeout(probeTimeoutMilliseconds),
      });
    } catch {
      return null;
    }
  }
}

/**
 * Tamaño real de la respuesta.
 *
 * Un `GET` de rango informa el total en `content-range` y no en
 * `content-length`, que en ese caso vale uno.
 */
function byteSizeOf(response: Response): number | null {
  const contentRange = response.headers.get("content-range");
  if (contentRange !== null) {
    const total = /\/(\d+)$/u.exec(contentRange)?.[1];
    if (total !== undefined) return Number.parseInt(total, 10);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength === null || !/^\d+$/u.test(contentLength)) return null;
  return Number.parseInt(contentLength, 10);
}

function describe(response: Response): PublicMediaProbeResult {
  if (!response.ok) return Object.freeze({ status: "unreachable" as const });
  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const byteSize = byteSizeOf(response);
  return mimeType === undefined || mimeType.length === 0 || byteSize === null
    ? Object.freeze({ status: "unreachable" as const })
    : Object.freeze({ byteSize, mimeType, status: "reachable" as const });
}
