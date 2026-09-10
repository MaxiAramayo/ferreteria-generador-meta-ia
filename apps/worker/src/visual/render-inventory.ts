/**
 * Inventario de lo que el navegador compuso y pintó en una pieza.
 *
 * La regresión visual (`P7-T02`) no compara píxeles. El mismo documento
 * renderizado con el Chrome de macOS y con el Chromium del contenedor de
 * producción difiere en más de un tercio de sus píxeles —antialiasing del
 * texto, remuestreo de las fotos— y ni promediando celdas de 54 px la
 * diferencia baja de 14 niveles: ninguna tolerancia que absorba eso deja pasar
 * sólo lo inofensivo. Lo que sí coincide entre plataformas, medido a 0,02 px,
 * es la composición: dónde quedó cada elemento, con qué tamaño, color,
 * tipografía, texto, cortes de línea, imagen y efecto. Eso es lo que se
 * inventaría y se compara.
 *
 * El inventario sale del render real, no del documento: una fuente que no
 * carga, un título que corta en otra línea o un tema que pinta otro color
 * aparecen acá aunque el HTML de entrada sea idéntico.
 */

/** Heredadas: se anotan en la raíz y en cada nodo donde cambian. */
const inheritedProperties: readonly string[] = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-align",
  "text-shadow",
  "text-transform",
  "visibility",
];

/** Pintura SVG: también se hereda, y sólo se anota en nodos SVG. */
const svgProperties: readonly string[] = [
  "fill",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
];

/**
 * Propias del elemento, con su valor inicial computado: se anotan sólo cuando
 * el elemento las cambia. Son las que alteran la pintura sin mover la caja; lo
 * que mueve la caja ya queda en la geometría.
 */
const ownProperties: readonly (readonly [name: string, initial: string])[] = [
  ["background-color", "rgba(0, 0, 0, 0)"],
  ["background-image", "none"],
  ["backdrop-filter", "none"],
  ["box-shadow", "none"],
  ["clip-path", "none"],
  ["filter", "none"],
  ["mask-image", "none"],
  ["mix-blend-mode", "normal"],
  ["object-fit", "fill"],
  ["object-position", "50% 50%"],
  ["opacity", "1"],
  ["overflow-x", "visible"],
  ["overflow-y", "visible"],
  ["transform", "none"],
  ["z-index", "auto"],
];

/** Sólo significan algo cuando hay una imagen de fondo. */
const backgroundLayoutProperties: readonly (readonly [
  name: string,
  initial: string,
])[] = [
  ["background-position", "0% 0%"],
  ["background-repeat", "repeat"],
  ["background-size", "auto"],
];

const borderSides = ["top", "right", "bottom", "left"] as const;
const radiusCorners = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
] as const;

/** Orden en que la página devuelve los valores computados de cada nodo. */
export const inventoriedProperties: readonly string[] = Object.freeze([
  ...inheritedProperties,
  ...svgProperties,
  ...ownProperties.map(([name]) => name),
  ...backgroundLayoutProperties.map(([name]) => name),
  ...borderSides.flatMap((side) => [
    `border-${side}-width`,
    `border-${side}-style`,
    `border-${side}-color`,
  ]),
  ...radiusCorners.map((corner) => `border-${corner}-radius`),
  "text-decoration-line",
  "text-decoration-color",
]);

/** Valor computado de cada propiedad no heredada cuando nadie la declara. */
export const initialPropertyValues: ReadonlyMap<string, string> = new Map([
  ...ownProperties,
  ...backgroundLayoutProperties,
  ...borderSides.flatMap((side): (readonly [string, string])[] => [
    [`border-${side}-width`, "0px"],
    [`border-${side}-style`, "none"],
    [`border-${side}-color`, "rgb(0, 0, 0)"],
  ]),
  ...radiusCorners.map((corner): readonly [string, string] => [
    `border-${corner}-radius`,
    "0px",
  ]),
  ["text-decoration-line", "none"],
  ["text-decoration-color", "rgb(0, 0, 0)"],
]);

const shapeTags: readonly string[] = [
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
];

const shapeAttributes: readonly string[] = [
  "cx",
  "cy",
  "d",
  "height",
  "points",
  "r",
  "rx",
  "ry",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
];

