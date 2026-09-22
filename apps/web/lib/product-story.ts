import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import type { DesignDocument } from "@aramayo/design-engine";
import { parseDesignDocument } from "@aramayo/design-engine/validation";

import { savedPublication } from "./publication-workspace-api.ts";

/**
 * Historia de producto con foto propia (`ADR-031`).
 *
 * El producto manda: la foto ocupa el lienzo y los datos se apoyan en una
 * tarjeta que no la tapa. Acá se arma el documento que dibuja el motor —el
 * mismo que renderiza el worker— y se guarda como borrador.
 *
 * El precio lo escribe quien publica y vive en la pieza, nunca en el caption:
 * un importe en el texto exige evidencia vigente del catálogo y este camino no
 * la tiene. Sin precio, el marco invita a consultarlo.
 */

export const productStoryFrames = Object.freeze([
  {
    description: "La foto entera y el precio en una tarjeta abajo del todo.",
    label: "Precio abajo",
    layout: "historia-producto-precio-abajo",
    value: "precio-abajo",
  },
  {
    description: "El importe como etiqueta colgada sobre la foto.",
    label: "Etiqueta de precio",
    layout: "historia-producto-etiqueta",
    value: "etiqueta",
  },
  {
    description: "Los datos en una tarjeta; el producto libre a la izquierda.",
    label: "Tarjeta a la derecha",
    layout: "historia-producto-tarjeta",
    value: "tarjeta",
  },
  {
    description: "La foto enmarcada sobre el fondo de marca, datos abajo.",
    label: "Foto enmarcada",
    layout: "historia-producto-ventana",
    value: "ventana",
  },
] as const);

export type ProductStoryFrame = (typeof productStoryFrames)[number]["value"];

export const productStoryThemes = Object.freeze([
  { label: "Rojo Aramayo", value: "promo" },
  { label: "Taller", value: "taller" },
  { label: "Claro", value: "claro" },
] as const);

export type ProductStoryTheme = (typeof productStoryThemes)[number]["value"];

export interface ProductStoryDraft {
  readonly badge: string;
  readonly callToAction: string;
  readonly caption: string;
  readonly category: string;
  readonly frame: ProductStoryFrame;
  readonly items: readonly string[];
  readonly photo: RecurringStoryPhotoPayload | null;
  readonly previousPrice: string;
  readonly price: string;
  readonly subtitle: string;
  readonly theme: ProductStoryTheme;
  readonly title: string;
  readonly validity: string;
}

export const emptyProductStoryDraft: ProductStoryDraft = Object.freeze({
  badge: "",
  callToAction: "Consultanos",
  caption: "",
  category: "",
  frame: "precio-abajo",
  items: Object.freeze([]),
  photo: null,
  previousPrice: "",
  price: "",
  subtitle: "",
  theme: "promo",
  title: "",
  validity: "",
});

export type ProductStoryPreview =
  | Readonly<{ document: DesignDocument; kind: "ready" }>
  | Readonly<{ kind: "blocked"; message: string }>
  | Readonly<{ kind: "needs-photo" }>;

function layoutFor(frame: ProductStoryFrame): string {
  return (
    productStoryFrames.find((candidate) => candidate.value === frame)?.layout ??
    "historia-producto-precio-abajo"
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
      message: "Escribí el nombre del producto para ver la historia.",
    };
  }
  const items = filledItems(draft.items);
  // El precio anterior sin uno nuevo no compara nada: se omite.
  const price = trimmed(draft.price);
  const previousPrice =
    price === undefined ? undefined : trimmed(draft.previousPrice);
  const parsed = parseDesignDocument({
    content: {
      ...(trimmed(draft.badge) === undefined
        ? {}
        : { badge: trimmed(draft.badge) }),
      ...(trimmed(draft.callToAction) === undefined
        ? {}
        : { callToAction: trimmed(draft.callToAction) }),
      ...(trimmed(draft.category) === undefined
        ? {}
        : { category: trimmed(draft.category) }),
      ...(items.length === 0 ? {} : { items }),
      ...(previousPrice === undefined ? {} : { previousPrice }),
      ...(price === undefined ? {} : { price }),
      ...(trimmed(draft.subtitle) === undefined
        ? {}
        : { subtitle: trimmed(draft.subtitle) }),
      title,
      ...(trimmed(draft.validity) === undefined
        ? {}
        : { validity: trimmed(draft.validity) }),
    },
    format: "historia",
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
    slug: "historia-producto",
    theme: draft.theme,
  });
  return parsed.ok
    ? { document: parsed.document, kind: "ready" }
    : {
        kind: "blocked",
        message: "La historia no se puede componer con estos datos.",
      };
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
      message: "La historia necesita la foto del producto.",
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
