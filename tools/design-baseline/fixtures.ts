import { readFixtureMetadata } from "./frontmatter.ts";

/**
 * Selección congelada de fixtures.
 *
 * La cobertura no se elige a mano: se toma una pieza real por cada layout en
 * uso productivo. Así, agregar un layout al generador y volver a congelar
 * incorpora su fixture en lugar de dejar un hueco silencioso.
 *
 * A esa cobertura se suman casos borde derivados —texto largo, ausencia de foto
 * y foto con proporción extrema— que existen sólo en esta línea base y nunca se
 * escriben en el repositorio fuente.
 */

export interface PostFile {
  readonly content: string;
  readonly path: string;
}

export interface SelectedFixture {
  readonly content: string;
  readonly coverage: string;
  readonly id: string;
  readonly sourcePath: string;
}

export interface DerivedFixture {
  readonly basedOn: string;
  readonly content: string;
  readonly coverage: string;
  readonly id: string;
}

/**
 * Elige la primera pieza de cada layout, ordenando por ruta para que el
 * resultado sea el mismo en cada congelamiento.
 */
export function selectFixturesFromPosts(
  postFiles: readonly PostFile[],
): readonly SelectedFixture[] {
  const byLayout = new Map<string, SelectedFixture>();
  const orderedPosts = [...postFiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );

  for (const postFile of orderedPosts) {
    const metadata = readFixtureMetadata(postFile.content);
    const layout = metadata.layout;

    if (layout === undefined || byLayout.has(layout)) {
      continue;
    }

    byLayout.set(layout, {
      content: postFile.content,
      coverage: `Layout \`${layout}\` en formato ${metadata.size ?? "sin declarar"} y tema ${metadata.theme ?? "por defecto"}`,
      id: layout,
      sourcePath: postFile.path,
    });
  }

  if (byLayout.size === 0) {
    throw new Error("El generador no tiene piezas con layout declarado.");
  }

  return Object.freeze(
    [...byLayout.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  );
}

const longTitle =
  "Taladros, amoladoras, mechas, accesorios y herramientas eléctricas para resolver cualquier trabajo del oficio en el día";
const longSubtitle =
  "Consultá modelos disponibles, potencias, accesorios compatibles, garantías, formas de pago y disponibilidad en Casa Central y en Sucursal Rivadavia antes de acercarte.";

export const derivedFixtures: readonly DerivedFixture[] = Object.freeze([
  {
    basedOn: "posts/feed/01-producto-taladro.md",
    content: `---
layout: producto-destacado
size: 1080x1350
theme: taller
titulo: "${longTitle}"
subtitulo: "${longSubtitle}"
rubro: "Herramientas eléctricas, accesorios y repuestos para el oficio"
badge: "Producto destacado de la semana"
cta: "Consultá stock y disponibilidad por WhatsApp"
image: stock-herramientas-electricas.jpg
imageAlt: "Taladro, amoladora y herramientas eléctricas"
fit: cover
focusX: 50
focusY: 50
zoom: 1
---
Caso borde de texto largo: título, subtítulo, rubro, badge y CTA exceden la longitud habitual.

Sirve para detectar recortes, desbordes y pérdida de jerarquía en la migración.
`,
    coverage: "Texto largo en título, subtítulo, badge y CTA",
    id: "borde-texto-largo",
  },
  {
    basedOn: "posts/feed/01-producto-taladro.md",
    content: `---
layout: producto-destacado
size: 1080x1350
theme: taller
titulo: "Taladros y herramientas para resolver en el día"
subtitulo: "Consultá modelos disponibles, accesorios y mechas para cada trabajo."
rubro: "Herramientas"
badge: "Producto destacado"
cta: "Consultá stock"
---
Caso borde sin foto: la pieza debe resolverse con una composición explícita y no con un hueco silencioso.
`,
    coverage: "Pieza sin foto declarada",
    id: "borde-sin-foto",
  },
  {
    basedOn: "posts/feed/01-producto-taladro.md",
    content: `---
layout: producto-destacado
size: 1080x1350
theme: claro
titulo: "Portada con foto panorámica"
subtitulo: "La foto tiene una proporción extrema respecto del formato 4:5."
rubro: "Fotografía"
badge: "Caso borde"
cta: "Consultá stock"
image: brand/frente-central.jpg
imageAlt: "Frente del local con proporción panorámica"
fit: contain
focusX: 50
focusY: 50
zoom: 1
---
Caso borde de proporción extrema: verifica encuadre, relleno y respeto de zonas seguras cuando la foto no coincide con el formato.
`,
    coverage: "Foto con proporción extrema y encuadre contain",
    id: "borde-foto-panoramica",
  },
]);
