import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import {
  layoutSpecFor,
  type ContentFieldKey,
  type DesignDocument,
  type ProductPhotoLayoutId,
} from "@aramayo/design-engine";
import { parseDesignDocument } from "@aramayo/design-engine/validation";

import { savedPublication } from "./publication-workspace-api.ts";

/**
 * Pieza de producto con foto propia, en post o historia (`ADR-033`).
 *
 * Quien publica sube la foto, elige el marco según dónde quedó el producto y
 * decide qué se ve. Acá se arma el documento que dibuja el motor —el mismo que
 * renderiza el worker— y se guarda como borrador.
 *
 * El precio lo escribe quien publica y vive en la pieza, nunca en el caption:
 * un importe en el texto exige evidencia vigente del catálogo y este camino no
 * la tiene (`ADR-031`).
 */

export const productStoryFrames = Object.freeze([
  {
    description:
      "El letrero del frente arriba; nombre, precio y botón en una placa abajo.",
    label: "Cartel",
    layout: "foto-producto-cartel",
    value: "cartel",
  },
  {
    description:
      "La foto como la vidriera del local, sin nada encima; los datos en el zócalo.",
    label: "Vidriera",
    layout: "foto-producto-vidriera",
    value: "vidriera",
  },
  {
    description: "El precio en la etiqueta del estante, del lado izquierdo.",
    label: "Góndola a la izquierda",
    layout: "foto-producto-gondola-izquierda",
    value: "gondola-izquierda",
  },
  {
    description: "El precio en la etiqueta del estante, del lado derecho.",
    label: "Góndola a la derecha",
    layout: "foto-producto-gondola-derecha",
    value: "gondola-derecha",
  },
  {
    description: "El cartel chico y, si querés, nombre, precio y botón abajo.",
    label: "Solo la foto",
    layout: "foto-producto-libre",
    value: "libre",
  },
  {
    description: "Papel de marca y la foto recuadrada; para fotos de catálogo.",
    label: "Ficha",
    layout: "foto-producto-ficha",
    value: "ficha",
  },
  {
    description: "La foto arriba y el precio enorme abajo; para ofertas.",
    label: "Precio grande",
    layout: "foto-producto-precio-grande",
    value: "precio-grande",
  },
] as const satisfies readonly Readonly<{
  description: string;
  label: string;
  layout: ProductPhotoLayoutId;
  value: string;
}>[]);

export type ProductStoryFrame = (typeof productStoryFrames)[number]["value"];

export const productStoryFormats = Object.freeze([
  { label: "Historia", ratio: "9:16", value: "historia" },
  { label: "Post", ratio: "4:5", value: "feed" },
] as const);

export type ProductStoryFormat = (typeof productStoryFormats)[number]["value"];

/** La marca decide el cartel: rojo de la ferretería o amarillo del lubricentro. */
export const productStoryBrands = Object.freeze([
  { label: "Ferretería", theme: "taller", value: "ferreteria" },
  { label: "Lubricentro", theme: "lubricentro", value: "lubricentro" },
] as const);

export type ProductStoryBrand = (typeof productStoryBrands)[number]["value"];

/** Qué dice la pieza del precio: el importe, que se consulte, o nada. */
export const productStoryPriceModes = Object.freeze([
  { label: "Mostrar el precio", value: "amount" },
  { label: "«Consultá precio»", value: "consult" },
  { label: "No hablar del precio", value: "none" },
] as const);

export type ProductStoryPriceMode =
  (typeof productStoryPriceModes)[number]["value"];

export interface ProductStoryDraft {
  readonly badge: string;
  readonly brand: ProductStoryBrand;
  readonly callToAction: string;
  readonly caption: string;
  readonly format: ProductStoryFormat;
  readonly frame: ProductStoryFrame;
  readonly items: readonly string[];
  readonly photo: RecurringStoryPhotoPayload | null;
  readonly previousPrice: string;
  readonly price: string;
  readonly priceMode: ProductStoryPriceMode;
  readonly priceUnit: string;
  readonly showButton: boolean;
  readonly showTitle: boolean;
  readonly subtitle: string;
  readonly title: string;
  readonly validity: string;
}

export const emptyProductStoryDraft: ProductStoryDraft = Object.freeze({
  badge: "",
  brand: "ferreteria",
  callToAction: "Consultanos por WhatsApp",
  caption: "",
  format: "historia",
  frame: "cartel",
  items: Object.freeze([]),
  photo: null,
  previousPrice: "",
  price: "",
  priceMode: "amount",
  priceUnit: "",
  showButton: true,
  showTitle: true,
  subtitle: "",
  title: "",
  validity: "",
});

export type ProductStoryPreview =
  | Readonly<{ document: DesignDocument; kind: "ready" }>
  | Readonly<{ kind: "blocked"; message: string }>
  | Readonly<{ kind: "needs-photo" }>;

export function layoutFor(frame: ProductStoryFrame): ProductPhotoLayoutId {
  return (
    productStoryFrames.find((candidate) => candidate.value === frame)?.layout ??
    "foto-producto-cartel"
  );
}

/**
 * Lo que el marco dibuja. Sale de la especificación del motor: un dato que el
 * marco no muestra no se guarda como si se hubiera publicado.
 */
export function frameShows(
  frame: ProductStoryFrame,
  field: ContentFieldKey,
): boolean {
  const spec = layoutSpecFor(layoutFor(frame));
  return (
    spec.requiredFields.includes(field) || spec.optionalFields.includes(field)
  );
}

function trimmed(value: string): string | undefined {
  const text = value.trim();
  return text.length === 0 ? undefined : text;
}

