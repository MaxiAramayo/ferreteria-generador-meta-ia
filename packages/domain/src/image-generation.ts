/**
 * Puerto de generación y edición de imágenes.
 *
 * Está separado del gateway de texto a propósito. Comparten proveedor pero no
 * comparten nada más: distinta unidad de costo, distintos modos de fallo,
 * distinta forma de respuesta y distinta política de reintento. Meterlos en un
 * puerto común obligaría a que cada uno cargue con los parámetros del otro.
 *
 * Generar y editar también son contratos distintos. Editar exige al menos una
 * referencia —es lo que la vuelve edición— y generar no admite ninguna. Un solo
 * método con una lista opcional dejaría pasar en compilación las dos
 * combinaciones sin sentido: una edición sin nada que editar y una generación
 * que arrastra referencias que nadie va a mirar.
 */

import type { VisualFormatId } from "./visual-prompt.ts";

/**
 * Tamaños que admite GPT Image. No son los formatos de la pieza: la pieza se
 * compone después recortando esta base al formato final.
 */
export const imageGenerationSizes = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
] as const;

export type ImageGenerationSize = (typeof imageGenerationSizes)[number];

export const imageGenerationQualities = ["high", "low", "medium"] as const;

export type ImageGenerationQuality = (typeof imageGenerationQualities)[number];

export const imageGenerationBackgrounds = ["opaque", "transparent"] as const;

export type ImageGenerationBackground =
  (typeof imageGenerationBackgrounds)[number];

const sizeAspectRatios: Readonly<Record<ImageGenerationSize, number>> =
  Object.freeze({
    "1024x1024": 1,
    "1024x1536": 1024 / 1536,
    "1536x1024": 1536 / 1024,
  });

const formatAspectRatios: Readonly<Record<VisualFormatId, number>> =
  Object.freeze({
    "banner-fb": 1640 / 624,
    cuadrado: 1,
    destacada: 1,
    feed: 1080 / 1350,
    historia: 1080 / 1920,
  });

/**
 * Tamaño del proveedor más cercano a la proporción del formato.
 *
 * Ninguno coincide exacto salvo los cuadrados, así que la base siempre se
 * recorta al componer. Elegir el más cercano minimiza cuánto se descarta: pedir
 * un cuadrado para una historia obligaría a tirar casi la mitad del alto y a
 * que el producto quede fuera de cuadro.
 */
export function imageSizeForFormat(
  format: VisualFormatId,
): ImageGenerationSize {
  const target = formatAspectRatios[format];
  let best: ImageGenerationSize = "1024x1024";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const size of imageGenerationSizes) {
    // La distancia se mide en escala logarítmica para que una proporción el
    // doble de ancha y otra el doble de alta queden a la misma distancia.
    const distance = Math.abs(
      Math.log(sizeAspectRatios[size]) - Math.log(target),
    );
    if (distance < bestDistance) {
      best = size;
      bestDistance = distance;
    }
  }
  return best;
}

export interface ImageReferenceInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  /** Nombre estable; el proveedor lo necesita para adjuntar el archivo. */
  readonly name: string;
}

interface ImageRequestBase {
  readonly background: ImageGenerationBackground;
  /** Qué no debe aparecer. Se adjunta al prompt como guía explícita. */
  readonly negativeGuidance: readonly string[];
  readonly prompt: string;
  readonly quality: ImageGenerationQuality;
  readonly size: ImageGenerationSize;
}

/** Generación nueva: no admite referencias. */
export interface GenerateImageCommand extends ImageRequestBase {
  readonly kind: "generate";
}

/** Edición: exige al menos una referencia. */
export interface EditImageCommand extends ImageRequestBase {
  readonly kind: "edit";
  readonly references: readonly [ImageReferenceInput, ...ImageReferenceInput[]];
}

export interface ImageGenerationUsage {
  readonly estimatedCostUsd: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly latencyMilliseconds: number;
  readonly mimeType: string;
  readonly model: string;
  readonly requestId: string | null;
  /** Hash de los bytes recibidos, calculado antes de guardarlos. */
  readonly sha256: string;
  readonly usage: ImageGenerationUsage | null;
  readonly width: number;
}

export const imageGenerationFailureCodes = [
  /** La respuesta llegó pero no trae una imagen utilizable. */
  "content-invalid",
  "provider-error",
  "rate-limit",
  "safety-rejection",
  "timeout",
  /** El pedido no es válido y no se llega a llamar al proveedor. */
  "unsupported-parameter",
] as const;

export type ImageGenerationFailureCode =
  (typeof imageGenerationFailureCodes)[number];

/**
 * Fallo de generación.
 *
 * El mensaje es fijo y no incorpora nada de la respuesta: un mensaje del
 * proveedor puede traer el prompt reflejado o una URL temporal, y un error
 * termina en un log.
 */
export class ImageGenerationError extends Error {
  readonly code: ImageGenerationFailureCode;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(
    code: ImageGenerationFailureCode,
    detail: string,
    retryable: boolean,
  ) {
    super("La generación de imagen no pudo completarse.");
    this.code = code;
    this.detail = detail;
    this.name = "ImageGenerationError";
    this.retryable = retryable;
  }
}

export const imageGenerationLimits = Object.freeze({
  promptMaximum: 32_000,
  promptMinimum: 1,
  referencesMaximum: 4,
});

/**
 * Comprueba el pedido antes de gastar una llamada.
 *
 * Un parámetro que el proveedor no admite tiene que fallar acá y no después:
 * una llamada rechazada igual consume cuota y tarda, y el error que devuelve no
 * siempre dice cuál de los parámetros estaba mal.
 */
export function assertImageRequestSupported(
  command: EditImageCommand | GenerateImageCommand,
): void {
  if (!(imageGenerationSizes as readonly string[]).includes(command.size)) {
    throw new ImageGenerationError(
      "unsupported-parameter",
      `El tamaño ${command.size} no está admitido.`,
      false,
    );
  }
  if (
    !(imageGenerationQualities as readonly string[]).includes(command.quality)
  ) {
    throw new ImageGenerationError(
      "unsupported-parameter",
      `La calidad ${command.quality} no está admitida.`,
      false,
    );
  }
  if (
    command.prompt.length < imageGenerationLimits.promptMinimum ||
    command.prompt.length > imageGenerationLimits.promptMaximum
  ) {
    throw new ImageGenerationError(
      "unsupported-parameter",
      "El prompt está vacío o supera la longitud admitida.",
      false,
    );
  }
  if (command.kind === "generate") {
    return;
  }
  if (command.references.length > imageGenerationLimits.referencesMaximum) {
    throw new ImageGenerationError(
      "unsupported-parameter",
      `Una edición admite hasta ${String(imageGenerationLimits.referencesMaximum)} referencias.`,
      false,
    );
  }
  // Un fondo transparente sobre una edición con referencias opacas no produce
  // transparencia: la promesa quedaría incumplida sin que nadie lo note.
  if (command.background === "transparent") {
    throw new ImageGenerationError(
      "unsupported-parameter",
      "Una edición con referencias no puede pedir fondo transparente.",
      false,
    );
  }
}

export interface ImageGenerationPort {
  edit(command: EditImageCommand): Promise<GeneratedImage>;
  generate(command: GenerateImageCommand): Promise<GeneratedImage>;
}
