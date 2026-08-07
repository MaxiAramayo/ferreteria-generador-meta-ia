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
  "image-creative-prototypes/2026-08-07.1";

export type PrototypeFamily =
  "problem-solution" | "product-price" | "real-assortment";

export type PrototypeTruthMode = "category-representation" | "real-local-stock";

export interface ImageCreativePrototypeCase {
  readonly caseId: string;
  readonly document: DesignDocument;
  readonly family: PrototypeFamily;
  /** Siempre falso: estos precios sirven para evaluar jerarquía, no para vender. */
  readonly publishable: false;
  readonly truthMode: PrototypeTruthMode;
}

const evaluationValidity = "PRECIO SINTÉTICO · NO PUBLICAR";

function media(
  assetId: string,
  alt: string,
  focus: Readonly<{ x: number; y: number }> = { x: 50, y: 50 },
): MediaAsset {
  return Object.freeze({
    alt,
    fit: "cover" as const,
    focus: Object.freeze({ ...focus }),
    reference: Object.freeze({ assetId, source: "brand-library" as const }),
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

const productContent: DesignContent = Object.freeze({
  badge: "PRODUCTO SIN MARCA",
  callToAction: "CONSULTÁ MEDIDAS",
  category: "RIEGO Y LIMPIEZA",
  disclaimer: "IMAGEN ILUSTRATIVA · EVALUACIÓN INTERNA",
  price: "$ 12.345",
  subtitle: "Para riego, limpieza y tareas de todos los días.",
  title: "Manguera reforzada de 1/2 pulgada",
  validity: evaluationValidity,
});

const problemContent: DesignContent = Object.freeze({
  badge: "SOLUCIÓN DE PLOMERÍA",
  callToAction: "TRAÉ LA MEDIDA",
  category: "CONEXIONES",
  disclaimer: "IMAGEN ILUSTRATIVA · EVALUACIÓN INTERNA",
  items: Object.freeze(["Elegí el largo", "Revisá las roscas"]),
  price: "$ 4.590",
  subtitle:
    "Un flexible nuevo conecta la grifería cuando la manguera existente está deteriorada.",
  title: "¿Perdés agua debajo de la pileta?",
  validity: evaluationValidity,
});

const assortmentContent: DesignContent = Object.freeze({
  badge: "SURTIDO REAL",
  callToAction: "MANDANOS FOTO O MEDIDA",
  category: "PLOMERÍA",
  disclaimer: "FOTO REAL DEL SURTIDO · EVALUACIÓN INTERNA",
  items: Object.freeze(["Codos PVC", "Tees PVC", "Reducciones PVC"]),
  price: "DESDE $ 1.990",
  subtitle: "Codos, tees y reducciones para completar tu instalación.",
  title: "Conexiones para agua y desagüe",
  validity: evaluationValidity,
});

const productPhoto = media(
  "manguera-azul-jpg",
  "Manguera azul reforzada enrollada, sin marca visible",
);
const problemPhoto = media(
  "flexible-conexion-agua",
  "Flexible metálico para conexión de agua, sin marca visible",
);
const mainAssortmentPhoto = media(
  "deposito-plomeria-surtido",
  "Depósito real de Aramayo con accesorios y conexiones de plomería",
  { x: 50, y: 42 },
);
const assortmentPhotos: readonly MediaAsset[] = Object.freeze([
  mainAssortmentPhoto,
  media("cano-ips-bicapa", "Caño bicapa para instalación de agua"),
  media("tapa-pvc-tuboforte", "Tapas de PVC para desagüe"),
  media("entrerosca-cano-ips", "Entreroscas para conexión de agua"),
]);

export function imageCreativePrototypeCases(): readonly ImageCreativePrototypeCase[] {
  return Object.freeze([
    Object.freeze({
      caseId: "P01-producto-precio-feed",
      document: documentFor({
        content: productContent,
        format: "feed",
        layout: "producto-precio",
        media: [productPhoto],
        slug: "prototipo-producto-precio-feed",
      }),
      family: "product-price" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "H01-producto-precio-historia",
      document: documentFor({
        content: productContent,
        format: "historia",
        layout: "historia-producto-precio",
        media: [productPhoto],
        slug: "prototipo-producto-precio-historia",
      }),
      family: "product-price" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "P02-problema-solucion-feed",
      document: documentFor({
        content: problemContent,
        format: "feed",
        layout: "problema-solucion",
        media: [problemPhoto],
        slug: "prototipo-problema-solucion-feed",
      }),
      family: "problem-solution" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "H02-problema-solucion-historia",
      document: documentFor({
        content: problemContent,
        format: "historia",
        layout: "historia-problema-solucion",
        media: [problemPhoto],
        slug: "prototipo-problema-solucion-historia",
      }),
      family: "problem-solution" as const,
      publishable: false as const,
      truthMode: "category-representation" as const,
    }),
    Object.freeze({
      caseId: "P03-surtido-real-feed",
      document: documentFor({
        content: assortmentContent,
        format: "feed",
        layout: "producto-mosaico",
        media: assortmentPhotos,
        slug: "prototipo-surtido-real-feed",
      }),
      family: "real-assortment" as const,
      publishable: false as const,
      truthMode: "real-local-stock" as const,
    }),
    Object.freeze({
      caseId: "H03-surtido-real-historia",
      document: documentFor({
        content: assortmentContent,
        format: "historia",
        layout: "historia-surtido-real",
        media: [mainAssortmentPhoto],
        slug: "prototipo-surtido-real-historia",
      }),
      family: "real-assortment" as const,
      publishable: false as const,
      truthMode: "real-local-stock" as const,
    }),
  ]);
}
