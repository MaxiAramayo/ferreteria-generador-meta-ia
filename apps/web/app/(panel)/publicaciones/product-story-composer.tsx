"use client";

import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import { startTransition, useId, useState, type ChangeEvent } from "react";

import { prepareOpeningPhoto } from "../../../lib/opening-photo.ts";
import {
  emptyProductStoryDraft,
  productStoryDocument,
  productStoryFrames,
  productStoryThemes,
  saveProductStoryDraft,
  type ProductStoryDraft,
} from "../../../lib/product-story.ts";
import { OpeningStoryPreview } from "./opening-story-style-controls.tsx";

/**
 * Historia de producto: subís la foto, elegís el marco y escribís lo que la
 * pieza afirma (`ADR-031`).
 *
 * La vista previa usa el mismo motor que renderiza el worker, así que lo que se
 * ve acá es lo que se publica. Guardar deja un borrador: revisar, aprobar y
 * publicar siguen siendo pasos aparte.
 */

const itemSlots = [0, 1, 2] as const;

export function ProductStoryComposer({
  apiBaseUrl,
  canEdit,
  onDraftSaved,
}: Readonly<{
  apiBaseUrl: string;
  canEdit: boolean;
  onDraftSaved: (title: string) => void;
}>) {
  const photoInputId = useId();
  const [draft, setDraft] = useState<ProductStoryDraft>(emptyProductStoryDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string>("");
  const preview = productStoryDocument(draft);

  function change(values: Partial<ProductStoryDraft>): void {
    setDraft((current) => ({ ...current, ...values }));
  }

  function changeItem(index: number, value: string): void {
    setDraft((current) => {
      const items = [...current.items];
      items[index] = value;
      return { ...current, items };
    });
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const [file] = input.files ?? [];
    input.value = "";
    if (file === undefined) return;
    setPhotoStatus("Preparando…");
    void prepareOpeningPhoto(file).then((result) => {
      if (result.kind === "error") {
        setPhotoStatus(result.message);
        return;
      }
      setPhotoStatus("");
      change({ photo: result.photo });
    });
  }

  function save(): void {
    if (!canEdit) {
      setNotice("Tu rol no permite crear borradores.");
      return;
    }
    if (preview.kind !== "ready") {
      setNotice(
        preview.kind === "needs-photo"
          ? "Subí la foto del producto para armar la historia."
          : preview.message,
      );
      return;
    }
    const caption = draft.caption.trim();
    if (caption.length === 0) {
      setNotice("Escribí el texto que acompaña la historia.");
      return;
    }
    setSaving(true);
    setNotice("Guardando borrador…");
    void saveProductStoryDraft(apiBaseUrl, {
      caption,
      document: preview.document,
      idempotencyKey: crypto.randomUUID(),
      title: draft.title.trim(),
    }).then((result) => {
      startTransition(() => {
        setSaving(false);
        if (result.kind === "saved") {
          onDraftSaved(result.title);
          setNotice(`Borrador guardado como “${result.title}”.`);
          return;
        }
        setNotice(
          result.kind === "forbidden"
            ? "La sesión no permite crear borradores."
            : result.message,
        );
      });
    });
  }

  return (
    <section
      aria-label="Compositor de historia de producto"
      className="composer-workbench"
      data-variant="product-story"
    >
      <form
        className="recurring-story-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div>
          <p className="workspace-eyebrow">Historia de producto · Instagram</p>
          <h2>La foto manda. Los datos acompañan.</h2>
          <p>
            Subí la foto del producto, elegí el marco y escribí lo que la pieza
            afirma. El precio se dibuja en la historia; el texto que va debajo
            no lo repite.
          </p>
        </div>

        <div className="opening-photo-control" data-own-image="false">
          <div className="opening-photo-thumb">
            {draft.photo === null ? (
              <span aria-hidden="true" className="opening-photo-thumb-empty">
                9:16
              </span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- es un data URL preparado en el navegador */
              <img
                alt={draft.photo.alt}
                src={draft.photo.dataUrl}
                style={{
                  height: 160,
                  objectFit: "cover",
                  objectPosition: `${String(draft.photo.focusX)}% ${String(draft.photo.focusY)}%`,
                  width: 120,
                }}
              />
            )}
          </div>
          <div className="opening-photo-copy">
            <strong>Foto del producto</strong>
            <small>
              Se prepara en el navegador: se achica, se pasa a JPEG y pierde sus
              metadatos. Arrastrala en la vista previa para acomodarla.
            </small>
            <div className="opening-photo-actions">
              <label
                className="opening-photo-upload"
                data-disabled={String(!canEdit || saving)}
                htmlFor={photoInputId}
              >
                {draft.photo === null ? "Subir foto" : "Cambiar"}
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="opening-photo-input"
                disabled={!canEdit || saving}
                id={photoInputId}
                onChange={choosePhoto}
                type="file"
              />
            </div>
            {draft.photo === null ? null : (
              <div className="opening-photo-framing">
                <label className="opening-photo-zoom">
                  Acercar
                  <input
                    aria-valuetext={`${String(draft.photo.zoom)}%`}
                    disabled={!canEdit || saving}
                    max={250}
                    min={100}
                    onChange={(event) => {
                      const zoom = Number(event.currentTarget.value);
                      setDraft((current) =>
                        current.photo === null
                          ? current
                          : { ...current, photo: { ...current.photo, zoom } },
                      );
                    }}
                    step={5}
                    type="range"
                    value={draft.photo.zoom}
                  />
                </label>
                <button
                  disabled={!canEdit || saving}
                  onClick={() => {
                    setDraft((current) =>
                      current.photo === null
                        ? current
                        : {
                            ...current,
                            photo: {
                              ...current.photo,
                              focusX: 50,
                              focusY: 50,
                              zoom: 100,
                            },
                          },
                    );
                  }}
                  type="button"
                >
                  Centrar
                </button>
              </div>
            )}
            <p aria-live="polite" className="opening-photo-status">
              {photoStatus}
            </p>
          </div>
        </div>

        <fieldset className="opening-style-controls">
          <legend>Marco y color</legend>
          <div
            aria-label="Marco de la historia"
            className="opening-layout-gallery"
            role="radiogroup"
          >
            {productStoryFrames.map((frame) => (
              <label
                className="opening-layout-option"
                data-selected={String(draft.frame === frame.value)}
                key={frame.value}
              >
                <input
                  checked={draft.frame === frame.value}
                  disabled={!canEdit || saving}
                  name="product-story-frame"
                  onChange={() => {
                    change({ frame: frame.value });
                  }}
                  type="radio"
                />
                <span
                  aria-hidden="true"
                  className={`opening-layout-illustration opening-layout-illustration--producto-${frame.value}`}
                >
                  <i />
                  <i />
                  <i />
                </span>
                <span className="opening-layout-option-copy">
                  <strong>{frame.label}</strong>
                  <small>{frame.description}</small>
                </span>
              </label>
            ))}
          </div>
          <label>
            Color
            <select
              disabled={!canEdit || saving}
              onChange={(event) => {
                change({
                  theme: event.currentTarget
                    .value as ProductStoryDraft["theme"],
                });
              }}
              value={draft.theme}
            >
              {productStoryThemes.map((theme) => (
                <option key={theme.value} value={theme.value}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="recurring-draft-fieldset">
          <legend>Lo que dice la pieza</legend>
          <div className="recurring-draft-editor-grid">
            <label className="recurring-draft-full-field">
              Nombre del producto
              <input
                disabled={!canEdit || saving}
                maxLength={90}
                onChange={(event) => {
                  change({ title: event.currentTarget.value });
                }}
                required
                value={draft.title}
              />
            </label>
            <label className="recurring-draft-full-field">
              Línea chica
              <input
                disabled={!canEdit || saving}
                maxLength={150}
                onChange={(event) => {
                  change({ subtitle: event.currentTarget.value });
                }}
                value={draft.subtitle}
              />
            </label>
            <label>
              Rubro
              <input
                disabled={!canEdit || saving}
                maxLength={40}
                onChange={(event) => {
                  change({ category: event.currentTarget.value });
                }}
                value={draft.category}
              />
            </label>
            <label>
              Etiqueta
              <input
                disabled={!canEdit || saving}
                maxLength={40}
                onChange={(event) => {
                  change({ badge: event.currentTarget.value });
                }}
                value={draft.badge}
              />
            </label>
            <label>
              Precio
              <input
                disabled={!canEdit || saving}
                maxLength={40}
                onChange={(event) => {
                  change({ price: event.currentTarget.value });
                }}
                placeholder="$ 48.900"
                value={draft.price}
              />
            </label>
            <label>
              Precio anterior
              <input
                disabled={!canEdit || saving || draft.price.trim() === ""}
                maxLength={40}
                onChange={(event) => {
                  change({ previousPrice: event.currentTarget.value });
                }}
                placeholder="$ 62.400"
                value={draft.previousPrice}
              />
            </label>
            {itemSlots.map((index) => (
              <label key={index}>
                Medida o variante {index + 1}
                <input
                  disabled={!canEdit || saving}
                  maxLength={60}
                  onChange={(event) => {
                    changeItem(index, event.currentTarget.value);
                  }}
                  value={draft.items[index] ?? ""}
                />
              </label>
            ))}
            <label>
              Vigencia
              <input
                disabled={!canEdit || saving}
                maxLength={90}
                onChange={(event) => {
                  change({ validity: event.currentTarget.value });
                }}
                placeholder="Hasta el sábado"
                value={draft.validity}
              />
            </label>
            <label>
              Botón
              <input
                disabled={!canEdit || saving}
                maxLength={40}
                onChange={(event) => {
                  change({ callToAction: event.currentTarget.value });
                }}
                value={draft.callToAction}
              />
            </label>
          </div>
          <p className="opening-style-controls-intro">
            Sin precio, la historia invita a consultarlo. El importe se dibuja
            en la pieza y no se repite en el texto: un precio escrito en el
            caption necesita respaldo del catálogo.
          </p>
        </fieldset>

        <label className="recurring-draft-caption">
          Texto que acompaña
          <textarea
            disabled={!canEdit || saving}
            maxLength={2_200}
            onChange={(event) => {
              change({ caption: event.currentTarget.value });
            }}
            required
            rows={5}
            value={draft.caption}
          />
        </label>

        <div className="recurring-story-actions">
          <p aria-live="polite" role="status">
            {notice ??
              "Guardar deja un borrador: revisar, aprobar y publicar siguen en el listado."}
          </p>
          <button
            className="workspace-primary-action"
            disabled={!canEdit || saving}
            type="submit"
          >
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
        </div>
      </form>

      <OpeningStoryPreview
        caption="Es la misma composición que se renderiza antes de aprobar."
        disabled={!canEdit || saving}
        onPhotoChange={(photo: RecurringStoryPhotoPayload) => {
          change({ photo });
        }}
        photo={draft.photo}
        preview={preview}
      />
    </section>
  );
}