/**
 * Script que corre dentro de la página ya lista —fuentes cargadas e imágenes
 * decodificadas— y devuelve cada elemento de `[data-card]` en orden de
 * documento. Se mantiene como texto porque corre en el navegador y no en el
 * worker, igual que las mediciones de `composition-geometry.ts`.
 *
 * La forma de un trazo SVG se resume con FNV-1a: alcanza para saber que el
 * icono cambió sin versionar cada coordenada de cada trazo.
 */
export const renderInventoryScript = `
  (() => {
    const card = document.querySelector("[data-card]");
    if (card === null) {
      return null;
    }

    const properties = ${JSON.stringify(inventoriedProperties)};
    const shapeTags = new Set(${JSON.stringify(shapeTags)});
    const shapeAttributes = ${JSON.stringify(shapeAttributes)};
    const cardBox = card.getBoundingClientRect();
    const elements = [card, ...card.querySelectorAll("*")];
    const positions = new Map(elements.map((element, index) => [element, index]));

    const hash = (text) => {
      let value = 0x811c9dc5;
      for (let index = 0; index < text.length; index += 1) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 0x01000193) >>> 0;
      }
      return value.toString(16).padStart(8, "0");
    };

    const nodes = elements.map((element, index) => {
      const box = element.getBoundingClientRect();
      const computed = getComputedStyle(element);
      const tag = element.tagName.toLowerCase();
      const isSvg = element.namespaceURI === "http://www.w3.org/2000/svg";
      const ownText = [...element.childNodes].filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0,
      );
      const lineTops = new Set();
      for (const textNode of ownText) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        for (const rect of range.getClientRects()) {
          lineTops.add(Math.round(rect.top));
        }
      }

      return {
        attributes: [...element.attributes]
          .filter(
            (attribute) =>
              attribute.name.startsWith("data-") ||
              attribute.name === "class" ||
              attribute.name === "viewBox",
          )
          .map((attribute) => [attribute.name, attribute.value]),
        box: {
          height: box.height,
          width: box.width,
          x: box.left - cardBox.left,
          y: box.top - cardBox.top,
        },
        image:
          element instanceof HTMLImageElement
            ? {
                height: element.naturalHeight,
                source: element.currentSrc || element.src,
                width: element.naturalWidth,
              }
            : null,
        lines: lineTops.size,
        namespace: isSvg ? "svg" : "html",
        parent: index === 0 ? -1 : (positions.get(element.parentElement) ?? -1),
        shape:
          isSvg && shapeTags.has(tag)
            ? hash(
                tag +
                  shapeAttributes
                    .map((name) => name + "=" + (element.getAttribute(name) ?? ""))
                    .join(";"),
              )
            : null,
        tag,
        text: ownText
          .map((node) => node.textContent ?? "")
          .join(" ")
          .replace(/\\s+/gu, " ")
          .trim(),
        values: properties.map((name) => computed.getPropertyValue(name)),
      };
    });

    const fonts = [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replaceAll('"', "") + " " + face.weight + " " + face.style);

    return { fonts, nodes };
  })()
`;

export interface InventoriedBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface InventoriedImage {
  readonly height: number;
  readonly source: string;
  readonly width: number;
}

export interface InventoriedNode {
  readonly attributes: readonly (readonly [name: string, value: string])[];
  /** Caja relativa a la pieza, no a la ventana. */
  readonly box: InventoriedBox;
  readonly image: InventoriedImage | null;
  /** Líneas que ocupa el texto propio del nodo; cero si no tiene. */
  readonly lines: number;
  readonly namespace: "html" | "svg";
  /** Índice del padre dentro del inventario; `-1` sólo en la raíz. */
  readonly parent: number;
  readonly shape: string | null;
  readonly tag: string;
  readonly text: string;
  /** Valores computados, en el orden de `inventoriedProperties`. */
  readonly values: readonly string[];
}

export interface RenderInventory {
  readonly fonts: readonly string[];
  readonly nodes: readonly InventoriedNode[];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function listOf(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items: readonly unknown[] = value;
  return items;
}

function stringListOf(value: unknown): readonly string[] | undefined {
  const items = listOf(value);

  if (items === undefined) {
    return undefined;
  }

  const strings: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      return undefined;
    }
    strings.push(item);
  }

  return strings;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function inventoryError(detail: string): Error {
  return new Error(
    `El inventario del render no tiene la forma esperada: ${detail}.`,
  );
}

