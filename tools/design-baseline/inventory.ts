import type { OwnershipStatus } from "./asset-ownership.ts";

/**
 * Extracción del inventario visual desde el código fuente del generador.
 *
 * Las funciones son puras sobre el texto de cada archivo: el congelamiento se
 * puede repetir y auditar sin ejecutar el repositorio anterior. Si un bloque no
 * se puede leer, la extracción falla en lugar de devolver una lista parcial que
 * parezca completa.
 */

export interface FormatEntry {
  readonly height: number;
  readonly id: string;
  readonly label: string;
  readonly safeArea: string;
  readonly size: string;
  readonly width: number;
}

export interface FontEntry {
  readonly family: string;
  readonly package: string;
  readonly version: string;
}

export interface AssetEntry {
  readonly bytes: number;
  readonly kind: "brand" | "media";
  readonly ownership: OwnershipStatus;
  readonly ownershipNote: string;
  readonly path: string;
  readonly sha256: string;
}

function extractBlock(
  source: string,
  marker: string,
  openingCharacter: "{" | "(",
): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`No se encontró "${marker}" en el archivo fuente.`);
  }

  const start = source.indexOf(openingCharacter, markerIndex);
  if (start === -1) {
    throw new Error(`No se encontró el bloque de "${marker}".`);
  }

  const closingCharacter = openingCharacter === "{" ? "}" : ")";
  let depth = 0;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === openingCharacter) {
      depth += 1;
    } else if (character === closingCharacter) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start + 1, index);
      }
    }
  }

  throw new Error(`El bloque de "${marker}" no está balanceado.`);
}

/**
 * Extrae el objeto asignado a una declaración.
 *
 * Busca el `= {` en lugar de la primera llave: la anotación de tipo del
 * registro de layouts contiene llaves propias (`(props: { post: Post })`) y
 * empezar por ellas devolvería un bloque equivocado.
 */
function extractRecordBlock(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`No se encontró "${marker}" en el archivo fuente.`);
  }

  const assignmentIndex = source.indexOf("= {", markerIndex);
  if (assignmentIndex === -1) {
    throw new Error(`"${marker}" no asigna un objeto.`);
  }

  return extractBlock(source.slice(assignmentIndex), "=", "{");
}

export function extractLayoutIds(layoutsSource: string): readonly string[] {
  const block = extractRecordBlock(layoutsSource, "export const LAYOUTS");
  const identifiers = [...block.matchAll(/^\s*'([a-z0-9-]+)':/gmu)].map(
    (match) => match[1] ?? "",
  );

  if (identifiers.length === 0) {
    throw new Error("El registro de layouts quedó vacío.");
  }

  return Object.freeze(identifiers);
}

export function extractThemeIds(themeSource: string): readonly string[] {
  const block = extractRecordBlock(themeSource, "export const THEMES");
  const identifiers = [...block.matchAll(/^\s{2}([a-z0-9-]+):\s*\{/gmu)].map(
    (match) => match[1] ?? "",
  );

  if (identifiers.length === 0) {
    throw new Error("El registro de temas quedó vacío.");
  }

  return Object.freeze(identifiers);
}

function readSafeAreaConstants(
  formatsSource: string,
): ReadonlyMap<string, string> {
  const constants = new Map<string, string>();

  for (const match of formatsSource.matchAll(
    /const (SAFE_[A-Z_]+): SafeArea = (\{[^}]*\})/gu,
  )) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      constants.set(name, value.replace(/\s+/gu, " ").trim());
    }
  }

  return constants;
}

function parseArguments(callBlock: string): readonly string[] {
  const values: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of callBlock) {
    if (character === "{" || character === "(" || character === "[") {
      depth += 1;
    } else if (character === "}" || character === ")" || character === "]") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) {
    values.push(current.trim());
  }

  return values;
}

