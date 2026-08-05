/**
 * Reglas de la composición determinista.
 *
 * `P4-T01` decidió qué se le pide al modelo; este módulo decide qué se le pone
 * encima. La imagen generada es el fondo, y el título, el precio, la vigencia,
 * el llamado a la acción y el logo se componen con el motor de marca sobre el
 * mismo rectángulo que el prompt le pidió al modelo dejar tranquilo.
 *
 * Tres invariantes lo gobiernan:
 *
 * 1. **Nada del texto comercial sale de la imagen.** Lo que se compone viene
 *    del brief validado y de su ledger de evidencia; si un dato no está
 *    sustentado, no se compone.
 * 2. **La composición se decide antes de gastar.** Un pedido que no puede
 *    componerse —una región sin pieza, un formato que la pieza no admite, un
 *    titular que no entra— se rechaza en la planificación y no después de
 *    pagarle una imagen al proveedor.
 * 3. **La misma entrada produce la misma pieza.** El hash de composición cubre
 *    versión, pieza, tema, formato, copy y la base, de modo que dos
 *    composiciones iguales se reconocen sin comparar píxeles.
 *
 * Igual que `visual-prompt.ts`, este módulo no importa el motor de diseño: la
 * geometría del rectángulo reservado está declarada de los dos lados y el
 * worker comprueba que coincidan.
 */

import {
  type ContentBrief,
  type ContentBriefFact,
  type ContentObjective,
} from "./content-brief.ts";
import {
  reservedRectangleFor,
  type VisualCanvas,
  type VisualFormatId,
  type VisualReservedSpace,
} from "./visual-prompt.ts";

/**
 * Versión de las reglas de composición.
 *
 * Cambiar qué campo se compone, con qué pieza o con qué recorte obliga a
 * subirla: es lo que permite mirar una pieza vieja y saber con qué reglas se
 * armó.
 */
export const visualCompositionVersion = "visual-composition/2026-08-05.1";

/**
 * Piezas de composición del motor de diseño.
 *
 * Se declaran acá por nombre porque el dominio no importa el motor. El worker
 * comprueba en tiempo de compilación que sigan siendo identificadores de layout
 * válidos, igual que hace con los formatos.
 */
export const composedLayoutIds = [
  "composicion-tercio-inferior",
  "composicion-banda-superior",
  "composicion-circulo-central",
] as const;

export type ComposedLayoutId = (typeof composedLayoutIds)[number];

/** Temas del motor que la composición sabe elegir. */
export const composedThemeIds = ["taller", "lubricentro", "promo"] as const;

export type ComposedThemeId = (typeof composedThemeIds)[number];

/** Formatos en los que una pieza de composición está aprobada. */
export const composedFormatIds = ["feed", "cuadrado", "historia"] as const;

export type ComposedFormatId = (typeof composedFormatIds)[number];

const composedFormats: ReadonlySet<string> = new Set(composedFormatIds);

export function isComposedFormat(
  format: VisualFormatId,
): format is ComposedFormatId {
  return composedFormats.has(format);
}

/**
 * Cuántos caracteres de titular sostiene cada región.
 *
 * Duplica `COMPOSED_TITLE_BUDGET` del motor por la misma razón que los
 * formatos: el dominio no lo importa y el worker comprueba que coincidan.
 */
export const composedTitleBudget: Readonly<Record<ComposedLayoutId, number>> =
  Object.freeze({
    "composicion-banda-superior": 56,
    "composicion-circulo-central": 44,
    "composicion-tercio-inferior": 70,
  });

/**
 * Qué pieza compone cada región reservada.
 *
 * `left_column` no tiene pieza: ningún perfil visual aprobado la usa y el
 * catálogo no admite una pieza sin objetivo comercial. Devolver `null` obliga a
 * quien llama a decidir explícitamente qué hacer, en lugar de caer en otra
 * pieza y escribir donde el modelo no dejó lugar.
 */
