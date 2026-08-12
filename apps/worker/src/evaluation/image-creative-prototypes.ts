import { readFileSync } from "node:fs";

import {
  DESIGN_SCHEMA_VERSION,
  describeIssues,
  parseDesignDocument,
  type DesignContent,
  type DesignDocument,
  type LayoutId,
  type MediaAsset,
} from "@aramayo/design-engine";

export const imageCreativePrototypeVersion =
  "image-creative-prototypes/2026-08-11.3";

export type PrototypeFamily = "application-guide" | "variant-sheet";

export type PrototypeTruthMode = "category-representation";

export interface ImageCreativePrototypeCase {
  readonly caseId: string;
  readonly document: DesignDocument;
  readonly family: PrototypeFamily;
  /** Siempre falso: la muestra sirve para revisar diseño, no para publicar. */
  readonly publishable: false;
  readonly truthMode: PrototypeTruthMode;
}

function generatedFixture(fileName: string, alt: string): MediaAsset {
  const bytes = readFileSync(
    new URL(`./fixtures/image-creative/${fileName}`, import.meta.url),
  );

  return Object.freeze({
    alt,
    fit: "contain" as const,
    focus: Object.freeze({ x: 50, y: 50 }),
    reference: Object.freeze({
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
      source: "inline" as const,
    }),
    zoom: 1,
  });
}

function documentFor(input: {
  readonly content: DesignContent;
  readonly format: "feed" | "historia";
  readonly layout: LayoutId;
  readonly media: readonly MediaAsset[];
  readonly slug: string;
}): DesignDocument {
  const parsed = parseDesignDocument({
    content: input.content,
    format: input.format,
    layout: input.layout,
    media: input.media,
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: input.slug,
    theme: "taller",
  });

  if (!parsed.ok) {
    throw new Error(
      `El prototipo ${input.slug} no es válido: ${describeIssues(parsed.issues)}`,
    );
  }

  return parsed.document;
}

const variantsContent: DesignContent = Object.freeze({
  badge: "MEDIDAS DE REFERENCIA",
  callToAction: "CONSULTÁ TU MEDIDA",
  disclaimer: "IMAGEN ILUSTRATIVA · MEDIDAS DE MUESTRA",
  items: Object.freeze(["1/2″", "3/4″", "1″"]),
  subtitle: "Tres opciones claras para comparar el diámetro que necesitás.",
  title: "Tee triple espiga",
});

const applicationContent: DesignContent = Object.freeze({
  badge: "CÓMO SE CONECTA",
  callToAction: "TRAÉ LA MUESTRA",
  disclaimer: "IMAGEN ILUSTRATIVA · VERIFICÁ LA MEDIDA",
  items: Object.freeze([
    "Hacé coincidir el diámetro",
    "Enfrentá la boca con la espiga",
    "Deslizá la manguera por fuera",
  ]),
  subtitle:
    "La boca de la manguera cubre la espiga: no se introduce dentro del accesorio.",
  title: "La manguera va por fuera",
});

const variantsPhoto = generatedFixture(
  "conectores-tres-medidas-ia-v2.png",
  "Tres conectores T de espiga ordenados de menor a mayor sobre el mostrador",
);

const applicationPhoto = generatedFixture(
  "conector-preencastre-ia-v2.png",
  "Representación del conector T y tres mangueras separados antes del encastre",
);

export function imageCreativePrototypeCases(): readonly ImageCreativePrototypeCase[] {
  return Object.freeze([
    Object.freeze({
      caseId: "P01-ficha-variantes-feed",
      document: documentFor({
        content: variantsContent,
        format: "feed",
        layout: "ficha-variantes",
        media: [variantsPhoto],
        slug: "prototipo-ficha-variantes-feed",
      }),
      family: "variant-sheet" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "H01-ficha-variantes-historia",
      document: documentFor({
        content: variantsContent,
        format: "historia",
        layout: "historia-ficha-variantes",
        media: [variantsPhoto],
        slug: "prototipo-ficha-variantes-historia",
      }),
      family: "variant-sheet" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "P02-guia-aplicacion-feed",
      document: documentFor({
        content: applicationContent,
        format: "feed",
        layout: "guia-aplicacion",
        media: [applicationPhoto],
        slug: "prototipo-guia-aplicacion-feed",
      }),
      family: "application-guide" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "H02-guia-aplicacion-historia",
      document: documentFor({
        content: applicationContent,
        format: "historia",
        layout: "historia-guia-aplicacion",
        media: [applicationPhoto],
        slug: "prototipo-guia-aplicacion-historia",
      }),
      family: "application-guide" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
  ]);
}