function unquote(rawValue: string): string {
  const trimmed = rawValue.trim();
  const quote = trimmed.at(0);

  return (quote === "'" || quote === '"') && trimmed.at(-1) === quote
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function extractFormats(formatsSource: string): readonly FormatEntry[] {
  const safeAreaConstants = readSafeAreaConstants(formatsSource);
  const block = extractRecordBlock(formatsSource, "export const FORMATS");
  const formats: FormatEntry[] = [];
  let callIndex = block.indexOf("makeFormat(");

  while (callIndex !== -1) {
    const callBlock = extractBlock(block.slice(callIndex), "makeFormat", "(");
    const callArguments = parseArguments(callBlock);
    const [rawId, rawLabel, rawSize] = callArguments;
    const rawSafeArea = callArguments[6];

    if (
      rawId === undefined ||
      rawLabel === undefined ||
      rawSize === undefined
    ) {
      throw new Error(
        "Un formato no declara identificador, etiqueta o tamaño.",
      );
    }

    const size = unquote(rawSize);
    const [width, height] = size.split("x").map(Number);

    if (
      width === undefined ||
      height === undefined ||
      !Number.isInteger(width) ||
      !Number.isInteger(height)
    ) {
      throw new Error(
        `El formato ${unquote(rawId)} declara un tamaño inválido.`,
      );
    }

    const safeAreaValue = rawSafeArea?.replace(/\s+/gu, " ").trim() ?? "";

    formats.push(
      Object.freeze({
        height,
        id: unquote(rawId),
        label: unquote(rawLabel),
        safeArea: safeAreaConstants.get(safeAreaValue) ?? safeAreaValue,
        size,
        width,
      }),
    );

    callIndex = block.indexOf("makeFormat(", callIndex + callBlock.length);
  }

  if (formats.length === 0) {
    throw new Error("El registro de formatos quedó vacío.");
  }

  return Object.freeze(formats);
}

export function extractFonts(packageJsonContent: string): readonly FontEntry[] {
  const parsed: unknown = JSON.parse(packageJsonContent);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("El package.json del generador no es un objeto.");
  }

  const dependencies = (parsed as Record<string, unknown>)["dependencies"];
  if (typeof dependencies !== "object" || dependencies === null) {
    throw new Error("El package.json del generador no declara dependencias.");
  }

  const fonts = Object.entries(dependencies as Record<string, unknown>)
    .filter(([name]) => name.startsWith("@fontsource/"))
    .map(([name, version]) =>
      Object.freeze({
        family: name.replace("@fontsource/", ""),
        package: name,
        version: typeof version === "string" ? version : "desconocida",
      }),
    );

  if (fonts.length === 0) {
    throw new Error("El generador no declara familias tipográficas.");
  }

  return Object.freeze(fonts);
}

export function extractIconLibrary(packageJsonContent: string): string {
  const parsed: unknown = JSON.parse(packageJsonContent);
  const dependencies =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)["dependencies"]
      : undefined;
  const version =
    typeof dependencies === "object" && dependencies !== null
      ? (dependencies as Record<string, unknown>)["lucide-react"]
      : undefined;

  if (typeof version !== "string") {
    throw new Error("El generador no declara la librería de iconos esperada.");
  }

  return `lucide-react@${version}`;
}

/**
 * Nombres semánticos de icono soportados por el generador.
 *
 * El adaptador mapea cada nombre a un icono de Lucide; el inventario registra
 * los nombres, no los SVG, porque la migración conserva la referencia semántica.
 */
export function extractIconNames(iconSource: string): readonly string[] {
  const block = extractRecordBlock(
    iconSource,
    "const MAP: Record<string, LucideIcon>",
  );
  const names = [...block.matchAll(/^\s*'?([a-z0-9-]+)'?:/gmu)].map(
    (match) => match[1] ?? "",
  );

  if (names.length === 0) {
    throw new Error("El adaptador de iconos quedó sin nombres semánticos.");
  }

  return Object.freeze(names);
}
