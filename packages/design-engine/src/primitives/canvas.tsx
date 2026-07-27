import type { CSSProperties, ReactElement, ReactNode } from "react";

import type { DesignFormat } from "../formats/formats.ts";
import type { Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { TYPOGRAPHY } from "../tokens/typography.ts";

/**
 * Lienzo exportable.
 *
 * `data-card` marca el nodo exacto que el worker recorta al exportar: el render
 * nunca captura la ventana completa. El lienzo fija tamaño, tema y familia
 * tipográfica; el resto de la composición ocurre dentro.
 */

export interface BackdropProps {
  readonly theme: Theme;
}

export function Backdrop({ theme }: BackdropProps): ReactElement {
  const lineColor =
    theme.tone === "dark"
      ? withAlpha(COLORS.paper, 0.08)
      : withAlpha(COLORS.ink, 0.08);
  const accentColor = withAlpha(
    theme.brand === "lubricentro" ? COLORS.safety : COLORS.rust,
    0.12,
  );

  return (
    <>
      <div
        style={{
          background: `linear-gradient(135deg, ${lineColor} 0 1px, transparent 1px 42px), linear-gradient(180deg, ${accentColor}, transparent 48%)`,
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
      <div
        style={{
          background: `linear-gradient(180deg, ${withAlpha(COLORS.white, 0.04)}, transparent 38%, ${withAlpha("#000000", 0.12)})`,
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
    </>
  );
}

export interface CanvasProps {
  readonly backdrop?: boolean | undefined;
  readonly children: ReactNode;
  readonly format: DesignFormat;
  readonly style?: CSSProperties | undefined;
  readonly theme: Theme;
}

export function Canvas({
  backdrop = true,
  children,
  format,
  style,
  theme,
}: CanvasProps): ReactElement {
  return (
    <div
      data-card=""
      data-format={format.id}
      data-theme={theme.id}
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: TYPOGRAPHY.body.cssStack,
        height: format.height,
        overflow: "hidden",
        position: "relative",
        width: format.width,
        ...style,
      }}
    >
      {backdrop ? <Backdrop theme={theme} /> : null}
      {children}
    </div>
  );
}

/**
 * Marco de zona segura: sitúa el contenido dentro de los márgenes aprobados del
 * formato en lugar de repetir `padding: 72` en cada layout.
 */
export interface SafeAreaProps {
  readonly children: ReactNode;
  readonly format: DesignFormat;
  readonly style?: CSSProperties | undefined;
}

export function SafeArea({
  children,
  format,
  style,
}: SafeAreaProps): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        paddingBottom: format.safeArea.bottom,
        paddingLeft: format.safeArea.left,
        paddingRight: format.safeArea.right,
        paddingTop: format.safeArea.top,
        position: "relative",
        zIndex: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
