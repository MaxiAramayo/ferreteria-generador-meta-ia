import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import {
  catalogStatusFor,
  LAYOUT_IDS,
  layoutSpecFor,
  THEME_IDS,
} from "@aramayo/design-engine";
import { isLayoutMigrated } from "@aramayo/design-engine/react";
import { composedLayoutFor, visualProfileIds } from "@aramayo/domain";

import {
  compareRenderSnapshots,
  describeRenderInventory,
  initialPropertyValues,
  inventoriedProperties,
  parseRenderInventory,
  parseVisualBaseline,
  serializeVisualBaseline,
  type InventoriedNode,
  type RenderSnapshot,
} from "./render-inventory.ts";
import { visualRegressionCases } from "./visual-regression-cases.ts";
import { visualProfileFor } from "./visual-profiles.ts";

/**
 * La suite completa necesita un navegador y corre con `pnpm visual:regression`.
 * Lo que se prueba acá no lo necesita y es lo que sostiene su valor: que el
 * inventario anote lo que cambia la pieza y nada más, que la comparación
 * detecte un cambio sin confundirlo con el ruido de otra plataforma, y que el
 * recorrido y la línea base versionada cubran lo que la tarea exige.
 */

const baselineDirectory = new URL("../../visual-regression/", import.meta.url);

function valuesWith(
  styles: Readonly<Record<string, string>> = {},
): readonly string[] {
  // Las heredadas no tienen valor inicial: un marcador igual en todos los
  // nodos alcanza para que sólo se anoten donde la prueba las cambia.
  return inventoriedProperties.map(
    (name) =>
      styles[name] ?? initialPropertyValues.get(name) ?? `valor-${name}`,
  );
}

interface NodeFixture {
  readonly attributes?: InventoriedNode["attributes"];
  readonly box?: InventoriedNode["box"];
  readonly image?: InventoriedNode["image"];
  readonly lines?: number;
  readonly namespace?: InventoriedNode["namespace"];
  readonly parent: number;
  readonly shape?: string;
  readonly styles?: Readonly<Record<string, string>>;
  readonly tag?: string;
  readonly text?: string;
}

function node(fixture: NodeFixture): InventoriedNode {
  return {
    attributes: fixture.attributes ?? [],
    box: fixture.box ?? { height: 10, width: 10, x: 0, y: 0 },
    image: fixture.image ?? null,
    lines: fixture.lines ?? 0,
    namespace: fixture.namespace ?? "html",
    parent: fixture.parent,
    shape: fixture.shape ?? null,
    tag: fixture.tag ?? "div",
    text: fixture.text ?? "",
    values: valuesWith(fixture.styles),
  };
}

test("el inventario anota lo heredado en la raíz y sólo donde cambia", () => {
  const snapshot = describeRenderInventory({
    fonts: [],
    nodes: [
      node({
        attributes: [
          ["data-format", "feed"],
          ["data-card", ""],
        ],
        box: { height: 1350, width: 1080, x: 0, y: 0 },
        parent: -1,
      }),
      node({
        box: { height: 100.4, width: 936.6, x: 72.2, y: 71.6 },
        parent: 0,
      }),
      node({
        lines: 2,
        parent: 1,
        styles: { color: "rgb(230, 59, 30)" },
        tag: "h1",
        text: "Taladro percutor",
      }),
    ],
  });

  const [root, block, title] = snapshot.nodes;
  assert.match(
    root ?? "",
    /^@0,0 1080×1350 div\[data-card\]\[data-format=feed\] · color valor-color · font-family valor-font-family/u,
  );
  assert.equal(block, "  @72,72 937×100 div");
  assert.equal(
    title,
    "    @0,0 10×10 h1 «Taladro percutor» 2 líneas · color rgb(230, 59, 30)",
  );
});

