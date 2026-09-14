import type { CSSProperties, ReactElement, ReactNode } from "react";

import { AramayoMark, logoDescriptorFor } from "../primitives/logo.tsx";
import type { Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  CARTEL_HEIGHT,
  VEIL_DENSE_OPACITY,
  VEIL_FADE,
} from "./frame-geometry.ts";
import { consultPriceLabel, ProductImage } from "./kit.tsx";
import {
  mediaAt,
  type LayoutContext,
  type LayoutProps,
} from "./layout-context.ts";

/**
 * Piezas compartidas de la familia de marcos (`ADR-029`).
 *
 * Toda la familia nace de un objeto real de la marca: el cartel del frente del
 * local, una placa roja con el nombre en mayúscula rematada por una pestaña
 * negra. Cada marco lo lleva arriba y resuelve el resto con placas, velos y
 * letra; nada de esto se dibuja con píxeles que decidió un modelo.
 */

export interface FrameAccent {
  readonly background: string;
  readonly text: string;
}

/**
 * Color de señal de la marca.
 *
 * El rojo es el hondo y no el de la paleta base: el blanco sobre `rust` mide
 * 4,19:1 y no alcanza el umbral de texto, y sobre `rustDeep` mide 6,31:1. El
 * lubricentro usa su amarillo con letra grafito, que mide más de 10:1.
 */
export function frameAccent(theme: Theme): FrameAccent {
  return theme.brand === "lubricentro"
    ? Object.freeze({ background: COLORS.safety, text: COLORS.graphite })
    : Object.freeze({ background: COLORS.rustDeep, text: COLORS.white });
}

/** Sombra que separa una placa de la foto sin convertirla en tarjeta. */
export const liftShadow = `0 12px 32px ${withAlpha(COLORS.graphiteDeep, 0.28)}`;

/**
 * El cartel: quién vende y dónde.
 *
 * El nombre sale del descriptor aprobado del logo y del nombre corto del
 * perfil, en una línea, como en el frente del local. La ciudad sale del perfil
 * del negocio y no del layout.
 */
