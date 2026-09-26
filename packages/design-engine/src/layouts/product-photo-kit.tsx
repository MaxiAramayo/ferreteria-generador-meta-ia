import type { CSSProperties, ReactElement } from "react";

import type { DesignContent } from "../contracts/document.ts";
import type { DesignFormat } from "../formats/formats.ts";
import { Icon } from "../primitives/icon.tsx";
import { AramayoMark, logoDescriptorFor } from "../primitives/logo.tsx";
import type { BrandBranch } from "../themes/themes.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { liftShadow } from "./frame-kit.tsx";
import { consultPriceLabel } from "./kit.tsx";
import type { LayoutContext } from "./layout-context.ts";
import { displayWidthEm } from "./story-frame-kit.tsx";

/**
 * Piezas compartidas de los marcos de producto con foto propia (`ADR-033`).
 *
 * Cada parte sale de un objeto real del local: el cartel del frente —panel
 * rojo con su filete blanco y la localidad al costado—, la chapa acanalada del
 * techo, la etiqueta de la góndola y el hexágono del isotipo.
 *
 * El rojo vivo sólo decora (riel, filetes, bordes): el blanco encima mide
 * 4,19:1. Todo texto se apoya en el rojo profundo (6,31:1), en grafito o en
 * papel, y en el lubricentro en su amarillo con letra grafito.
 */

export interface ProductPalette {
  /** Superficie con texto: cartel, zócalo, bandera, botón sobre grafito. */
  readonly surface: string;
  readonly surfaceText: string;
  /** El texto chico que acompaña sobre la superficie. */
  readonly surfaceMuted: string;
  /** Filete del cartel: una línea, nunca un fondo de texto. */
  readonly rule: string;
  /** Acento que decora: riel, borde superior de la placa, sombra del recuadro. */
  readonly accent: string;
}

export function productPalette(brand: BrandBranch): ProductPalette {
  return brand === "lubricentro"
    ? {
        accent: COLORS.safety,
        rule: withAlpha(COLORS.graphite, 0.85),
        surface: COLORS.safety,
        surfaceMuted: COLORS.graphite,
        surfaceText: COLORS.graphite,
      }
    : {
        accent: COLORS.ferre,
        rule: withAlpha(COLORS.white, 0.9),
        surface: COLORS.rustDeep,
        surfaceMuted: COLORS.paper,
        surfaceText: COLORS.white,
      };
}

/** Márgenes de la pieza: la zona segura del formato y si es una historia. */
export interface ProductFrameMetrics {
  readonly bottom: number;
  readonly height: number;
  readonly side: number;
  readonly story: boolean;
  readonly top: number;
  readonly width: number;
}

export function productFrameMetrics(format: DesignFormat): ProductFrameMetrics {
  return {
    bottom: format.safeArea.bottom,
    height: format.height,
    side: format.safeArea.left,
    story: format.id === "historia",
    top: format.safeArea.top,
    width: format.width,
  };
}

export function showsTitle(content: DesignContent): boolean {
  return content.hidden?.includes("title") !== true;
}

export function showsPrice(content: DesignContent): boolean {
  return content.hidden?.includes("price") !== true;
}

/**
 * Tamaño del titular: el mayor que entra en `lines` renglones del ancho, con
 * las palabras repartidas en orden. Si ni el mínimo entra, se admiten más
 * renglones antes que partir una palabra o salirse de la pieza.
 */
export function fittedDisplaySize(
  text: string,
  width: number,
  options: Readonly<{ lines: number; maximum: number; minimum: number }>,
): number {
  const words = text.trim().split(/\s+/u);
  const usable = width * 0.97;

  const linesAt = (size: number): number => {
    let lines = 1;
    let current = 0;
    for (const word of words) {
      const wordWidth = displayWidthEm(word) * size;
      const next =
        current === 0
          ? wordWidth
          : current + displayWidthEm(" ") * size + wordWidth;
      if (next <= usable || current === 0) {
        current = next;
      } else {
        lines += 1;
        current = wordWidth;
      }
    }
    return lines;
  };

  const widest = Math.max(...words.map((word) => displayWidthEm(word)));
  for (let size = options.maximum; size > options.minimum; size -= 2) {
    if (widest * size <= usable && linesAt(size) <= options.lines) {
      return size;
    }
  }
  return options.minimum;
}

