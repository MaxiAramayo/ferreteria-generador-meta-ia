/**
 * Reglas de la composición determinista.
 *
 * `P4-T01` decidió qué se le pide al modelo; este módulo decide qué se le pone
 * encima. La imagen generada es el fondo, y el título, el precio, la vigencia,
 * el llamado a la acción y la marca se componen con el motor de diseño en la
 * zona de la pieza elegida: uno de los marcos de `ADR-029` o, para lo ya
 * generado, una de las piezas de región de `P4-T05`.
 *
 * Tres invariantes lo gobiernan:
 *
 * 1. **Nada del texto comercial sale de la imagen.** Lo que se compone viene
 *    del brief validado y de su ledger de evidencia; si un dato no está
 *    sustentado, no se compone.
 * 2. **La composición se decide antes de gastar.** Un pedido que no puede
 *    componerse —un formato que la pieza no admite, un titular que no entra— se
 *    rechaza en la planificación y no después de pagarle una imagen al
 *    proveedor.
 * 3. **La misma entrada produce la misma pieza.** El hash de composición cubre
 *    versión, pieza, tema, formato, copy y la base, de modo que dos
 *    composiciones iguales se reconocen sin comparar píxeles.
 *
 * Igual que `visual-prompt.ts`, este módulo no importa el motor de diseño: los
 * identificadores de pieza, los presupuestos de titular y los campos que cada
 * pieza sabe ubicar están declarados de los dos lados, y el worker comprueba
 * que coincidan.
 */

import { type ContentBrief, type ContentBriefFact } from "./content-brief.ts";
import {
  reservedRectangleFor,
  visualReservedSpaces,
  type VisualCanvas,
  type VisualFormatId,
  type VisualReservedSpace,
} from "./visual-prompt.ts";

/**
 * Versión de las reglas de composición.
 *
 * Cambiar qué campo se compone, con qué pieza o con qué recorte obliga a
 * subirla: es lo que permite mirar una pieza vieja y saber con qué reglas se
 * armó. `2026-09-14.1` agrega los marcos de `ADR-029`, los vuelve la pieza por
 * defecto de cada región y deja de componer etiquetas que el brief no sustenta.
 */
export const visualCompositionVersion = "visual-composition/2026-09-14.1";

/**
 * Piezas de región (`P4-T05`).
 *
 * Su panel cae sobre el rectángulo que el prompt le pidió al modelo dejar
 * libre. Siguen registradas para volver a componer lo que ya se generó con
 * ellas; una pieza nueva sale con un marco.
 */
export const regionLayoutIds = [
  "composicion-tercio-inferior",
  "composicion-banda-superior",
  "composicion-circulo-central",
] as const;

export type RegionLayoutId = (typeof regionLayoutIds)[number];

/**
 * Marcos de marca (`ADR-029`).
 *
 * Cada uno ocupa su propia zona, y quien revisa la variante elige el que no
 * tapa el producto. Se declaran acá por nombre porque el dominio no importa el
 * motor; el worker comprueba en tiempo de compilación que sigan siendo
 * identificadores de layout válidos, igual que hace con los formatos.
 */
export const frameLayoutIds = [
  "marco-firma",
  "marco-etiqueta",
  "marco-sello",
  "marco-velo-superior",
  "marco-velo-inferior",
  "marco-columna-izquierda",
  "marco-columna-derecha",
  "marco-zocalo",
  "marco-vitrina",
] as const;

export type FrameLayoutId = (typeof frameLayoutIds)[number];

/** Todas las piezas que componen una base generada. */
export const composedLayoutIds = [
  ...regionLayoutIds,
  ...frameLayoutIds,
] as const;

export type ComposedLayoutId = (typeof composedLayoutIds)[number];

/** Región que ocupa cada pieza de región: es la que el prompt reservó. */
export const regionLayoutRegions: Readonly<
  Record<RegionLayoutId, VisualReservedSpace>