export function composedLayoutFor(
  region: VisualReservedSpace,
): ComposedLayoutId | null {
  switch (region) {
    case "lower_third":
      return "composicion-tercio-inferior";
    case "upper_band":
      return "composicion-banda-superior";
    case "center_circle":
      return "composicion-circulo-central";
    case "left_column":
      return null;
  }
}

export type VisualCompositionErrorCode =
  /** El titular no entra en la región ni en su escalón más chico. */
  | "copy-too-long"
  /** La pieza de composición no está aprobada para ese formato. */
  | "format-not-composable"
  /** La región reservada no tiene pieza de composición. */
  | "region-without-layout";

/** Rechazo previo a componer, y por lo tanto previo a gastar. */
export class VisualCompositionError extends Error {
  readonly code: VisualCompositionErrorCode;
  /** Qué hacer, en el idioma de quien pidió la pieza. */
  readonly correction: string;
  readonly field: string;

  constructor(
    code: VisualCompositionErrorCode,
    field: string,
    message: string,
    correction: string,
  ) {
    super(message);
    this.code = code;
    this.correction = correction;
    this.field = field;
    this.name = "VisualCompositionError";
  }
}

/**
 * Importe argentino dentro de un hecho verificado.
 *
 * El brief no tiene campo de precio: el precio existe como hecho con
 * `claimKind: "price"` y un enunciado en prosa. Extraerlo es la única forma de
 * componerlo, y por eso el reconocimiento es estricto: exige el símbolo de
 * moneda y admite un solo importe por enunciado. Dos importes en la misma
 * oración —«de $32.000 a $24.500»— no se resuelven adivinando cuál es el
 * vigente; la pieza sale sin precio y con la invitación a consultar, que es la
 * decisión de negocio ya aprobada.
 */
const amountPattern =
  /(?:\$|ars)\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/giu;

export interface VerifiedPrice {
  /** Importe ya normalizado a la forma que muestra la pieza. */
  readonly amount: string;
  /** Evidencia que lo respalda: sin ella el precio no se compone. */
  readonly evidenceId: string;
}

export function parseVerifiedAmount(statement: string): string | null {
  amountPattern.lastIndex = 0;
  const matches = [...statement.matchAll(amountPattern)];
  const [first] = matches;

  if (matches.length !== 1 || first === undefined) {
    return null;
  }

  const digits = first[1];

  if (digits === undefined) {
    return null;
  }

  return `$ ${digits}`;
}

/**
 * Precio a componer, tomado de los hechos verificados del brief.
 *
 * Se recorre en orden y se toma el primero que produce un importe inequívoco.
 * Si hay varios hechos de precio con importes distintos, no se elige: dos
 * precios sustentados a la vez es una contradicción del brief, no algo que la
 * composición deba resolver dibujando uno.
 */
export function verifiedPriceFor(brief: ContentBrief): VerifiedPrice | null {
  const priced = brief.verifiedFacts.filter(
    (fact: ContentBriefFact) => fact.claimKind === "price",
  );
  const amounts = priced
    .map((fact) => ({
      amount: parseVerifiedAmount(fact.statement),
      evidenceId: fact.evidenceId,
    }))
    .filter(
      (entry): entry is VerifiedPrice =>
        entry.amount !== null && entry.amount.length > 0,
    );
  const [first] = amounts;

  if (first === undefined) {
    return null;
  }

  const distinct = new Set(amounts.map((entry) => entry.amount));

  return distinct.size === 1 ? first : null;
}

/**
 * Vigencia a componer.
 *
 * Sale de un hecho de promoción y sólo si el enunciado la declara: una
 * promoción sin fecha de fin no se convierte en «por tiempo limitado», que es
 * una afirmación que nadie sustentó.
 */
const validityPattern =
  /(hasta el [^.,;]{3,60}|válid[ao] [^.,;]{3,60}|por (?:el )?(?:mes|fin de semana|día)[^.,;]{0,40})/iu;

export function verifiedValidityFor(brief: ContentBrief): string | null {
  for (const fact of brief.verifiedFacts) {
    if (fact.claimKind !== "promotion") {
      continue;
    }

    const match = validityPattern.exec(fact.statement);
    const found = match?.[1];

    if (found !== undefined) {
      return found.trim();
    }
  }

  return null;
}