test("una propiedad propia se anota sólo si se aparta de su valor inicial", () => {
  const snapshot = describeRenderInventory({
    fonts: [],
    nodes: [
      node({ parent: -1 }),
      node({
        parent: 0,
        styles: {
          "background-color": "rgb(230, 59, 30)",
          "border-bottom-left-radius": "12px",
          "border-bottom-right-radius": "12px",
          "border-top-left-radius": "12px",
          "border-top-right-radius": "12px",
        },
      }),
      node({
        parent: 0,
        styles: {
          "border-top-color": "rgb(0, 0, 0)",
          "border-top-style": "solid",
          "border-top-width": "2px",
          "text-decoration-color": "rgb(1, 2, 3)",
          "text-decoration-line": "line-through",
        },
      }),
      node({ parent: 0, styles: { opacity: "1", transform: "none" } }),
    ],
  });

  assert.deepEqual(snapshot.nodes.slice(1), [
    "  @0,0 10×10 div · background-color rgb(230, 59, 30) · border-radius 12px",
    "  @0,0 10×10 div · border 2px solid rgb(0, 0, 0) / 0 / 0 / 0 · text-decoration line-through rgb(1, 2, 3)",
    "  @0,0 10×10 div",
  ]);
});

test("los activos se anotan relativos a la biblioteca y una base embebida como inline", () => {
  const snapshot = describeRenderInventory({
    fonts: [],
    nodes: [
      node({ parent: -1 }),
      node({
        image: {
          height: 1067,
          source:
            "file:///srv/checkout/packages/design-engine/assets/stock-herramientas-electricas.jpg",
          width: 1600,
        },
        parent: 0,
        tag: "img",
      }),
      node({
        image: {
          height: 1536,
          source: "data:image/png;base64,AAAA",
          width: 1024,
        },
        parent: 0,
        tag: "img",
      }),
      node({
        parent: 0,
        styles: {
          "background-image":
            'url("file:///Users/otra/packages/design-engine/assets/brand/logo-ferreteria-dark.png")',
        },
      }),
    ],
  });

  assert.deepEqual(snapshot.nodes.slice(1), [
    "  @0,0 10×10 img imagen assets/stock-herramientas-electricas.jpg 1600×1067",
    "  @0,0 10×10 img imagen inline 1024×1536",
    '  @0,0 10×10 div · background-image url("assets/brand/logo-ferreteria-dark.png")',
  ]);
});

test("un archivo local fuera de la biblioteca hace fallar el inventario", () => {
  // Una ruta de la máquina en la línea base haría que sólo pasara donde se
  // generó.
  assert.throws(
    () =>
      describeRenderInventory({
        fonts: [],
        nodes: [
          node({
            image: { height: 1, source: "file:///tmp/otra.png", width: 1 },
            parent: -1,
            tag: "img",
          }),
        ],
      }),
    /fuera de la biblioteca de activos/u,
  );
});

test("la pintura SVG se anota sólo en nodos SVG y el trazo por su forma", () => {
  const snapshot = describeRenderInventory({
    fonts: [],
    nodes: [
      node({ parent: -1 }),
      node({
        attributes: [
          ["viewBox", "0 0 24 24"],
          ["class", "lucide lucide-wrench"],
        ],
        namespace: "svg",
        parent: 0,
        styles: { fill: "none", stroke: "rgb(230, 59, 30)" },
        tag: "svg",
      }),
      node({
        namespace: "svg",
        parent: 1,
        shape: "1a2b3c4d",
        styles: { fill: "none", stroke: "rgb(230, 59, 30)" },
        tag: "path",
      }),
    ],
  });

  assert.doesNotMatch(snapshot.nodes[0] ?? "", /fill/u);
  assert.deepEqual(snapshot.nodes.slice(1), [
    "  @0,0 10×10 svg[class=lucide lucide-wrench][viewBox=0 0 24 24] · fill none · stroke rgb(230, 59, 30)",
    "    @0,0 10×10 path forma 1a2b3c4d",
  ]);
});

test("las fuentes se agrupan por familia, peso y estilo", () => {
  const snapshot = describeRenderInventory({
    fonts: [
      "Saira Condensed 800 normal",
      "Archivo 400 normal",
      "Archivo 400 normal",
    ],
    nodes: [node({ parent: -1 })],
  });

  assert.deepEqual(snapshot.fonts, [
    "Archivo 400 normal ×2",
    "Saira Condensed 800 normal",
  ]);
});

const cardLine = "@0,0 1080×1350 div[data-card] · color rgb(0, 0, 0)";
const titleLine = "  @72,300 936×184 h1 «Taladro» 1 línea";
const ctaLine = "  @72,1200 936×80 div[data-cta] «Consultá stock» 1 línea";
const baselineSnapshot: RenderSnapshot = {
  fonts: ["Archivo 400 normal"],
  nodes: [cardLine, titleLine, ctaLine],
};