function parseAttributes(
  value: unknown,
  index: number,
): readonly (readonly [string, string])[] {
  const items = listOf(value);

  if (items === undefined) {
    throw inventoryError(`atributos del nodo ${String(index)}`);
  }

  return items.map((item): readonly [string, string] => {
    const pair = stringListOf(item);
    const [name, attributeValue] = pair ?? [];

    if (
      pair?.length !== 2 ||
      name === undefined ||
      attributeValue === undefined
    ) {
      throw inventoryError(`atributo del nodo ${String(index)}`);
    }

    return [name, attributeValue];
  });
}

function parseBox(value: unknown, index: number): InventoriedBox {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height)
  ) {
    throw inventoryError(`caja del nodo ${String(index)}`);
  }

  return {
    height: value.height,
    width: value.width,
    x: value.x,
    y: value.y,
  };
}

function parseImage(value: unknown, index: number): InventoriedImage | null {
  if (value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.source !== "string" ||
    !isCount(value.width) ||
    !isCount(value.height)
  ) {
    throw inventoryError(`imagen del nodo ${String(index)}`);
  }

  return { height: value.height, source: value.source, width: value.width };
}

function parseNode(value: unknown, index: number): InventoriedNode {
  if (!isRecord(value)) {
    throw inventoryError(`nodo ${String(index)}`);
  }

  const { lines, namespace, parent, shape, tag, text } = value;
  const values = stringListOf(value.values);

  // El inventario va en orden de documento: el padre siempre aparece antes que
  // sus hijos, y es lo que permite calcular profundidad y herencia de una pasada.
  const parentIsValid =
    index === 0
      ? parent === -1
      : typeof parent === "number" &&
        Number.isInteger(parent) &&
        parent >= 0 &&
        parent < index;

  if (!parentIsValid) {
    throw inventoryError(`padre del nodo ${String(index)}`);
  }
  if (typeof tag !== "string" || tag.length === 0) {
    throw inventoryError(`etiqueta del nodo ${String(index)}`);
  }
  if (namespace !== "html" && namespace !== "svg") {
    throw inventoryError(`espacio de nombres del nodo ${String(index)}`);
  }
  if (typeof text !== "string" || !isCount(lines)) {
    throw inventoryError(`texto del nodo ${String(index)}`);
  }
  if (shape !== null && typeof shape !== "string") {
    throw inventoryError(`forma del nodo ${String(index)}`);
  }
  if (values?.length !== inventoriedProperties.length) {
    throw inventoryError(`estilos del nodo ${String(index)}`);
  }

  return Object.freeze({
    attributes: parseAttributes(value.attributes, index),
    box: parseBox(value.box, index),
    image: parseImage(value.image, index),
    lines,
    namespace,
    parent: typeof parent === "number" ? parent : -1,
    shape,
    tag,
    text,
    values,
  });
}

/** Valida lo que devolvió la página antes de tratarlo como inventario. */
export function parseRenderInventory(value: unknown): RenderInventory {
  if (value === null) {
    throw new Error("La página no tiene el nodo exportable [data-card].");
  }

  if (!isRecord(value)) {
    throw inventoryError("la página no devolvió un objeto");
  }

  const fonts = stringListOf(value.fonts);
  const nodes = listOf(value.nodes);

  if (fonts === undefined) {
    throw inventoryError("fuentes");
  }
  if (nodes === undefined || nodes.length === 0) {
    throw inventoryError("la pieza no tiene nodos");
  }

  return Object.freeze({
    fonts: Object.freeze([...fonts]),
    nodes: Object.freeze(nodes.map((node, index) => parseNode(node, index))),
  });
}

/**
 * Lo que se versiona: una línea por fuente cargada y una por nodo.
 *
 * Cada línea de nodo empieza con su geometría —`@x,y ancho×alto`— sangrada
 * según su profundidad, así el diff de la línea base muestra el árbol y la
 * comparación puede tolerar geometría sin tolerar nada más.
 */
export interface RenderSnapshot {
  readonly fonts: readonly string[];
  readonly nodes: readonly string[];
}

