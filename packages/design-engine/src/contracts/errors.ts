import type { DesignIssue } from "../validation/issues.ts";

/**
 * Fallos del motor discriminados por etapa.
 *
 * Cada etapa tiene una acción distinta: `content` se corrige editando la pieza,
 * `asset` reemplazando o volviendo a subir el activo, `layout` eligiendo otra
 * plantilla o formato, `render` reintentando o revisando el navegador, y
 * `export` revisando el destino de la imagen. Colapsarlas en un único error
 * obligaría a leer un mensaje para decidir.
 */

export type DesignFailureStage =
  "asset" | "content" | "export" | "layout" | "render";

export interface ContentFailure {
  readonly issues: readonly DesignIssue[];
  readonly stage: "content";
}

export interface AssetFailure {
  /** Referencia del activo, ya redactada: nunca una ruta local ni una URL firmada. */
  readonly assetReference: string;
  readonly reason: "decode-failed" | "not-found" | "rejected" | "unreadable";
  readonly stage: "asset";
}

export interface LayoutFailure {
  readonly layout: string;
  readonly reason: "format-not-supported" | "not-registered" | "unrenderable";
  readonly stage: "layout";
}

export interface RenderFailure {
  readonly durationMs: number;
  readonly reason:
    "browser-crashed" | "fonts-unavailable" | "node-missing" | "timeout";
  readonly stage: "render";
}

export interface ExportFailure {
  readonly reason: "dimensions-mismatch" | "encode-failed" | "write-failed";
  readonly stage: "export";
}

export type DesignFailure =
  AssetFailure | ContentFailure | ExportFailure | LayoutFailure | RenderFailure;

/**
 * Error transportable del motor.
 *
 * Conserva el fallo estructurado para que quien lo captura decida sin analizar
 * el texto del mensaje.
 */
export class DesignEngineError extends Error {
  readonly failure: DesignFailure;

  constructor(failure: DesignFailure, message: string) {
    super(message);
    this.name = "DesignEngineError";
    this.failure = failure;
  }
}

export function isDesignEngineError(
  value: unknown,
): value is DesignEngineError {
  return value instanceof DesignEngineError;
}