/** Nombre del producto: condensado, en mayúscula y del mayor tamaño que entra. */
export function ProductName({
  color,
  lines = 2,
  maximum,
  minimum = 52,
  title,
  width,
  style,
}: {
  readonly color: string;
  readonly lines?: number | undefined;
  readonly maximum: number;
  readonly minimum?: number | undefined;
  readonly style?: CSSProperties | undefined;
  readonly title: string;
  readonly width: number;
}): ReactElement {
  return (
    <h1
      data-role="titulo"
      style={{
        color,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: fittedDisplaySize(title, width, {
          lines,
          maximum,
          minimum,
        }),
        fontWeight: FONT_WEIGHTS.black,
        letterSpacing: -1,
        lineHeight: 0.94,
        margin: 0,
        maxWidth: width,
        overflowWrap: "break-word",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {title}
    </h1>
  );
}

/** La descripción corta, en letra de texto. */
export function ProductDescription({
  children,
  color,
  size = 36,
}: {
  readonly children: string;
  readonly color: string;
  readonly size?: number | undefined;
}): ReactElement {
  return (
    <p
      data-role="descripcion"
      style={{
        color,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: size,
        fontWeight: FONT_WEIGHTS.medium,
        lineHeight: 1.22,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

/**
 * El cartel del frente: el panel con su filete, el isotipo y el nombre, y la
 * pestaña grafito con la localidad. `full` cruza la pieza de lado a lado como
 * el letrero del local; `compact` se apoya en una esquina.
 */
export function Letrero({
  brand,
  context,
  metrics,
  size,
  style,
}: {
  readonly brand: BrandBranch;
  readonly context: LayoutContext;
  readonly metrics: ProductFrameMetrics;
  readonly size: "compact" | "full";
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  const palette = productPalette(brand);
  const full = size === "full";
  const height = full ? (metrics.story ? 132 : 118) : metrics.story ? 104 : 94;
  const nameSize = full ? (metrics.story ? 74 : 66) : metrics.story ? 58 : 52;
  const [rawCity] = context.brand.city.split(",");
  const city = (rawCity ?? context.brand.city).trim();

  return (
    <div
      data-letrero={size}
      style={{
        boxShadow: liftShadow,
        display: "flex",
        height,
        position: "absolute",
        width: full ? undefined : "fit-content",
        ...(full ? { left: 0, right: 0 } : {}),
        zIndex: 20,
        ...style,
      }}
    >
      <div
        style={{
          alignItems: "center",
          backgroundColor: palette.surface,
          color: palette.surfaceText,
          display: "flex",
          flex: "1 1 auto",
          // Pegado al borde, el nombre igual arranca en la zona segura.
          paddingLeft: full ? metrics.side : 30,
          paddingRight: 34,
          position: "relative",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            border: `4px solid ${palette.rule}`,
            borderRadius: 2,
            inset: 11,
            ...(full ? { left: metrics.side - 22 } : {}),
            pointerEvents: "none",
            position: "absolute",
          }}
        />
        <span
          data-logo=""
          data-role="logo"
          style={{
            alignItems: "center",
            display: "flex",
            gap: full ? 20 : 16,
            position: "relative",
          }}
        >
          <AramayoMark
            color={palette.surfaceText}
            size={Math.round(nameSize * 0.94)}
          />
          <span
            style={{
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: nameSize,
              fontWeight: FONT_WEIGHTS.black,
              letterSpacing: 0.5,
              lineHeight: 1,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {`${logoDescriptorFor(brand)} ${context.brand.shortName}`}
          </span>
        </span>
      </div>
      <div
        data-role="localidad"
        style={{
          alignItems: "center",
          backgroundColor: COLORS.graphite,
          color: brand === "lubricentro" ? COLORS.safety : COLORS.paper,
          display: "flex",
          fontFamily: TYPOGRAPHY.display.cssStack,
          fontSize: Math.round(nameSize * 0.54),
          fontWeight: FONT_WEIGHTS.extrabold,
          letterSpacing: 1.5,
          lineHeight: 1,
          paddingLeft: 26,
          paddingRight: full ? metrics.side - 8 : 26,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {`En ${city}`}
      </div>
    </div>
  );
}

/** «$ 24.500» → «24.500»: el signo se compone aparte, más chico. */
function amountOf(price: string): string {
  const match = /^\s*\$\s*(.+)$/u.exec(price);
  return match?.[1] ?? price;
}

/** Tamaño del importe: el pedido, salvo que no entre en el ancho. */
function priceSize(
  amount: string,
  unit: string | undefined,
  width: number,
  maximum: number,
): number {
  // El signo va a 0,42 em y la unidad en letra de texto a 0,22 em.
  const signEm = 0.42 * 0.5;
  const unitEm = unit === undefined ? 0 : 0.5 + unit.length * 0.24 * 0.56;
  const em = displayWidthEm(amount) + signEm + unitEm;
  return Math.max(48, Math.min(maximum, Math.floor((width * 0.96) / em)));
}

/**
 * El precio de la pieza, en sus tres casos: el importe (con el anterior
 * tachado y la unidad), la invitación a consultarlo o nada.
 */
export function ProductPrice({
  align = "left",
  color,
  content,
  maximum,
  muted,
  width,
}: {
  readonly align?: "center" | "left" | undefined;
  readonly color: string;
  readonly content: DesignContent;
  readonly maximum: number;
  readonly muted: string;
  readonly width: number;
}): ReactElement | null {
  if (!showsPrice(content)) {
    return null;
  }

  if (content.price === undefined) {
    return (
      <span
        data-price=""
        data-role="precio"
        style={{
          color,
          fontFamily: TYPOGRAPHY.display.cssStack,
          fontSize: Math.max(44, Math.round(maximum * 0.42)),
          fontWeight: FONT_WEIGHTS.extrabold,
          letterSpacing: 1,
          lineHeight: 1,
          textAlign: align,
          textTransform: "uppercase",
        }}
      >
        {consultPriceLabel}
      </span>
    );
  }

  const amount = amountOf(content.price);
  const size = priceSize(amount, content.priceUnit, width, maximum);

  return (
    <div
      data-price=""
      data-role="precio"
      style={{
        color,
        display: "grid",
        gap: 8,
        justifyItems: align === "center" ? "center" : "start",
      }}
    >
      {content.previousPrice === undefined ? null : (
        <span
          data-previous-price=""
          style={{
            color: muted,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: Math.max(30, Math.round(size * 0.24)),
            fontWeight: FONT_WEIGHTS.semibold,
            lineHeight: 1,
          }}
        >
          {"Antes "}
          <s style={{ textDecorationThickness: 3 }}>{content.previousPrice}</s>
        </span>
      )}
      <span
        style={{
          alignItems: "flex-start",
          display: "flex",
          fontFamily: TYPOGRAPHY.display.cssStack,
          fontSize: size,
          fontWeight: FONT_WEIGHTS.black,
          letterSpacing: -1,
          lineHeight: 0.82,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontSize: "0.42em",
            lineHeight: 1,
            margin: "0.1em 0.08em 0 0",
          }}
        >
          $
        </span>
        {amount}
        {content.priceUnit === undefined ? null : (
          <span
            data-price-unit=""
            style={{
              alignSelf: "flex-end",
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: Math.max(30, Math.round(size * 0.22)),
              fontWeight: FONT_WEIGHTS.bold,
              letterSpacing: 0,
              lineHeight: 1.2,
              marginLeft: "0.5em",
            }}
          >
            {content.priceUnit}
          </span>
        )}
      </span>
    </div>
  );
}

export interface ButtonColors {
  readonly background: string;
  readonly muted: string;
  readonly text: string;
}

/**
 * El botón de contacto: el llamado en chico y el teléfono en grande, que es lo
 * que se anota. Sin llamado, la pieza no lleva botón.
 */
export function ContactButton({
  colors,
  content,
  context,
  scale = 1,
  width,
}: {
  readonly colors: ButtonColors;
  readonly content: DesignContent;
  readonly context: LayoutContext;
  readonly scale?: number | undefined;
  readonly width?: number | "100%" | undefined;
}): ReactElement | null {
  if (content.callToAction === undefined) {
    return null;
  }

  return (
    <div
      data-cta=""
      data-role="cta"
      style={{
        alignItems: "center",
        alignSelf: width === undefined ? "flex-start" : undefined,
        backgroundColor: colors.background,
        borderRadius: 14,
        color: colors.text,
        display: "flex",
        gap: Math.round(20 * scale),
        padding: `${String(Math.round(18 * scale))}px ${String(Math.round(28 * scale))}px`,
        width,
      }}
    >
      <Icon
        color={colors.text}
        name="telefono"
        size={Math.round(52 * scale)}
        strokeWidth={2.6}
      />
      <span style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            color: colors.muted,
            fontFamily: TYPOGRAPHY.display.cssStack,
            fontSize: Math.max(28, Math.round(32 * scale)),
            fontWeight: FONT_WEIGHTS.extrabold,
            letterSpacing: 1.2,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {content.callToAction}
        </span>
        <span
          style={{
            fontFamily: TYPOGRAPHY.display.cssStack,
            fontSize: Math.round(60 * scale),
            fontWeight: FONT_WEIGHTS.black,
            letterSpacing: 0.5,
            lineHeight: 0.95,
            whiteSpace: "nowrap",
          }}
        >
          {context.brand.phone}
        </span>
      </span>
    </div>
  );
}

/** Etiqueta corta como un banderín: «Oferta», «Recién llegado». */
export function Bandera({
  background,
  label,
  scale = 1,
  text,
}: {
  readonly background: string;
  readonly label: string;
  readonly scale?: number | undefined;
  readonly text: string;
}): ReactElement {
  return (
    <span
      data-badge=""
      data-role="etiqueta"
      style={{
        alignSelf: "flex-start",
        backgroundColor: background,
        clipPath:
          "polygon(0 0, 100% 0, calc(100% - 22px) 50%, 100% 100%, 0 100%)",
        color: text,
        display: "inline-block",
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: Math.max(30, Math.round(36 * scale)),
        fontWeight: FONT_WEIGHTS.extrabold,
        letterSpacing: 2,
        lineHeight: 1,
        padding: "12px 46px 12px 20px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/** Medidas, presentaciones o variantes, como fichas con borde. */
export function Medidas({
  border,
  color,
  items,
  size = 32,
}: {
  readonly border: string;
  readonly color: string;
  readonly items: readonly string[] | undefined;
  readonly size?: number | undefined;
}): ReactElement | null {
  if (items === undefined || items.length === 0) {
    return null;
  }
  return (
    <div
      data-role="medidas"
      style={{ display: "flex", flexWrap: "wrap", gap: 12 }}
    >
      {items.map((item) => (
        <span
          key={item}
          style={{
            border: `3px solid ${border}`,
            borderRadius: 8,
            color,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: size,
            fontWeight: FONT_WEIGHTS.bold,
            lineHeight: 1.1,
            padding: "8px 16px",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/** Hasta cuándo vale lo que la pieza afirma. */
export function Vigencia({
  color,
  size = 30,
  validity,
}: {
  readonly color: string;
  readonly size?: number | undefined;
  readonly validity: string | undefined;
}): ReactElement | null {
  if (validity === undefined) {
    return null;
  }
  return (
    <span
      data-role="vigencia"
      style={{
        alignItems: "center",
        color,
        display: "flex",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: size,
        fontWeight: FONT_WEIGHTS.semibold,
        gap: 10,
        lineHeight: 1.15,
      }}
    >
      <Icon
        color={color}
        name="reloj"
        size={Math.round(size * 1.05)}
        strokeWidth={2.6}
      />
      {validity}
    </span>
  );
}

/**
 * Chapa acanalada del techo del local. Es SVG y no una imagen de fondo: se
 * dibuja igual en el panel y en el render.
 */
export function Chapa({ height }: { readonly height: number }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      height={height}
      style={{ left: 0, position: "absolute", top: 0 }}
      width="100%"
    >
      <defs>
        <pattern
          height="10"
          id="aramayo-chapa"
          patternUnits="userSpaceOnUse"
          width="44"
        >
          <rect fill={COLORS.humo} height="10" width="44" />
          <rect fill="#3a3a3a" height="10" width="3" x="16" />
          <rect fill={COLORS.graphiteDeep} height="10" width="8" x="19" />
        </pattern>
        <linearGradient id="aramayo-chapa-sombra" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={COLORS.graphiteDeep} stopOpacity="0.1" />
          <stop offset="1" stopColor={COLORS.graphiteDeep} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect fill="url(#aramayo-chapa)" height="100%" width="100%" />
      <rect fill="url(#aramayo-chapa-sombra)" height="100%" width="100%" />
    </svg>
  );
}

/** Trama de hexágonos del isotipo, casi invisible, sobre el papel de la ficha. */
export function TramaHexagonal(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      height="100%"
      style={{ inset: 0, opacity: 0.07, position: "absolute" }}
      width="100%"
    >
      <defs>
        <pattern
          height="104"
          id="aramayo-trama-hex"
          patternUnits="userSpaceOnUse"
          width="60"
        >
          <path
            d="M30 0 L60 17 L60 52 L30 69 L0 52 L0 17 Z M30 69 L30 104"
            fill="none"
            stroke={COLORS.graphite}
            strokeWidth="2"
          />
        </pattern>
      </defs>
      <rect fill="url(#aramayo-trama-hex)" height="100%" width="100%" />
    </svg>
  );
}
