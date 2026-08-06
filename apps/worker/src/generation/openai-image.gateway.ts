/**
 * Gateway de generación y edición de imágenes.
 *
 * Implementa el puerto del dominio sobre un transporte sustituible. Su trabajo
 * es lo que el transporte no puede hacer: validar el pedido antes de gastar una
 * llamada, y comprobar que lo que volvió es realmente una imagen.
 *
 * Las dimensiones se leen decodificando los bytes y no del campo que devuelve la
 * API. Lo que se persiste tiene que describir la imagen que llegó; un metadato
 * copiado del pedido taparía una diferencia en lugar de mostrarla.
 */

import { createHash } from "node:crypto";

import {
  assertImageRequestSupported,
  ImageGenerationError,
  type EditImageCommand,
  type GenerateImageCommand,
  type GeneratedImage,
  type ImageGenerationPort,
  type ImageGenerationUsage,
} from "@aramayo/domain";
import sharp from "sharp";

import type {
  OpenAIImageTransportRequest,
  OpenAIImageTransportResponse,
  OpenAIImagesTransport,
} from "./openai-image-transport.ts";

/** Modelo de imágenes fijado por `docs/integrations/OPENAI.md`. */
export const defaultImageModel = "gpt-image-2";

/**
 * La guía negativa viaja dentro del prompt porque la API de imágenes no tiene
 * un campo aparte. Va al final y con encabezado propio para que se lea como una
 * lista de exclusiones y no como parte de la escena pedida.
 */
function promptWith(
  prompt: string,
  negativeGuidance: readonly string[],
): string {
  if (negativeGuidance.length === 0) {
    return prompt;
  }
  return `${prompt}\n\nNo incluir: ${negativeGuidance.join("; ")}.`;
}

function usageFrom(
  usage: OpenAIImageTransportResponse["usage"],
): ImageGenerationUsage | null {
  if (usage === null) {
    return null;
  }
  return Object.freeze({
    estimatedCostUsd: null,
    imageInputTokens: usage.imageInputTokens ?? 0,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    textInputTokens: usage.textInputTokens ?? 0,
    totalTokens: usage.totalTokens,
  });
}

export class OpenAIImageGenerationGateway implements ImageGenerationPort {
  readonly #model: string;
  readonly #now: () => number;
  readonly #transport: OpenAIImagesTransport;

  constructor(
    transport: OpenAIImagesTransport,
    options: Readonly<{ model?: string; now?: () => number }> = {},
  ) {
    this.#model = options.model ?? defaultImageModel;
    this.#now = options.now ?? Date.now;
    this.#transport = transport;
  }

  async generate(command: GenerateImageCommand): Promise<GeneratedImage> {
    assertImageRequestSupported(command);
    const startedAt = this.#now();
    const response = await this.#transport.generate(
      this.#requestFrom(command, []),
    );
    return this.#imageFrom(response, startedAt);
  }

  async edit(command: EditImageCommand): Promise<GeneratedImage> {
    assertImageRequestSupported(command);
    const startedAt = this.#now();
    const response = await this.#transport.edit(
      this.#requestFrom(
        command,
        command.references.map((reference) => ({
          bytes: reference.bytes,
          mimeType: reference.mimeType,
          name: reference.name,
        })),
      ),
    );
    return this.#imageFrom(response, startedAt);
  }

  #requestFrom(
    command: EditImageCommand | GenerateImageCommand,
    references: OpenAIImageTransportRequest["references"],
  ): OpenAIImageTransportRequest {
    return Object.freeze({
      background: command.background,
      model: this.#model,
      prompt: promptWith(command.prompt, command.negativeGuidance),
      quality: command.quality,
      references,
      size: command.size,
      ...(command.safetyIdentifier === undefined
        ? {}
        : { safetyIdentifier: command.safetyIdentifier }),
    });
  }

  /**
   * Convierte la respuesta en una imagen verificada.
   *
   * Una respuesta sin imagen, o con bytes que no decodifican, es
   * `content-invalid` y no un éxito degradado: devolver un activo vacío haría
   * fallar la composición mucho más lejos de donde está el problema.
   */
  async #imageFrom(
    response: OpenAIImageTransportResponse,
    startedAt: number,
  ): Promise<GeneratedImage> {
    if (response.encodedImage === null || response.encodedImage.length === 0) {
      throw new ImageGenerationError(
        "content-invalid",
        "La respuesta no contiene una imagen.",
        true,
        {
          requestId: response.requestId,
          usage: usageFrom(response.usage),
        },
      );
    }
    const bytes = new Uint8Array(Buffer.from(response.encodedImage, "base64"));

    let width: number;
    let height: number;
    try {
      const metadata = await sharp(bytes, { failOn: "error" }).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch {
      throw new ImageGenerationError(
        "content-invalid",
        "La imagen devuelta no se puede decodificar.",
        true,
        {
          requestId: response.requestId,
          usage: usageFrom(response.usage),
        },
      );
    }

    return Object.freeze({
      bytes,
      height,
      latencyMilliseconds: this.#now() - startedAt,
      mimeType: "image/png",
      model: this.#model,
      requestId: response.requestId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      usage: usageFrom(response.usage),
      width,
    });
  }
}