/** Un renglón vacío no viaja: el motor rechaza una lista con huecos. */
function filledItems(items: readonly string[]): readonly string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function themeFor(brand: ProductStoryBrand): "lubricentro" | "taller" {
  return (
    productStoryBrands.find((candidate) => candidate.value === brand)?.theme ??
    "taller"
  );
}

/** Lo que el marco dibuja y quien publica escribió; lo demás no viaja. */
function pieceContent(
  draft: ProductStoryDraft,
  title: string,
): Readonly<Record<string, unknown>> {
  const shows = (field: ContentFieldKey): boolean =>
    frameShows(draft.frame, field);
  const text = (field: ContentFieldKey, value: string) => {
    const filled = trimmed(value);
    return filled !== undefined && shows(field) ? { [field]: filled } : {};
  };
  const items = filledItems(draft.items);
  const price = draft.priceMode === "amount" ? trimmed(draft.price) : undefined;
  const hidden = [
    ...(draft.showTitle ? [] : ["title"]),
    ...(draft.priceMode === "none" ? ["price"] : []),
  ];

  return {
    ...text("badge", draft.badge),
    ...(draft.showButton ? text("callToAction", draft.callToAction) : {}),
    ...(hidden.length === 0 ? {} : { hidden }),
    ...(items.length > 0 && shows("items") ? { items } : {}),
    // El precio anterior y la unidad sólo acompañan a un importe.
    ...(price === undefined
      ? {}
      : {
          price,
          ...text("previousPrice", draft.previousPrice),
          ...text("priceUnit", draft.priceUnit),
        }),
    ...text("subtitle", draft.subtitle),
    title,
    ...text("validity", draft.validity),
  };
}

export function productStoryDocument(
  draft: ProductStoryDraft,
): ProductStoryPreview {
  if (draft.photo === null) {
    return { kind: "needs-photo" };
  }
  const title = trimmed(draft.title);
  if (title === undefined) {
    return {
      kind: "blocked",
      message: "Escribí el nombre del producto para ver la pieza.",
    };
  }
  if (draft.priceMode === "amount" && trimmed(draft.price) === undefined) {
    return {
      kind: "blocked",
      message:
        "Escribí el precio, o elegí «Consultá precio» o no hablar del precio.",
    };
  }
  const parsed = parseDesignDocument({
    content: pieceContent(draft, title),
    format: draft.format,
    layout: layoutFor(draft.frame),
    media: [
      {
        alt: draft.photo.alt,
        fit: "cover",
        focus: { x: draft.photo.focusX, y: draft.photo.focusY },
        reference: { dataUrl: draft.photo.dataUrl, source: "inline" },
        zoom: draft.photo.zoom / 100,
      },
    ],
    schemaVersion: 1,
    slug: "foto-producto",
    theme: themeFor(draft.brand),
  });
  return parsed.ok
    ? { document: parsed.document, kind: "ready" }
    : {
        kind: "blocked",
        message: "La pieza no se puede componer con estos datos.",
      };
}

/**
 * La miniatura de cada marco en la galería: la pieza de verdad con la foto y
 * los datos que se cargaron. Mientras falten, una foto de la biblioteca y un
 * nombre de muestra dejan ver la forma del marco.
 */
export function productFrameThumbnail(
  draft: ProductStoryDraft,
  frame: ProductStoryFrame,
): DesignDocument | null {
  const own = productStoryDocument({ ...draft, frame });
  if (own.kind === "ready") {
    return own.document;
  }
  const sample = parseDesignDocument({
    content: {
      ...(frameShows(frame, "callToAction")
        ? { callToAction: draft.callToAction.trim() || "Consultanos" }
        : {}),
      price: "$ 24.500",
      title: trimmed(draft.title) ?? "Tu producto",
    },
    format: draft.format,
    layout: layoutFor(frame),
    media: [
      {
        alt: "Herramientas sobre un banco de trabajo",
        reference: {
          assetId: "stock-herramientas-electricas",
          source: "brand-library",
        },
      },
    ],
    schemaVersion: 1,
    slug: "foto-producto-muestra",
    theme: themeFor(draft.brand),
  });
  return sample.ok ? sample.document : null;
}

export type ProductStorySaveResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      kind: "saved";
      publication: Readonly<{ id: string; title: string }>;
    }>;

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    cache: "no-store",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

/** La foto viaja embebida, igual que en las historias recurrentes. */
export async function saveProductStoryDraft(
  apiBaseUrl: string,
  input: Readonly<{
    caption: string;
    document: DesignDocument;
    idempotencyKey: string;
    title: string;
  }>,
): Promise<ProductStorySaveResult> {
  const [media] = input.document.media;
  if (media === undefined || media.reference.source !== "inline") {
    return {
      kind: "error",
      message: "La pieza necesita la foto del producto.",
    };
  }
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(new URL("publications", apiBaseUrl), {
      body: JSON.stringify({
        content: { caption: input.caption, products: [] },
        design: {
          content: input.document.content,
          format: input.document.format,
          layout: input.document.layout,
          media: [
            {
              alt: media.alt,
              dataUrl: media.reference.dataUrl,
              fit: media.fit,
              focus: { x: media.focus.x, y: media.focus.y },
              zoom: media.zoom,
            },
          ],
          schemaVersion: input.document.schemaVersion,
          slug: input.document.slug,
          theme: input.document.theme,
        },
        title: input.title,
      }),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
        "x-csrf-token": csrf,
      },
      method: "POST",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    if (response.status === 413) {
      return {
        kind: "error",
        message:
          "La foto es demasiado pesada. Probá con otra o recortala antes de subirla.",
      };
    }
    const publication = savedPublication(await payload(response));
    return response.ok && publication !== null
      ? { kind: "saved", publication }
      : {
          kind: "error",
          message: "El borrador no se guardó. Revisá los campos y reintentá.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. El borrador no fue confirmado.",
    };
  }
}
