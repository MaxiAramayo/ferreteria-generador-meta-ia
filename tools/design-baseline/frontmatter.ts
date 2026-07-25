/**
 * Lectura mínima del frontmatter de una pieza.
 *
 * Sólo interesa la metadata que la línea base necesita comparar: layout,
 * formato, tema y categoría. No se reimplementa YAML: un valor que no se pueda
 * leer queda como `undefined` y el congelamiento lo informa.
 */

export interface FixtureMetadata {
  readonly categoria: string | undefined;
  readonly layout: string | undefined;
  readonly size: string | undefined;
  readonly theme: string | undefined;
}

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---/u;

function readScalar(frontmatter: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "mu").exec(frontmatter);
  const rawValue = match?.[1]?.trim();

  if (rawValue === undefined || rawValue.length === 0 || rawValue === "|-") {
    return undefined;
  }

  const quote = rawValue.at(0);
  return (quote === '"' || quote === "'") && rawValue.at(-1) === quote
    ? rawValue.slice(1, -1)
    : rawValue;
}

export function readFixtureMetadata(fileContent: string): FixtureMetadata {
  const match = frontmatterPattern.exec(fileContent);

  if (match?.[1] === undefined) {
    throw new Error("La pieza no declara frontmatter.");
  }

  const frontmatter = match[1];

  return Object.freeze({
    categoria: readScalar(frontmatter, "categoria"),
    layout: readScalar(frontmatter, "layout"),
    size: readScalar(frontmatter, "size"),
    theme: readScalar(frontmatter, "theme"),
  });
}

export function parseSize(size: string): {
  readonly height: number;
  readonly width: number;
} {
  const [width, height] = size.split("x").map(Number);

  if (
    width === undefined ||
    height === undefined ||
    !Number.isInteger(width) ||
    !Number.isInteger(height)
  ) {
    throw new Error(`Tamaño inválido: ${size}.`);
  }

  return Object.freeze({ height, width });
}
