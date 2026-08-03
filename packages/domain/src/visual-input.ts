/**
 * Reglas de las entradas visuales.
 *
 * Una foto que va a servir de referencia sale del sistema: viaja a un proveedor
 * que puede devolverla transformada. Por eso hay dos frentes que este módulo
 * separa a propósito.
 *
 * El primero es qué entra. `P1-T07` ya valida que el archivo sea una imagen real
 * del tipo y tamaño admitidos; acá se agrega lo que una referencia necesita
 * además: resolución suficiente para que el modelo distinga el producto,
 * proporción que no sea una tira, y una advertencia cuando el fondo está tan
 * cargado que el producto se pierde.
 *
 * El segundo es qué sale. La preparación quita los metadatos, aplica la
 * orientación a los píxeles y normaliza el color. La decisión del negocio del
 * 2026-08-03 fue limpiar también el original: la plataforma no almacena
 * ubicación ni datos de cámara en ningún momento. Se conservan los dos
 * SHA-256 —el de los bytes recibidos y el del archivo normalizado— para poder
 * probar qué se subió sin guardar lo que decía.
 */

import type { VisualReferenceRole } from "./visual-prompt.ts";

export const visualInputLimits = Object.freeze({
  /** Proporción máxima entre lado largo y lado corto. */
  aspectRatioMaximum: 3,
  /**
   * Umbral de uniformidad del borde por debajo del cual el fondo se considera
   * cargado. No rechaza: avisa, porque una foto útil con fondo movido sigue
   * siendo mejor que ninguna.
   */
  backgroundUniformityMinimum: 0.6,
  /** Lado largo del derivado. Acota lo que viaja al proveedor. */
  preparedLongestSide: 2048,
  /** Lado corto mínimo para que el modelo distinga el producto. */
  shortestSideMinimum: 512,
});

export const visualInputRejectionCodes = [
  "aspect-ratio-extreme",
  "not-decodable",
  "organization-mismatch",
  "resolution-insufficient",
  "type-not-allowed",
] as const;

export type VisualInputRejectionCode =
  (typeof visualInputRejectionCodes)[number];

/**
 * Avisos que no bloquean.
 *
 * La lista es corta a propósito: un aviso que salta con casi cualquier entrada
 * válida y no sugiere ninguna acción deja de leerse, y arrastra con él a los que
 * sí importan.
 */
export const visualInputAdvisoryCodes = ["background-busy"] as const;

export type VisualInputAdvisoryCode = (typeof visualInputAdvisoryCodes)[number];

/** Tipos que sirven de referencia. Un vectorial no describe un producto real. */
export const visualInputMimeTypes = ["image/jpeg", "image/png"] as const;

export type VisualInputMimeType = (typeof visualInputMimeTypes)[number];

/**
 * Lo que se sabe de la imagen después de decodificarla.
 *
 * `backgroundUniformity` va de 0 a 1 y resume cuán parejo es el borde del
 * cuadro. Es una señal barata y suficiente para avisar; no pretende entender la
 * escena.
 */
export interface VisualInputInspection {
  readonly backgroundUniformity: number;
  readonly byteSize: number;
  readonly height: number;
  readonly mimeType: string;
  readonly width: number;
}

export interface VisualInputCandidate {
  readonly inspection: VisualInputInspection;
  /** Organización dueña del activo, tal como la resolvió el servidor. */
  readonly ownerOrganizationId: string;
  readonly role: VisualReferenceRole;
}

export interface VisualInputRejection {
  readonly code: VisualInputRejectionCode;
  /** Qué hacer para que la próxima entrada sirva. */
  readonly correction: string;
  readonly reason: string;
}

export interface VisualInputAdvisory {
  readonly code: VisualInputAdvisoryCode;
  readonly detail: string;
}

export type VisualInputDecision =
  | Readonly<{
      advisories: readonly VisualInputAdvisory[];
      status: "accepted";
    }>
  | Readonly<{ rejection: VisualInputRejection; status: "rejected" }>;

function rejected(
  code: VisualInputRejectionCode,
  reason: string,
  correction: string,
): VisualInputDecision {
  return Object.freeze({
    rejection: Object.freeze({ code, correction, reason }),
    status: "rejected" as const,
  });
}