export function Cartel({
  context,
  style,
  theme,
}: {
  readonly context: LayoutContext;
  readonly style?: CSSProperties | undefined;
  readonly theme: Theme;
}): ReactElement {
  const accent = frameAccent(theme);
  const [rawCity] = context.brand.city.split(",");
  const city = (rawCity ?? context.brand.city)
    .trim()
    .toLocaleUpperCase("es-AR");
  const name = `${logoDescriptorFor(theme.brand)} ${context.brand.shortName}`;

  return (
    <div
      data-cartel=""
      data-panel=""
      style={{
        alignItems: "stretch",
        boxShadow: liftShadow,
        display: "flex",
        height: CARTEL_HEIGHT,
        position: "absolute",
        width: "fit-content",
        zIndex: 20,
        ...style,
      }}
    >
      <div
        data-logo=""
        data-role="logo"
        style={{
          alignItems: "center",
          backgroundColor: accent.background,
          color: accent.text,
          display: "flex",
          gap: 18,
          paddingLeft: 22,
          paddingRight: 30,
        }}
      >
        <AramayoMark color={accent.text} size={54} />
        <span
          style={{
            fontFamily: TYPOGRAPHY.display.cssStack,
            fontSize: 60,
            fontWeight: FONT_WEIGHTS.black,
            letterSpacing: 0.4,
            lineHeight: 1,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </div>
      <div
        data-locality=""
        data-role="localidad"
        style={{
          alignItems: "center",
          backgroundColor: COLORS.graphite,
          color: theme.brand === "lubricentro" ? COLORS.safety : COLORS.paper,
          display: "flex",
          fontFamily: TYPOGRAPHY.display.cssStack,
          fontSize: 38,
          fontWeight: FONT_WEIGHTS.extrabold,
          letterSpacing: 1,
          lineHeight: 1,
          paddingLeft: 24,
          paddingRight: 24,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {`En ${city}`}
      </div>
    </div>
  );
}

/**
 * La base generada a sangre, sin velo propio.
 *
 * A diferencia de las piezas de región, un marco no oscurece la foto entera:
 * cada uno protege sólo la zona donde vive su texto.
 */
export function FramePhoto({
  content,
  context,
  document,
  style,
  theme,
}: LayoutProps & {
  readonly style?: CSSProperties | undefined;
}): ReactElement | null {
  const asset = mediaAt(document, 0);

  if (asset === undefined) {
    return null;
  }

  return (
    <div
      data-frame-photo=""
      style={{ inset: 0, position: "absolute", ...style }}
    >
      <ProductImage
        asset={asset}
        context={context}
        fallbackIcon={content.icon ?? "productos"}
        radius={RADII.none}
        style={{ height: "100%", width: "100%" }}
        theme={theme}
      />
    </div>
  );
}

export type VeilEdge = "bottom" | "top";

/** Letra sobre el velo. */
export const veilText = COLORS.paper;
export const veilMuted = withAlpha(COLORS.paper, 0.86);
export const veilTextShadow = `0 2px 18px ${withAlpha(COLORS.graphiteDeep, 0.4)}`;

/**
 * Degradado del velo: denso donde viven las letras y ausente donde habla la
 * foto.
 *
 * El tramo que se desvanece mide `VEIL_FADE` y coincide con el relleno del
 * lado de la foto, así que el velo acompaña al alto del texto en lugar de tener
 * una medida fija: un titular corto no oscurece foto que no necesita.
 */
export function veilBackground(edge: VeilEdge): string {
  const ink = COLORS.graphiteDeep;
  const direction = edge === "top" ? "180deg" : "0deg";
  const fade = String(VEIL_FADE);
  const halfFade = String(Math.round(VEIL_FADE / 2));

  return `linear-gradient(${direction}, ${withAlpha(ink, 0.94)} 0%, ${withAlpha(ink, VEIL_DENSE_OPACITY)} calc(100% - ${fade}px), ${withAlpha(ink, 0.5)} calc(100% - ${halfFade}px), ${withAlpha(ink, 0)} 100%)`;
}

export function FrameChip({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: Theme;
}): ReactElement {
  const accent = frameAccent(theme);

  return (
    <span
      data-role="etiqueta"
      style={{
        alignSelf: "flex-start",
        backgroundColor: accent.background,
        borderRadius: RADII.sm,
        color: accent.text,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 26,
        fontWeight: FONT_WEIGHTS.extrabold,
        letterSpacing: 1.2,
        lineHeight: 1,
        paddingBottom: 10,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 10,
        textShadow: "none",
        textTransform: "uppercase",
        // Una etiqueta partida en dos renglones deja de leerse como etiqueta.
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function FrameTitle({
  color,
  size,
  title,
}: {
  readonly color: string;
  readonly size: number;
  readonly title: string;
}): ReactElement {
  return (
    <h1
      style={{
        color,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: size,
        fontWeight: FONT_WEIGHTS.extrabold,
        lineHeight: 0.9,
        margin: 0,
        overflowWrap: "break-word",
        textTransform: "uppercase",
      }}
    >
      {title}
    </h1>
  );
}

export function FrameSubtitle({
  children,
  color,
}: {
  readonly children: ReactNode;
  readonly color: string;
}): ReactElement {
  return (
    <p
      data-role="bajada"
      style={{
        color,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 31,
        fontWeight: FONT_WEIGHTS.medium,
        lineHeight: 1.3,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

/**
 * Precio con su vigencia.
 *
 * Los marcos con forma de precio —etiqueta, sello y zócalo— no se quedan vacíos
 * sin importe: muestran la invitación a consultar, que es la decisión del
 * negocio registrada en `PIECE-CATALOG.md`. El resto simplemente no lo dibuja.
 */
export function FramePrice({
  color,
  invitesWhenMissing = false,
  mutedColor,
  price,
  size = 96,
  validity,
}: {
  readonly color: string;
  readonly invitesWhenMissing?: boolean | undefined;
  readonly mutedColor: string;
  readonly price: string | undefined;
  readonly size?: number | undefined;
  readonly validity: string | undefined;
}): ReactElement | null {
  if (price === undefined && !invitesWhenMissing) {
    return null;
  }

  return (
    <div
      data-price=""
      data-role="precio"
      style={{
        color,
        display: "flex",
        flexDirection: "column",
        // En la fila de compra el que cede es el botón: un importe angosto
        // obligaría a partir la vigencia en renglones de una palabra.
        flexShrink: 0,
        gap: 8,
      }}
    >
      {price === undefined ? (
        <span
          style={{
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 38,
            fontWeight: FONT_WEIGHTS.bold,
            lineHeight: 1.1,
          }}
        >
          {consultPriceLabel}
        </span>
      ) : (
        <span
          style={{
            fontFamily: TYPOGRAPHY.display.cssStack,
            fontSize: size,
            fontWeight: FONT_WEIGHTS.black,
            lineHeight: 0.82,
            whiteSpace: "nowrap",
          }}
        >
          {price}
        </span>
      )}
      {price === undefined || validity === undefined ? null : (
        <span
          style={{
            color: mutedColor,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 26,
            fontWeight: FONT_WEIGHTS.semibold,
            lineHeight: 1.1,
          }}
        >
          {validity}
        </span>
      )}
    </div>
  );
}

export interface FrameCtaColors {
  readonly background: string;
  readonly text: string;
}

/**
 * Colores del botón según la superficie donde se apoya.
 *
 * El tema decide el botón, salvo cuando pinta del mismo color que la placa: el
 * botón de papel de `promo` desaparecería sobre la etiqueta de papel. En ese caso
 * se invierte al par tinta/papel, que mide 15,43:1.
 */
export function frameCtaColors(theme: Theme, surface: string): FrameCtaColors {
  if (theme.colors.action !== surface) {
    return Object.freeze({
      background: theme.colors.action,
      text: theme.colors.actionText,
    });
  }

  return surface === COLORS.paper
    ? Object.freeze({ background: COLORS.ink, text: COLORS.paper })
    : Object.freeze({ background: COLORS.paper, text: COLORS.ink });
}

/**
 * Botón de acción.
 *
 * El texto lo puede escribir quien revisa la variante, así que un botón largo
 * baja a otro renglón en lugar de salirse de su zona: en una sola línea, un
 * llamado de 60 caracteres empuja la fila de compra fuera del lienzo. El
 * reparto equilibrado evita un último renglón de una palabra, y un botón que
 * entra en una línea se ve igual que antes.
 */
export function FrameCta({
  children,
  colors,
  panel = false,
  style,
}: {
  readonly children: ReactNode;
  readonly colors: FrameCtaColors;
  /**
   * Un botón que sobresale de su zona es una zona en sí mismo: tiene fondo
   * propio y se declara como tal para que la suite no lo cuente como desborde.
   */
  readonly panel?: boolean | undefined;
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  return (
    <div
      data-cta=""
      data-panel={panel ? "" : undefined}
      data-role="cta"
      style={{
        backgroundColor: colors.background,
        borderRadius: RADII.pill,
        color: colors.text,
        flexShrink: 1,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: 34,
        fontWeight: FONT_WEIGHTS.extrabold,
        letterSpacing: 0.4,
        lineHeight: 1,
        maxWidth: "100%",
        paddingBottom: 18,
        paddingLeft: 34,
        paddingRight: 34,
        paddingTop: 18,
        textAlign: "center",
        textShadow: "none",
        textTransform: "uppercase",
        textWrap: "balance",
        whiteSpace: "normal",
        width: "fit-content",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Fila de compra: precio a la izquierda y botón a la derecha, o el botón solo. */
export function FrameBuyRow({
  children,
  spread,
}: {
  readonly children: ReactNode;
  readonly spread: boolean;
}): ReactElement {
  return (
    <div
      style={{
        alignItems: "flex-end",
        display: "flex",
        gap: 24,
        justifyContent: spread ? "space-between" : "flex-start",
        marginTop: 6,
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}