/** Etiqueta corta de la pieza, derivada del objetivo del brief. */
export function composedBadgeFor(objective: ContentObjective): string {
  switch (objective) {
    case "promotion":
      return "Oferta";
    case "product":
      return "Disponible";
    case "informative":
      return "Aramayo";
    case "daily_story":
      return "Hoy";
  }
}

export function composedThemeFor(brief: ContentBrief): ComposedThemeId {
  if (brief.brand === "lubricentro") {
    return "lubricentro";
  }

  return brief.objective === "promotion" ? "promo" : "taller";
}

/**
 * Copy de la pieza, con la procedencia de cada dato.
 *
 * `priceEvidenceId` existe para que una revisión pueda responder de dónde salió
 * el número sin volver a mirar el brief, que es lo que `P4-T06` va a necesitar
 * cuando alguien edite el precio.
 */
export interface ComposedCopy {
  readonly badge: string;
  readonly callToAction: string;
  readonly price: string | null;
  readonly priceEvidenceId: string | null;
  readonly subtitle: string | null;
  readonly title: string;
  readonly validity: string | null;
}

/**
 * Con cuántos caracteres de titular la bajada todavía entra en el tercio
 * inferior. Por encima, el panel tendría que crecer y taparía el producto.
 */
const subtitleTitleCeiling = 40;

export function composedCopyFor(
  brief: ContentBrief,
  layout: ComposedLayoutId,
): ComposedCopy {
  const price = verifiedPriceFor(brief);
  const carriesPrice = layout !== "composicion-banda-superior";
  const carriesSubtitle =
    layout === "composicion-tercio-inferior" &&
    brief.subtitle !== null &&
    brief.title.length <= subtitleTitleCeiling;

  return Object.freeze({
    badge: composedBadgeFor(brief.objective),
    callToAction: brief.callToAction.label,
    price: carriesPrice ? (price?.amount ?? null) : null,
    priceEvidenceId: carriesPrice ? (price?.evidenceId ?? null) : null,
    subtitle: carriesSubtitle ? brief.subtitle : null,
    title: brief.title,
    validity: carriesPrice ? verifiedValidityFor(brief) : null,
  });
}

/**
 * Recorte de la base generada dentro del formato de la pieza.
 *
 * El proveedor entrega la proporción más cercana que admite, no la exacta: una
 * base de 1024×1536 tiene que entrar en un feed de 1080×1350. Recortar es
 * inevitable; lo que se decide acá es **por dónde**.
 *
 * La regla es alinear: la mitad de la base que el prompt dejó libre tiene que
 * caer sobre el panel, y la mitad donde está el producto sobre lo que queda a
 * la vista. Por eso el foco se corre en contra de la región reservada —si el
 * panel va abajo, el encuadre sube— en lugar de quedarse en el centro, que
 * cortaría la mitad del sujeto en un formato más apaisado que la base.
 */
export interface ComposedCrop {
  readonly fit: "cover";
  readonly focusX: number;
  readonly focusY: number;
  readonly zoom: number;
}

export interface ComposedBaseSize {
  readonly height: number;
  readonly width: number;
}

export function composedCropFor(
  region: VisualReservedSpace,
  base: ComposedBaseSize,
  canvas: VisualCanvas,
): ComposedCrop {
  const rect = reservedRectangleFor(region, canvas);
  // Cuánto de la base sobra en cada eje después de cubrir el lienzo. Si un eje
  // no sobra, no hay nada que elegir en él y el foco se queda en el centro.
  const scale = Math.max(
    canvas.width / base.width,
    canvas.height / base.height,
  );
  const coveredWidth = base.width * scale;
  const coveredHeight = base.height * scale;
  const slackX = coveredWidth - canvas.width;
  const slackY = coveredHeight - canvas.height;

  return Object.freeze({
    fit: "cover" as const,
    focusX: slackX <= 0 ? 50 : oppositeFocus(rect.x, rect.width, canvas.width),
    focusY:
      slackY <= 0 ? 50 : oppositeFocus(rect.y, rect.height, canvas.height),
    // El zoom queda en 1: agrandar la base para «acomodar» el sujeto la
    // interpola y le baja la nitidez, y nadie pidió recortar más de lo que el
    // formato obliga.
    zoom: 1,
  });
}

