import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { COLORS, FONT_WEIGHTS, TYPOGRAPHY } from "@aramayo/design-engine";
import { Logo } from "@aramayo/design-engine/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

export const metaAppReviewArtifact = Object.freeze({
  administrativeApprovalAt: "2026-08-21",
  altText:
    "Placa técnica de Aramayo Content Platform rotulada App Review y sin oferta comercial.",
  copy: "Publicación de prueba para la revisión técnica de Aramayo Content Platform. Sin oferta comercial.",
  fileName: "meta-app-review-technical.png",
  height: 1350,
  targets: Object.freeze(["instagram_feed", "facebook_page"] as const),
  version: "meta-app-review/2026-08-21.1",
  width: 1080,
});

const fontStylesheetSpecifiers: readonly string[] = Object.freeze([
  "@fontsource/archivo/600.css",
  "@fontsource/archivo/700.css",
  "@fontsource/archivo/800.css",
  "@fontsource/saira-condensed/700.css",
  "@fontsource/saira-condensed/800.css",
  "@fontsource/saira-condensed/900.css",
]);

function fontStylesheetUrls(): readonly string[] {
  return fontStylesheetSpecifiers.map((specifier) =>
    pathToFileURL(require.resolve(specifier)).toString(),
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildMetaAppReviewArtifactHtml(): string {
  const fontLinks = fontStylesheetUrls()
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("");
  const logo = renderToStaticMarkup(
    createElement(Logo, {
      size: 92,
      tone: "light",
      variant: "familia",
    }),
  );
  const altText = escapeHtml(metaAppReviewArtifact.altText);

  return `<!doctype html>
<html lang="es-AR">
<head>
  <meta charset="utf-8">
  ${fontLinks}
  <style>
    :root {
      --ink: ${COLORS.ink};
      --muted: ${COLORS.steel};
      --paper: ${COLORS.paper};
      --rust: ${COLORS.rust};
      --white: ${COLORS.white};
      --display: ${TYPOGRAPHY.display.cssStack};
      --body: ${TYPOGRAPHY.body.cssStack};
    }
    * { box-sizing: border-box; }
    html, body {
      background: transparent;
      height: ${String(metaAppReviewArtifact.height)}px;
      margin: 0;
      overflow: hidden;
      padding: 0;
      width: ${String(metaAppReviewArtifact.width)}px;
    }
    #artifact {
      background:
        linear-gradient(90deg, var(--rust) 0 28px, transparent 28px),
        linear-gradient(rgb(28 26 25 / 5%) 1px, transparent 1px),
        linear-gradient(90deg, rgb(28 26 25 / 5%) 1px, transparent 1px),
        var(--paper);
      background-size: auto, 54px 54px, 54px 54px, auto;
      color: var(--ink);
      display: flex;
      flex-direction: column;
      font-family: var(--body);
      height: ${String(metaAppReviewArtifact.height)}px;
      overflow: hidden;
      padding: 72px 78px 68px 100px;
      position: relative;
      width: ${String(metaAppReviewArtifact.width)}px;
    }
    .topline {
      align-items: center;
      display: flex;
      justify-content: space-between;
      position: relative;
      z-index: 2;
    }
    .reference {
      border: 2px solid var(--ink);
      font-size: 18px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      letter-spacing: .12em;
      padding: 12px 16px;
      text-transform: uppercase;
    }
    .main {
      display: flex;
      flex: 1;
      flex-direction: column;
      justify-content: center;
      padding: 70px 0 56px;
      position: relative;
      z-index: 2;
    }
    .serial {
      color: rgb(28 26 25 / 5%);
      font-family: var(--display);
      font-size: 650px;
      font-weight: ${String(FONT_WEIGHTS.black)};
      line-height: .7;
      position: absolute;
      right: -44px;
      top: 6px;
      user-select: none;
      z-index: -1;
    }
    .badge {
      align-self: flex-start;
      background: var(--rust);
      color: var(--white);
      font-size: 23px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      letter-spacing: .14em;
      padding: 14px 20px;
      text-transform: uppercase;
    }
    h1 {
      font-family: var(--display);
      font-size: 226px;
      font-weight: ${String(FONT_WEIGHTS.black)};
      letter-spacing: -.045em;
      line-height: .72;
      margin: 42px 0 38px;
      max-width: 800px;
      text-transform: uppercase;
    }
    .subtitle {
      font-size: 37px;
      font-weight: ${String(FONT_WEIGHTS.bold)};
      line-height: 1.12;
      margin: 0;
      max-width: 670px;
    }
    .commercial-status {
      align-items: center;
      display: flex;
      font-size: 22px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      gap: 14px;
      letter-spacing: .1em;
      margin-top: 30px;
      text-transform: uppercase;
    }
    .commercial-status::before {
      background: var(--rust);
      content: "";
      display: block;
      height: 4px;
      width: 74px;
    }
    .limits {
      border-bottom: 3px solid var(--ink);
      border-top: 3px solid var(--ink);
      display: grid;
      grid-template-columns: 1fr 1fr;
      position: relative;
      z-index: 2;
    }
    .limit {
      min-height: 118px;
      padding: 22px 20px 20px 0;
    }
    .limit + .limit {
      border-left: 1px solid rgb(28 26 25 / 28%);
      padding-left: 28px;
    }
    .limit-label {
      color: var(--muted);
      display: block;
      font-size: 15px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      letter-spacing: .12em;
      margin-bottom: 9px;
      text-transform: uppercase;
    }
    .limit-value {
      font-family: var(--display);
      font-size: 31px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      line-height: .95;
      text-transform: uppercase;
    }
    .footer {
      align-items: center;
      display: flex;
      font-size: 16px;
      font-weight: ${String(FONT_WEIGHTS.extrabold)};
      justify-content: space-between;
      letter-spacing: .1em;
      padding-top: 24px;
      position: relative;
      text-transform: uppercase;
      z-index: 2;
    }
    .footer span:last-child { color: var(--rust); }
  </style>
</head>
<body>
  <main id="artifact" data-meta-app-review-artifact="" role="img" aria-label="${altText}">
    <div class="topline">
      ${logo}
      <span class="reference">REV–01 · STAGING</span>
    </div>
    <section class="main">
      <span class="serial" aria-hidden="true">01</span>
      <span class="badge">Prueba técnica</span>
      <h1>App<br>Review</h1>
      <p class="subtitle">Verificación de publicación de Aramayo Content Platform</p>
      <p class="commercial-status">Sin oferta comercial</p>
    </section>
    <section class="limits" aria-label="Alcance de la prueba">
      <div class="limit">
        <span class="limit-label">Destinos previstos</span>
        <span class="limit-value">Instagram feed<br>Facebook Page</span>
      </div>
      <div class="limit">
        <span class="limit-label">Límite operativo</span>
        <span class="limit-value">Una publicación<br>por destino</span>
      </div>
    </section>
    <footer class="footer">
      <span>Aramayo Content Platform</span>
      <span>Entorno de revisión</span>
    </footer>
  </main>
</body>
</html>`;
}
