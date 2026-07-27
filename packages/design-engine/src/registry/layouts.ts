import type { LayoutId } from "./layout-id.ts";
import type {
  ContentFieldKey,
  LayoutFamily,
  LayoutSpec,
  MediaCapacity,
} from "./layout-spec.ts";
import type { FormatId } from "../formats/formats.ts";

/**
 * Registro tipado de layouts.
 *
 * Cada entrada describe en qué formatos está aprobado el layout, qué campos
 * admite y cuántas imágenes sabe ubicar. Los datos reproducen el generador
 * congelado en `P1-T01`: campos editables por layout, layouts con imagen y
 * ranuras adicionales observadas en los componentes fuente.
 *
 * `Record<LayoutId, LayoutSpec>` obliga a registrar cada layout: agregar un
 * identificador sin especificación no compila.
 */

function specFor(
  id: LayoutId,
  family: LayoutFamily,
  formats: readonly FormatId[],
  requiredFields: readonly ContentFieldKey[],
  optionalFields: readonly ContentFieldKey[],
  media: MediaCapacity,
): LayoutSpec {
  return Object.freeze({
    family,
    formats: Object.freeze([...formats]),
    id,
    media: Object.freeze({ ...media }),
    optionalFields: Object.freeze([...optionalFields]),
    requiredFields: Object.freeze([...requiredFields]),
  });
}

const noMedia: MediaCapacity = { maximum: 0, minimum: 0 };
const singlePhoto: MediaCapacity = { maximum: 1, minimum: 0 };
const photoPair: MediaCapacity = { maximum: 2, minimum: 0 };
const mosaic: MediaCapacity = { maximum: 6, minimum: 0 };

