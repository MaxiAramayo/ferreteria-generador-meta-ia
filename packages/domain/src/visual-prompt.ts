/**
 * Reglas del prompt visual.
 *
 * Un perfil traduce el lenguaje visual aprobado de Aramayo a parámetros
 * verificables —formato, intención, estilo, foco, espacio reservado y guía
 * negativa— para que pedir una imagen no dependa de redactar texto libre en
 * cada ejecución. El catálogo de perfiles y el texto de las instrucciones viven
 * en el worker; acá vive la autoridad: qué perfil corresponde, qué puede entrar
 * al prompt y en qué se convierte lo que el modelo propuso.
 *
 * Dos invariantes gobiernan este módulo:
 *
 * 1. La imagen generada nunca decide texto comercial. Precio, promoción,
 *    horario, CTA y logo se componen después, con el motor determinista. Por eso
 *    el prompt jamás transporta esos campos y un texto que los insinúe frena la
 *    construcción en lugar de viajar al proveedor.
 * 2. Lo que escribió una persona o propuso el modelo entra como dato, no como
 *    instrucción. Se sanea, se acota y viaja dentro de una sección declarada
 *    como no confiable; nunca concatenado dentro de las instrucciones.
 */

import {
  detectClaimSignals,
  type BrandVariant,
  type ContentBrief,
  type VisualDirection,
} from "./content-brief.ts";

export const visualPromptLimits = Object.freeze({
  creativeNoteMaximum: 300,
  referencesMaximum: 3,
  subjectLabelMaximum: 160,
  subjectLabelMinimum: 2,
  subjectsMaximum: 4,
});

/**
 * Formatos admitidos para generar. Reproduce los identificadores canónicos de
 * `@aramayo/design-engine`; el dominio no depende del motor de diseño, así que
 * el worker comprueba en tiempo de compilación que ambas listas coincidan.
 */
export const visualFormatIds = [
  "feed",
  "cuadrado",
  "historia",
  "banner-fb",
  "destacada",
] as const;

export type VisualFormatId = (typeof visualFormatIds)[number];

/**
 * Perfiles iniciales, uno por combinación de campaña y tipo de producto que el
 * brief sabe pedir. No hay perfil genérico a propósito: elegir uno es una
 * decisión visual y comercial, y un perfil «para todo» la esconde.
 */
export const visualProfileIds = [
  "ferreteria-producto-limpio",
  "lubricentro-producto-limpio",
  "ferreteria-taller",
  "ferreteria-obra",
  "lubricentro-servicio",
  "promocion-estacional",
] as const;

export type VisualProfileId = (typeof visualProfileIds)[number];

/**
 * Región que el perfil deja tranquila para que el motor determinista escriba
 * encima. No es una medida: la medida es la zona segura del formato. Es el
 * compromiso de composición que el prompt le pide a la imagen.
 */
export const visualReservedSpaces = [
  "upper_band",
  "lower_third",
  "left_column",
  "center_circle",
] as const;

export type VisualReservedSpace = (typeof visualReservedSpaces)[number];

/**
 * Para qué se admite una referencia. El logo no figura: la identidad se compone
 * con activos aprobados en la capa determinista y nunca se le pide al modelo
 * que la dibuje.
 */
export const visualReferenceRoles = ["product_photo", "store_context"] as const;

export type VisualReferenceRole = (typeof visualReferenceRoles)[number];

export interface VisualProfileStyle {
  readonly composition: string;
  readonly lighting: string;
  readonly photography: string;
  readonly texture: string;
}

export interface VisualProfile {
  /** Marcas habilitadas a usar el perfil. */
  readonly brands: readonly BrandVariant[];
  /** Formato habitual del perfil; siempre pertenece a `formats`. */
  readonly defaultFormat: VisualFormatId;
  /** Qué tiene que quedar nítido y reconocible. */
  readonly focus: string;
  readonly formats: readonly VisualFormatId[];
  readonly id: VisualProfileId;
  /** Para qué sirve la pieza, en una oración. */
  readonly intent: string;
  /** Qué no debe aparecer. Viaja al proveedor como guía negativa explícita. */
  readonly negativeGuidance: readonly string[];
  /** Rol de referencia sin el cual el perfil no puede generar. */
  readonly requiredReferenceRole: VisualReferenceRole | null;
  readonly reservedSpace: VisualReservedSpace;
  /** Límites de contenido del perfil, además de la guía negativa. */
  readonly restrictions: readonly string[];
  readonly style: VisualProfileStyle;
  /** Cambiar cualquier campo del perfil obliga a subir esta versión. */
  readonly version: string;
}

