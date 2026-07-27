import type { ReactElement } from "react";

import { DesignEngineError } from "../contracts/errors.ts";
import { COLORS } from "../tokens/colors.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import type { BrandBranch, ThemeTone } from "../themes/themes.ts";

/**
 * Marca Aramayo.
 *
 * El isotipo es un SVG con `viewBox` fijo de 120×120: la relación de aspecto se
 * conserva sea cual sea el tamaño y el grosor de trazo no se reescala dos
 * veces. `LOGO_SPEC` publica el área segura y el tamaño mínimo legible para que
 * los layouts respeten el aire de la marca en lugar de estimarlo.
 */

export type LogoVariant = BrandBranch | "familia";

export const LOGO_VARIANTS: readonly LogoVariant[] = Object.freeze([
  "ferreteria",
  "lubricentro",
  "familia",
]);

export const LOGO_SPEC = Object.freeze({
  aspectRatio: 1,
  /** Aire mínimo alrededor del isotipo, como fracción de su tamaño. */
  clearSpaceRatio: 0.25,
  /** Por debajo de este tamaño el isotipo deja de ser legible impreso. */
  minimumSize: 48,
  viewBox: 120,
});

export function logoClearSpace(size: number): number {
  return Math.round(size * LOGO_SPEC.clearSpaceRatio);
}

const DESCRIPTORS: ReadonlyMap<string, string> = new Map([
  ["familia", "Ferretería · Lubricentro"],
  ["ferreteria", "Ferretería"],
  ["lubricentro", "Lubricentro"],
]);

export function logoDescriptorFor(variant: string): string {
  const descriptor = DESCRIPTORS.get(variant);

  if (descriptor === undefined) {
    throw new DesignEngineError(
      {
        assetReference: `logo:${variant}`,
        reason: "not-found",
        stage: "asset",
      },
      "La variante de logo no existe en la identidad aprobada.",
    );
  }

  return descriptor;
}

export interface AramayoMarkProps {
  readonly color?: string | undefined;
  readonly size: number;
}

export function AramayoMark({
  color = "currentColor",
  size,
}: AramayoMarkProps): ReactElement {
  if (size < LOGO_SPEC.minimumSize) {
    throw new DesignEngineError(
      {
        assetReference: "logo:mark",
        reason: "rejected",
        stage: "asset",
      },
      "El isotipo no puede dibujarse por debajo de su tamaño mínimo legible.",
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox={`0 0 ${String(LOGO_SPEC.viewBox)} ${String(LOGO_SPEC.viewBox)}`}
      width={size}
    >
      <polygon
        points="114,60 87,107 33,107 6,60 33,13 87,13"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={8}
      />
      <path
        d="M34 100 L60 26 L86 100"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={12}
      />
      <path
        d="M45 75 L75 75"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={12}
      />
    </svg>
  );
}

export interface LogoProps {
  readonly markColor?: string | undefined;
  readonly showDescriptor?: boolean | undefined;
  readonly size?: number | undefined;
  readonly textColor?: string | undefined;
  readonly tone?: ThemeTone | undefined;
  readonly variant?: LogoVariant | undefined;
}

export function Logo({
  markColor,
  showDescriptor = true,
  size = 64,
  textColor,
  tone = "light",
  variant = "ferreteria",
}: LogoProps): ReactElement {
  const descriptor = logoDescriptorFor(variant);
  const resolvedMarkColor =
    markColor ?? (variant === "lubricentro" ? COLORS.safety : COLORS.rust);
  const resolvedTextColor =
    textColor ?? (tone === "light" ? COLORS.ink : COLORS.paper);

  return (
    <div
      data-logo=""
      data-role="logo"
      style={{
        alignItems: "center",
        color: resolvedTextColor,
        display: "flex",
        gap: 16,
      }}
    >
      <span
        style={{
          color: resolvedMarkColor,
          display: "grid",
          flexShrink: 0,
          height: size,
          placeItems: "center",
          width: size,
        }}
      >
        <AramayoMark size={size} />
      </span>
      {showDescriptor ? (
        <span style={{ display: "grid", gap: 4 }}>
          <span
            style={{
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: 38,
              fontWeight: FONT_WEIGHTS.extrabold,
              lineHeight: 0.78,
              textTransform: "uppercase",
            }}
          >
            {variant === "familia" ? "Aramayo" : descriptor}
            {variant === "familia" ? null : <br />}
            {variant === "familia" ? null : "Aramayo"}
          </span>
          <span
            style={{
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 11,
              fontWeight: FONT_WEIGHTS.semibold,
              lineHeight: 1,
              opacity: 0.7,
              textTransform: "uppercase",
            }}
          >
            {variant === "familia" ? descriptor : "Frías · Santiago del Estero"}
          </span>
        </span>
      ) : null}
    </div>
  );
}