function withNodes(nodes: readonly string[]): RenderSnapshot {
  return { fonts: baselineSnapshot.fonts, nodes };
}

test("la misma pieza, o una corrida un píxel, no es una regresión", () => {
  assert.deepEqual(
    compareRenderSnapshots(baselineSnapshot, baselineSnapshot),
    [],
  );
  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([cardLine, "  @73,301 935×185 h1 «Taladro» 1 línea", ctaLine]),
    ),
    [],
  );
});

test("un elemento desplazado más que la tolerancia se informa con las dos posiciones", () => {
  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([cardLine, "  @72,314 936×184 h1 «Taladro» 1 línea", ctaLine]),
    ),
    ["@72,300 936×184 → @72,314 936×184 h1 «Taladro» 1 línea"],
  );
});

test("un nodo que cambió se informa en una línea, con sólo lo que cambió", () => {
  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([
        "@0,0 1080×1350 div[data-card] · color rgb(9, 9, 9)",
        titleLine,
        ctaLine,
      ]),
    ),
    ["@0,0 1080×1350 div[data-card]: color rgb(0, 0, 0) → rgb(9, 9, 9)"],
  );

  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([cardLine, "  @72,300 936×184 h1 «Taladro» 2 líneas", ctaLine]),
    ),
    ["@72,300 936×184 h1 «Taladro» 1 línea → h1 «Taladro» 2 líneas"],
  );

  // El texto puede contener el separador de estilos sin confundirlos.
  assert.deepEqual(
    compareRenderSnapshots(
      withNodes([
        cardLine,
        "  @164,136 170×11 span «Frías · Santiago del Estero» 1 línea · font-size 11px · opacity 0.7",
      ]),
      withNodes([
        cardLine,
        "  @164,146 170×11 span «Frías · Santiago del Estero» 1 línea · font-size 11px · opacity 0.5 · z-index 10",
      ]),
    ),
    [
      "@164,136 170×11 → @164,146 170×11 span «Frías · Santiago del Estero» 1 línea: opacity 0.7 → 0.5; z-index (inicial) → 10",
    ],
  );

  assert.deepEqual(
    compareRenderSnapshots(
      withNodes([cardLine, "  @0,0 10×10 span · color rgb(1, 2, 3)"]),
      withNodes([cardLine, "  @0,0 10×10 span"]),
    ),
    ["@0,0 10×10 span: color rgb(1, 2, 3) → (heredado)"],
  );
});

test("un nodo agregado, quitado o reemplazado por otro se informa entero", () => {
  // Un nodo agregado queda como una sola diferencia: no desalinea lo que sigue.
  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([
        cardLine,
        titleLine,
        "  @72,1100 936×80 div[data-price] «$ 24.500» 1 línea",
        ctaLine,
      ]),
    ),
    ["+ @72,1100 936×80 div[data-price] «$ 24.500» 1 línea"],
  );

  assert.deepEqual(
    compareRenderSnapshots(baselineSnapshot, withNodes([cardLine, ctaLine])),
    [`− ${titleLine.trim()}`],
  );

  const link = "  @72,1200 936×80 a[data-cta] «Consultá stock» 1 línea";
  assert.deepEqual(
    compareRenderSnapshots(
      baselineSnapshot,
      withNodes([cardLine, titleLine, link]),
    ),
    [`− ${ctaLine.trim()}`, `+ ${link.trim()}`],
  );
});

test("una fuente que deja de cargar es una regresión aunque la geometría no cambie", () => {
  const differences = compareRenderSnapshots(baselineSnapshot, {
    fonts: [],
    nodes: baselineSnapshot.nodes,
  });

  assert.equal(differences.length, 1);
  assert.match(differences[0] ?? "", /^fuentes cargadas/u);
});