export const LAYOUT_SPECS: Readonly<Record<LayoutId, LayoutSpec>> =
  Object.freeze({
    "banner-marca": specFor(
      "banner-marca",
      "banner",
      ["banner-fb"],
      ["title"],
      ["subtitle", "phone"],
      photoPair,
    ),
    "carrusel-bienvenida-datos": specFor(
      "carrusel-bienvenida-datos",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["subtitle", "callToAction", "phone"],
      noMedia,
    ),
    "carrusel-bienvenida-locales": specFor(
      "carrusel-bienvenida-locales",
      "carrusel",
      ["cuadrado"],
      ["title"],
      [],
      photoPair,
    ),
    "carrusel-bienvenida-portada": specFor(
      "carrusel-bienvenida-portada",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["subtitle", "badge", "branch"],
      noMedia,
    ),
    "carrusel-lubricentro-portada": specFor(
      "carrusel-lubricentro-portada",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["subtitle", "badge", "branch"],
      noMedia,
    ),
    "carrusel-lubricentro-servicios": specFor(
      "carrusel-lubricentro-servicios",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["subtitle", "items"],
      singlePhoto,
    ),
    "carrusel-lubricentro-turno": specFor(
      "carrusel-lubricentro-turno",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["phone", "branch", "validity"],
      noMedia,
    ),
    "carrusel-productos-ferreteria": specFor(
      "carrusel-productos-ferreteria",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["badge", "items"],
      noMedia,
    ),
    "carrusel-productos-mas": specFor(
      "carrusel-productos-mas",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["badge", "items", "callToAction", "phone"],
      noMedia,
    ),
    "carrusel-productos-portada": specFor(
      "carrusel-productos-portada",
      "carrusel",
      ["cuadrado"],
      ["title"],
      ["subtitle"],
      singlePhoto,
    ),
    "destacada-cover": specFor(
      "destacada-cover",
      "destacada",
      ["destacada"],
      ["title", "icon"],
      [],
      noMedia,
    ),
    "epp-seguridad": specFor(
      "epp-seguridad",
      "publicacion",
      ["feed"],
      ["title", "items"],
      ["subtitle", "category", "badge", "callToAction"],
      singlePhoto,
    ),
    "historia-apertura": specFor(
      "historia-apertura",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "items", "validity", "callToAction", "phone"],
      noMedia,
    ),
    "historia-encuesta": specFor(
      "historia-encuesta",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "items"],
      noMedia,
    ),
    "historia-informativa": specFor(
      "historia-informativa",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "items", "callToAction", "phone"],
      noMedia,
    ),
    "historia-locales": specFor(
      "historia-locales",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "branch", "items", "callToAction", "phone"],
      photoPair,
    ),
    "historia-lubricentro-diaria": specFor(
      "historia-lubricentro-diaria",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "items", "callToAction", "phone"],
      singlePhoto,
    ),
    "historia-oferta-diaria": specFor(
      "historia-oferta-diaria",
      "historia",
      ["historia"],
      ["title"],
      [
        "category",
        "price",
        "previousPrice",
        "badge",
        "validity",
        "callToAction",
        "phone",
      ],
      singlePhoto,
    ),
    "historia-preguntas": specFor(
      "historia-preguntas",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge"],
      noMedia,
    ),
    "historia-producto": specFor(
      "historia-producto",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "category", "badge", "callToAction"],
      singlePhoto,
    ),
    "historia-producto-del-dia": specFor(
      "historia-producto-del-dia",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "category", "price", "badge", "callToAction"],
      singlePhoto,
    ),
    "historia-promo": specFor(
      "historia-promo",
      "historia",
      ["historia"],
      ["title", "price"],
      [
        "category",
        "previousPrice",
        "subtitle",
        "badge",
        "validity",
        "callToAction",
      ],
      noMedia,
    ),
    "historia-recordatorio-lubricentro": specFor(
      "historia-recordatorio-lubricentro",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "items", "callToAction", "phone"],
      noMedia,
    ),
    "historia-reposicion": specFor(
      "historia-reposicion",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "category", "badge", "callToAction", "phone"],
      singlePhoto,
    ),
    "historia-resena": specFor(
      "historia-resena",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "callToAction"],
      noMedia,
    ),
    "historia-tip-diario": specFor(
      "historia-tip-diario",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "callToAction"],
      noMedia,
    ),
    "lubricentro-servicio": specFor(
      "lubricentro-servicio",
      "publicacion",
      ["feed"],
      ["title"],
      ["subtitle", "badge", "icon", "callToAction", "branch"],
      singlePhoto,
    ),
    "presentacion-marca": specFor(
      "presentacion-marca",
      "publicacion",
      ["feed"],
      ["title", "items"],
      ["subtitle", "badge", "callToAction", "branch"],
      singlePhoto,
    ),
    "producto-destacado": specFor(
      "producto-destacado",
      "publicacion",
      ["feed"],
      ["title"],
      ["subtitle", "category", "badge", "callToAction"],
      singlePhoto,
    ),
    "producto-mosaico": specFor(
      "producto-mosaico",
      "publicacion",
      ["feed"],
      ["title"],
      ["subtitle", "category", "badge", "callToAction"],
      mosaic,
    ),
    "promo-producto": specFor(
      "promo-producto",
      "publicacion",
      ["feed"],
      ["title", "price"],
      [
        "category",
        "previousPrice",
        "subtitle",
        "badge",
        "validity",
        "callToAction",
      ],
      singlePhoto,
    ),
    sucursales: specFor(
      "sucursales",
      "publicacion",
      ["feed"],
      ["title"],
      ["subtitle", "badge", "callToAction"],
      photoPair,
    ),
    "tip-oficio": specFor(
      "tip-oficio",
      "publicacion",
      ["cuadrado"],
      ["title", "items"],
      ["subtitle", "category", "badge", "icon", "callToAction"],
      singlePhoto,
    ),
  });

const layoutIds: ReadonlySet<string> = new Set(Object.keys(LAYOUT_SPECS));

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === "string" && layoutIds.has(value);
}

export const LAYOUT_IDS: readonly LayoutId[] = Object.freeze(
  Object.keys(LAYOUT_SPECS).filter(isLayoutId),
);

export function layoutSpecFor(layoutId: LayoutId): LayoutSpec {
  return LAYOUT_SPECS[layoutId];
}

export function supportsFormat(spec: LayoutSpec, formatId: FormatId): boolean {
  return spec.formats.includes(formatId);
}

export function defaultFormatFor(spec: LayoutSpec): FormatId {
  const [firstFormat] = spec.formats;

  if (firstFormat === undefined) {
    throw new Error(`El layout ${spec.id} no declara ningún formato aprobado.`);
  }

  return firstFormat;
}
