import { COLORS } from "@aramayo/design-engine";
import { AramayoMark } from "@aramayo/design-engine/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

/** El mismo isotipo de la pieza, con un cuarto de su tamaño como aire total. */
export async function renderMetaAppReviewAppIcon(): Promise<Buffer> {
  const size = 1024;
  const markSize = 768;
  const inset = (size - markSize) / 2;
  const svg = renderToStaticMarkup(
    createElement(
      "svg",
      {
        height: size,
        viewBox: `0 0 ${String(size)} ${String(size)}`,
        width: size,
        xmlns: "http://www.w3.org/2000/svg",
      },
      createElement("rect", {
        fill: COLORS.graphiteDeep,
        height: size,
        width: size,
      }),
      createElement(
        "g",
        { transform: `translate(${String(inset)},${String(inset)})` },
        createElement(AramayoMark, { color: COLORS.rust, size: markSize }),
      ),
    ),
  );
  return sharp(Buffer.from(svg)).png().toBuffer();
}
