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
const technicalScene: MediaCapacity = { maximum: 1, minimum: 1 };

export const LAYOUT_SPECS: Readonly<Record<LayoutId, LayoutSpec>> =
  Object.freeze({
    "combo-kit": specFor(
      "combo-kit",
      "publicacion",
      ["feed"],
      ["title", "items"],
      ["subtitle", "category", "price", "badge", "validity", "callToAction"],
      { maximum: 3, minimum: 0 },
    ),
    "ficha-variantes": specFor(
      "ficha-variantes",
      "publicacion",
      ["feed"],
      ["title", "items"],
      ["subtitle", "badge", "callToAction", "disclaimer"],
      technicalScene,
    ),
    "guia-aplicacion": specFor(
      "guia-aplicacion",
      "publicacion",
      ["feed"],
      ["title", "items"],
      ["subtitle", "badge", "callToAction", "disclaimer", "icon"],
      technicalScene,
    ),
    "historia-precio-dia": specFor(
      "historia-precio-dia",
      "historia",
      ["historia"],
      ["title"],
      [
        "subtitle",
        "category",
        "price",
        "previousPrice",
        "badge",
        "validity",
        "callToAction",
      ],
      singlePhoto,
    ),
    "historia-producto-precio": specFor(
      "historia-producto-precio",
      "historia",
      ["historia"],
      ["title"],
      [
        "subtitle",
        "category",
        "price",
        "badge",
        "validity",
        "callToAction",
        "disclaimer",
      ],
      singlePhoto,
    ),
    "historia-problema-solucion": specFor(
      "historia-problema-solucion",
      "historia",
      ["historia"],
      ["title", "subtitle"],
      [
        "category",
        "price",
        "badge",
        "validity",
        "callToAction",
        "disclaimer",
        "icon",
        "items",
      ],
      singlePhoto,
    ),
    "historia-surtido-real": specFor(
      "historia-surtido-real",
      "historia",
      ["historia"],
      ["title"],
      [
        "subtitle",
        "category",
        "price",
        "badge",
        "validity",
        "callToAction",
        "disclaimer",
        "items",
      ],
      singlePhoto,
    ),
    "historia-tip": specFor(
      "historia-tip",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "items", "callToAction"],
      noMedia,
    ),
    "historia-turno-lubricentro": specFor(
      "historia-turno-lubricentro",
      "historia",
      ["historia"],
      ["title"],
      ["subtitle", "badge", "icon", "items", "branch", "phone", "callToAction"],
      singlePhoto,
    ),
    "problema-solucion": specFor(
      "problema-solucion",
      "publicacion",
      ["feed"],
      ["title", "subtitle"],
      [
        "category",
        "badge",
        "icon",
        "items",
        "price",
        "validity",
        "callToAction",
        "disclaimer",
      ],
      singlePhoto,
    ),
    "producto-precio": specFor(
      "producto-precio",
      "publicacion",
      ["feed"],
      ["title"],
      [
        "subtitle",
        "category",
        "price",
        "badge",
        "validity",
        "callToAction",
        "disclaimer",
      ],
      singlePhoto,
    ),
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
    "historia-ficha-variantes": specFor(
      "historia-ficha-variantes",
      "historia",
      ["historia"],
      ["title", "items"],
      ["subtitle", "badge", "callToAction", "disclaimer"],
      technicalScene,
    ),
    "historia-guia-aplicacion": specFor(
      "historia-guia-aplicacion",
      "historia",
      ["historia"],
      ["title", "items"],
      ["subtitle", "badge", "callToAction", "disclaimer", "icon"],
      technicalScene,
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
    "producto-editorial": specFor(
      "producto-editorial",
      "publicacion",
      ["feed"],
      ["title", "category"],
      [
        "subtitle",
        "price",
        "badge",
        "callToAction",
        "disclaimer",
        "validity",
        "branch",
        "phone",
      ],
      technicalScene,
    ),
    "producto-mosaico": specFor(
      "producto-mosaico",
      "publicacion",
      ["feed"],
      ["title"],
      [
        "subtitle",
        "category",
        "badge",
        "items",
        "price",
        "validity",
        "callToAction",
        "disclaimer",
      ],
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
    // Piezas de composición (`P4-T05`). Los tres formatos aprobados son los que
    // publican una pieza comercial; `banner-fb` y `destacada` quedan afuera
    // porque su rectángulo reservado no sostiene el bloque determinista sin
    // achicar el titular hasta que deje de serlo, y porque una portada
    // destacada ya tiene su propia pieza.
    "composicion-banda-superior": specFor(
      "composicion-banda-superior",
      "composicion",
      ["feed", "cuadrado", "historia"],
      ["title"],
      ["badge", "callToAction", "icon"],
      singlePhoto,
    ),
    "composicion-circulo-central": specFor(
      "composicion-circulo-central",
      "composicion",
      ["feed", "cuadrado", "historia"],
      ["title"],
      ["badge", "callToAction", "icon", "previousPrice", "price", "validity"],
      singlePhoto,
    ),
    "composicion-tercio-inferior": specFor(
      "composicion-tercio-inferior",
      "composicion",
      ["feed", "cuadrado", "historia"],
      ["title"],
      [
        "badge",
        "callToAction",
        "icon",
        "previousPrice",
        "price",
        "subtitle",
        "validity",
      ],
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
