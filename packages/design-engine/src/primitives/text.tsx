import type { CSSProperties, ReactElement, ReactNode } from "react";

import {
  TYPE_SCALE,
  TYPOGRAPHY,
  type TypeStyleToken,
} from "../tokens/typography.ts";

/**
 * Texto de marca.
 *
 * Traduce un nivel de la escala tipográfica a estilos concretos. Ningún layout
 * vuelve a escribir un tamaño, un peso o un interlineado suelto: pide `hero`,
 * `h1`, `sub`, `body` o `label`.
 */

export function typeStyleFor(token: TypeStyleToken): CSSProperties {
  const style = TYPE_SCALE[token];

  return {
    fontFamily: TYPOGRAPHY[style.role].cssStack,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing === 0 ? undefined : style.letterSpacing,
    lineHeight: style.lineHeight,
    textTransform: style.textTransform,
  };
}

export interface TextProps {
  readonly as?: "div" | "h1" | "h2" | "p" | "span";
  readonly children: ReactNode;
  readonly color?: string;
  readonly style?: CSSProperties;
  readonly token: TypeStyleToken;
}

export function Text({
  as: Component = "span",
  children,
  color,
  style,
  token,
}: TextProps): ReactElement {
  return (
    <Component style={{ ...typeStyleFor(token), color, margin: 0, ...style }}>
      {children}
    </Component>
  );
}
