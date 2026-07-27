import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COLORS,
  DesignEngineError,
  FORMATS,
  themeFor,
  TYPOGRAPHY,
} from "../../dist/index.js";
import {
  AramayoMark,
  Canvas,
  fontFamilyFor,
  Icon,
  iconComponentFor,
  LOGO_SPEC,
  Logo,
  logoClearSpace,
  logoDescriptorFor,
  Photo,
  PhotoFallback,
  SafeArea,
  Text,
} from "../../dist/react.js";

/**
 * Las primitivas se comprueban por su salida: qué dibujan y, sobre todo, cómo
 * fallan. Un activo, un icono, una variante de logo o un tamaño inválidos
 * detienen la composición en lugar de producir una pieza incompleta.
 *
 * Las pruebas se escriben con `createElement` en lugar de JSX y consumen la
 * compilación del paquete: Node ejecuta TypeScript quitando tipos, pero no
 * transforma JSX. Probar `dist/` además verifica exactamente lo que reciben los
 * consumidores.
 */

const assetBaseUrl = "https://panel.example/media";

function markup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

test("el lienzo marca el nodo exportable y aplica formato y tema", () => {
  const html = markup(
    createElement(Canvas, {
      children: createElement("span", null, "contenido"),
      format: FORMATS.feed,
      theme: themeFor("taller"),
    }),
  );

  assert.match(html, /data-card=""/u);
  assert.match(html, /data-format="feed"/u);
  assert.match(html, /data-theme="taller"/u);
  assert.match(html, /width:1080px/u);
  assert.match(html, /height:1350px/u);
  assert.ok(html.includes(COLORS.ink));
});

test("la zona segura usa los márgenes del formato y no valores sueltos", () => {
  const html = markup(
    createElement(SafeArea, {
      children: createElement("span", null, "contenido"),
      format: FORMATS.historia,
    }),
  );

  assert.match(html, /padding-top:250px/u);
  assert.match(html, /padding-bottom:300px/u);
  assert.match(html, /padding-left:72px/u);
});

test("la foto aplica encuadre, foco y zoom declarados", () => {
  const html = markup(
    createElement(Photo, {
      asset: {
        alt: "Taladro sobre un banco",
        fit: "contain",
        focus: { x: 30, y: 70 },
        reference: {
          assetId: "stock-herramientas-electricas",
          source: "brand-library",
        },
        zoom: 1.5,
      },
      assetBaseUrl,
    }),
  );

  assert.match(html, /object-fit:contain/u);
  assert.match(html, /object-position:30% 70%/u);
  assert.match(html, /transform:scale\(1\.5\)/u);
  assert.match(html, /alt="Taladro sobre un banco"/u);
  assert.match(html, /src="https:\/\/panel\.example\/media\//u);
});

test("una foto cuyo activo no existe detiene la composición", () => {
  assert.throws(
    () =>
      markup(
        createElement(Photo, {
          asset: {
            alt: "Foto inexistente",
            fit: "cover",
            focus: { x: 50, y: 50 },
            reference: { assetId: "foto-inexistente", source: "brand-library" },
            zoom: 1,
          },
          assetBaseUrl,
        }),
      ),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "asset",
  );
});

test("el icono se elige por nombre semántico y usa Lucide", () => {
  const html = markup(createElement(Icon, { name: "lubricentro", size: 48 }));

  assert.match(html, /<svg/u);
  assert.match(html, /aria-hidden="true"/u);
  assert.match(html, /lucide/u);
});

test("un nombre de icono fuera del registro es un error de contenido", () => {
  assert.throws(
    () => iconComponentFor("martillo-dorado"),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "content",
  );
});

test("el logo conserva relación de aspecto y publica su área segura", () => {
  const html = markup(createElement(AramayoMark, { size: 120 }));

  assert.match(html, /viewBox="0 0 120 120"/u);
  assert.match(html, /width="120"/u);
  assert.match(html, /height="120"/u);
  assert.equal(LOGO_SPEC.aspectRatio, 1);
  assert.equal(logoClearSpace(120), 30);
});

test("una variante de logo inexistente y un tamaño ilegible fallan", () => {
  assert.throws(
    () => logoDescriptorFor("mayorista"),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "asset",
  );

  assert.throws(
    () =>
      markup(createElement(AramayoMark, { size: LOGO_SPEC.minimumSize - 1 })),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "asset",
  );
});

test("el logo describe la rama de marca correspondiente", () => {
  assert.match(
    markup(createElement(Logo, { variant: "lubricentro" })),
    /Lubricentro/u,
  );
  assert.match(
    markup(createElement(Logo, { variant: "familia" })),
    /Ferretería · Lubricentro/u,
  );
  assert.match(
    markup(createElement(Logo, { variant: "ferreteria" })),
    /Frías · Santiago del Estero/u,
  );
});

test("el texto resuelve la escala tipográfica desde los tokens", () => {
  const html = markup(
    createElement(Text, { as: "h1", children: "Taladros", token: "h1" }),
  );

  assert.match(html, /font-size:92px/u);
  assert.match(html, /font-weight:800/u);
  assert.match(html, /text-transform:uppercase/u);
  assert.match(html, /Saira Condensed/u);
});

test("una pieza sin foto muestra un marcador explícito, no un hueco", () => {
  const html = markup(
    createElement(PhotoFallback, { theme: themeFor("taller") }),
  );

  assert.match(html, /data-photo-fallback=""/u);
  assert.match(html, /<svg/u);
  assert.match(html, /dashed/u);
});

test("una familia tipográfica inexistente es un error de activo", () => {
  assert.equal(fontFamilyFor("display"), TYPOGRAPHY.display.cssStack);

  assert.throws(
    () => fontFamilyFor("manuscrita"),
    (error: unknown) =>
      error instanceof DesignEngineError && error.failure.stage === "asset",
  );
});
