import type { DesignDocument, MediaAsset } from "@aramayo/design-engine";
import { parseDesignDocument } from "@aramayo/design-engine/validation";

type OpeningLayout =
  | "historia-apertura-cartel"
  | "historia-apertura-horario"
  | "historia-apertura-imagen"
  | "historia-apertura-locales";
type OpeningTheme = "claro" | "promo" | "taller";

export interface RecurringStoryDraft {
  readonly content: Readonly<{ caption: string }>;
  readonly designDocument: DesignDocument;
  readonly id: string;
  readonly locationId?: string;
  readonly title: string;
  readonly version: number;
}

export type RecurringStoryDraftLoadResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; draft: RecurringStoryDraft }>;

export type RecurringStoryDraftSaveResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "saved"; draft: RecurringStoryDraft }>;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function openingLayout(value: unknown): value is OpeningLayout {
  return (
    value === "historia-apertura-cartel" ||
    value === "historia-apertura-horario" ||
    value === "historia-apertura-imagen" ||
    value === "historia-apertura-locales"
  );
}

/**
 * La foto de un borrador de apertura vuelve a la API por su origen: la foto
 * del local por su identificador de marca y la foto propia, embebida. Una URL
 * remota no se puede reenviar como tal: el editor no la ofrece.
 */
function mediaPayload(
  media: MediaAsset,
): Readonly<Record<string, unknown>> | null {
  const framing = {
    alt: media.alt,
    fit: media.fit,
    focus: { x: media.focus.x, y: media.focus.y },
    zoom: media.zoom,
  };
  switch (media.reference.source) {
    case "brand-library":
      return { ...framing, brandAssetId: media.reference.assetId };
    case "inline":
      return { ...framing, dataUrl: media.reference.dataUrl };
    case "remote":
      return null;
  }
}

function openingTheme(value: unknown): value is OpeningTheme {
  return value === "taller" || value === "claro" || value === "promo";
}

function draft(value: unknown): RecurringStoryDraft | null {
  const publication = record(value);
  const revision = record(publication?.["latestRevision"]);
  const content = record(revision?.["content"]);
  const parsedDocument = parseDesignDocument(revision?.["designDocument"]);
  if (
    publication === null ||
    revision === null ||
    content === null ||
    !parsedDocument.ok ||
    !openingLayout(parsedDocument.document.layout) ||
    !openingTheme(parsedDocument.document.theme) ||
    typeof content["caption"] !== "string" ||
    typeof publication["id"] !== "string" ||
    typeof publication["title"] !== "string" ||
    typeof publication["version"] !== "number"
  ) {
    return null;
  }
  return Object.freeze({
    content: Object.freeze({ caption: content["caption"] }),
    designDocument: parsedDocument.document,
    id: publication["id"],
    ...(typeof publication["locationId"] === "string"
      ? { locationId: publication["locationId"] }
      : {}),
    title: publication["title"],
    version: publication["version"],
  });
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

export async function loadRecurringStoryDraft(
  apiBaseUrl: string,
  publicationId: string,
): Promise<RecurringStoryDraftLoadResult> {
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
    const parsed = draft(await payload(response));
    return response.ok && parsed !== null
      ? { kind: "ready", draft: parsed }
      : {
          kind: "error",
          message: "Este borrador no es una historia de apertura editable.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo cargar el borrador recurrente.",
    };
  }
}

export async function saveRecurringStoryDraft(
  apiBaseUrl: string,
  input: RecurringStoryDraft,
): Promise<RecurringStoryDraftSaveResult> {
  const media = input.designDocument.media.map(mediaPayload);
  if (media.some((entry) => entry === null)) {
    return {
      kind: "error",
      message: "La foto de este borrador no se puede conservar al editarlo.",
    };
  }
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`publications/${input.id}`, apiBaseUrl),
      {
        body: JSON.stringify({
          content: { caption: input.content.caption, products: [] },
          design: {
            content: input.designDocument.content,
            format: input.designDocument.format,
            layout: input.designDocument.layout,
            media,
            schemaVersion: input.designDocument.schemaVersion,
            slug: input.designDocument.slug,
            theme: input.designDocument.theme,
          },
          expectedVersion: input.version,
          ...(input.locationId === undefined
            ? {}
            : { locationId: input.locationId }),
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
    const parsed = draft(await payload(response));
    return response.ok && parsed !== null
      ? { kind: "saved", draft: parsed }
      : {
          kind: "error",
          message:
            "No se pudo guardar la revisión. Recargá antes de reintentar.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no confirmó el guardado del borrador.",
    };
  }
}