/**
 * Punto de interés opuesto a la región reservada.
 *
 * Devuelve el centro de la franja que la región deja libre, expresado en
 * porcentaje. Si la región está centrada y no deja una franja mayor de un lado
 * que del otro, el foco queda en el medio.
 */
function oppositeFocus(start: number, length: number, total: number): number {
  const before = start;
  const after = total - (start + length);

  if (Math.abs(before - after) <= 1) {
    return 50;
  }

  const free =
    before > after
      ? { length: before, start: 0 }
      : { length: after, start: start + length };

  return Math.round(((free.start + free.length / 2) / total) * 100);
}

/**
 * Todo lo que hace falta para componer, ya comprobado.
 *
 * Es lo que el worker convierte en documento de diseño y lo que se persiste
 * junto a la variante para poder rehacer la pieza sin volver a preguntarle nada
 * al brief.
 */
export interface ComposedPiecePlan {
  readonly copy: ComposedCopy;
  readonly crop: ComposedCrop;
  readonly format: ComposedFormatId;
  readonly layout: ComposedLayoutId;
  readonly region: VisualReservedSpace;
  readonly theme: ComposedThemeId;
  readonly version: string;
}

export interface PlanComposedPieceInput {
  readonly base: ComposedBaseSize;
  readonly brief: ContentBrief;
  readonly canvas: VisualCanvas;
  readonly format: VisualFormatId;
  readonly region: VisualReservedSpace;
}

/**
 * Comprueba y arma el plan de composición. Lanza antes de gastar.
 */
export function planComposedPiece(
  input: PlanComposedPieceInput,
): ComposedPiecePlan {
  const layout = composedLayoutFor(input.region);

  if (layout === null) {
    throw new VisualCompositionError(
      "region-without-layout",
      "region",
      "La región reservada no tiene una pieza de composición aprobada.",
      "Elegí un perfil visual cuya región reservada tenga pieza: banda superior, tercio inferior o sello central.",
    );
  }

  if (!isComposedFormat(input.format)) {
    throw new VisualCompositionError(
      "format-not-composable",
      "format",
      "El formato no está aprobado para una pieza de composición.",
      "Pedí la pieza en feed, cuadrado o historia; una portada o un banner no sostienen el bloque de marca.",
    );
  }

  if (input.brief.title.length > composedTitleBudget[layout]) {
    throw new VisualCompositionError(
      "copy-too-long",
      "brief.title",
      "El titular no entra en la región reservada de la pieza.",
      `Acortá el título a ${String(composedTitleBudget[layout])} caracteres o menos.`,
    );
  }

  return Object.freeze({
    copy: composedCopyFor(input.brief, layout),
    crop: composedCropFor(input.region, input.base, input.canvas),
    format: input.format,
    layout,
    region: input.region,
    theme: composedThemeFor(input.brief),
    version: visualCompositionVersion,
  });
}

/**
 * Entrada canónica del hash de composición.
 *
 * El dominio no calcula el hash —no importa `node:crypto`, igual que no importa
 * ningún SDK— pero sí decide **qué entra**: versión, pieza, tema, formato, copy
 * y la base. Dos composiciones con la misma entrada son la misma pieza, y por
 * eso volver a renderizarla puede compararse sin mirar un solo píxel.
 *
 * El recorte no entra por separado porque se deriva de la base y del formato,
 * que ya están.
 */
export function composedPieceFingerprint(
  plan: ComposedPiecePlan,
  baseSha256: string | null,
): string {
  const { copy } = plan;

  return [
    plan.version,
    plan.layout,
    plan.theme,
    plan.format,
    plan.region,
    baseSha256 ?? "sin-base",
    copy.title,
    copy.subtitle ?? "",
    copy.badge,
    copy.callToAction,
    copy.price ?? "",
    copy.validity ?? "",
  ].join("\n");
}
