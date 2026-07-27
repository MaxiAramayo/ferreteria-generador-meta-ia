import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  designEngineStylesheet,
  formatFor,
  type DesignDocument,
} from "@aramayo/design-engine";
import { DesignPiece, type LayoutContext } from "@aramayo/design-engine/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Documento HTML que se renderiza en el navegador.
 *
 * Se construye completo en el worker: no hay servidor intermedio ni recursos
 * remotos. Las fuentes se enlazan desde los paquetes instalados y los activos
 * desde el directorio del motor, ambos por `file://`, de modo que un render no
 * depende de la red y siempre usa la versión aprobada.
 */

const require = createRequire(import.meta.url);

const fontStylesheetSpecifiers: readonly string[] = [
  "@fontsource/archivo/400.css",
  "@fontsource/archivo/500.css",
  "@fontsource/archivo/600.css",
  "@fontsource/archivo/700.css",
  "@fontsource/archivo/800.css",
  "@fontsource/saira-condensed/500.css",
  "@fontsource/saira-condensed/600.css",
  "@fontsource/saira-condensed/700.css",
  "@fontsource/saira-condensed/800.css",
  "@fontsource/saira-condensed/900.css",
];

export function fontStylesheetUrls(): readonly string[] {
  return fontStylesheetSpecifiers.map(
    (specifier) => pathToFileURL(require.resolve(specifier)).href,
  );
}

/**
 * Los activos aprobados viven en el paquete del motor; el render los lee de
 * disco en lugar de pedirlos por HTTP.
 */
export function assetBaseUrl(): string {
  const packageJsonPath =
    require.resolve("@aramayo/design-engine/package.json");
  const assetsDirectory = new URL("assets/", pathToFileURL(packageJsonPath));

  return assetsDirectory.href.replace(/\/$/u, "");
}

export function renderContextFor(brand: LayoutContext["brand"]): LayoutContext {
  return { assetBaseUrl: assetBaseUrl(), brand };
}

export interface RenderDocumentOptions {
  readonly context: LayoutContext;
  readonly document: DesignDocument;
}

export function buildRenderHtml({
  context,
  document,
}: RenderDocumentOptions): string {
  const format = formatFor(document.format);
  const markup = renderToStaticMarkup(
    createElement(DesignPiece, { context, document }),
  );
  const fontLinks = fontStylesheetUrls()
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");

  return [
    "<!doctype html>",
    '<html lang="es-AR">',
    "<head>",
    '<meta charset="utf-8">',
    fontLinks,
    "<style>",
    designEngineStylesheet(),
    // El lienzo debe quedar exactamente en su tamaño: sin márgenes del
    // documento ni barras de desplazamiento que desplacen el recorte.
    `html,body{margin:0;padding:0;background:transparent;width:${String(format.width)}px;height:${String(format.height)}px;overflow:hidden;}`,
    "*{box-sizing:border-box;}",
    "</style>",
    "</head>",
    "<body>",
    markup,
    "</body>",
    "</html>",
  ].join("");
}

/**
 * Espera que la pieza esté realmente lista para exportar.
 *
 * Se ejecuta dentro de la página: las fuentes tienen que estar cargadas y cada
 * imagen decodificada. Una imagen que no decodifica devuelve su origen para que
 * el trabajo falle con un error de activo, en lugar de exportar un hueco.
 */
export const waitForRenderAssets = `
  (async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    const broken = [];
    for (const image of images) {
      try {
        await image.decode();
      } catch {
        broken.push(image.getAttribute("src") ?? "sin origen");
      }
    }
    return broken;
  })()
`;

export function assetsDirectoryPath(): string {
  return fileURLToPath(`${assetBaseUrl()}/`);
}
