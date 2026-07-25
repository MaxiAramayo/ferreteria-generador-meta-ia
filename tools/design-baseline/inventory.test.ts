import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractFonts,
  extractFormats,
  extractIconLibrary,
  extractIconNames,
  extractLayoutIds,
  extractThemeIds,
} from "./inventory.ts";
import { selectFixturesFromPosts } from "./fixtures.ts";
import { parseSize, readFixtureMetadata } from "./frontmatter.ts";
import { readPngDimensions } from "./references.ts";
import { parseDirtyPaths } from "./snapshot.ts";

/** La anotación de tipo real incluye llaves propias antes del objeto. */
const layoutsSource = `
export const LAYOUTS: Record<Post['layout'], (props: { post: Post }) => ReactElement> = {
  'producto-destacado': ProductoDestacado,
  'promo-producto': PromoProducto,
  'historia-informativa': HistoriaInformativa,
}
`;

const themeSource = `
export const THEMES: Record<ThemeId, Theme> = {
  taller: { id: 'taller' },
  claro: { id: 'claro' },
}
`;

const formatsSource = `
const SAFE_FEED: SafeArea = { top: 72, right: 72, bottom: 72, left: 72 }

export const FORMATS: Record<FormatId, SocialFormat> = {
  feed: makeFormat(
    'feed',
    'Post feed 4:5',
    '1080x1350',
    'feed',
    'Instagram',
    '4:5',
    SAFE_FEED,
    'Formato principal.',
  ),
  destacada: makeFormat(
    'destacada',
    'Portada destacada',
    '1080x1080',
    'destacada',
    'Highlights',
    '1:1',
    { top: 110, right: 110, bottom: 110, left: 110, circleDiameter: 860 },
    'Recorte circular.',
  ),
}
`;

const packageJson = JSON.stringify({
  dependencies: {
    "@fontsource/archivo": "^5.2.8",
    "@fontsource/inter": "^5.2.8",
    "lucide-react": "^0.561.0",
    react: "^19.2.7",
  },
});

const iconSource = `
const MAP: Record<string, LucideIcon> = {
  aceite: Droplets,
  bateria: BatteryCharging,
}
`;

test("extrae el registro completo de layouts", () => {
  assert.deepEqual(extractLayoutIds(layoutsSource), [
    "producto-destacado",
    "promo-producto",
    "historia-informativa",
  ]);
});

test("un registro de layouts ilegible detiene el congelamiento", () => {
  assert.throws(() => extractLayoutIds("sin registro"), /LAYOUTS/u);
});

test("extrae temas declarados", () => {
  assert.deepEqual(extractThemeIds(themeSource), ["taller", "claro"]);
});

test("extrae formatos con tamaño y zona segura resueltos", () => {
  const formats = extractFormats(formatsSource);

  assert.equal(formats.length, 2);

  const [feed, destacada] = formats;

  assert.ok(feed);
  assert.ok(destacada);
  assert.equal(feed.id, "feed");
  assert.equal(feed.width, 1080);
  assert.equal(feed.height, 1350);
  assert.equal(feed.safeArea, "{ top: 72, right: 72, bottom: 72, left: 72 }");
  assert.ok(destacada.safeArea.includes("circleDiameter: 860"));
});

test("extrae familias tipográficas e ignora el resto de dependencias", () => {
  const fonts = extractFonts(packageJson);

  assert.deepEqual(
    fonts.map((font) => font.family),
    ["archivo", "inter"],
  );
  assert.equal(extractIconLibrary(packageJson), "lucide-react@^0.561.0");
});

test("extrae nombres semánticos de icono", () => {
  assert.deepEqual(extractIconNames(iconSource), ["aceite", "bateria"]);
});

test("lee la metadata mínima del frontmatter", () => {
  const metadata = readFixtureMetadata(
    `---
layout: producto-destacado
size: 1080x1350
theme: taller
titulo: "Con dos puntos: y comillas"
---
Cuerpo.
`,
  );

  assert.equal(metadata.layout, "producto-destacado");
  assert.equal(metadata.size, "1080x1350");
  assert.equal(metadata.theme, "taller");
  assert.equal(metadata.categoria, undefined);
});

test("una pieza sin frontmatter falla de forma explícita", () => {
  assert.throws(() => readFixtureMetadata("sin frontmatter"), /frontmatter/u);
});

test("parseSize rechaza tamaños inválidos", () => {
  assert.deepEqual(parseSize("1080x1350"), { height: 1350, width: 1080 });
  assert.throws(() => parseSize("grande"), /inválido/u);
});

test("lee dimensiones desde la cabecera PNG", () => {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(1080, 16);
  png.writeUInt32BE(1350, 20);

  assert.deepEqual(readPngDimensions(png), { height: 1350, width: 1080 });
  assert.throws(() => readPngDimensions(Buffer.alloc(24)), /PNG/u);
});

test("clasifica rutas sucias del checkout fuente", () => {
  assert.deepEqual(
    parseDirtyPaths(" M src/App.tsx\n?? nuevo.md\n D posts/viejo.md\n"),
    ["nuevo.md", "posts/viejo.md", "src/App.tsx"],
  );
});

test("cubre un fixture por layout en uso y prioriza la primera pieza", () => {
  const fixtures = selectFixturesFromPosts([
    {
      content: "---\nlayout: producto-destacado\nsize: 1080x1350\n---\nA\n",
      path: "posts/feed/02-segundo.md",
    },
    {
      content: "---\nlayout: producto-destacado\nsize: 1080x1350\n---\nB\n",
      path: "posts/feed/01-primero.md",
    },
    {
      content: "---\nlayout: historia-informativa\nsize: 1080x1920\n---\nC\n",
      path: "posts/historia/01.md",
    },
  ]);

  assert.deepEqual(
    fixtures.map((fixture) => fixture.id),
    ["historia-informativa", "producto-destacado"],
  );
  assert.equal(
    fixtures.find((fixture) => fixture.id === "producto-destacado")?.sourcePath,
    "posts/feed/01-primero.md",
  );
});

test("sin piezas con layout la selección falla", () => {
  assert.throws(
    () =>
      selectFixturesFromPosts([
        { content: "---\nsize: 1080x1350\n---\nSin layout\n", path: "a.md" },
      ]),
    /layout/u,
  );
});