export interface VisualPromptReference {
  readonly assetId: string;
  readonly role: VisualReferenceRole;
  readonly sha256: string;
}

export interface VisualPromptSubject {
  readonly externalProductId: string | null;
  readonly label: string;
}

/**
 * Por qué una pieza se resuelve sin IA.
 *
 * `brief-requested-template` es la decisión editorial del brief;
 * `generation-disabled` es la palanca de operación; `no-approved-reference` es
 * la consecuencia de un perfil que necesita una foto aprobada y no la tiene.
 * Los tres terminan en el mismo lugar —render completamente determinista— pero
 * quien audita necesita distinguirlos.
 */
export const deterministicVisualReasons = [
  "brief-requested-template",
  "generation-disabled",
  "no-approved-reference",
] as const;

export type DeterministicVisualReason =
  (typeof deterministicVisualReasons)[number];

/**
 * Resultado de planificar la parte visual de un brief.
 *
 * Es una unión discriminada para que no exista un plan «a medias»: o hay
 * prompt, perfil, versión y referencias, o hay una decisión determinista con su
 * motivo. Ambas variantes son suficientes para que la ejecución registre con
 * qué perfil se resolvió la pieza.
 */
export type VisualPromptPlan =
  | Readonly<{
      kind: "deterministic";
      /** Perfil que habría correspondido, o `null` si el brief pidió plantilla. */
      profileId: VisualProfileId | null;
      profileVersion: string | null;
      reason: DeterministicVisualReason;
    }>
  | Readonly<{
      format: VisualFormatId;
      kind: "generated";
      negativeGuidance: readonly string[];
      profileId: VisualProfileId;
      profileVersion: string;
      /** Mensaje de datos que viaja al proveedor, ya saneado. */
      prompt: string;
      /** Hash de instrucciones y datos: identifica la ejecución exacta. */
      promptHash: string;
      promptVersion: string;
      references: readonly VisualPromptReference[];
      reservedSpace: VisualReservedSpace;
      subjects: readonly VisualPromptSubject[];
    }>;

export type VisualPromptValidationErrorCode =
  | "brand-not-approved"
  | "commercial-text-in-prompt"
  | "format-not-approved"
  /** El activo no está aprobado para salir del sistema como referencia. */
  | "reference-not-approved"
  /** El activo es válido, pero el perfil no admite ese rol de referencia. */
  | "reference-role-not-approved"
  | "text-length"
  | "too-many-references"
  | "too-many-subjects"
  | "unsafe-characters";

/** Rechazo previo a gastar una llamada de imágenes. */
export class VisualPromptValidationError extends Error {
  readonly code: VisualPromptValidationErrorCode;
  readonly field: string;

  constructor(
    code: VisualPromptValidationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = "VisualPromptValidationError";
  }
}

/**
 * Caracteres que jamás aparecen en una etiqueta de producto legítima y sí en un
 * intento de inyección: controles C0 y C1, separadores de línea Unicode,
 * anulación bidireccional y ancho cero. Se rechazan en lugar de limpiarse
 * porque su presencia no es un descuido de tipeo.
 *
 * Tabulación, salto de línea y retorno quedan fuera de la clase: son ruido de
 * copiado y el saneo los colapsa como cualquier otro espacio.
 */
const unsafeCharacters =
  // eslint-disable-next-line no-control-regex -- Los controles son el objeto de la regla.
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u;

/**
 * Convierte texto de origen no confiable en un valor citable como dato.
 *
 * El saneo colapsa los saltos de línea a propósito: sin ellos, un valor no
 * puede simular el final de una sección ni el comienzo de otra. El resto de la
 * defensa no es textual sino estructural: el valor viaja como cadena JSON
 * dentro de la sección de datos y nunca se concatena en las instrucciones.
 */
export function sanitizeVisualPromptText(
  value: string,
  field: string,
  maximum: number,
  minimum = 0,
): string {
  if (unsafeCharacters.test(value)) {
    throw new VisualPromptValidationError(
      "unsafe-characters",
      field,
      `El campo ${field} contiene caracteres no admitidos en un prompt.`,
    );
  }
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new VisualPromptValidationError(
      "text-length",
      field,
      `El campo ${field} no cumple la longitud admitida.`,
    );
  }
  const signals = detectClaimSignals(normalized);
  if (signals.length > 0) {
    throw new VisualPromptValidationError(
      "commercial-text-in-prompt",
      field,
      `El campo ${field} insinúa ${signals.join(", ")}; ese texto se compone de forma determinista y no viaja al generador.`,
    );
  }
  return normalized;
}

