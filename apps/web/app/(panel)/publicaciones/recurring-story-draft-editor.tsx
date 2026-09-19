"use client";

import type {
  RecurringStoryAccentResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryPhotoPayload,
  RecurringStoryThemeResponse,
} from "@aramayo/contracts";
import type {
  DesignContent,
  DesignDocument,
  MediaAsset,
} from "@aramayo/design-engine";
import { openingStoryDefaultPhoto } from "@aramayo/domain";
import { startTransition, useEffect, useState } from "react";

import {
  loadRecurringStoryDraft,
  saveRecurringStoryDraft,
  type RecurringStoryDraft,
} from "../../../lib/recurring-story-draft-api.ts";
import {
  OpeningStoryPreview,
  OpeningStoryStyleControls,
} from "./opening-story-style-controls.tsx";

type EditorState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; draft: RecurringStoryDraft; notice?: string }>;

const openingLayouts = Object.freeze({
  cartel: "historia-apertura-cartel",
  horario: "historia-apertura-horario",
  imagen: "historia-apertura-imagen",
  locales: "historia-apertura-locales",
} as const);

/** Foto del local: la misma que usa el borrador de una regla sin foto propia. */
const storePhotoMedia: MediaAsset = Object.freeze({
  alt: openingStoryDefaultPhoto.alt,
  fit: "cover",
  focus: Object.freeze({ x: 50, y: 50 }),
  reference: Object.freeze({
    assetId: openingStoryDefaultPhoto.assetId,
    source: "brand-library" as const,
  }),
  zoom: 1,
});

function layoutVariant(
  document: DesignDocument,
): RecurringStoryDesignVariantResponse {
  if (document.layout === openingLayouts.horario) return "horario";
  if (document.layout === openingLayouts.locales) return "locales";
  if (document.layout === openingLayouts.imagen) return "imagen";
  return "cartel";
}

function recurringTheme(document: DesignDocument): RecurringStoryThemeResponse {
  return document.theme === "claro" || document.theme === "promo"
    ? document.theme
    : "taller";
}

/** La foto propia del borrador; `null` si usa la del local. */
function draftPhoto(
  document: DesignDocument,
): RecurringStoryPhotoPayload | null {
  const [media] = document.media;
  return media?.reference.source === "inline"
    ? {
        alt: media.alt,
        dataUrl: media.reference.dataUrl,
        focusY: media.focus.y,
      }
    : null;
}

function photoMedia(photo: RecurringStoryPhotoPayload | null): MediaAsset {
  return photo === null
    ? storePhotoMedia
    : {
        alt: photo.alt,
        fit: "cover",
        focus: { x: 50, y: photo.focusY },
        reference: { dataUrl: photo.dataUrl, source: "inline" },
        zoom: 1,
      };
}

function editableText(value: string | undefined): string {
  return value ?? "";
}

type OptionalTextField = "badge" | "greeting" | "subtitle" | "validity";

/** Un campo vacío se quita: el motor rechaza un texto opcional en blanco. */
function withOptionalText(
  content: DesignContent,
  field: OptionalTextField,
  value: string,
): DesignContent {
  const next: { -readonly [Key in keyof DesignContent]: DesignContent[Key] } = {
    ...content,
  };
  if (value.trim().length > 0) {
    next[field] = value;
    return next;
  }
  switch (field) {
    case "badge":
      delete next.badge;
      break;
    case "greeting":
      delete next.greeting;
      break;
    case "subtitle":
      delete next.subtitle;
      break;
    case "validity":
      delete next.validity;
      break;
  }
  return next;
}

