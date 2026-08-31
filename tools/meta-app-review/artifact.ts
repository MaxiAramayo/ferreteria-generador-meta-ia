import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import { designEngineStylesheet, formatFor } from "@aramayo/design-engine";
import { DesignPiece, type LayoutContext } from "@aramayo/design-engine/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { metaAppReviewDesignDocument } from "./content.ts";
import { metaAppReviewPackage } from "./manifest.ts";

const require = createRequire(import.meta.url);

export const metaAppReviewArtifact = metaAppReviewPackage;
export const metaAppReviewIllustrativeAssetUrl = new URL(
  "./assets/soldadora-ilustrativa-v1.png",
  import.meta.url,
);

export function metaAppReviewIllustrativeAssetBytes(): Buffer {
  return readFileSync(metaAppReviewIllustrativeAssetUrl);
}

const fontStylesheetSpecifiers: readonly string[] = Object.freeze([
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
]);

function fontStylesheetUrls(): readonly string[] {
  return fontStylesheetSpecifiers.map((specifier) =>
    pathToFileURL(require.resolve(specifier)).toString(),
  );
}

function assetBaseUrl(): string {
  const packageJsonPath =
    require.resolve("@aramayo/design-engine/package.json");
  return new URL("assets/", pathToFileURL(packageJsonPath)).href.replace(
    /\/$/u,
    "",
  );
}

function renderContext(): LayoutContext {
  return {
    assetBaseUrl: assetBaseUrl(),
    brand: ARAMAYO_BRAND_PROFILE,
  };
}

export function buildMetaAppReviewArtifactHtml(): string {
  const illustrativeDataUrl = `data:image/png;base64,${metaAppReviewIllustrativeAssetBytes().toString("base64")}`;
  const document = metaAppReviewDesignDocument({
    dataUrl: illustrativeDataUrl,
    source: "inline",
  });
  const format = formatFor(document.format);
  const fontLinks = fontStylesheetUrls()
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const markup = renderToStaticMarkup(
    createElement(DesignPiece, {
      context: renderContext(),
      document,
    }),
  );

  return [
    "<!doctype html>",
    '<html lang="es-AR">',
    "<head>",
    '<meta charset="utf-8">',
    fontLinks,
    "<style>",
    designEngineStylesheet(),
    `html,body{margin:0;padding:0;background:transparent;width:${String(format.width)}px;height:${String(format.height)}px;overflow:hidden;}`,
    "*{box-sizing:border-box;}",
    "</style>",
    "</head>",
    '<body data-meta-app-review-artifact="">',
    markup,
    "</body>",
    "</html>",
  ].join("");
}
