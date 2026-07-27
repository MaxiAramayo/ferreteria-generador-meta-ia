import type { CSSProperties, ReactElement } from "react";

import type { MediaAsset } from "../contracts/document.ts";
import { DesignEngineError } from "../contracts/errors.ts";
import { resolveAssetUrl } from "../assets/asset-resolver.ts";
import type { Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII } from "../tokens/space.ts";
import { isFontRole, TYPOGRAPHY, type FontRole } from "../tokens/typography.ts";
import { Icon } from "./icon.tsx";
import type { IconName } from "../registry/icons.ts";

/**
 * Foto con encuadre explícito.
 *
 * El encuadre no queda a criterio del layout: viaja en el documento como
 * `fit`, `focus` y `zoom`, ya normalizados por la validación. Un activo que no
 * está en la biblioteca aprobada hace fallar la composición desde
 * `resolveAssetUrl`, en lugar de dejar un hueco silencioso.
 */

export interface PhotoProps {
  readonly asset: MediaAsset;
  readonly assetBaseUrl: string;
  readonly className?: string | undefined;
  /** Color visible cuando la foto se ajusta con `contain`. */
  readonly matte?: string | undefined;
  readonly radius?: number | undefined;
  readonly style?: CSSProperties | undefined;
}

export function Photo({
  asset,
  assetBaseUrl,
  className,
  matte = COLORS.paper,
  radius = RADII.photo,
  style,
}: PhotoProps): ReactElement {
  const source = resolveAssetUrl(asset.reference, { assetBaseUrl });
  const position = `${String(asset.focus.x)}% ${String(asset.focus.y)}%`;

  return (
    <div
      className={className}
      style={{
        background: asset.fit === "contain" ? matte : undefined,
        borderRadius: radius,
        overflow: "hidden",
        ...style,
      }}
    >
      <img
        alt={asset.alt}
        src={source}
        style={{
          display: "block",
          height: "100%",
          objectFit: asset.fit,
          objectPosition: position,
          transform:
            asset.zoom === 1 ? undefined : `scale(${String(asset.zoom)})`,
          transformOrigin: position,
          width: "100%",
        }}
      />
    </div>
  );
}

/**
 * Familia tipográfica por rol.
 *
 * Un rol inexistente no cae en una fuente del sistema: es un error de activo,
 * igual que un logo o una foto que no existen.
 */
export function fontFamilyFor(role: string): string {
  if (!isFontRole(role)) {
    throw new DesignEngineError(
      { assetReference: `font:${role}`, reason: "not-found", stage: "asset" },
      "La familia tipográfica no pertenece a la identidad aprobada.",
    );
  }

  const fontRole: FontRole = role;

  return TYPOGRAPHY[fontRole].cssStack;
}

export interface PhotoFallbackProps {
  readonly className?: string | undefined;
  readonly icon?: IconName | undefined;
  readonly radius?: number | undefined;
  readonly style?: CSSProperties | undefined;
  readonly theme: Theme;
}

/**
 * Marcador visible para una pieza sin foto declarada.
 *
 * Es un estado explícito, no un hueco: la línea base lo documenta como el
 * comportamiento esperado cuando el contenido todavía no tiene imagen. Un
 * activo inválido, en cambio, hace fallar la composición.
 */
export function PhotoFallback({
  className,
  icon = "tienda",
  radius = RADII.photo,
  style,
  theme,
}: PhotoFallbackProps): ReactElement {
  return (
    <div
      className={className}
      data-photo-fallback=""
      style={{
        alignItems: "center",
        backgroundColor: withAlpha(theme.colors.text, 0.08),
        border: `2px dashed ${theme.colors.border}`,
        borderRadius: radius,
        color: theme.colors.primary,
        display: "grid",
        justifyItems: "center",
        ...style,
      }}
    >
      <Icon name={icon} size={96} />
    </div>
  );
}