export function RecurringStoryDraftEditor({
  apiBaseUrl,
  onClose,
  onSaved,
  publicationId,
}: Readonly<{
  apiBaseUrl: string;
  onClose: () => void;
  onSaved: () => void;
  publicationId: string;
}>) {
  const [state, setState] = useState<EditorState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void loadRecurringStoryDraft(apiBaseUrl, publicationId).then((result) => {
      if (!active) return;
      setState(
        result.kind === "ready"
          ? { kind: "ready", draft: result.draft }
          : result,
      );
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, publicationId]);

  if (state.kind === "loading") {
    return <p className="recurring-draft-editor">Cargando borrador…</p>;
  }
  if (state.kind === "forbidden") {
    return (
      <p className="recurring-draft-editor" role="alert">
        Tu sesión no permite editar este borrador.
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className="recurring-draft-editor" role="alert">
        {state.message}
      </p>
    );
  }

  const draft = state.draft;
  const content = draft.designDocument.content;
  const items = content.items ?? [];
  const designVariant = layoutVariant(draft.designDocument);
  const photo = draftPhoto(draft.designDocument);
  const ownImage = designVariant === "imagen";
  const accent: RecurringStoryAccentResponse = content.accent ?? "marca";

  const updateDocument = (
    change: (document: DesignDocument) => DesignDocument,
  ): void => {
    setState((current) =>
      current.kind === "ready"
        ? {
            kind: "ready",
            draft: {
              ...current.draft,
              designDocument: change(current.draft.designDocument),
            },
          }
        : current,
    );
  };
  const update = (change: Partial<DesignContent>): void => {
    updateDocument((document) => ({
      ...document,
      content: { ...document.content, ...change },
    }));
  };
  const updateOptional = (field: OptionalTextField, value: string): void => {
    updateDocument((document) => ({
      ...document,
      content: withOptionalText(document.content, field, value),
    }));
  };
  const save = (): void => {
    if (ownImage && photo === null) {
      setState({
        draft,
        kind: "ready",
        notice:
          "Subí la imagen que querés publicar: «Imagen propia» no tiene otra cosa que mostrar.",
      });
      return;
    }
    setSaving(true);
    void saveRecurringStoryDraft(apiBaseUrl, draft).then((result) => {
      startTransition(() => {
        setSaving(false);
        if (result.kind === "saved") {
          setState({ kind: "ready", draft: result.draft });
          onSaved();
          return;
        }
        setState(result);
      });
    });
  };

  return (
    <section
      aria-labelledby="recurring-draft-editor-title"
      className="recurring-draft-editor"
    >
      <div>
        <p className="workspace-eyebrow">Antes de aprobar</p>
        <h2 id="recurring-draft-editor-title">Editá lo que verá tu cliente.</h2>
        <p>
          Cambiá el mensaje, los datos, la foto, el diseño o el color. Guardar
          crea una nueva revisión; generar, aprobar y publicar siguen siendo
          pasos separados.
        </p>
      </div>
      <div className="recurring-draft-editor-workbench">
        <div className="recurring-draft-editor-fields">
          <label>
            Título interno
            <input
              maxLength={180}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setState((current) =>
                  current.kind === "ready"
                    ? { kind: "ready", draft: { ...current.draft, title } }
                    : current,
                );
              }}
              value={draft.title}
            />
          </label>
          <OpeningStoryStyleControls
            accent={accent}
            designVariant={designVariant}
            inputName={`draft-${publicationId}`}
            onAccentChange={(nextAccent) => {
              update({ accent: nextAccent });
            }}
            onDesignVariantChange={(nextVariant) => {
              updateDocument((document) => ({
                ...document,
                layout: openingLayouts[nextVariant],
              }));
            }}
            onPhotoChange={(nextPhoto) => {
              updateDocument((document) => ({
                ...document,
                media: [photoMedia(nextPhoto)],
              }));
            }}
            onThemeChange={(nextTheme) => {
              updateDocument((document) => ({ ...document, theme: nextTheme }));
            }}
            photo={photo}
            theme={recurringTheme(draft.designDocument)}
          />
          {ownImage ? (
            <p className="recurring-draft-own-image-note">
              La imagen propia se publica tal cual: los textos de abajo no se
              dibujan, pero se conservan si volvés a un diseño.
            </p>
          ) : null}
          <fieldset className="recurring-draft-fieldset" disabled={ownImage}>
            <legend>Mensaje</legend>
            <div className="recurring-draft-editor-grid">
              <label>
                Titular
                <input
                  maxLength={90}
                  onChange={(event) => {
                    update({ title: event.currentTarget.value });
                  }}
                  value={content.title}
                />
              </label>
              <label>
                Saludo
                <input
                  maxLength={26}
                  onChange={(event) => {
                    updateOptional("greeting", event.currentTarget.value);
                  }}
                  value={editableText(content.greeting)}
                />
              </label>
              <label>
                Etiqueta
                <input
                  maxLength={40}
                  onChange={(event) => {
                    updateOptional("badge", event.currentTarget.value);
                  }}
                  value={editableText(content.badge)}
                />
              </label>
              <label>
                Botón
                <input
                  maxLength={40}
                  onChange={(event) => {
                    update({ callToAction: event.currentTarget.value });
                  }}
                  value={editableText(content.callToAction)}
                />
              </label>
              <label className="recurring-draft-full-field">
                Texto
                <textarea
                  maxLength={150}
                  onChange={(event) => {
                    updateOptional("subtitle", event.currentTarget.value);
                  }}
                  rows={3}
                  value={editableText(content.subtitle)}
                />
              </label>
            </div>
          </fieldset>
          <fieldset
            className="recurring-draft-items recurring-draft-fieldset"
            disabled={ownImage}
          >
            <legend>Datos que se ven en la historia</legend>
            <p>
              Vienen de la configuración de cada sucursal. Confirmalos antes de
              guardar: se vuelven a renderizar en la pieza.
            </p>
            <div className="recurring-draft-editor-grid">
              {[0, 1, 2].map((index) => (
                <label key={index}>
                  Sucursal {index + 1}
                  <input
                    maxLength={60}
                    onChange={(event) => {
                      const nextItems = [...items];
                      nextItems[index] = event.currentTarget.value;
                      update({
                        items: nextItems.filter((item) => item.trim() !== ""),
                      });
                    }}
                    value={items[index] ?? ""}
                  />
                </label>
              ))}
              <label className="recurring-draft-full-field">
                Horario
                <input
                  maxLength={90}
                  onChange={(event) => {
                    updateOptional("validity", event.currentTarget.value);
                  }}
                  value={editableText(content.validity)}
                />
              </label>
            </div>
          </fieldset>
          <label className="recurring-draft-caption">
            Caption
            <textarea
              maxLength={2_200}
              onChange={(event) => {
                const caption = event.currentTarget.value;
                setState((current) =>
                  current.kind === "ready"
                    ? {
                        kind: "ready",
                        draft: { ...current.draft, content: { caption } },
                      }
                    : current,
                );
              }}
              value={draft.content.caption}
            />
          </label>
        </div>
        <OpeningStoryPreview
          caption="Es la misma composición que se renderiza antes de aprobar."
          heading="Cambios en vivo"
          preview={{ document: draft.designDocument, kind: "ready" }}
        />
      </div>
      <div className="recurring-draft-editor-actions">
        <p aria-live="polite" role="status">
          {state.notice ?? ""}
        </p>
        <button disabled={saving} onClick={onClose} type="button">
          Cerrar
        </button>
        <button disabled={saving} onClick={save} type="button">
          {saving ? "Guardando…" : "Guardar revisión"}
        </button>
      </div>
    </section>
  );
}