/** Orden por unidades de código: no depende del idioma de la máquina. */
function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

const assetLocationPattern = /file:\/\/[^\s"')]*\/assets\//gu;

/**
 * Los activos se leen por `file://` desde el checkout, así que su ruta cambia
 * de una máquina a otra. Se anota relativa a la biblioteca; cualquier otro
 * archivo local haría que la línea base dependiera de dónde corre.
 */
function normalizeLocations(value: string): string {
  const normalized = value.replace(assetLocationPattern, "assets/");

  if (normalized.includes("file://")) {
    throw new Error(
      "El render usó un archivo local fuera de la biblioteca de activos: la línea base dependería de la máquina.",
    );
  }

  return normalized;
}

function describeSource(source: string): string {
  return source.startsWith("data:") ? "inline" : normalizeLocations(source);
}

function describeAttributes(
  attributes: readonly (readonly [string, string])[],
): string {
  return attributes
    .toSorted(([left], [right]) => compareText(left, right))
    .map(([name, value]) =>
      value.length === 0
        ? `[${name}]`
        : `[${name}=${normalizeLocations(value)}]`,
    )
    .join("");
}

function describeBorder(valueOf: (name: string) => string): string | null {
  const sides = borderSides.map((side) => {
    const width = valueOf(`border-${side}-width`);
    const style = valueOf(`border-${side}-style`);

    return style === "none" || style === "hidden" || width === "0px"
      ? null
      : `${width} ${style} ${valueOf(`border-${side}-color`)}`;
  });

  if (sides.every((side) => side === null)) {
    return null;
  }

  const [first] = sides;
  return sides.every((side) => side === first)
    ? `border ${first ?? "0"}`
    : `border ${sides.map((side) => side ?? "0").join(" / ")}`;
}

function describeRadius(valueOf: (name: string) => string): string | null {
  const corners = radiusCorners.map((corner) =>
    valueOf(`border-${corner}-radius`),
  );

  if (corners.every((corner) => corner === "0px")) {
    return null;
  }

  const [first] = corners;
  return corners.every((corner) => corner === first)
    ? `border-radius ${first ?? ""}`
    : `border-radius ${corners.join(" ")}`;
}

function valuesByName(node: InventoriedNode): ReadonlyMap<string, string> {
  return new Map(
    inventoriedProperties.map((name, index) => [
      name,
      node.values[index] ?? "",
    ]),
  );
}

function describeStyles(
  node: InventoriedNode,
  parent: InventoriedNode | undefined,
): readonly string[] {
  const values = valuesByName(node);
  const parentValues = parent === undefined ? undefined : valuesByName(parent);
  const valueOf = (name: string): string => values.get(name) ?? "";
  const entries: string[] = [];

  const inherited =
    node.namespace === "svg"
      ? [...inheritedProperties, ...svgProperties]
      : inheritedProperties;

  for (const name of inherited) {
    const value = valueOf(name);
    if (parentValues?.get(name) !== value) {
      entries.push(`${name} ${normalizeLocations(value)}`);
    }
  }

  for (const [name, initial] of ownProperties) {
    const value = valueOf(name);
    if (value !== initial) {
      entries.push(`${name} ${normalizeLocations(value)}`);
    }
  }

  if (valueOf("background-image") !== "none") {
    for (const [name, initial] of backgroundLayoutProperties) {
      const value = valueOf(name);
      if (value !== initial) {
        entries.push(`${name} ${value}`);
      }
    }
  }

  const border = describeBorder(valueOf);
  if (border !== null) {
    entries.push(border);
  }

  const radius = describeRadius(valueOf);
  if (radius !== null) {
    entries.push(radius);
  }

  const decoration = valueOf("text-decoration-line");
  if (decoration !== "none") {
    entries.push(
      `text-decoration ${decoration} ${valueOf("text-decoration-color")}`,
    );
  }

  return entries;
}

function describeNode(
  node: InventoriedNode,
  parent: InventoriedNode | undefined,
  depth: number,
): string {
  const { height, width, x, y } = node.box;
  const parts = [
    `${"  ".repeat(depth)}@${Math.round(x)},${Math.round(y)} ${Math.round(width)}×${Math.round(height)} ${node.tag}${describeAttributes(node.attributes)}`,
  ];

  if (node.text.length > 0) {
    parts.push(
      `«${node.text}» ${node.lines === 1 ? "1 línea" : `${node.lines} líneas`}`,
    );
  }
  if (node.image !== null) {
    parts.push(
      `imagen ${describeSource(node.image.source)} ${node.image.width}×${node.image.height}`,
    );
  }
  if (node.shape !== null) {
    parts.push(`forma ${node.shape}`);
  }

  return [parts.join(" "), ...describeStyles(node, parent)].join(" · ");
}

function describeFonts(fonts: readonly string[]): readonly string[] {
  const counts = new Map<string, number>();

  for (const face of fonts) {
    counts.set(face, (counts.get(face) ?? 0) + 1);
  }

  // La misma familia puede cargar varios subconjuntos Unicode; la cantidad
  // cambia si el texto empieza a necesitar uno nuevo.
  return [...counts.entries()]
    .toSorted(([left], [right]) => compareText(left, right))
    .map(([face, count]) => (count === 1 ? face : `${face} ×${count}`));
}

export function describeRenderInventory(
  inventory: RenderInventory,
): RenderSnapshot {
  const depths: number[] = [];
  const nodes = inventory.nodes.map((node, index) => {
    const parent =
      node.parent === -1 ? undefined : inventory.nodes[node.parent];
    const depth = parent === undefined ? 0 : (depths[node.parent] ?? 0) + 1;
    depths[index] = depth;

    return describeNode(node, parent, depth);
  });

  return Object.freeze({
    fonts: Object.freeze(describeFonts(inventory.fonts)),
    nodes: Object.freeze(nodes),
  });
}

/**
 * Tolerancia de geometría, en píxeles de la pieza.
 *
 * Entre el Chrome de macOS y el Chromium del contenedor de producción la
 * geometría difiere como mucho 0,02 px; redondeada a entero, un valor puede
 * saltar de lado sólo si cae justo en el medio. Un píxel absorbe eso y sigue
 * detectando cualquier desplazamiento que una persona pueda notar.
 */
export const geometryTolerancePx = 1;

const snapshotLinePattern =
  /^(?<indent> *)@(?<x>-?\d+),(?<y>-?\d+) (?<width>\d+)×(?<height>\d+) (?<rest>.+)$/u;

interface SnapshotLine {
  readonly depth: number;
  readonly geometry: readonly [number, number, number, number];
  /** Etiqueta, atributos, texto, imagen y forma: lo que precede a los estilos. */
  readonly head: string;
  /** Todo lo que no es geometría: tiene que coincidir exacto. */
  readonly key: string;
  /** Estilos anotados, por propiedad. */
  readonly styles: ReadonlyMap<string, string>;
  readonly tag: string;
  readonly text: string;
}

const styleSeparator = " · ";
const textEndPattern = /» \d+ líneas?/gu;

/**
 * Separa la cabeza de un nodo de sus estilos.
 *
 * El texto de una pieza puede contener el separador —«Frías · Santiago del
 * Estero»—, así que los estilos empiezan en el primer separador posterior al
 * cierre del texto y no en el primero de la línea.
 */
function splitHead(
  rest: string,
): readonly [head: string, styles: readonly string[]] {
  let headEnd = 0;
  for (const match of rest.matchAll(textEndPattern)) {
    headEnd = match.index + match[0].length;
  }

  const separator = rest.indexOf(styleSeparator, headEnd);
  return separator === -1
    ? [rest, []]
    : [
        rest.slice(0, separator),
        rest.slice(separator + styleSeparator.length).split(styleSeparator),
      ];
}

function parseSnapshotLine(line: string): SnapshotLine {
  const groups = snapshotLinePattern.exec(line)?.groups;
  const read = (name: string): string => {
    const value = groups?.[name];
    if (value === undefined) {
      throw new Error(`Línea de inventario sin geometría: ${line}`);
    }
    return value;
  };
  const indent = read("indent");
  const rest = read("rest");
  const [head, segments] = splitHead(rest);
  const styles = new Map<string, string>();

  for (const segment of segments) {
    const space = segment.indexOf(" ");
    styles.set(
      space === -1 ? segment : segment.slice(0, space),
      space === -1 ? "" : segment.slice(space + 1),
    );
  }

  return {
    depth: indent.length / 2,
    geometry: [
      Number(read("x")),
      Number(read("y")),
      Number(read("width")),
      Number(read("height")),
    ],
    head,
    key: `${indent}${rest}`,
    styles,
    tag: /^[^\s[]+/u.exec(head)?.[0] ?? head,
    text: line.trim(),
  };
}

function geometryText(line: SnapshotLine): string {
  const [x, y, width, height] = line.geometry;
  return `@${x},${y} ${width}×${height}`;
}

function geometryShift(before: SnapshotLine, after: SnapshotLine): number {
  return Math.max(
    ...before.geometry.map((value, index) =>
      Math.abs(value - (after.geometry[index] ?? value)),
    ),
  );
}

const inheritedPropertyNames: ReadonlySet<string> = new Set([
  ...inheritedProperties,
  ...svgProperties,
]);

/** Lo que vale una propiedad que el inventario no anota en ese nodo. */
function unannotated(name: string): string {
  return inheritedPropertyNames.has(name) ? "(heredado)" : "(inicial)";
}

function describeStyleChanges(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): readonly string[] {
  const names = [
    ...before.keys(),
    ...[...after.keys()].filter((name) => !before.has(name)),
  ];

  return names.flatMap((name) => {
    const was = before.get(name);
    const now = after.get(name);

    return was === now
      ? []
      : [`${name} ${was ?? unannotated(name)} → ${now ?? unannotated(name)}`];
  });
}

/**
 * Un mismo nodo que cambió: dónde estaba, qué cabeza tenía y qué estilos
 * cambiaron, sin repetir lo que quedó igual. `null` si nada cambió más allá de
 * la tolerancia.
 */
function describeChange(
  before: SnapshotLine,
  after: SnapshotLine,
  tolerancePx: number,
): string | null {
  const moved = geometryShift(before, after) > tolerancePx;
  const styleChanges = describeStyleChanges(before.styles, after.styles);

  if (!moved && before.head === after.head && styleChanges.length === 0) {
    return null;
  }

  const location = moved
    ? `${geometryText(before)} → ${geometryText(after)}`
    : geometryText(before);
  const head =
    before.head === after.head ? before.head : `${before.head} → ${after.head}`;

  return styleChanges.length === 0
    ? `${location} ${head}`
    : `${location} ${head}: ${styleChanges.join("; ")}`;
}

type AlignmentStep =
  | {
      readonly after: SnapshotLine;
      readonly before: SnapshotLine;
      readonly kind: "matched";
    }
  | { readonly before: SnapshotLine; readonly kind: "missing" }
  | { readonly after: SnapshotLine; readonly kind: "extra" };

function lineAt(lines: readonly SnapshotLine[], index: number): SnapshotLine {
  const line = lines[index];
  if (line === undefined) {
    throw new Error(`No existe la línea ${String(index)} del inventario.`);
  }
  return line;
}

/**
 * Alinea los dos inventarios por la subsecuencia común más larga de sus
 * claves. Un nodo agregado o quitado queda como una sola diferencia en lugar
 * de desalinear todo lo que viene después.
 */
function align(
  before: readonly SnapshotLine[],
  after: readonly SnapshotLine[],
): readonly AlignmentStep[] {
  const columns = after.length + 1;
  const table = new Uint32Array((before.length + 1) * columns);
  const cell = (row: number, column: number): number =>
    table[row * columns + column] ?? 0;

  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      table[row * columns + column] =
        lineAt(before, row).key === lineAt(after, column).key
          ? cell(row + 1, column + 1) + 1
          : Math.max(cell(row + 1, column), cell(row, column + 1));
    }
  }

  const steps: AlignmentStep[] = [];
  let row = 0;
  let column = 0;

  while (row < before.length && column < after.length) {
    const expected = lineAt(before, row);
    const actual = lineAt(after, column);

    if (expected.key === actual.key) {
      steps.push({ after: actual, before: expected, kind: "matched" });
      row += 1;
      column += 1;
    } else if (cell(row + 1, column) >= cell(row, column + 1)) {
      steps.push({ before: expected, kind: "missing" });
      row += 1;
    } else {
      steps.push({ after: actual, kind: "extra" });
      column += 1;
    }
  }

  for (; row < before.length; row += 1) {
    steps.push({ before: lineAt(before, row), kind: "missing" });
  }
  for (; column < after.length; column += 1) {
    steps.push({ after: lineAt(after, column), kind: "extra" });
  }

  return steps;
}