> = Object.freeze({
  "composicion-banda-superior": "upper_band",
  "composicion-circulo-central": "center_circle",
  "composicion-tercio-inferior": "lower_third",
});

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
 * Cuántos caracteres de titular sostiene cada pieza.
 *
 * Duplica `COMPOSED_TITLE_BUDGET` y `FRAME_TITLE_BUDGET` del motor por la misma
 * razón que los formatos: el dominio no los importa y el worker comprueba que
 * coincidan.
 */
export const composedTitleBudget: Readonly<Record<ComposedLayoutId, number>> =
  Object.freeze({
    "composicion-banda-superior": 56,
    "composicion-circulo-central": 44,
    "composicion-tercio-inferior": 70,
    "marco-columna-derecha": 48,
    "marco-columna-izquierda": 48,
    "marco-etiqueta": 44,
    "marco-firma": 36,
    "marco-sello": 32,
    "marco-velo-inferior": 70,
    "marco-velo-superior": 56,
    "marco-vitrina": 60,
    "marco-zocalo": 70,
  });

/**
 * Marco por defecto de cada región reservada (`ADR-029`).
 *
 * La región sigue siendo lo que el prompt le pide al modelo dejar libre, y el
 * marco por defecto es el que ocupa esa misma zona: el zócalo abajo, el velo
 * arriba, el sello en el centro y la columna a la izquierda. Quien revisa la
 * variante puede elegir cualquier otro.
 */
export function composedLayoutFor(region: VisualReservedSpace): FrameLayoutId {
  switch (region) {
    case "lower_third":
      return "marco-zocalo";
    case "upper_band":
      return "marco-velo-superior";
    case "center_circle":
      return "marco-sello";
    case "left_column":
      return "marco-columna-izquierda";
  }
}

/**
 * Región de la que un marco es el valor por defecto, o el tercio inferior si
 * ninguna lo elige.
 *
 * El recorte de un marco no depende de la región reservada —cada uno define su
 * propia zona en `composedCropForLayout`—, pero el plan igual conserva una
 * región y entra en la huella. Cuando se recompone una variante existente con
 * otro marco (`ADR-029`, cambio de marco), no queda ninguna región original que
 * recuperar del historial, así que se usa ésta: no cambia el recorte, sólo
 * identifica la pieza.
 */
export function defaultRegionForFrame(
  layout: FrameLayoutId,
): VisualReservedSpace {
  return (
    visualReservedSpaces.find(
      (region) => composedLayoutFor(region) === layout,
    ) ?? "lower_third"
  );
}

export type VisualCompositionErrorCode =
  /** El titular no entra en la pieza ni en su escalón más chico. */
  | "copy-too-long"
  /** La pieza de composición no está aprobada para ese formato. */
  | "format-not-composable";

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

/**
 * Etiqueta corta de la pieza.
 *
 * Sólo se compone lo que el brief sustenta, porque la etiqueta se dibuja fuera
 * del texto que valida `validateContentBrief`. «Oferta» exige un hecho de
 * promoción verificado: el objetivo del brief es una intención, no evidencia.
 * Un producto no lleva «Disponible»: afirmaría stock que nadie verificó, y aun
 * con un hecho de stock caducaría a los cinco minutos mientras la pieza sigue
 * publicada. Una pieza informativa no lleva etiqueta: el cartel ya dice quién
 * vende.
 */
