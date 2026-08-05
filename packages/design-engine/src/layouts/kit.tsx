import type { CSSProperties, ReactElement, ReactNode } from "react";

import type { MediaAsset } from "../contracts/document.ts";
import { Icon } from "../primitives/icon.tsx";
import { Logo } from "../primitives/logo.tsx";
import { Photo, PhotoFallback } from "../primitives/photo.tsx";
import { Text } from "../primitives/text.tsx";
import type { IconName } from "../registry/icons.ts";
import { composedPanelColors, type Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING, STROKES } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import type { LayoutContext } from "./layout-context.ts";

/**
 * Piezas compartidas de composición.
 *
 * Reemplaza el `kit.tsx` del generador. Cada elemento resuelve sus valores
 * desde tokens y desde el tema recibido: un layout no vuelve a escribir un
 * color, un radio ni un tamaño suelto.
 */

export function Eyebrow({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: Theme;
}): ReactElement {
  const isLubricentro = theme.brand === "lubricentro";
  const background =
    theme.id === "promo"
      ? COLORS.white
      : isLubricentro
        ? COLORS.safety
        : COLORS.rust;
  const color =
    theme.id === "promo"
      ? COLORS.rust
      : isLubricentro
        ? COLORS.graphite
        : COLORS.white;

  return (
    <span
      style={{
        alignItems: "center",
        backgroundColor: background,
        borderRadius: RADII.pill,
        color,
        display: "inline-flex",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 24,
        fontWeight: FONT_WEIGHTS.extrabold,
        padding: `${String(SPACING.xs + 4)}px ${String(SPACING.lg)}px`,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export function Header({
  eyebrow,
  theme,
}: {
  readonly eyebrow?: string | undefined;
  readonly theme: Theme;
}): ReactElement {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "space-between",
        position: "relative",
        zIndex: 10,
      }}
    >
      <Logo tone={theme.tone} variant={theme.brand} />
      {eyebrow === undefined ? null : (
        <Eyebrow theme={theme}>{eyebrow}</Eyebrow>
      )}
    </div>
  );
}

export function Cta({
  children,
  compact = false,
  theme,
}: {
  readonly children: ReactNode;
  readonly compact?: boolean | undefined;
  readonly theme: Theme;
}): ReactElement {
  return (
    <div
      data-cta=""
      data-role="cta"
      style={{
        backgroundColor: theme.colors.action,
        borderRadius: RADII.pill,
        color: theme.colors.actionText,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: compact ? 28 : 42,
        fontWeight: FONT_WEIGHTS.extrabold,
        lineHeight: 1,
        maxWidth: "100%",
        padding: compact
          ? `${String(SPACING.sm)}px ${String(SPACING.xl - 4)}px`
          : `${String(SPACING.lg)}px ${String(SPACING.gutter - 24)}px`,
        textAlign: "center",
        textTransform: "uppercase",
        width: "fit-content",
      }}
    >
      {children}
    </div>
  );
}

export function Footer({
  branch,
  context,
  theme,
}: {
  readonly branch: string;
  readonly context: LayoutContext;
  readonly theme: Theme;
}): ReactElement {
  return (
    <div
      style={{
        alignItems: "center",
        color: theme.colors.muted,
        columnGap: SPACING.xl,
        display: "flex",
        flexWrap: "wrap",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 26,
        fontWeight: FONT_WEIGHTS.semibold,
        justifyContent: "space-between",
        minWidth: 0,
        position: "relative",
        rowGap: SPACING.xxs,
        zIndex: 10,
      }}
    >
      <span style={{ lineHeight: 1.1, minWidth: 0 }}>{branch}</span>
      <span style={{ flexShrink: 0 }}>{context.brand.phone}</span>
    </div>
  );
}

export function IconBadge({
  icon,
  iconSize = 54,
  size = 98,
  theme,
}: {
  readonly icon: IconName;
  readonly iconSize?: number | undefined;
  readonly size?: number | undefined;
  readonly theme: Theme;
}): ReactElement {
  const background =
    theme.brand === "lubricentro" ? COLORS.safety : COLORS.rust;
  const color = theme.brand === "lubricentro" ? COLORS.graphite : COLORS.white;

  return (
    <span
      style={{
        backgroundColor: background,
        borderRadius: RADII.icon,
        color,
        display: "grid",
        flexShrink: 0,
        height: size,
        placeItems: "center",
        width: size,
      }}
    >
      <Icon
        color={color}
        name={icon}
        size={iconSize}
        strokeWidth={STROKES.iconBadge}
      />
    </span>
  );
}

export const consultPriceLabel = "Consultá precio";

/**
 * Bloque de precio.
 *
 * Sin precio no desaparece: ocupa el mismo lugar con la invitación a
 * consultarlo, de modo que la jerarquía de la pieza no cambia según el dato
 * disponible. Es la decisión del negocio registrada en `PIECE-CATALOG.md`.
 */
export function PriceBlock({
  color,
  compact = false,
  mutedColor,
  price,
  previousPrice,
  validity,
}: {
  readonly color: string;
  /**
   * Dentro de un panel de composición el precio comparte una caja de altura
   * fija con el titular y el CTA: `hero` no entra, y achicar el titular para
   * que entre el número invertiría la jerarquía de la pieza.
   */
  readonly compact?: boolean | undefined;
  readonly mutedColor: string;
  readonly price: string | undefined;
  readonly previousPrice?: string | undefined;
  readonly validity?: string | undefined;
}): ReactElement {
  return (
    <div data-price="" data-role="precio">
      {previousPrice === undefined || price === undefined ? null : (
        <div
          style={{
            color: mutedColor,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: compact ? 32 : 44,
            fontWeight: FONT_WEIGHTS.bold,
            textDecoration: "line-through",
          }}
        >
          {previousPrice}
        </div>
      )}
      {price === undefined ? (
        <Text as="div" color={color} token={compact ? "sub" : "h2"}>
          {consultPriceLabel}
        </Text>
      ) : (
        <Text as="div" color={color} token={compact ? "h2" : "hero"}>
          {price}
        </Text>
      )}
      {validity === undefined ? null : (
        <div
          style={{
            color: mutedColor,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: compact ? 22 : 26,
            fontWeight: FONT_WEIGHTS.semibold,
            marginTop: SPACING.xxs,
          }}
        >
          {validity}
        </div>
      )}
    </div>
  );
}

/**
 * Panel de marca sobre el que se apoya la capa determinista.
 *
 * Es la respuesta de `P4-T05` al contraste sobre una imagen generada: el texto
 * comercial no se apoya en píxeles que decidió un modelo, sino en un color de
 * tema que conocemos, así que el contraste se puede calcular antes de
 * renderizar y demostrar con un umbral en lugar de suponerlo.
 *
 * Por eso el fondo es **opaco**. Un velo translúcido haría que el contraste
 * real dependiera de lo que el modelo haya dibujado debajo, que es exactamente
 * lo que esta pieza evita.
 */
export function BrandPanel({
  children,
  style,
  theme,
}: {
  readonly children: ReactNode;
  readonly style?: CSSProperties | undefined;
  readonly theme: Theme;
}): ReactElement {
  return (
    <div
      data-panel=""
      style={{
        backgroundColor: composedPanelColors(theme).background,
        borderRadius: RADII.card,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: SPACING.xxl,
        position: "relative",
        zIndex: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Velo inferior sobre una foto a sangre, para que el texto conserve contraste.
 */
export function PhotoScrim(): ReactElement {
  return (
    <div
      style={{
        background: `linear-gradient(to top, ${withAlpha(COLORS.ink, 0.9)} 0%, ${withAlpha(COLORS.ink, 0.58)} 36%, ${withAlpha(COLORS.ink, 0.08)} 72%)`,
        inset: 0,
        pointerEvents: "none",
        position: "absolute",
      }}
    />
  );
}

export function BulletList({
  items,
  theme,
}: {
  readonly items: readonly string[];
  readonly theme: Theme;
}): ReactElement {
  const accent = theme.brand === "lubricentro" ? COLORS.safety : COLORS.rust;
  const accentText =
    theme.brand === "lubricentro" ? COLORS.graphite : COLORS.white;

  return (
    <ul
      style={{
        display: "grid",
        gap: SPACING.md,
        listStyle: "none",
        margin: 0,
        padding: 0,
        position: "relative",
        zIndex: 10,
      }}
    >
      {items.slice(0, 4).map((item) => (
        <li
          key={item}
          style={{
            alignItems: "center",
            backgroundColor: withAlpha(COLORS.white, 0.08),
            border: `1px solid ${theme.colors.border}`,
            borderRadius: RADII.icon,
            display: "flex",
            gap: SPACING.md,
            padding: `${String(SPACING.md)}px ${String(SPACING.lg)}px`,
          }}
        >
          <span
            style={{
              backgroundColor: accent,
              borderRadius: RADII.pill,
              color: accentText,
              display: "grid",
              flexShrink: 0,
              height: 44,
              placeItems: "center",
              width: 44,
            }}
          >
            <Icon
              color={accentText}
              name="tag"
              size={24}
              strokeWidth={STROKES.emphasis}
            />
          </span>
          <span
            style={{
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 34,
              fontWeight: FONT_WEIGHTS.bold,
              lineHeight: 1.1,
            }}
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Foto principal de la pieza, con marcador explícito cuando no hay imagen
 * declarada.
 */
export function ProductImage({
  asset,
  context,
  fallbackIcon = "productos",
  radius = RADII.card,
  style,
  theme,
}: {
  readonly asset: MediaAsset | undefined;
  readonly context: LayoutContext;
  readonly fallbackIcon?: IconName | undefined;
  readonly radius?: number | undefined;
  readonly style?: CSSProperties | undefined;
  readonly theme: Theme;
}): ReactElement {
  if (asset === undefined) {
    return (
      <PhotoFallback
        icon={fallbackIcon}
        radius={radius}
        style={style}
        theme={theme}
      />
    );
  }

  return (
    <Photo
      asset={asset}
      assetBaseUrl={context.assetBaseUrl}
      radius={radius}
      style={style}
    />
  );
}

export function Title({
  children,
  color,
  maxWidth,
}: {
  readonly children: ReactNode;
  readonly color?: string | undefined;
  readonly maxWidth?: number | undefined;
}): ReactElement {
  return (
    <Text as="h1" color={color} style={{ maxWidth }} token="h1">
      {children}
    </Text>
  );
}

export function Subtitle({
  children,
  color,
  maxWidth,
}: {
  readonly children: ReactNode;
  readonly color?: string | undefined;
  readonly maxWidth?: number | undefined;
}): ReactElement {
  return (
    <Text
      as="p"
      color={color}
      style={{ marginTop: SPACING.md, maxWidth }}
      token="sub"
    >
      {children}
    </Text>
  );
}