/**
 * Diferencias entre la línea base y el render, en el orden de la pieza.
 *
 * Un nodo que sigue en su lugar pero cambió se informa en una sola línea y con
 * sólo lo que cambió: `@x,y ancho×alto etiqueta: propiedad antes → después`.
 * `−` es un nodo que la línea base tenía y el render ya no; `+`, uno que el
 * render agregó.
 */
export function compareRenderSnapshots(
  expected: RenderSnapshot,
  actual: RenderSnapshot,
  tolerancePx: number = geometryTolerancePx,
): readonly string[] {
  const differences: string[] = [];

  if (
    expected.fonts.length !== actual.fonts.length ||
    expected.fonts.some((face, index) => face !== actual.fonts[index])
  ) {
    differences.push(
      `fuentes cargadas: la línea base tiene ${expected.fonts.join(", ")} y el render ${actual.fonts.join(", ")}`,
    );
  }

  const steps = align(
    expected.nodes.map((line) => parseSnapshotLine(line)),
    actual.nodes.map((line) => parseSnapshotLine(line)),
  );
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];

    if (step === undefined) {
      break;
    }

    if (step.kind === "matched") {
      const change = describeChange(step.before, step.after, tolerancePx);
      if (change !== null) {
        differences.push(change);
      }
      index += 1;
      continue;
    }

    // Una corrida de nodos que faltan seguida de otra de nodos nuevos, con la
    // misma cantidad, profundidad y etiqueta, son los mismos nodos cambiados.
    const missing: SnapshotLine[] = [];
    for (
      let current = steps[index];
      current?.kind === "missing";
      current = steps[index]
    ) {
      missing.push(current.before);
      index += 1;
    }

    const extra: SnapshotLine[] = [];
    for (
      let current = steps[index];
      current?.kind === "extra";
      current = steps[index]
    ) {
      extra.push(current.after);
      index += 1;
    }

    const pairs = missing.flatMap((line, position) => {
      const other = extra[position];
      return other !== undefined &&
        other.depth === line.depth &&
        other.tag === line.tag
        ? [[line, other] as const]
        : [];
    });

    if (missing.length === extra.length && pairs.length === missing.length) {
      for (const [before, after] of pairs) {
        const change = describeChange(before, after, tolerancePx);
        if (change !== null) {
          differences.push(change);
        }
      }
    } else {
      differences.push(
        ...missing.map((line) => `− ${line.text}`),
        ...extra.map((line) => `+ ${line.text}`),
      );
    }
  }

  return Object.freeze(differences);
}

