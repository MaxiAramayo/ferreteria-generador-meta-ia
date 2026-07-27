import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  FORMAT_IDS,
  FORMATS,
  hasCircularSafeArea,
  type FormatId,
} from "../formats/formats.ts";
import { THEME_IDS } from "../themes/themes.ts";
import { ICON_NAMES } from "./icons.ts";
import { LAYOUT_IDS, LAYOUT_SPECS, isLayoutId } from "./layouts.ts";

/**
 * El registro debe describir exactamente la línea base congelada en `P1-T01`.
 *
 * Si alguien agrega un layout, un formato, un tema o un icono sin volver a
 * congelar la línea base, esta prueba falla: el contrato y la evidencia visual
 * no pueden separarse.
 */

interface BaselineFixture {
  readonly layout: string;
  readonly size: string;
}

interface BaselineFormat {
  readonly height: number;
  readonly id: string;
  readonly safeArea: string;
  readonly width: number;
}

interface BaselineManifest {
  readonly fixtures: readonly BaselineFixture[];
  readonly inventory: {
    readonly formats: readonly BaselineFormat[];
    readonly iconNames: readonly string[];
    readonly layouts: readonly string[];
    readonly themes: readonly string[];
  };
}

/**
 * El manifiesto es un archivo congelado y verificable, pero se lee igual que
 * cualquier entrada externa: nada entra a la prueba sin comprobarse.
 */
function asRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} debe ser un objeto.`,
  );
  return { ...value };
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function asArray(value: unknown, label: string): readonly unknown[] {
  assert.ok(isUnknownArray(value), `${label} debe ser una lista.`);
  return value;
}

function asText(value: unknown, label: string): string {
  assert.ok(typeof value === "string", `${label} debe ser una cadena.`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  assert.ok(typeof value === "number", `${label} debe ser un número.`);
  return value;
}

function asTextList(value: unknown, label: string): readonly string[] {
  return asArray(value, label).map((entry, index) =>
    asText(entry, `${label}[${String(index)}]`),
  );
}

function readManifest(): BaselineManifest {
  const manifestUrl = new URL("../../baseline/manifest.json", import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(manifestUrl, "utf8"));
  const root = asRecord(parsed, "manifest");
  const inventory = asRecord(root["inventory"], "manifest.inventory");

  return {
    fixtures: asArray(root["fixtures"], "manifest.fixtures").map(
      (entry, index) => {
        const label = `manifest.fixtures[${String(index)}]`;
        const fixture = asRecord(entry, label);

        return {
          layout: asText(fixture["layout"], `${label}.layout`),
          size: asText(fixture["size"], `${label}.size`),
        };
      },
    ),
    inventory: {
      formats: asArray(inventory["formats"], "manifest.inventory.formats").map(
        (entry, index) => {
          const label = `manifest.inventory.formats[${String(index)}]`;
          const format = asRecord(entry, label);

          return {
            height: asNumber(format["height"], `${label}.height`),
            id: asText(format["id"], `${label}.id`),
            safeArea: asText(format["safeArea"], `${label}.safeArea`),
            width: asNumber(format["width"], `${label}.width`),
          };
        },
      ),
      iconNames: asTextList(
        inventory["iconNames"],
        "manifest.inventory.iconNames",
      ),
      layouts: asTextList(inventory["layouts"], "manifest.inventory.layouts"),
      themes: asTextList(inventory["themes"], "manifest.inventory.themes"),
    },
  };
}

function safeAreaNumbers(description: string): readonly number[] {
  return [...description.matchAll(/(\d+)/gu)].map((match) => Number(match[0]));
}

const manifest = readManifest();

test("el registro conserva todo el inventario congelado y suma el catálogo propio", () => {
  const registered = new Set<string>(LAYOUT_IDS);

  for (const layout of manifest.inventory.layouts) {
    assert.ok(
      registered.has(layout),
      `El layout congelado ${layout} dejó de estar registrado.`,
    );
  }

  assert.ok(
    LAYOUT_IDS.length >= manifest.inventory.layouts.length,
    "El registro no puede perder identificadores de la línea base.",
  );
});

test("los formatos coinciden en identificador, tamaño y zona segura", () => {
  assert.deepEqual(
    [...FORMAT_IDS].sort(),
    [...manifest.inventory.formats.map((format) => format.id)].sort(),
  );

  for (const baselineFormat of manifest.inventory.formats) {
    const registered = FORMAT_IDS.find((id) => id === baselineFormat.id);
    assert.ok(registered, `Falta el formato ${baselineFormat.id}.`);

    const format = FORMATS[registered];
    assert.equal(format.width, baselineFormat.width);
    assert.equal(format.height, baselineFormat.height);

    const expectedNumbers = safeAreaNumbers(baselineFormat.safeArea);
    const actualNumbers: readonly number[] = [
      format.safeArea.top,
      format.safeArea.right,
      format.safeArea.bottom,
      format.safeArea.left,
      ...(hasCircularSafeArea(format) ? [format.safeArea.circleDiameter] : []),
    ];
    assert.deepEqual(
      [...actualNumbers].sort((first, second) => first - second),
      [...expectedNumbers].sort((first, second) => first - second),
      `La zona segura de ${format.id} no coincide con la línea base.`,
    );
  }
});

test("los temas y los iconos coinciden con el inventario", () => {
  assert.deepEqual(
    [...THEME_IDS].sort(),
    [...manifest.inventory.themes].sort(),
  );
  assert.deepEqual(
    [...ICON_NAMES].sort(),
    [...manifest.inventory.iconNames].sort(),
  );
});

test("cada layout declara al menos un formato registrado", () => {
  for (const layoutId of LAYOUT_IDS) {
    const spec = LAYOUT_SPECS[layoutId];

    assert.ok(spec.formats.length > 0, `${layoutId} no declara formato.`);
    for (const formatId of spec.formats) {
      assert.ok(
        FORMAT_IDS.includes(formatId),
        `${layoutId} declara un formato inexistente.`,
      );
    }
  }
});

test("cada fixture congelado encaja en el formato aprobado de su layout", () => {
  for (const fixture of manifest.fixtures) {
    assert.ok(
      isLayoutId(fixture.layout),
      `El fixture usa un layout no registrado: ${fixture.layout}.`,
    );

    const spec = LAYOUT_SPECS[fixture.layout];
    const sizes = spec.formats.map((formatId: FormatId) => {
      const format = FORMATS[formatId];
      return `${String(format.width)}x${String(format.height)}`;
    });

    assert.ok(
      sizes.includes(fixture.size),
      `El layout ${fixture.layout} no admite el tamaño ${fixture.size}.`,
    );
  }
});

test("los campos obligatorios y opcionales no se superponen", () => {
  for (const layoutId of LAYOUT_IDS) {
    const spec = LAYOUT_SPECS[layoutId];
    const optional = new Set(spec.optionalFields);

    assert.ok(
      spec.requiredFields.includes("title"),
      `${layoutId} debe exigir un título.`,
    );

    for (const field of spec.requiredFields) {
      assert.ok(
        !optional.has(field),
        `${layoutId} declara ${field} como obligatorio y opcional.`,
      );
    }
  }
});
