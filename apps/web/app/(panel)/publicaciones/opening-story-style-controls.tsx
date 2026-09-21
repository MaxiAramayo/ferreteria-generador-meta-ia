import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import type {
  RecurringStoryAccentResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryKindResponse,
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
import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  clampFramingPercentage,
  defaultOpeningPhotoFraming,
  framingAfterDrag,
  prepareOpeningPhoto,
} from "../../../lib/opening-photo.ts";
import type { OpeningStoryPreview as OpeningPreviewResult } from "../../../lib/opening-story-preview.ts";

/**
 * Mismo contexto de marca que el worker usa para renderizar: la vista previa
 * muestra el teléfono y la localidad que va a publicar la historia.
 */
export const openingPreviewContext: LayoutContext = Object.freeze({
  assetBaseUrl: "/media",
  brand: ARAMAYO_BRAND_PROFILE,
});

/** Foto que usa una regla sin foto propia, según la historia. */
const defaultPhotoUrls: Readonly<Record<RecurringStoryKindResponse, string>> =
  Object.freeze({
    apertura: "/media/brand/interior-herramientas.jpg",
    lubricentro: "/media/brand/lubricentro-filtros.jpg",
  });

interface StoryOption<TValue> {
  readonly description: string;
  readonly label: string;
  readonly value: TValue;
}

export const recurringStoryKinds = Object.freeze([
  {
    description: "«Ya abrimos» con los rubros, las sucursales y el horario.",
    label: "Apertura",
    value: "apertura",
  },
  {
    description: "«¿Toca el service?» con los servicios del lubricentro.",
    label: "Lubricentro",
    value: "lubricentro",
  },
] as const satisfies readonly StoryOption<RecurringStoryKindResponse>[]);

/**
 * Marcos de cada historia.
 *
 * Cada uno deja libre una zona distinta de la foto: quien opera elige el que no
 * tapa lo que importa de la suya y la acomoda arrastrándola en la vista previa.
 */
const frames: Readonly<
  Record<
    RecurringStoryKindResponse,
    readonly StoryOption<RecurringStoryDesignVariantResponse>[]
  >
> = Object.freeze({
  apertura: Object.freeze([
    {
      description: "La foto cruza la historia y los datos van abajo.",
      label: "Foto al medio",
      value: "cartel",
    },
    {
      description:
        "La foto entera, con los datos en una tarjeta abajo del todo.",
      label: "Datos abajo",
      value: "placa",
    },
    {
      description:
        "Los datos en una tarjeta; la foto queda libre a la izquierda.",
      label: "Tarjeta a la derecha",
      value: "esquina",
    },
    {
      description: "Subís una historia ya armada y se publica tal cual.",
      label: "Imagen propia",
      value: "imagen",
    },
  ] as const),
  lubricentro: Object.freeze([
    {
      description: "La foto enmarcada en amarillo y los datos abajo.",
      label: "Foto enmarcada",
      value: "ventana",
    },
    {
      description:
        "La foto entera, con los datos en una tarjeta abajo del todo.",
      label: "Datos abajo",
      value: "placa",
    },
    {
      description:
        "Los datos en una tarjeta; la foto queda libre a la izquierda.",
      label: "Tarjeta a la derecha",
      value: "esquina",
    },
    {
      description: "Subís una historia ya armada y se publica tal cual.",
      label: "Imagen propia",
      value: "imagen",
    },
  ] as const),
});

/** Marcos anteriores: hoy componen igual que «Foto al medio» (`ADR-030`). */
const legacyFrames: readonly StoryOption<RecurringStoryDesignVariantResponse>[] =
  Object.freeze([
    {
      description: "Diseño anterior; hoy se compone como «Foto al medio».",
      label: "Horario en foco",
      value: "horario",
    },
    {
      description: "Diseño anterior; hoy se compone como «Foto al medio».",
      label: "Sucursales en foco",
      value: "locales",
    },
  ]);

/**
 * Marcos a mostrar: los de la historia y, sólo si la regla todavía lo usa, el
 * marco anterior con el que nació.
 */