export function composedBadgeFor(brief: ContentBrief): string | null {
  switch (brief.objective) {
    case "promotion":
      return brief.verifiedFacts.some((fact) => fact.claimKind === "promotion")
        ? "Oferta"
        : null;
    case "daily_story":
      return "Hoy";
    case "informative":
    case "product":
      return null;
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
  readonly badge: string | null;
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

interface CopyCapacity {
  readonly badge: boolean;
  readonly price: boolean;
  /** Largo máximo de la bajada; `0` es una pieza que no lleva bajada. */
  readonly subtitleMaximum: number;
}

/**
 * Qué campos sabe ubicar cada pieza.
 *
 * Refleja los campos que cada layout declara en `LAYOUT_SPECS` del motor, y el
 * worker comprueba que el dominio nunca componga uno que la pieza no sabe
 * dibujar: componerlo igual cambiaría la huella de la pieza sin cambiar lo que
 * se ve. Los topes de bajada son de las zonas angostas: una columna de 500 px
 * no sostiene la misma bajada que un velo a todo el ancho.
 */
const copyCapacity: Readonly<Record<ComposedLayoutId, CopyCapacity>> =
  Object.freeze({
    "composicion-banda-superior": Object.freeze({
      badge: true,
      price: false,
      subtitleMaximum: 0,
    }),
    "composicion-circulo-central": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 0,
    }),
    "composicion-tercio-inferior": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 150,
    }),
    "marco-columna-derecha": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 90,
    }),
    "marco-columna-izquierda": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 90,
    }),
    "marco-etiqueta": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 0,
    }),
    "marco-firma": Object.freeze({
      badge: false,
      price: false,
      subtitleMaximum: 0,
    }),
    "marco-sello": Object.freeze({
      badge: false,
      price: true,
      subtitleMaximum: 0,
    }),
    "marco-velo-inferior": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 120,
    }),
    "marco-velo-superior": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 120,
    }),
    "marco-vitrina": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 0,
    }),
    "marco-zocalo": Object.freeze({
      badge: true,
      price: true,
      subtitleMaximum: 120,
    }),
  });

/**
 * Cuánto texto sostiene cada pieza, para quien valida un copy editado antes de
 * llegar acá (`ADR-029`, cambio de marco y textos).
 *
 * Sale de la misma tabla que decide qué se compone por defecto: un titular o
 * una bajada que no entran en la zona de un marco no se aceptan sólo porque
 * alguien los volvió a escribir.
 */
export interface ComposedCopyCapacity {
  readonly badge: boolean;
  readonly price: boolean;
  readonly subtitleMaximum: number;
}

export function composedCopyCapacityFor(
  layout: ComposedLayoutId,
): ComposedCopyCapacity {
  return copyCapacity[layout];
}

/**
 * Título, bajada, etiqueta y llamado a la acción elegidos por quien revisa la
 * variante, en lugar de los que derivaría el brief.
 *
 * Precio y vigencia quedan afuera a propósito: siguen componiéndose sólo desde
 * hechos verificados, y ninguna edición de marco y textos los puede tocar
 * (`ADR-029`, sección 7).
 */
export interface ComposedCopyOverride {
  readonly badge: string | null;
  readonly callToAction: string;
  readonly subtitle: string | null;
  readonly title: string;
}

export function composedCopyFor(
  brief: ContentBrief,
  layout: ComposedLayoutId,
  override?: ComposedCopyOverride,
): ComposedCopy {
  const capacity = copyCapacity[layout];
  const price = capacity.price ? verifiedPriceFor(brief) : null;

  if (override !== undefined) {
    return Object.freeze({
      badge: capacity.badge ? override.badge : null,
      callToAction: override.callToAction,
      price: price?.amount ?? null,
      priceEvidenceId: price?.evidenceId ?? null,
      // Quien llama ya validó el texto contra esta misma capacidad: acá no se
      // recorta en silencio un valor que no debería haber llegado.
      subtitle: override.subtitle,
      title: override.title,
      validity: capacity.price ? verifiedValidityFor(brief) : null,
    });
  }

  const carriesSubtitle =
    brief.subtitle !== null &&
    brief.subtitle.length <= capacity.subtitleMaximum &&
    (layout !== "composicion-tercio-inferior" ||
      brief.title.length <= subtitleTitleCeiling);

  return Object.freeze({
    badge: capacity.badge ? composedBadgeFor(brief) : null,
    callToAction: brief.callToAction.label,
    price: price?.amount ?? null,
    priceEvidenceId: price?.evidenceId ?? null,
    subtitle: carriesSubtitle ? brief.subtitle : null,
    title: brief.title,
    validity: capacity.price ? verifiedValidityFor(brief) : null,
  });
}

