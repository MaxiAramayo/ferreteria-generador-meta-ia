/**
 * Esquema estricto de salida del brief.
 *
 * Sólo declara forma: tipos, enums, propiedades requeridas y prohibición de
 * propiedades extra. Longitudes, referencias de evidencia, frescura y política
 * de marca se validan en `@aramayo/domain`, que es la autoridad. El esquema
 * evita que el modelo devuelva algo que ni siquiera podamos leer; no sustituye
 * la validación.
 *
 * Modo estricto: cada objeto declara todas sus propiedades como requeridas y
 * `additionalProperties: false`.
 */

import {
  brandVariants,
  callToActionKinds,
  contentObjectives,
  factualClaimKinds,
  missingInformationKinds,
  visualDirections,
  type StructuredOutputSchema,
} from "@aramayo/domain";

export const contentBriefSchemaVersion = "content-brief/2026-07-30.1";

function enumeration(
  values: readonly string[],
  description: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    description,
    enum: [...values],
    type: "string",
  });
}

function text(description: string): Readonly<Record<string, unknown>> {
  return Object.freeze({ description, type: "string" });
}

function object(
  properties: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
    type: "object",
  });
}

function list(
  items: Readonly<Record<string, unknown>>,
  description: string,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ description, items, type: "array" });
}

const factSchema = object({
  claimKind: enumeration(
    factualClaimKinds,
    "Tipo de afirmación que sustenta la evidencia citada.",
  ),
  evidenceId: text(
    "Identificador exacto de la evidencia provista por el sistema; nunca inventado.",
  ),
  statement: text("Afirmación verificable, en una sola oración."),
});

const productSchema = object({
  evidenceId: text(
    "Identificador de la observación comercial que prueba el producto.",
  ),
  externalProductId: text(
    "Identificador opaco del producto, tal como lo devolvió la herramienta.",
  ),
  label: text("Nombre del producto tal como se mostrará en la pieza."),
});

const missingInformationSchema = object({
  detail: text("Qué falta confirmar y con quién, en una oración."),
  kind: enumeration(
    missingInformationKinds,
    "Motivo por el que el dato no pudo verificarse.",
  ),
  subject: enumeration(
    factualClaimKinds,
    "Tipo de dato que quedó sin respaldo.",
  ),
});

export const contentBriefSchema: StructuredOutputSchema = Object.freeze({
  name: "aramayo_content_brief",
  schema: object({
    brand: enumeration(brandVariants, "Marca que firma la pieza."),
    callToAction: object({
      kind: enumeration(
        callToActionKinds,
        "Acción concreta que la ferretería puede atender hoy.",
      ),
      label: text("Texto breve del llamado a la acción."),
    }),
    caption: text("Texto de publicación en español argentino claro."),
    creativeProposal: text(
      "Propuesta creativa y de tono. Es interpretación propia, no un hecho.",
    ),
    missingInformation: list(
      missingInformationSchema,
      "Datos que no pudieron verificarse y bloquean una afirmación.",
    ),
    objective: enumeration(
      contentObjectives,
      "Objetivo editorial de la pieza.",
    ),
    products: list(
      productSchema,
      "Productos citados, cada uno con su observación comercial.",
    ),
    requiresHumanApproval: Object.freeze({
      description:
        "Verdadero si hay faltantes, promoción o cualquier duda que exija decisión humana.",
      type: "boolean",
    }),
    subtitle: Object.freeze({
      description: "Bajada opcional; null cuando la pieza no la necesita.",
      type: ["string", "null"],
    }),
    title: text("Título de la pieza, una sola idea."),
    verifiedFacts: list(
      factSchema,
      "Hechos sustentados, cada uno atado a una evidencia entregada por el sistema.",
    ),
    visualDirection: enumeration(
      visualDirections,
      "Dirección visual sugerida para el motor determinista.",
    ),
  }),
  version: contentBriefSchemaVersion,
});
