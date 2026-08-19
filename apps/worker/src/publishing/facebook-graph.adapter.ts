/**
 * Adaptador de publicación en la Page de Facebook sobre Graph API.
 *
 * Cuatro llamadas: subir la foto sin publicar, crear la historia de la Page que
 * la adjunta, preguntarle a la foto si ya pertenece a una publicación y leer el
 * enlace permanente. Las dos últimas existen sólo para reconciliar y para
 * mostrar el resultado; ninguna publica.
 *
 * Comparte con el adaptador de Instagram la traducción de errores a la
 * taxonomía del dominio y la decisión de que el token viaje en el encabezado
 * `Authorization`. Lo que no comparte es el catálogo de subcódigos: la Page
 * informa sus fallos con los códigos generales de Graph y no con la familia
 * `22070xx` de publicación de contenido de Instagram.
 *
 * Códigos consultados en la documentación oficial el 2026-08-19 y citados en
 * `docs/integrations/META.md`.
 */

import {
  MetaPublishingError,
  type FacebookPagePost,
  type FacebookPagePostRequest,
  type FacebookPublishingPort,
  type FacebookStagePhotoRequest,
  type FacebookStagedPhoto,
  type FacebookStagedPhotoReport,
} from "@aramayo/domain";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const graphOrigin = "https://graph.facebook.com/";
const maximumResponseBytes = 64 * 1024;
const requestTimeoutMilliseconds = 15_000;

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MetaPublishingError(
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
    throw new MetaPublishingError(
      "provider-error",
      `Meta no devolvió ${field}.`,
      true,
    );
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

/**
 * Traduce un error de Graph.
 *
 * `100` con subcódigo de medios y `324` describen una pieza que Meta no pudo
 * usar; `2` y `1` son transitorios; el resto sigue el mismo criterio que
 * Instagram. Un código desconocido no se adivina.
 */
function failureFrom(
  status: number,
  payload: Record<string, unknown>,
): MetaPublishingError {
  const errorValue = payload["error"];
  if (typeof errorValue === "object" && errorValue !== null) {
    const error = objectValue(errorValue);
    const code = error["code"];
    if (typeof code === "number") {
      if (
        code === 4 ||
        code === 17 ||
        code === 32 ||
        code === 341 ||
        code === 613
      ) {
        return new MetaPublishingError(
          "rate-limit",
          "Meta está limitando las llamadas de esta aplicación.",
          true,
        );
      }
      if (code === 102 || code === 190) {
        return new MetaPublishingError(
          "token-expired",
          "La credencial de la conexión venció o dejó de ser válida.",
          false,
        );
      }
      if (code === 10 || (code >= 200 && code <= 299)) {
        return new MetaPublishingError(
          "permission-denied",
          "Meta rechazó los permisos de la conexión.",
          false,
        );
      }
      if (code === 324 || code === 1_363_030 || code === 1_363_037) {
        return new MetaPublishingError(
          "media-invalid",
          "Facebook rechazó la pieza por su formato o su tamaño.",
          false,
        );
      }
      if (code === 1 || code === 2) {
        return new MetaPublishingError(
          "provider-error",
          "Meta informó un problema transitorio.",
          true,
        );
      }
      // `100` sobre una foto preparada significa que ya no existe: venció el
      // estado temporal de veinticuatro horas.
      if (code === 100) {
        return new MetaPublishingError(
          "staged-media-expired",
          "La foto preparada ya no existe o no es visible para esta conexión.",
          true,
        );
      }
    }
  }
  if (status === 429) {
    return new MetaPublishingError(
      "rate-limit",
      "Meta está limitando las llamadas de esta aplicación.",
      true,
    );
  }
  if (status === 401 || status === 403) {
    return new MetaPublishingError(
      "permission-denied",
      "Meta rechazó los permisos de la conexión.",
      false,
    );
  }
  return new MetaPublishingError(
    "provider-error",
    status >= 500
      ? "Meta no pudo responder la operación solicitada."
      : "Meta rechazó la operación y no informó una causa reconocida.",
    status >= 500,
  );
}

export class FacebookGraphPublishingAdapter implements FacebookPublishingPort {
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

  /**
   * Sube la foto sin publicarla.
   *
   * `published=false` la deja en estado temporal por veinticuatro horas. No
   * aparece en la Page y nadie la ve; lo único que produce es el identificador
   * que el intento guarda antes de pedir la publicación.
   */
  async stagePhoto(
    request: FacebookStagePhotoRequest,
    accessToken: string,
  ): Promise<FacebookStagedPhoto> {
    const payload = await this.#post(
      `${request.pageAssetId}/photos`,
      accessToken,
      { published: "false", url: request.imageUrl },
    );
    return Object.freeze({ photoId: stringValue(payload, "id") });
  }

  async createPagePost(
    request: FacebookPagePostRequest,
    accessToken: string,
  ): Promise<FacebookPagePost> {
    const payload = await this.#post(
      `${request.pageAssetId}/feed`,
      accessToken,
      {
        attached_media: JSON.stringify([{ media_fbid: request.stagedPhotoId }]),
        message: request.copy,
      },
    );
    return Object.freeze({ postId: stringValue(payload, "id") });
  }

  /**
   * Pregunta si la foto preparada ya pertenece a una publicación.
   *
   * `page_story_id` presente prueba que la publicación existe. Ausente no
   * prueba lo contrario: Meta documenta que el campo puede faltar. Por eso el
   * resultado es un identificador opcional y no un booleano, que invitaría a
   * leer la ausencia como una negativa.
   */
  async readStagedPhoto(
    photoId: string,
    accessToken: string,
  ): Promise<FacebookStagedPhotoReport> {
    const payload = await this.#get(photoId, accessToken, {
      fields: "page_story_id",
    });
    const postId = optionalString(payload, "page_story_id");
    return Object.freeze(postId === undefined ? {} : { postId });
  }

  /**
   * Enlace permanente de la publicación.
   *
   * Devuelve `null` en vez de fallar cuando Meta no lo entrega: es información
   * de presentación, y una lectura que falla no puede poner en duda una
   * publicación ya confirmada.
   */
  async readPermalink(
    postId: string,
    accessToken: string,
  ): Promise<string | null> {
    try {
      const payload = await this.#get(postId, accessToken, {
        fields: "permalink_url",
      });
      return optionalString(payload, "permalink_url") ?? null;
    } catch (cause: unknown) {
      if (cause instanceof MetaPublishingError) return null;
      throw cause;
    }
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
      throw new MetaPublishingError(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "request-timeout"
          : "provider-error",
        "No se pudo contactar a Meta de forma segura.",
        true,
      );
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > maximumResponseBytes) {
      throw new MetaPublishingError(
        "provider-error",
        "Meta devolvió una respuesta demasiado grande.",
        false,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new MetaPublishingError(
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
