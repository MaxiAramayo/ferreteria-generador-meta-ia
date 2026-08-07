import type { FormatId } from "../formats/formats.ts";
import type { LayoutId } from "./layout-id.ts";

/**
 * Descripción declarativa de cada layout.
 *
 * La especificación es datos, no comportamiento: permite validar un documento
 * antes de que exista el componente React que lo dibuja y evita que la
 * validación quede escrita dentro de cada layout.
 */

export type LayoutFamily =
  | "banner"
  | "carrusel"
  | "composicion"
  | "destacada"
  | "historia"
  | "publicacion";

/**
 * Campos de texto que un layout puede mostrar. Son los campos editables del
 * generador congelado, traducidos al vocabulario de la plataforma.
 */
export type ContentFieldKey =
  | "badge"
  | "branch"
  | "callToAction"
  | "category"
  | "disclaimer"
  | "icon"
  | "items"
  | "phone"
  | "previousPrice"
  | "price"
  | "subtitle"
  | "title"
  | "validity";

export interface MediaCapacity {
  /** Cantidad mínima de imágenes que el layout necesita para componerse. */
  readonly minimum: number;
  /** Cantidad máxima de ranuras de imagen que el layout sabe ubicar. */
  readonly maximum: number;
}

export interface LayoutSpec {
  readonly family: LayoutFamily;
  /** Formatos en los que el layout está aprobado. El primero es el habitual. */
  readonly formats: readonly FormatId[];
  readonly id: LayoutId;
  readonly media: MediaCapacity;
  /** Campos admitidos además de los obligatorios. */
  readonly optionalFields: readonly ContentFieldKey[];
  /** Campos sin los cuales la pieza no puede componerse. */
  readonly requiredFields: readonly ContentFieldKey[];
}