/**
 * Decide si una imagen puede usarse como referencia.
 *
 * Un rechazo siempre explica qué pasó y qué hacer: quien sube la foto no tiene
 * por qué deducir que «no cumple la política» significa sacarla más de cerca.
 */
export function decideVisualInput(
  candidate: VisualInputCandidate,
  organizationId: string,
): VisualInputDecision {
  // El aislamiento entre organizaciones se comprueba primero: una foto ajena no
  // se evalúa siquiera, porque el resultado no importa.
  if (candidate.ownerOrganizationId !== organizationId) {
    return rejected(
      "organization-mismatch",
      "El activo pertenece a otra organización.",
      "Usá una foto propia de tu organización.",
    );
  }

  const { inspection } = candidate;
  if (
    !(visualInputMimeTypes as readonly string[]).includes(inspection.mimeType)
  ) {
    return rejected(
      "type-not-allowed",
      `El contenido real del archivo es ${inspection.mimeType}.`,
      "Subí la foto en JPEG o PNG; un vectorial o un archivo de otro tipo no sirve de referencia.",
    );
  }

  const shortestSide = Math.min(inspection.width, inspection.height);
  if (shortestSide < visualInputLimits.shortestSideMinimum) {
    return rejected(
      "resolution-insufficient",
      `El lado más corto mide ${String(shortestSide)} px.`,
      `Necesita al menos ${String(visualInputLimits.shortestSideMinimum)} px de lado corto; sacá la foto más cerca o sin recortarla tanto.`,
    );
  }

  const longestSide = Math.max(inspection.width, inspection.height);
  const aspectRatio = longestSide / shortestSide;
  if (aspectRatio > visualInputLimits.aspectRatioMaximum) {
    return rejected(
      "aspect-ratio-extreme",
      `La proporción es ${aspectRatio.toFixed(1)}:1.`,
      `No puede superar ${String(visualInputLimits.aspectRatioMaximum)}:1; encuadrá el producto en lugar de recortar una tira.`,
    );
  }

  const advisories: VisualInputAdvisory[] = [];
  if (
    candidate.role === "product_photo" &&
    inspection.backgroundUniformity <
      visualInputLimits.backgroundUniformityMinimum
  ) {
    advisories.push(
      Object.freeze({
        code: "background-busy" as const,
        detail:
          "El fondo tiene mucho detalle y el producto puede perderse. Una superficie lisa y de un solo tono da mejor resultado.",
      }),
    );
  }
  return Object.freeze({
    advisories: Object.freeze(advisories),
    status: "accepted" as const,
  });
}

/**
 * Resultado de preparar una entrada.
 *
 * Conserva los dos hashes a propósito. `sourceSha256` prueba qué archivo entregó
 * la persona; `preparedSha256` identifica el que realmente se guarda y viaja.
 * Sin el primero no se puede demostrar la correspondencia con el original; sin
 * el segundo no se sabe qué se envió.
 */
export interface PreparedVisualInput {
  /** Bytes normalizados: es lo que se almacena y lo que viaja al proveedor. */
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: VisualInputMimeType;
  readonly preparedByteSize: number;
  readonly preparedSha256: string;
  readonly role: VisualReferenceRole;
  readonly sourceByteSize: number;
  readonly sourceSha256: string;
  readonly width: number;
}

export interface PrepareVisualInputCommand {
  readonly bytes: Uint8Array;
  readonly organizationId: string;
  readonly ownerOrganizationId: string;
  readonly role: VisualReferenceRole;
}

export type VisualInputPreparationResult =
  | Readonly<{ prepared: PreparedVisualInput; status: "prepared" }>
  | Readonly<{ rejection: VisualInputRejection; status: "rejected" }>;

/**
 * Puerto de preparación. El dominio no decodifica imágenes: declara qué
 * necesita y el worker lo resuelve con la biblioteca que corresponda.
 */
export interface VisualInputPreparer {
  prepare(
    command: PrepareVisualInputCommand,
  ): Promise<VisualInputPreparationResult>;
}
