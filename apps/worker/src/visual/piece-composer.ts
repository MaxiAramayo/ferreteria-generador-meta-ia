/**
 * Compositor de piezas: la capa de marca sobre la base generada.
 *
 * El dominio decide **qué** se compone —qué pieza, qué tema, qué copy, con qué
 * recorte— y este módulo lo convierte en el documento que el motor de diseño
 * sabe renderizar. Es el otro extremo del lazo que abrió `P4-T01`: el prompt le
 * pidió al modelo dejar libre un rectángulo en coordenadas exactas, y acá el
 * bloque determinista se dibuja sobre ese mismo rectángulo.
 *
 * La base viaja **embebida** en el documento y no como URL (`ADR-014`). Es lo
 * que mantiene el render sin red y lo que hace que volver a componer el mismo
 * documento dé el mismo PNG: una URL puede cambiar de contenido o dejar de
 * responder, y `MediaStorage` todavía no sabe leer bytes.
 */

import { createHash } from "node:crypto";

import {
  DESIGN_SCHEMA_VERSION,
  formatFor,
  inlineAssetLimits,
  layoutSpecFor,
  supportsFormat,
  type DesignContent,
  type DesignDocument,
  type LayoutId,
  type ThemeId,
} from "@aramayo/design-engine";
import {
  composedPieceFingerprint,
  planComposedPiece,
  visualCompositionVersion,
  VisualCompositionError,
  type ComposedLayoutId,
  type ComposedPiecePlan,
  type ComposedThemeId,
  type ContentBrief,
  type VisualFormatId,
  type VisualReservedSpace,
} from "@aramayo/domain";

import { toDesignFormatId } from "./visual-profiles.ts";
import { canvasFor } from "./visual-prompt-builder.ts";

/**
 * El dominio nombra pieza y tema por separado del motor, igual que hace con los
 * formatos. Acá se comprueba en tiempo de compilación que sigan siendo los
 * mismos identificadores: renombrar un layout de un lado y no del otro rompe el
 * typecheck en lugar de fallar al componer.
 */
type AssertAssignable<Target, Source extends Target> = Source;
type ComposedLayoutIsLayoutId = AssertAssignable<LayoutId, ComposedLayoutId>;
type ComposedThemeIsThemeId = AssertAssignable<ThemeId, ComposedThemeId>;

/**
 * Base generada por el proveedor, con sus bytes.
 *
 * Se compone con los bytes en la mano, ni bien vuelven de la generación: es el
 * único momento en que existen sin pedirle una lectura al almacenamiento.
 */
export interface ComposedBaseImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: string;
  readonly sha256: string;
  readonly width: number;
}

export interface ComposePieceInput {
  readonly base: ComposedBaseImage | null;
  readonly brief: ContentBrief;
  readonly format: VisualFormatId;
  /**
   * Región que el prompt reservó. En el camino determinista no hubo prompt, y
   * quien llama elige la del perfil que habría correspondido.
   */
  readonly region: VisualReservedSpace;
  /** Identificador estable de la pieza dentro de la plataforma. */
  readonly slug: string;
}

/**
 * Lo que hay que conservar de una composición para poder rehacerla.
 *
 * `baseSha256` en `null` es el camino determinista: la pieza salió sin imagen
 * generada, y eso es un dato de la composición, no la ausencia de uno.
 */
export interface ComposedPieceSnapshot {
  readonly baseSha256: string | null;
  readonly format: VisualFormatId;
  /** Hash de todo lo que decide la pieza: versión, layout, tema, copy y base. */
  readonly compositionHash: string;
  readonly layout: ComposedLayoutId;
  /** Hash sólo de la capa determinista, sin la base. */
  readonly overlayHash: string;
  readonly priceEvidenceId: string | null;
  readonly theme: ComposedThemeId;
  readonly version: string;
}

export interface ComposedPiece {
  readonly document: DesignDocument;
  readonly plan: ComposedPiecePlan;
  readonly snapshot: ComposedPieceSnapshot;
}

/**
 * La pieza no se pudo renderizar.
 *
 * Se distingue de `VisualCompositionError` porque son cosas distintas: aquélla
 * es un pedido que no se puede componer y se detecta antes de gastar; ésta es
 * un fallo del render con la imagen ya pagada. Confundirlas mandaría a
 * reintentar contra el lugar equivocado.
 */
export class CompositionRenderError extends Error {
  readonly stage: string;