/**
 * Recorte de la base generada dentro del formato de la pieza.
 *
 * El proveedor entrega la proporción más cercana que admite, no la exacta: una
 * base de 1024×1536 tiene que entrar en un feed de 1080×1350. Recortar es
 * inevitable; lo que se decide acá es **por dónde**.
 *
 * La regla es alinear: la parte de la base que la pieza tapa tiene que ser la
 * que el prompt dejó libre, y la parte donde está el producto tiene que quedar
 * a la vista. Por eso el foco se corre en contra de la zona de la pieza —si la
 * pieza va abajo, el encuadre sube— en lugar de quedarse en el centro, que
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
 * Zona que ocupa cada pieza, para recortar la base en su contra.
 *
 * `null` es una pieza que no se apoya en ningún costado: la firma y la etiqueta
 * tapan tan poco que correr el encuadre movería el producto sin necesidad, y la
 * vitrina muestra la foto entera en una ventana propia. La columna derecha no
 * tiene región reservada que la nombre y se resuelve como espejo de la
 * izquierda.
 */
type CompositionZone = VisualReservedSpace | "right_column";

function zoneOf(layout: ComposedLayoutId): CompositionZone | null {
  switch (layout) {
    case "composicion-banda-superior":
    case "marco-velo-superior":
      return "upper_band";
    case "composicion-circulo-central":
    case "marco-sello":
      return "center_circle";
    case "composicion-tercio-inferior":
    case "marco-velo-inferior":
    case "marco-zocalo":
      return "lower_third";
    case "marco-columna-izquierda":
      return "left_column";
    case "marco-columna-derecha":
      return "right_column";
    case "marco-etiqueta":
    case "marco-firma":
    case "marco-vitrina":
      return null;
  }
}

export function composedCropForLayout(
  layout: ComposedLayoutId,
  base: ComposedBaseSize,
  canvas: VisualCanvas,
): ComposedCrop {
  const zone = zoneOf(layout);

  if (zone === null) {
    return Object.freeze({
      fit: "cover" as const,
      focusX: 50,
      focusY: 50,
      zoom: 1,
    });
  }

  if (zone === "right_column") {
    const mirrored = composedCropFor("left_column", base, canvas);

    return Object.freeze({ ...mirrored, focusX: 100 - mirrored.focusX });
  }

  return composedCropFor(zone, base, canvas);
}

/**
 * Punto de interés opuesto a la zona de la pieza.
 *
 * Devuelve el centro de la franja que la zona deja libre, expresado en
 * porcentaje. Si la zona está centrada y no deja una franja mayor de un lado
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
  /**
   * Título, bajada, etiqueta y llamado a la acción elegidos desde la variante.
   * Sin ella, los cuatro salen del brief como siempre.
   */
  readonly copyOverride?: ComposedCopyOverride | undefined;
  readonly format: VisualFormatId;
  /**
   * Pieza elegida por quien revisa la variante. Sin ella se usa el marco por
   * defecto de la región reservada.
   */
  readonly layout?: ComposedLayoutId | undefined;
  /** Región que el prompt reservó; en el camino determinista, la del perfil. */
  readonly region: VisualReservedSpace;
}

/**
 * Comprueba y arma el plan de composición. Lanza antes de gastar.
 */
export function planComposedPiece(
  input: PlanComposedPieceInput,
): ComposedPiecePlan {
  const layout = input.layout ?? composedLayoutFor(input.region);

  if (!isComposedFormat(input.format)) {
    throw new VisualCompositionError(
      "format-not-composable",
      "format",
      "El formato no está aprobado para una pieza de composición.",
      "Pedí la pieza en feed, cuadrado o historia; una portada o un banner no sostienen el bloque de marca.",
    );
  }

  const budget = composedTitleBudget[layout];
  const title = input.copyOverride?.title ?? input.brief.title;

  if (title.length > budget) {
    throw new VisualCompositionError(
      "copy-too-long",
      input.copyOverride === undefined ? "brief.title" : "copy.title",
      "El titular no entra en la zona de texto de la pieza.",
      `Acortá el título a ${String(budget)} caracteres o menos, o elegí un marco con más lugar para el texto.`,
    );
  }

  return Object.freeze({
    copy: composedCopyFor(input.brief, layout, input.copyOverride),
    crop: composedCropForLayout(layout, input.base, input.canvas),
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
 * El recorte no entra por separado porque se deriva de la pieza, la base y el
 * formato, que ya están.
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
    copy.badge ?? "",
    copy.callToAction,
    copy.price ?? "",
    copy.validity ?? "",
  ].join("\n");
}
