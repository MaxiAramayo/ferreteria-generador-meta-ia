import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import {
  layoutSpecFor,
  type ContentFieldKey,
  type DesignDocument,
  type ProductPhotoLayoutId,
} from "@aramayo/design-engine";
import { parseDesignDocument } from "@aramayo/design-engine/validation";

import {
  reopenPublication,
  savedPublication,
} from "./publication-workspace-api.ts";

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

/**
 * Si la pieza usa algo de «Más datos»: precio anterior, unidad, etiqueta,
 * vigencia, medidas o un botón distinto del de siempre. El compositor los
 * pliega para ir rápido y los abre solo cuando la pieza ya dice alguno.
 */
export function usesExtraFields(draft: ProductStoryDraft): boolean {
  return (
    draft.previousPrice.trim() !== "" ||
    draft.priceUnit.trim() !== "" ||
    draft.badge.trim() !== "" ||
    draft.validity.trim() !== "" ||
    draft.items.some((item) => item.trim() !== "") ||
    !draft.showButton ||
    draft.callToAction.trim() !== emptyProductStoryDraft.callToAction
  );
}

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

/** La foto propia, con el encuadre que se acomodó en la vista previa. */
function photoMedia(
  photo: RecurringStoryPhotoPayload,
): Readonly<Record<string, unknown>> {
  return {
    alt: photo.alt,
    fit: "cover",
    focus: { x: photo.focusX, y: photo.focusY },
    reference: { dataUrl: photo.dataUrl, source: "inline" },
    zoom: photo.zoom / 100,
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
    media: [photoMedia(draft.photo)],
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

/** Lo que la vista previa completa con un ejemplo mientras falte. */
export type ProductPreviewSample = "photo" | "price" | "title";

export type ProductStoryLivePreview =
  | Readonly<{
      document: DesignDocument;
      kind: "ready";
      /** Vacío cuando la pieza es exactamente la que se va a guardar. */
      samples: readonly ProductPreviewSample[];
    }>
  | Readonly<{ kind: "blocked"; message: string }>;

/** Se ve como relleno a propósito: nadie lo confunde con un precio real. */
export const sampleProductPrice = "$ 00.000";
export const sampleProductTitle = "Tu producto";

const samplePhoto = Object.freeze({
  alt: "Herramientas sobre un banco de trabajo",
  reference: Object.freeze({
    assetId: "stock-herramientas-electricas",
    source: "brand-library",
  }),
});

/**
 * La pieza que se ve mientras se arma: la misma que se guarda cuando está
 * completa y, mientras falten la foto, el nombre o el importe, la misma
 * composición con un ejemplo en su lugar, para ver cómo queda antes de
 * escribir nada.
 *
 * El ejemplo nunca viaja: guardar sigue pasando por `productStoryDocument`,
 * que exige los datos reales. Por eso `samples` dice qué es de ejemplo y el
 * panel lo avisa sobre la vista previa.
 */
export function productStoryLivePreview(
  draft: ProductStoryDraft,
): ProductStoryLivePreview {
  const own = productStoryDocument(draft);
  if (own.kind === "ready") {
    return { document: own.document, kind: "ready", samples: [] };
  }
  const title = trimmed(draft.title);
  const missingPrice =
    draft.priceMode === "amount" && trimmed(draft.price) === undefined;
  // Con todo cargado, si igual no compone, se dice por qué: un ejemplo no
  // tapa un dato real que el motor rechaza.
  if (own.kind === "blocked" && title !== undefined && !missingPrice) {
    return own;
  }
  // Sólo se avisa lo que se ve: un nombre callado no aparece en la pieza.
  const samples: ProductPreviewSample[] = [];
  if (draft.photo === null) samples.push("photo");
  if (title === undefined && draft.showTitle) samples.push("title");
  if (missingPrice) samples.push("price");

  const content = pieceContent(
    missingPrice ? { ...draft, price: sampleProductPrice } : draft,
    title ?? sampleProductTitle,
  );
  const parsed = parseDesignDocument({
    content,
    format: draft.format,
    layout: layoutFor(draft.frame),
    media: [draft.photo === null ? samplePhoto : photoMedia(draft.photo)],
    schemaVersion: 1,
    slug: "foto-producto-muestra",
    theme: themeFor(draft.brand),
  });
  return parsed.ok
    ? { document: parsed.document, kind: "ready", samples }
    : {
        kind: "blocked",
        message: "La pieza no se puede componer con estos datos.",
      };
}

const sampleNames: Readonly<Record<ProductPreviewSample, string>> =
  Object.freeze({ photo: "foto", price: "precio", title: "nombre" });

/** Qué de la vista previa es de ejemplo, en el orden en que se carga. */
export function productPreviewNote(
  samples: readonly ProductPreviewSample[],
): string | null {
  const names = (["photo", "title", "price"] as const)
    .filter((sample) => samples.includes(sample))
    .map((sample) => sampleNames[sample]);
  const last = names.at(-1);
  if (last === undefined) return null;
  const list =
    names.length === 1 ? last : `${names.slice(0, -1).join(", ")} y ${last}`;
  return `Por ahora con ${list} de ejemplo.`;
}

/**
 * La miniatura de cada marco en la galería: la pieza de verdad con la foto y
 * los datos que se cargaron. La foto propia aparece apenas se sube; lo que
 * todavía falte se completa con el mismo ejemplo que la vista previa.
 */
export function productFrameThumbnail(
  draft: ProductStoryDraft,
  frame: ProductStoryFrame,
): DesignDocument | null {
  const preview = productStoryLivePreview({ ...draft, frame });
  return preview.kind === "ready" ? preview.document : null;
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

/** El diseño como lo recibe la API: la foto viaja embebida, con su encuadre. */
function designPayload(
  document: DesignDocument,
  media: DesignDocument["media"][number],
  dataUrl: string,
): Readonly<Record<string, unknown>> {
  return {
    content: document.content,
    format: document.format,
    layout: document.layout,
    media: [
      {
        alt: media.alt,
        dataUrl,
        fit: media.fit,
        focus: { x: media.focus.x, y: media.focus.y },
        zoom: media.zoom,
      },
    ],
    schemaVersion: document.schemaVersion,
    slug: document.slug,
    theme: document.theme,
  };
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
        design: designPayload(input.document, media, media.reference.dataUrl),
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

/** Una pieza de producto ya guardada, lista para seguir editándola. */
export interface EditableProductPiece {
  readonly draft: ProductStoryDraft;
  readonly id: string;
  readonly status: string;
  readonly version: number;
}

function textOf(
  content: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = content[field];
  return typeof value === "string" ? value : "";
}

/**
 * Convierte la pieza guardada en el borrador del compositor (`P2-T11`).
 *
 * Es la inversa de `productStoryDocument`: el marco sale del layout, la marca
 * del tema y lo callado de `hidden`. Una pieza que no sea de esta familia, o
 * sin su foto embebida, no se abre acá.
 */
export function editableProductPiece(
  value: unknown,
): EditableProductPiece | null {
  const publication = record(value);
  const revision = record(publication?.["latestRevision"]);
  const content = record(revision?.["content"]);
  const parsed = parseDesignDocument(revision?.["designDocument"]);
  if (
    publication === null ||
    content === null ||
    !parsed.ok ||
    typeof publication["id"] !== "string" ||
    typeof publication["status"] !== "string" ||
    typeof publication["version"] !== "number"
  ) {
    return null;
  }
  const { document } = parsed;
  const frame = productStoryFrames.find(
    (candidate) => candidate.layout === document.layout,
  );
  const format = productStoryFormats.find(
    (candidate) => candidate.value === document.format,
  );
  const [media] = document.media;
  if (
    frame === undefined ||
    format === undefined ||
    media === undefined ||
    media.reference.source !== "inline"
  ) {
    return null;
  }
  const piece = record(document.content) ?? {};
  const hidden = document.content.hidden ?? [];
  const priceMode: ProductStoryPriceMode =
    document.content.price !== undefined
      ? "amount"
      : hidden.includes("price")
        ? "none"
        : "consult";
  return {
    draft: {
      badge: textOf(piece, "badge"),
      brand: document.theme === "lubricentro" ? "lubricentro" : "ferreteria",
      callToAction:
        document.content.callToAction ?? emptyProductStoryDraft.callToAction,
      caption: typeof content["caption"] === "string" ? content["caption"] : "",
      format: format.value,
      frame: frame.value,
      items: document.content.items ?? [],
      photo: {
        alt: media.alt,
        dataUrl: media.reference.dataUrl,
        focusX: media.focus.x,
        focusY: media.focus.y,
        zoom: Math.round(media.zoom * 100),
      },
      previousPrice: textOf(piece, "previousPrice"),
      price: textOf(piece, "price"),
      priceMode,
      priceUnit: textOf(piece, "priceUnit"),
      showButton: document.content.callToAction !== undefined,
      showTitle: !hidden.includes("title"),
      subtitle: textOf(piece, "subtitle"),
      title: document.content.title,
      validity: textOf(piece, "validity"),
    },
    id: publication["id"],
    status: publication["status"],
    version: publication["version"],
  };
}

export type ProductPieceLoadResult =
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "ready"; piece: EditableProductPiece }>;

export async function loadProductPiece(
  apiBaseUrl: string,
  publicationId: string,
): Promise<ProductPieceLoadResult> {
  try {
    const response = await fetch(
      new URL(`publications/${publicationId}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const piece = response.ok
      ? editableProductPiece(await payload(response))
      : null;
    return piece === null
      ? {
          kind: "error",
          message: "Esta pieza no se puede abrir en el compositor de producto.",
        }
      : { kind: "ready", piece };
  } catch {
    return { kind: "error", message: "No se pudo cargar la pieza." };
  }
}

/**
 * Guarda la edición de una pieza de producto como revisión nueva.
 *
 * Si la pieza ya estaba en revisión, primero vuelve a borrador: su imagen era
 * de la revisión anterior y la nueva pide otra. Una pieza aprobada no llega
 * acá: el listado no ofrece editarla.
 */
export async function saveProductPieceEdit(
  apiBaseUrl: string,
  input: Readonly<{
    caption: string;
    document: DesignDocument;
    piece: Pick<EditableProductPiece, "id" | "status" | "version">;
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
  let version = input.piece.version;
  if (input.piece.status !== "draft") {
    const reopened = await reopenPublication(
      apiBaseUrl,
      input.piece.id,
      version,
      crypto.randomUUID(),
    );
    if (reopened.kind !== "reopened") return reopened;
    version = reopened.version;
  }
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`publications/${input.piece.id}`, apiBaseUrl),
      {
        body: JSON.stringify({
          content: { caption: input.caption, products: [] },
          design: designPayload(input.document, media, media.reference.dataUrl),
          expectedVersion: version,
          title: input.title,
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          "x-csrf-token": csrf,
        },
        method: "PATCH",
      },
    );
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
          message: "No se guardó la edición. Recargá la pieza y reintentá.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. La edición no fue confirmada.",
    };
  }
}
