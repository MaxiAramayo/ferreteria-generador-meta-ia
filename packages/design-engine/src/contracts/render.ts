import type { DesignFailure } from "./errors.ts";
import type { DesignDocument } from "./document.ts";

/**
 * Contrato de render.
 *
 * Describe qué produce el motor, no cómo. La implementación con navegador vive
 * en el worker (`P1-T05`) detrás de este puerto: acá no se nombra Playwright,
 * ni rutas de archivo, ni almacenamiento remoto.
 */

export interface RenderRequest {
  readonly document: DesignDocument;
  /** Identificador para correlacionar publicación, ejecución y activo. */
  readonly requestId: string;
  /** Multiplicador de resolución sobre el tamaño del formato. */
  readonly scale?: number;
}

export interface RenderedImage {
  readonly byteLength: number;
  readonly height: number;
  /** Contenido PNG; el motor no decide dónde se guarda. */
  readonly png: Uint8Array;
  /** Hash del contenido, base de la comparación visual y de la idempotencia. */
  readonly sha256: string;
  readonly width: number;
}

export interface RenderSuccess {
  readonly durationMs: number;
  readonly image: RenderedImage;
  readonly ok: true;
  readonly requestId: string;
}

export interface RenderRejected {
  readonly durationMs: number;
  readonly failure: DesignFailure;
  readonly ok: false;
  readonly requestId: string;
}

export type RenderResult = RenderRejected | RenderSuccess;

/**
 * Puerto que implementa el worker. Un reintento con la misma solicitud debe
 * producir el mismo resultado: el `requestId` viaja de vuelta para correlación.
 */
export interface DesignRenderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