test("lo que devuelve la página se valida antes de tratarlo como inventario", () => {
  const root = {
    attributes: [["data-card", ""]],
    box: { height: 1350, width: 1080, x: 0, y: 0 },
    image: null,
    lines: 0,
    namespace: "html",
    parent: -1,
    shape: null,
    tag: "div",
    text: "",
    values: valuesWith(),
  };

  assert.equal(
    parseRenderInventory({ fonts: ["Archivo 400 normal"], nodes: [root] }).nodes
      .length,
    1,
  );
  assert.throws(() => parseRenderInventory(null), /\[data-card\]/u);
  assert.throws(
    () => parseRenderInventory({ fonts: [], nodes: [] }),
    /forma esperada/u,
  );
  assert.throws(
    () =>
      parseRenderInventory({
        fonts: [],
        nodes: [root, { ...root, parent: 1 }],
      }),
    /padre del nodo 1/u,
  );
  assert.throws(
    () =>
      parseRenderInventory({
        fonts: [],
        nodes: [{ ...root, values: ["rgb(0, 0, 0)"] }],
      }),
    /estilos del nodo 0/u,
  );
  assert.throws(
    () =>
      parseRenderInventory({ fonts: [], nodes: [{ ...root, box: { x: 0 } }] }),
    /caja del nodo 0/u,
  );
});

test("la línea base se escribe y se lee sin perder nada", () => {
  const raw = serializeVisualBaseline({
    format: "feed",
    id: "catalogo-producto-precio-feed",
    snapshot: baselineSnapshot,
  });

  assert.deepEqual(parseVisualBaseline(raw), {
    format: "feed",
    id: "catalogo-producto-precio-feed",
    snapshot: baselineSnapshot,
  });
  assert.throws(
    () =>
      parseVisualBaseline(
        JSON.stringify({
          fonts: [],
          format: "feed",
          id: "roto",
          nodes: ["div sin geometría"],
        }),
      ),
    /sin geometría/u,
  );
});

test("el recorrido cubre cada pieza vigente en cada formato aprobado", () => {
  const cases = visualRegressionCases();
  const covered = new Set(
    cases.map((entry) => `${entry.layout}/${entry.format}`),
  );

  for (const layout of LAYOUT_IDS) {
    if (catalogStatusFor(layout) !== "current" || !isLayoutMigrated(layout)) {
      continue;
    }

    for (const format of layoutSpecFor(layout).formats) {
      assert.ok(
        covered.has(`${layout}/${format}`),
        `${layout} en ${format} no tiene pieza en la regresión visual.`,
      );
    }
  }

  // Cada caso escribe su propio archivo de línea base.
  assert.equal(new Set(cases.map((entry) => entry.id)).size, cases.length);
});

test("cada perfil visual se renderiza en todos los formatos que su pieza compone", () => {
  const cases = visualRegressionCases();

  for (const profileId of visualProfileIds) {
    const profile = visualProfileFor(profileId);
    const layout = composedLayoutFor(profile.reservedSpace);
    assert.ok(layout !== null, `${profileId} no tiene pieza de composición.`);

    const composable = profile.formats.filter((format) =>
      layoutSpecFor(layout).formats.includes(format),
    );
    const rendered = cases.flatMap((entry) =>
      entry.source.kind === "perfil" &&
      entry.source.entry.profileId === profileId
        ? [entry.format]
        : [],
    );

    assert.deepEqual(
      rendered.toSorted(),
      composable.toSorted(),
      `${profileId} no se renderiza en todos sus formatos componibles.`,
    );
  }
});

test("los cuatro temas pintan al menos una publicación y una historia", () => {
  const painted = new Set(
    visualRegressionCases().flatMap((entry) =>
      entry.source.kind === "catalogo" || entry.source.kind === "tema"
        ? [`${entry.source.theme}/${layoutSpecFor(entry.layout).family}`]
        : [],
    ),
  );

  for (const theme of THEME_IDS) {
    assert.ok(
      painted.has(`${theme}/publicacion`),
      `${theme} no pinta ninguna publicación.`,
    );
    assert.ok(
      painted.has(`${theme}/historia`),
      `${theme} no pinta ninguna historia.`,
    );
  }
});

test("la línea base versionada describe exactamente el recorrido", async () => {
  const files = (await readdir(baselineDirectory))
    .filter((name) => name.endsWith(".json"))
    .toSorted();
  const expected = visualRegressionCases()
    .map((entry) => `${entry.id}.json`)
    .toSorted();

  assert.deepEqual(
    files,
    expected,
    "La línea base y el recorrido dejaron de coincidir: regenerá con pnpm visual:regression -- --update.",
  );

  for (const file of files) {
    const baseline = parseVisualBaseline(
      await readFile(new URL(file, baselineDirectory), "utf8"),
    );
    assert.equal(`${baseline.id}.json`, file);
  }
});