/** Un archivo de la línea base: una pieza, su formato y su inventario. */
export interface VisualBaseline {
  readonly format: string;
  readonly id: string;
  readonly snapshot: RenderSnapshot;
}

export function serializeVisualBaseline(baseline: VisualBaseline): string {
  return `${JSON.stringify(
    {
      id: baseline.id,
      format: baseline.format,
      fonts: baseline.snapshot.fonts,
      nodes: baseline.snapshot.nodes,
    },
    null,
    2,
  )}\n`;
}

export function parseVisualBaseline(raw: string): VisualBaseline {
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("La línea base visual no es un objeto.");
  }

  const { format, id } = parsed;
  const fonts = stringListOf(parsed.fonts);
  const nodes = stringListOf(parsed.nodes);

  if (typeof id !== "string" || typeof format !== "string") {
    throw new Error("La línea base visual no declara pieza y formato.");
  }
  if (fonts === undefined || nodes === undefined || nodes.length === 0) {
    throw new Error(`La línea base visual de ${id} no tiene inventario.`);
  }

  // Cada línea tiene que poder compararse: una sin geometría falla acá y no en
  // medio de una comparación.
  for (const node of nodes) {
    parseSnapshotLine(node);
  }

  return Object.freeze({
    format,
    id,
    snapshot: Object.freeze({ fonts, nodes }),
  });
}
