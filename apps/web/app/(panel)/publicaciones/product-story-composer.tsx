"use client";

import type { RecurringStoryPhotoPayload } from "@aramayo/contracts";
import { DesignPiece } from "@aramayo/design-engine/react";
import {
  startTransition,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import { prepareOpeningPhoto } from "../../../lib/opening-photo.ts";
import {
  emptyProductStoryDraft,
  frameShows,
  productFrameThumbnail,
  productStoryBrands,
  productStoryDocument,
  productStoryFormats,
  productStoryFrames,
  productStoryPriceModes,
  saveProductStoryDraft,
  type ProductStoryDraft,
} from "../../../lib/product-story.ts";
import {
  OpeningStoryPreview,
  openingPreviewContext,
} from "./opening-story-style-controls.tsx";

/**
 * Producto con foto propia, en post o historia (`ADR-033`): subís la foto,
 * elegís el marco según dónde quedó el producto y decidís qué se ve.
 *
 * La vista previa y las miniaturas usan el mismo motor que renderiza el
 * worker, así que lo que se ve acá es lo que se publica. Guardar deja un
 * borrador: revisar, aprobar y publicar siguen siendo pasos aparte.
 */

const itemSlots = [0, 1, 2] as const;

/** Aviso junto a un campo que el marco elegido no dibuja. */
function NotInFrame({ shown }: Readonly<{ shown: boolean }>) {
  return shown ? null : (
    <small className="product-field-note">Este marco no lo muestra.</small>
  );
}

export function ProductStoryComposer({
  apiBaseUrl,
  canEdit,
  onDraftSaved,
}: Readonly<{
  apiBaseUrl: string;
  canEdit: boolean;
  onDraftSaved: (publication: Readonly<{ id: string; title: string }>) => void;
}>) {
  const photoInputId = useId();
  const [draft, setDraft] = useState<ProductStoryDraft>(emptyProductStoryDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string>("");
  const preview = productStoryDocument(draft);
  // Cada miniatura vuelve a validar la foto embebida: se calculan con el
  // borrador diferido para que escribir no espere a las siete.
  const deferredDraft = useDeferredValue(draft);
  const thumbnails = useMemo(
    () =>
      new Map(
        productStoryFrames.map((frame) => [
          frame.value,
          productFrameThumbnail(deferredDraft, frame.value),
        ]),
      ),
    [deferredDraft],
  );
  const locked = !canEdit || saving;
  const shows = (field: Parameters<typeof frameShows>[1]): boolean =>
    frameShows(draft.frame, field);
  const format = productStoryFormats.find(
    (candidate) => candidate.value === draft.format,
  );

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
          ? "Subí la foto del producto para armar la pieza."
          : preview.message,
      );
      return;
    }
    const caption = draft.caption.trim();
    if (caption.length === 0) {
      setNotice("Escribí el texto que acompaña la publicación.");
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
          onDraftSaved(result.publication);
          setNotice(`Borrador guardado como “${result.publication.title}”.`);
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
      aria-label="Compositor de producto con foto propia"
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
          <p className="workspace-eyebrow">Producto · Instagram</p>
          <h2>La foto manda. Vos elegís qué se ve.</h2>
          <p>
            Subí la foto, elegí el marco que no tapa el producto y marcá qué
            dice la pieza. El precio se dibuja en la pieza; el texto que va
            debajo no lo repite.
          </p>
        </div>

        <div className="opening-photo-control" data-own-image="false">
          <div className="opening-photo-thumb">
            {draft.photo === null ? (
              <span aria-hidden="true" className="opening-photo-thumb-empty">
                {format?.ratio ?? "9:16"}
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
                data-disabled={String(locked)}
                htmlFor={photoInputId}
              >
                {draft.photo === null ? "Subir foto" : "Cambiar"}
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="opening-photo-input"
                disabled={locked}
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
                    disabled={locked}
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
                  disabled={locked}
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
          <legend>Formato y marca</legend>
          <div className="product-choice-row">
            <div
              aria-label="Formato de la pieza"
              className="product-segmented"
              role="radiogroup"
            >
              {productStoryFormats.map((option) => (
                <label
                  data-selected={String(draft.format === option.value)}
                  key={option.value}
                >
                  <input
                    checked={draft.format === option.value}
                    disabled={locked}
                    name="product-format"
                    onChange={() => {
                      change({ format: option.value });
                    }}
                    type="radio"
                  />
                  {option.label}
                  <small>{option.ratio}</small>
                </label>
              ))}
            </div>
            <div
              aria-label="Marca del cartel"
              className="product-segmented"
              role="radiogroup"
            >
              {productStoryBrands.map((option) => (
                <label
                  data-selected={String(draft.brand === option.value)}
                  key={option.value}
                >
                  <input
                    checked={draft.brand === option.value}
                    disabled={locked}
                    name="product-brand"
                    onChange={() => {
                      change({ brand: option.value });
                    }}
                    type="radio"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="opening-style-controls">
          <legend>Marco</legend>
          <p className="opening-style-controls-intro">
            Elegí el que deja libre el producto. Cada miniatura es la pieza de
            verdad, con tu foto y tus datos.
          </p>
          <div
            aria-label="Marco de la pieza"
            className="opening-layout-gallery product-frame-gallery"
            role="radiogroup"
          >
            {productStoryFrames.map((frame) => {
              const thumbnail = thumbnails.get(frame.value) ?? null;
              return (
                <label
                  className="opening-layout-option"
                  data-selected={String(draft.frame === frame.value)}
                  key={frame.value}
                >
                  <input
                    checked={draft.frame === frame.value}
                    disabled={locked}
                    name="product-frame"
                    onChange={() => {
                      change({ frame: frame.value });
                    }}
                    type="radio"
                  />
                  <span
                    aria-hidden="true"
                    className="product-frame-thumb"
                    data-format={draft.format}
                  >
                    {thumbnail === null ? null : (
                      <DesignPiece
                        context={openingPreviewContext}
                        document={thumbnail}
                      />
                    )}
                  </span>
                  <span className="opening-layout-option-copy">
                    <strong>{frame.label}</strong>
                    <small>{frame.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="recurring-draft-fieldset">
          <legend>Qué muestra la pieza</legend>
          <div className="recurring-draft-editor-grid">
            <label className="recurring-draft-full-field">
              Nombre del producto
              <input
                disabled={locked}
                maxLength={90}
                onChange={(event) => {
                  change({ title: event.currentTarget.value });
                }}
                required
                value={draft.title}
              />
            </label>
            <label className="product-toggle recurring-draft-full-field">
              <input
                checked={draft.showTitle}
                disabled={locked}
                onChange={(event) => {
                  change({ showTitle: event.currentTarget.checked });
                }}
                type="checkbox"
              />
              Mostrar el nombre en la pieza
              <small>
                Si lo apagás, el nombre sólo identifica el borrador.
              </small>
            </label>
            <label className="recurring-draft-full-field">
              Descripción
              <input
                disabled={locked || !shows("subtitle")}
                maxLength={150}
                onChange={(event) => {
                  change({ subtitle: event.currentTarget.value });
                }}
                placeholder="Una línea: para qué sirve o qué trae"
                value={draft.subtitle}
              />
              <NotInFrame shown={shows("subtitle")} />
            </label>

            <fieldset className="product-price-fieldset recurring-draft-full-field">
              <legend>Precio</legend>
              <div
                aria-label="Qué dice la pieza del precio"
                className="product-segmented"
                role="radiogroup"
              >
                {productStoryPriceModes.map((option) => (
                  <label
                    data-selected={String(draft.priceMode === option.value)}
                    key={option.value}
                  >
                    <input
                      checked={draft.priceMode === option.value}
                      disabled={locked}
                      name="product-price-mode"
                      onChange={() => {
                        change({ priceMode: option.value });
                      }}
                      type="radio"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {draft.priceMode === "amount" ? (
                <div className="product-price-fields">
                  <label>
                    Precio
                    <input
                      disabled={locked}
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
                      disabled={locked || draft.price.trim() === ""}
                      maxLength={40}
                      onChange={(event) => {
                        change({ previousPrice: event.currentTarget.value });
                      }}
                      placeholder="$ 62.400"
                      value={draft.previousPrice}
                    />
                  </label>
                  <label>
                    Unidad
                    <input
                      disabled={locked || draft.price.trim() === ""}
                      maxLength={20}
                      onChange={(event) => {
                        change({ priceUnit: event.currentTarget.value });
                      }}
                      placeholder="el metro, c/u"
                      value={draft.priceUnit}
                    />
                  </label>
                </div>
              ) : null}
            </fieldset>

            <label>
              Etiqueta
              <input
                disabled={locked || !shows("badge")}
                maxLength={30}
                onChange={(event) => {
                  change({ badge: event.currentTarget.value });
                }}
                placeholder="Oferta, Recién llegado"
                value={draft.badge}
              />
              <NotInFrame shown={shows("badge")} />
            </label>
            <label>
              Vigencia
              <input
                disabled={locked || !shows("validity")}
                maxLength={60}
                onChange={(event) => {
                  change({ validity: event.currentTarget.value });
                }}
                placeholder="Hasta el sábado"
                value={draft.validity}
              />
              <NotInFrame shown={shows("validity")} />
            </label>
            {itemSlots.map((index) => (
              <label key={index}>
                Medida o variante {index + 1}
                <input
                  disabled={locked || !shows("items")}
                  maxLength={40}
                  onChange={(event) => {
                    changeItem(index, event.currentTarget.value);
                  }}
                  value={draft.items[index] ?? ""}
                />
                {index === 0 ? <NotInFrame shown={shows("items")} /> : null}
              </label>
            ))}
            <label className="product-toggle recurring-draft-full-field">
              <input
                checked={draft.showButton}
                disabled={locked}
                onChange={(event) => {
                  change({ showButton: event.currentTarget.checked });
                }}
                type="checkbox"
              />
              Mostrar el botón con el teléfono
            </label>
            <label className="recurring-draft-full-field">
              Texto del botón
              <input
                disabled={locked || !draft.showButton}
                maxLength={40}
                onChange={(event) => {
                  change({ callToAction: event.currentTarget.value });
                }}
                value={draft.callToAction}
              />
            </label>
          </div>
          <p className="opening-style-controls-intro">
            Lo que dejás vacío no aparece y el marco se acomoda. El importe se
            dibuja en la pieza y no se repite en el texto: un precio escrito en
            el caption necesita respaldo del catálogo.
          </p>
        </fieldset>

        <label className="recurring-draft-caption">
          Texto que acompaña
          <textarea
            disabled={locked}
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
            disabled={locked}
            type="submit"
          >
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
        </div>
      </form>

      <OpeningStoryPreview
        caption="Es la misma composición que se renderiza antes de aprobar."
        disabled={locked}
        formatLabel={
          format === undefined ? undefined : `${format.label} · ${format.ratio}`
        }
        onPhotoChange={(photo: RecurringStoryPhotoPayload) => {
          change({ photo });
        }}
        photo={draft.photo}
        preview={preview}
      />
    </section>
  );
}
