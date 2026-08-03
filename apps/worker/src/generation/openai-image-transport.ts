/**
 * Transporte de OpenAI Images.
 *
 * Aísla el SDK igual que `OpenAIResponsesTransport` lo hace para texto: acá
 * viven la llamada y la traducción de sus errores, y afuera queda una interfaz
 * que se puede sustituir en una prueba sin tocar la red.
 *
 * La traducción de errores es el contenido real de este archivo. Un timeout, un
 * límite de tasa y un rechazo de seguridad exigen respuestas distintas —esperar,
 * reintentar más tarde, no reintentar nunca— y el SDK los entrega como clases
 * distintas que hay que distinguir antes de perder esa información.
 */

import type { OpenAICredentials } from "@aramayo/configuration";
import { ImageGenerationError } from "@aramayo/domain";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";
import { toFile } from "openai/uploads";

export interface OpenAIImageTransportRequest {
  readonly background: "opaque" | "transparent";
  readonly model: string;
  readonly prompt: string;
  readonly quality: "high" | "low" | "medium";
  /** Archivos adjuntos; vacío en una generación nueva. */
  readonly references: readonly Readonly<{
    bytes: Uint8Array;
    mimeType: string;
    name: string;
  }>[];
  readonly size: string;
}

export interface OpenAIImageTransportResponse {
  /** Imagen en base64, tal como la devuelve el proveedor. */
  readonly encodedImage: string | null;
  readonly requestId: string | null;
  readonly usage: Readonly<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> | null;
}

export interface OpenAIImagesTransport {
  edit(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse>;
  generate(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse>;
}

const safetyCodes: ReadonlySet<string> = new Set([
  "content_policy_violation",
  "image_generation_user_error",
  "moderation_blocked",
]);

/**
 * Traduce un fallo del SDK sin arrastrar su mensaje.
 *
 * El texto del proveedor puede traer el prompt reflejado o una URL temporal
 * firmada, y un error termina en un log. El `detail` que se conserva lo
 * escribimos nosotros.
 */
export function imageFailureFor(cause: unknown): ImageGenerationError {
  if (cause instanceof ImageGenerationError) {
    return cause;
  }
  if (
    cause instanceof APIError &&
    typeof cause.code === "string" &&
    safetyCodes.has(cause.code)
  ) {
    return new ImageGenerationError(
      "safety-rejection",
      "El proveedor rechazó el pedido por su política de contenido.",
      false,
    );
  }
  if (cause instanceof RateLimitError) {
    return new ImageGenerationError(
      "rate-limit",
      "El proveedor aplicó límite de tasa.",
      true,
    );
  }
  if (cause instanceof APIConnectionTimeoutError) {
    return new ImageGenerationError(
      "timeout",
      "El proveedor no respondió dentro del tiempo permitido.",
      true,
    );
  }
  if (cause instanceof APIConnectionError) {
    return new ImageGenerationError(
      "provider-error",
      "No se pudo establecer conexión con el proveedor.",
      true,
    );
  }
  if (cause instanceof APIError) {
    // Un 4xx es culpa del pedido: repetirlo sin cambiarlo repite el gasto.
    const retryable = cause.status === undefined || cause.status >= 500;
    return new ImageGenerationError(
      "provider-error",
      `El proveedor respondió con estado ${String(cause.status ?? "desconocido")}.`,
      retryable,
    );
  }
  return new ImageGenerationError(
    "provider-error",
    "El proveedor falló de forma no identificada.",
    true,
  );
}

export class OfficialOpenAIImagesTransport implements OpenAIImagesTransport {
  readonly #client: OpenAI;

  constructor(credentials: OpenAICredentials, timeoutMilliseconds = 120_000) {
    this.#client = new OpenAI({
      apiKey: credentials.apiKey.reveal(),
      // El reintento lo decide el caso de uso, que es quien sabe si el fallo
      // admite repetir sin volver a gastar.
      maxRetries: 0,
      timeout: timeoutMilliseconds,
    });
  }

  async generate(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse> {
    try {
      const { data, request_id: requestId } = await this.#client.images
        .generate({
          background: request.background,
          model: request.model,
          n: 1,
          output_format: "png",
          prompt: request.prompt,
          quality: request.quality,
          size: request.size,
        })
        .withResponse();
      return responseFrom(data, requestId ?? null);
    } catch (cause: unknown) {
      throw imageFailureFor(cause);
    }
  }

  async edit(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse> {
    try {
      const files = await Promise.all(
        request.references.map(async (reference) =>
          toFile(Buffer.from(reference.bytes), reference.name, {
            type: reference.mimeType,
          }),
        ),
      );
      const { data, request_id: requestId } = await this.#client.images
        .edit({
          background: request.background,
          image: files,
          model: request.model,
          n: 1,
          output_format: "png",
          prompt: request.prompt,
          quality: request.quality,
          size: request.size,
        })
        .withResponse();
      return responseFrom(data, requestId ?? null);
    } catch (cause: unknown) {
      throw imageFailureFor(cause);
    }
  }
}

function responseFrom(
  payload: Readonly<{
    data?: readonly Readonly<{ b64_json?: string }>[];
    usage?: Readonly<{
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    }>;
  }>,
  requestId: string | null,
): OpenAIImageTransportResponse {
  const usage = payload.usage;
  return Object.freeze({
    encodedImage: payload.data?.[0]?.b64_json ?? null,
    requestId,
    usage:
      usage === undefined
        ? null
        : Object.freeze({
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }),
  });
}
