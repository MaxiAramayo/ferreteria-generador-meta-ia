import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import type {
  RecurringStoryAccentResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryPhotoPayload,
  RecurringStoryThemeResponse,
} from "@aramayo/contracts";
import { isDesignEngineError } from "@aramayo/design-engine";
import {
  assertTextFits,
  DesignPiece,
  type LayoutContext,
} from "@aramayo/design-engine/react";
import Image from "next/image";
import { useId, useState, type ChangeEvent } from "react";

import { prepareOpeningPhoto } from "../../../lib/opening-photo.ts";
import type { OpeningStoryPreview as OpeningPreviewResult } from "../../../lib/opening-story-preview.ts";

/**
 * Mismo contexto de marca que el worker usa para renderizar: la vista previa
 * muestra el teléfono y la localidad que va a publicar la historia.
 */
export const openingPreviewContext: LayoutContext = Object.freeze({
  assetBaseUrl: "/media",
  brand: ARAMAYO_BRAND_PROFILE,
});

/** Foto del local que usa una regla sin foto propia. */
const storePhotoUrl = "/media/brand/interior-herramientas.jpg";

export const openingStoryVariants = Object.freeze([
  {
    description: "La foto cruza la historia y los datos van abajo.",
    label: "Cartel de apertura",
    value: "cartel",
  },
  {
    description: "La foto como esfera de reloj y el horario grande.",
    label: "Horario en foco",
    value: "horario",
  },
  {
    description: "Foto pegada como copia impresa y una chapa por sucursal.",
    label: "Sucursales en foco",
    value: "locales",
  },
  {
    description: "Subís una historia ya armada y se publica tal cual.",
    label: "Imagen propia",
    value: "imagen",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly label: string;
  readonly value: RecurringStoryDesignVariantResponse;
}[]);

export const openingStoryThemes = Object.freeze([
  {
    description: "Fondo oscuro, amarillo de señal y rojo Aramayo.",
    label: "Taller",
    value: "taller",
  },
  {
    description: "Fondo claro, lectura serena y detalle óxido.",
    label: "Claro",
    value: "claro",
  },
  {
    description: "Rojo Aramayo, como el cartel del local.",
    label: "Rojo Aramayo",
    value: "promo",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly label: string;
  readonly value: RecurringStoryThemeResponse;
}[]);

export const openingStoryAccents = Object.freeze([
  {
    description: "Los colores del tema elegido.",
    label: "Colores de la marca",
    value: "marca",
  },
  {
    description: "Amarillo de señal con texto oscuro.",
    label: "Amarillo",
    value: "senal",
  },
  {
    description: "Verde de «abierto» y WhatsApp.",
    label: "Verde",
    value: "verde",
  },
] as const satisfies readonly {
  readonly description: string;
  readonly label: string;
  readonly value: RecurringStoryAccentResponse;
}[]);

export function openingStoryVariantLabel(
  variant: RecurringStoryDesignVariantResponse,
): string {
  return (
    openingStoryVariants.find((candidate) => candidate.value === variant)
      ?.label ?? "Diseño de apertura"
  );
}

/**
 * Un texto que no entra detiene el render del worker: la vista previa lo dice
 * con el campo en vez de romper la pantalla.
 */
function overflowMessage(preview: OpeningPreviewResult): string | null {
  if (preview.kind !== "ready") return null;
  try {
    assertTextFits(preview.document);
    return null;
  } catch (cause: unknown) {
    if (isDesignEngineError(cause) && cause.failure.stage === "content") {
      const fields = cause.failure.issues.map(({ path }) =>
        path.replace("content.", ""),
      );
      return `Hay texto que no entra en la historia (${fields.join(", ")}). Acortalo antes de aprobar.`;
    }
    throw cause;
  }
}

export function OpeningStoryPreview({
  caption,
  heading = "Vista real",
  preview,
}: Readonly<{
  caption: string;
  heading?: string;
  preview: OpeningPreviewResult;
}>) {
  const overflow = overflowMessage(preview);
  return (
    <aside
      aria-label="Vista previa real de la historia"
      className="recurring-story-engine-preview"
    >
      <div className="recurring-story-preview-heading">
        <span>{heading}</span>
        <small>Historia · 9:16</small>
      </div>
      {preview.kind === "ready" && overflow === null ? (
        <div className="recurring-story-engine-scale">
          <DesignPiece
            context={openingPreviewContext}
            document={preview.document}
          />
        </div>
      ) : (
        <div className="recurring-story-preview-empty" role="status">
          {preview.kind === "needs-photo"
            ? "Subí la imagen que querés publicar para verla acá."
            : preview.kind === "blocked"
              ? preview.message
              : overflow}
        </div>
      )}
      <p>{caption}</p>
    </aside>
  );
}

/**
 * Foto de la historia.
 *
 * Sin foto propia, la historia usa la del local. La foto se prepara en el
 * navegador antes de guardarse: se achica, se pasa a JPEG y pierde sus
 * metadatos.
 */
function OpeningPhotoControl({
  designVariant,
  disabled,
  onPhotoChange,
  photo,
}: Readonly<{
  designVariant: RecurringStoryDesignVariantResponse;
  disabled: boolean;
  onPhotoChange: (photo: RecurringStoryPhotoPayload | null) => void;
  photo: RecurringStoryPhotoPayload | null;
}>) {
  const inputId = useId();
  const [status, setStatus] = useState<
    | Readonly<{ kind: "idle" }>
    | Readonly<{ kind: "preparing" }>
    | Readonly<{ kind: "error"; message: string }>
  >({ kind: "idle" });
  const ownImage = designVariant === "imagen";

  function choose(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const [file] = input.files ?? [];
    // Vaciar el campo deja elegir de nuevo el mismo archivo.
    input.value = "";
    if (file === undefined) return;
    setStatus({ kind: "preparing" });
    void prepareOpeningPhoto(file).then((result) => {
      if (result.kind === "error") {
        setStatus(result);
        return;
      }
      setStatus({ kind: "idle" });
      onPhotoChange(result.photo);
    });
  }

  return (
    <div className="opening-photo-control" data-own-image={String(ownImage)}>
      <div className="opening-photo-thumb">
        {photo === null ? (
          ownImage ? (
            <span aria-hidden="true" className="opening-photo-thumb-empty">
              9:16
            </span>
          ) : (
            <Image
              alt="Foto del local"
              height={160}
              src={storePhotoUrl}
              unoptimized
              width={120}
            />
          )
        ) : (
          <Image
            alt={photo.alt}
            height={160}
            src={photo.dataUrl}
            style={{ objectPosition: `50% ${String(photo.focusY)}%` }}
            unoptimized
            width={120}
          />
        )}
      </div>
      <div className="opening-photo-copy">
        <strong>{ownImage ? "Imagen de la historia" : "Foto"}</strong>
        <small>
          {ownImage
            ? "Subí la historia completa, en vertical. Se publica tal cual y siempre pide tu aprobación."
            : photo === null
              ? "Ahora usa la foto del local. Subí la tuya, por ejemplo la mascota en el mostrador."
              : "Foto propia. El horario, las direcciones y el teléfono los escribe el sistema."}
        </small>
        <div className="opening-photo-actions">
          <label
            className="opening-photo-upload"
            data-disabled={String(disabled || status.kind === "preparing")}
            htmlFor={inputId}
          >
            {status.kind === "preparing"
              ? "Preparando…"
              : photo === null
                ? ownImage
                  ? "Subir imagen"
                  : "Subir foto"
                : "Cambiar"}
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="opening-photo-input"
            disabled={disabled || status.kind === "preparing"}
            id={inputId}
            onChange={choose}
            type="file"
          />
          {photo === null || ownImage ? null : (
            <button
              disabled={disabled}
              onClick={() => {
                onPhotoChange(null);
              }}
              type="button"
            >
              Usar la del local
            </button>
          )}
        </div>
        {photo === null ? null : (
          <label className="opening-photo-focus">
            Encuadre vertical
            <input
              aria-valuetext={`${String(photo.focusY)}% desde arriba`}
              disabled={disabled}
              max={100}
              min={0}
              onChange={(event) => {
                onPhotoChange({
                  ...photo,
                  focusY: Number(event.currentTarget.value),
                });
              }}
              step={5}
              type="range"
              value={photo.focusY}
            />
          </label>
        )}
        <p aria-live="polite" className="opening-photo-status">
          {status.kind === "error" ? status.message : ""}
        </p>
      </div>
    </div>
  );
}

export function OpeningStoryStyleControls({
  accent,
  designVariant,
  disabled = false,
  inputName,
  onAccentChange,
  onDesignVariantChange,
  onPhotoChange,
  onThemeChange,
  photo,
  theme,
}: Readonly<{
  accent: RecurringStoryAccentResponse;
  designVariant: RecurringStoryDesignVariantResponse;
  disabled?: boolean;
  inputName: string;
  onAccentChange: (accent: RecurringStoryAccentResponse) => void;
  onDesignVariantChange: (variant: RecurringStoryDesignVariantResponse) => void;
  onPhotoChange: (photo: RecurringStoryPhotoPayload | null) => void;
  onThemeChange: (theme: RecurringStoryThemeResponse) => void;
  photo: RecurringStoryPhotoPayload | null;
  theme: RecurringStoryThemeResponse;
}>) {
  const ownImage = designVariant === "imagen";

  return (
    <fieldset className="opening-style-controls">
      <legend>Diseño, color y foto</legend>
      <p className="opening-style-controls-intro">
        Elegí cómo se arma la historia, su color y la foto. La vista previa usa
        el mismo motor que la publica, no una maqueta aproximada.
      </p>
      <div
        aria-label="Composición de la historia"
        className="opening-layout-gallery"
        role="radiogroup"
      >
        {openingStoryVariants.map((variant) => (
          <label
            className="opening-layout-option"
            data-selected={String(designVariant === variant.value)}
            key={variant.value}
          >
            <input
              checked={designVariant === variant.value}
              disabled={disabled}
              name={`${inputName}-layout`}
              onChange={() => {
                onDesignVariantChange(variant.value);
              }}
              type="radio"
            />
            <span
              aria-hidden="true"
              className={`opening-layout-illustration opening-layout-illustration--${variant.value}`}
            >
              <i />
              <i />
              <i />
            </span>
            <span className="opening-layout-option-copy">
              <strong>{variant.label}</strong>
              <small>{variant.description}</small>
            </span>
          </label>
        ))}
      </div>
      <OpeningPhotoControl
        designVariant={designVariant}
        disabled={disabled}
        onPhotoChange={onPhotoChange}
        photo={photo}
      />
      {ownImage ? (
        <p className="opening-style-controls-intro">
          La imagen propia no usa el color ni los textos del sistema. El caption
          sí sale del horario vigente de cada sucursal.
        </p>
      ) : (
        <>
          <div
            aria-label="Color de marca y fondo"
            className="opening-theme-options"
            role="radiogroup"
          >
            {openingStoryThemes.map((candidate) => (
              <label
                className="opening-theme-option"
                data-selected={String(theme === candidate.value)}
                data-theme={candidate.value}
                key={candidate.value}
              >
                <input
                  checked={theme === candidate.value}
                  disabled={disabled}
                  name={`${inputName}-theme`}
                  onChange={() => {
                    onThemeChange(candidate.value);
                  }}
                  type="radio"
                />
                <span aria-hidden="true" className="opening-theme-swatch">
                  <i />
                  <i />
                </span>
                <span>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.description}</small>
                </span>
              </label>
            ))}
          </div>
          <div
            aria-label="Color de la etiqueta y del botón"
            className="opening-accent-options"
            role="radiogroup"
          >
            {openingStoryAccents.map((candidate) => (
              <label
                className="opening-theme-option opening-accent-option"
                data-accent={candidate.value}
                data-selected={String(accent === candidate.value)}
                key={candidate.value}
              >
                <input
                  checked={accent === candidate.value}
                  disabled={disabled}
                  name={`${inputName}-accent`}
                  onChange={() => {
                    onAccentChange(candidate.value);
                  }}
                  type="radio"
                />
                <span aria-hidden="true" className="opening-accent-swatch" />
                <span>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.description}</small>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