/**
 * Perfil que corresponde a la dirección visual del brief.
 *
 * `null` significa que el brief pidió explícitamente la plantilla determinista,
 * que no es un perfil de IA. El `switch` es exhaustivo: agregar una dirección
 * visual sin decidir su perfil no compila.
 *
 * La marca participa de la decisión en todas las direcciones de contexto, no
 * sólo en producto limpio. El brief puede combinar una dirección de ferretería
 * con la marca del lubricentro —son campos independientes y ambos validan— y
 * generar un banco de ferretería para una pieza del lubricentro sería mostrar
 * un lugar donde ese trabajo no ocurre. Ante esa combinación se elige el
 * contexto propio de la marca, que es el escenario donde sí trabaja.
 *
 * La consecuencia es un invariante que vale la pena sostener: esta función
 * nunca devuelve un perfil que la marca no tenga aprobado.
 */
export function visualProfileIdFor(
  direction: VisualDirection,
  brand: BrandVariant,
): VisualProfileId | null {
  const isLubricentro = brand === "lubricentro";
  switch (direction) {
    case "deterministic_template":
      return null;
    case "clean_product":
      return isLubricentro
        ? "lubricentro-producto-limpio"
        : "ferreteria-producto-limpio";
    case "workshop_context":
      return isLubricentro ? "lubricentro-servicio" : "ferreteria-taller";
    case "construction_context":
      return isLubricentro ? "lubricentro-servicio" : "ferreteria-obra";
    case "lubricentro_context":
      return isLubricentro ? "lubricentro-servicio" : "ferreteria-taller";
    case "seasonal_promotion":
      return "promocion-estacional";
  }
}

export function assertVisualProfileSupports(
  profile: VisualProfile,
  scope: Readonly<{ brand: BrandVariant; format: VisualFormatId }>,
): void {
  if (!profile.brands.includes(scope.brand)) {
    throw new VisualPromptValidationError(
      "brand-not-approved",
      "brand",
      `El perfil ${profile.id} no está aprobado para la marca ${scope.brand}.`,
    );
  }
  if (!profile.formats.includes(scope.format)) {
    throw new VisualPromptValidationError(
      "format-not-approved",
      "format",
      `El perfil ${profile.id} no está aprobado para el formato ${scope.format}.`,
    );
  }
}

/**
 * Referencias admitidas por el perfil, en el orden recibido.
 *
 * Una referencia con un rol que el perfil no contempla es un error y no un
 * descarte silencioso: quien la eligió tiene que enterarse de que no se usó.
 */
export function assertVisualReferencesAllowed(
  profile: VisualProfile,
  references: readonly VisualPromptReference[],
): void {
  if (references.length > visualPromptLimits.referencesMaximum) {
    throw new VisualPromptValidationError(
      "too-many-references",
      "references",
      `El perfil admite hasta ${visualPromptLimits.referencesMaximum} referencias.`,
    );
  }
  const allowed: readonly VisualReferenceRole[] =
    profile.requiredReferenceRole === null
      ? visualReferenceRoles
      : [profile.requiredReferenceRole, "store_context"];
  for (const [index, reference] of references.entries()) {
    if (!allowed.includes(reference.role)) {
      throw new VisualPromptValidationError(
        "reference-role-not-approved",
        `references[${String(index)}].role`,
        `El perfil ${profile.id} no admite una referencia de tipo ${reference.role}.`,
      );
    }
  }
}

/**
 * Sujetos visuales del brief.
 *
 * Sólo salen de `products`, que es lo único del brief atado a una observación
 * comercial. Título, bajada, caption, CTA y hechos quedan afuera: son texto
 * comercial y se componen después.
 */
export function visualPromptSubjects(
  brief: ContentBrief,
): readonly VisualPromptSubject[] {
  if (brief.products.length > visualPromptLimits.subjectsMaximum) {
    throw new VisualPromptValidationError(
      "too-many-subjects",
      "subjects",
      `Una pieza admite hasta ${visualPromptLimits.subjectsMaximum} sujetos visuales.`,
    );
  }
  return Object.freeze(
    brief.products.map((product, index) =>
      Object.freeze({
        externalProductId: product.externalProductId,
        label: sanitizeVisualPromptText(
          product.label,
          `subjects[${String(index)}].label`,
          visualPromptLimits.subjectLabelMaximum,
          visualPromptLimits.subjectLabelMinimum,
        ),
      }),
    ),
  );
}