  constructor(stage: string) {
    super(`El render de la pieza falló en la etapa ${stage}.`);
    this.name = "CompositionRenderError";
    this.stage = stage;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * La base como `data:` URL.
 *
 * El tipo se comprueba contra la lista aprobada del contrato antes de armar la
 * cadena: un tipo que el documento no admite tiene que fallar acá, con nombre,
 * y no como un problema de validación más abajo.
 */
function inlineDataUrl(base: ComposedBaseImage): string {
  if (!inlineAssetLimits.mimeTypes.includes(base.mimeType)) {
    throw new VisualCompositionError(
      "format-not-composable",
      "base.mimeType",
      "La base generada no tiene un tipo que el documento sepa embeber.",
      "Volvé a pedir el lote: el proveedor tiene que devolver PNG o JPEG.",
    );
  }

  const encoded = Buffer.from(base.bytes).toString("base64");
  const dataUrl = `data:${base.mimeType};base64,${encoded}`;

  if (dataUrl.length > inlineAssetLimits.dataUrlMaximum) {
    throw new VisualCompositionError(
      "format-not-composable",
      "base.bytes",
      "La base generada no entra embebida en el documento.",
      "Pedí la pieza en una calidad menor: la imagen supera el tamaño que admite un documento de diseño.",
    );
  }

  return dataUrl;
}

/**
 * Texto alternativo de la base.
 *
 * No repite el copy comercial: describe qué es la imagen para quien no la ve, y
 * el precio o la promoción los lleva el texto de la pieza, que sí es texto.
 */
function baseAltFor(brief: ContentBrief): string {
  const [product] = brief.products;

  return product === undefined
    ? "Fondo generado para la pieza de Aramayo"
    : `Fondo generado con ${product.label}`;
}

function contentFor(plan: ComposedPiecePlan): DesignContent {
  const spec = layoutSpecFor(plan.layout);
  const admits = (field: string): boolean =>
    spec.requiredFields.includes(field as never) ||
    spec.optionalFields.includes(field as never);
  const { copy } = plan;

  return {
    ...(admits("badge") ? { badge: copy.badge } : {}),
    ...(admits("callToAction") ? { callToAction: copy.callToAction } : {}),
    ...(copy.price !== null && admits("price") ? { price: copy.price } : {}),
    ...(copy.subtitle !== null && admits("subtitle")
      ? { subtitle: copy.subtitle }
      : {}),
    ...(copy.validity !== null && admits("validity")
      ? { validity: copy.validity }
      : {}),
    title: copy.title,
  };
}

/**
 * Compone la pieza. Lanza `VisualCompositionError` antes de producir nada si el
 * pedido no se puede componer.
 */
export function composePiece(input: ComposePieceInput): ComposedPiece {
  const plan = planComposedPiece({
    // Sin base el recorte no aplica, pero el plan igual lo calcula: se le pasa
    // el propio lienzo, que produce un encuadre centrado y sin sobrante.
    base:
      input.base === null
        ? {
            height: formatFor(toDesignFormatId(input.format)).height,
            width: formatFor(toDesignFormatId(input.format)).width,
          }
        : { height: input.base.height, width: input.base.width },
    brief: input.brief,
    canvas: canvasFor(input.format),
    format: input.format,
    region: input.region,
  });
  const spec = layoutSpecFor(plan.layout);
  const formatId = toDesignFormatId(plan.format);

  if (!supportsFormat(spec, formatId)) {
    throw new VisualCompositionError(
      "format-not-composable",
      "format",
      "La pieza de composición no está aprobada para ese formato.",
      "Pedí la pieza en uno de los formatos que el layout declara.",
    );
  }

  const document: DesignDocument = Object.freeze({
    content: contentFor(plan),
    format: formatId,
    layout: plan.layout,
    media:
      input.base === null
        ? Object.freeze([])
        : Object.freeze([
            Object.freeze({
              alt: baseAltFor(input.brief),
              fit: plan.crop.fit,
              focus: Object.freeze({
                x: plan.crop.focusX,
                y: plan.crop.focusY,
              }),
              reference: Object.freeze({
                dataUrl: inlineDataUrl(input.base),
                source: "inline" as const,
              }),
              zoom: plan.crop.zoom,
            }),
          ]),
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: input.slug,
    theme: plan.theme,
  });

  const baseSha256 = input.base?.sha256 ?? null;

  return Object.freeze({
    document,
    plan,
    snapshot: Object.freeze({
      baseSha256,
      compositionHash: sha256(composedPieceFingerprint(plan, baseSha256)),
      format: plan.format,
      layout: plan.layout,
      overlayHash: sha256(composedPieceFingerprint(plan, null)),
      priceEvidenceId: plan.copy.priceEvidenceId,
      theme: plan.theme,
      version: visualCompositionVersion,
    }),
  });
}

export { visualCompositionVersion };

/** Identidades de tipo comprobadas arriba; no se usan en runtime. */
export type ComposedLayoutIdentity = ComposedLayoutIsLayoutId;
export type ComposedThemeIdentity = ComposedThemeIsThemeId;