function recurringStoryFrames(
  kind: RecurringStoryKindResponse,
  current: RecurringStoryDesignVariantResponse,
): readonly StoryOption<RecurringStoryDesignVariantResponse>[] {
  const available = frames[kind];
  const legacy = legacyFrames.find((frame) => frame.value === current);
  return legacy === undefined ? available : [...available, legacy];
}

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
] as const satisfies readonly StoryOption<RecurringStoryThemeResponse>[]);

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
] as const satisfies readonly StoryOption<RecurringStoryAccentResponse>[]);

export function openingStoryVariantLabel(
  variant: RecurringStoryDesignVariantResponse,
): string {
  const known = [
    ...frames.apertura,
    ...frames.lubricentro,
    ...legacyFrames,
  ].find((candidate) => candidate.value === variant);
  return known?.label ?? "Marco de la historia";
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

interface DragState {
  readonly focusX: number;
  readonly focusY: number;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly zoom: number;
}

/** Paso de teclado: mover la foto sin mouse ni dedo. */
const keyboardStep = 2;

export function OpeningStoryPreview({
  caption,
  disabled = false,
  heading = "Vista real",
  onPhotoChange,
  photo = null,
  preview,
}: Readonly<{
  caption: string;
  disabled?: boolean;
  heading?: string;
  /** Sin esto, la vista previa sólo muestra: no se puede mover la foto. */
  onPhotoChange?: (photo: RecurringStoryPhotoPayload) => void;
  photo?: RecurringStoryPhotoPayload | null;
  preview: OpeningPreviewResult;
}>) {
  const overflow = overflowMessage(preview);
  const surface = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const movable = photo !== null && onPhotoChange !== undefined && !disabled;

  /**
   * El recuadro que recorta la foto y la foto misma.
   *
   * El recuadro se mide en el contenedor y no en la imagen: el acercamiento es
   * una transformación de la imagen y agrandaría la medida del recorte.
   */
  function photoFrame(): Readonly<{
    box: DOMRect;
    image: HTMLImageElement;
  }> | null {
    const wrapper =
      surface.current?.querySelector<HTMLElement>(".opening-photo");
    const image = wrapper?.querySelector("img") ?? null;
    return wrapper === undefined || wrapper === null || image === null
      ? null
      : { box: wrapper.getBoundingClientRect(), image };
  }

  function moveBy(delta: Readonly<{ x: number; y: number }>): void {
    const frame = photoFrame();
    const state = drag.current;
    if (frame === null || state === null || photo === null) return;
    onPhotoChange?.({
      ...photo,
      ...framingAfterDrag(
        {
          boxHeight: frame.box.height,
          boxWidth: frame.box.width,
          naturalHeight: frame.image.naturalHeight,
          naturalWidth: frame.image.naturalWidth,
        },
        state,
        delta,
      ),
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>): void {
    if (!movable) return;
    // Sin esto, el navegador arranca su propio arrastre de la imagen y cancela
    // el gesto a los pocos píxeles.
    event.preventDefault();
    drag.current = {
      focusX: photo.focusX,
      focusY: photo.focusY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      zoom: photo.zoom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>): void {
    const state = drag.current;
    if (state === null || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    moveBy({
      x: event.clientX - state.startX,
      y: event.clientY - state.startY,
    });
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>): void {
    if (!movable) return;
    const steps: Readonly<Record<string, readonly [number, number]>> = {
      ArrowDown: [0, keyboardStep],
      ArrowLeft: [-keyboardStep, 0],
      ArrowRight: [keyboardStep, 0],
      ArrowUp: [0, -keyboardStep],
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const [x, y] = step;
    onPhotoChange({
      ...photo,
      focusX: clampFramingPercentage(photo.focusX + x),
      focusY: clampFramingPercentage(photo.focusY + y),
    });
  }

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
        <div
          {...(movable
            ? {
                "aria-label":
                  "Mover la foto dentro de la historia con las flechas",
                onDragStart: (event: DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                },
                onKeyDown: nudge,
                onPointerCancel: endDrag,
                onPointerDown: startDrag,
                onPointerMove: continueDrag,
                onPointerUp: endDrag,
                role: "group" as const,
                tabIndex: 0,
              }
            : {})}
          className="recurring-story-engine-scale"
          data-movable={String(movable)}
          ref={surface}
        >
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
      <p>
        {movable ? "Arrastrá la foto para acomodarla. " : ""}
        {caption}
      </p>
    </aside>
  );
}

/**
 * Foto de la historia.
 *
 * Sin foto propia, la historia usa la de la biblioteca. La foto se prepara en
 * el navegador antes de guardarse: se achica, se pasa a JPEG y pierde sus
 * metadatos. El encuadre se acomoda arrastrando la foto en la vista previa; la
 * barra de acercamiento es la que deja lugar para moverla.
 */
function OpeningPhotoControl({
  designVariant,
  disabled,
  kind,
  onPhotoChange,
  photo,
}: Readonly<{
  designVariant: RecurringStoryDesignVariantResponse;
  disabled: boolean;
  kind: RecurringStoryKindResponse;
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
              alt="Foto de la biblioteca"
              height={160}
              src={defaultPhotoUrls[kind]}
              unoptimized
              width={120}
            />
          )
        ) : (
          <Image
            alt={photo.alt}
            height={160}
            src={photo.dataUrl}
            style={{
              objectPosition: `${String(photo.focusX)}% ${String(photo.focusY)}%`,
            }}
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
              ? "Ahora usa la foto de la biblioteca. Subí la tuya, por ejemplo la mascota en el mostrador."
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
              Usar la de la biblioteca
            </button>
          )}
        </div>
        {photo === null ? null : (
          <div className="opening-photo-framing">
            <label className="opening-photo-zoom">
              Acercar
              <input
                aria-valuetext={`${String(photo.zoom)}%`}
                disabled={disabled}
                max={250}
                min={100}
                onChange={(event) => {
                  onPhotoChange({
                    ...photo,
                    zoom: Number(event.currentTarget.value),
                  });
                }}
                step={5}
                type="range"
                value={photo.zoom}
              />
            </label>
            <button
              disabled={disabled}
              onClick={() => {
                onPhotoChange({ ...photo, ...defaultOpeningPhotoFraming });
              }}
              type="button"
            >
              Centrar
            </button>
            <small>
              Arrastrá la foto en la vista previa para moverla; acercala si
              querés elegir qué parte se ve.
            </small>
          </div>
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
  kind,
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
  kind: RecurringStoryKindResponse;
  onAccentChange: (accent: RecurringStoryAccentResponse) => void;
  onDesignVariantChange: (variant: RecurringStoryDesignVariantResponse) => void;
  onPhotoChange: (photo: RecurringStoryPhotoPayload | null) => void;
  onThemeChange: (theme: RecurringStoryThemeResponse) => void;
  photo: RecurringStoryPhotoPayload | null;
  theme: RecurringStoryThemeResponse;
}>) {
  const ownImage = designVariant === "imagen";
  // El lubricentro tiene su paleta propia, grafito y amarillo: no se elige.
  const choosesColor = kind !== "lubricentro";

  return (
    <fieldset className="opening-style-controls">
      <legend>Marco, color y foto</legend>
      <p className="opening-style-controls-intro">
        Elegí el marco de la historia, su color y la foto. Cada marco deja libre
        una parte distinta de la foto. La vista previa usa el mismo motor que la
        publica, no una maqueta aproximada.
      </p>
      <div
        aria-label="Marco de la historia"
        className="opening-layout-gallery"
        role="radiogroup"
      >
        {recurringStoryFrames(kind, designVariant).map((variant) => (
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
        kind={kind}
        onPhotoChange={onPhotoChange}
        photo={photo}
      />
      {ownImage ? (
        <p className="opening-style-controls-intro">
          La imagen propia no usa el color ni los textos del sistema. El caption
          sí sale del horario vigente de cada sucursal.
        </p>
      ) : choosesColor ? (
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
      ) : (
        <p className="opening-style-controls-intro">
          El lubricentro usa su paleta: grafito y amarillo de señal, como el
          borde de la fosa.
        </p>
      )}
    </fieldset>
  );
}
