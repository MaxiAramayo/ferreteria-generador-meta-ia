/**
 * Programación, recurrencia y ocurrencias de una publicación.
 *
 * El modelo separa tres cosas que es tentador mezclar:
 *
 * - la **programación** es una intención temporal: qué snapshot aprobado, a qué
 *   destinos y cuándo, expresado como lo dice el negocio —«todos los martes a
 *   las nueve»—;
 * - la **ocurrencia** es un instante concreto que esa intención produjo;
 * - la **orden de publicación** es lo que efectivamente sale, y vive en
 *   `publication-publishing.ts`.
 *
 * Una recurrencia nunca publica: materializa ocurrencias. Una ocurrencia
 * tampoco publica: se despacha y ahí nace la orden. Mezclar los tres niveles es
 * lo que hace que editar una regla reescriba el pasado.
 *
 * ## La hora local es el dato original, no el instante
 *
 * El negocio no piensa en UTC: piensa «las nueve de la mañana». Esa hora local
 * más la zona IANA son el dato que hay que conservar, y el instante UTC es su
 * consecuencia. Al revés se pierde información: si sólo se guardara el
 * instante, un cambio en las reglas de la zona —que ocurren y se publican en la
 * base tz— movería la hora que la gente ve sin que nadie lo haya decidido.
 *
 * Por eso la identidad de una ocurrencia es su **clave civil local**
 * `YYYY-MM-DDTHH:mm` y no su instante: la clave sobrevive a una actualización
 * de tzdata y a una edición de la regla, y es lo que permite volver a
 * materializar sin duplicar.
 *
 * ## Las dos anomalías de zona horaria se resuelven por política
 *
 * Una hora local puede **no existir** —la madrugada que el adelanto de reloj se
 * saltea— o **existir dos veces** —la que el atraso repite—. Ninguna de las dos
 * es un error de datos y ninguna se puede resolver adivinando:
 *
 * - la hora inexistente se resuelve con `gapPolicy`, que declara si la
 *   ocurrencia se saltea o se corre al primer instante válido;
 * - la hora ambigua se resuelve siempre por el **primer** instante, y la
 *   ocurrencia queda marcada `ambiguous` para que la evidencia lo diga.
 *
 * Argentina no aplica horario de verano desde 2009, así que hoy ninguna de las
 * dos ocurre en `America/Argentina/Cordoba`. Se modelan igual porque la zona es
 * un dato configurable y porque un modelo de calendario que asume que toda hora
 * local existe una sola vez está mal escrito, no simplificado.
 */

import type { OrganizationScope } from "./persistence.ts";
import type { PublicationTarget } from "./publication.ts";

/** Zona por defecto del negocio. */
export const publicationScheduleDefaultTimeZone =
  "America/Argentina/Cordoba" as const;

/** Estados de una programación. */
export const publicationScheduleStatuses = Object.freeze([
  /** Produce ocurrencias. */
  "active",
  /** Deja de producir; conserva las planificadas y puede reanudarse. */
  "paused",
  /** Terminal por decisión humana. */
  "cancelled",
  /** Terminal porque su vigencia terminó. */
  "expired",
  /** Terminal porque una programación única ya se despachó. */
  "completed",
] as const);

export type PublicationScheduleStatus =
  (typeof publicationScheduleStatuses)[number];

/**
 * Estados de una ocurrencia.
 *
 * No incluye «publicada»: eso lo sabe la orden. Una ocurrencia sólo declara si
 * sigue esperando su turno, si alguien la sacó del calendario o si ya se
 * convirtió en orden. Duplicar acá el desenlace remoto crearía una segunda
 * verdad sobre lo mismo.
 */
export const publicationOccurrenceStatuses = Object.freeze([
  /** Esperando su instante. */
  "planned",
  /** No se ejecuta: excepción de calendario o política de hora inexistente. */
  "skipped",
  /** Sacada del calendario por una persona. */
  "cancelled",
  /** Ya produjo una orden de publicación. Congelada. */
  "dispatched",
] as const);

export type PublicationOccurrenceStatus =
  (typeof publicationOccurrenceStatuses)[number];

/**
 * Cómo resolver una hora local que no existe.
 *
 * `skip` es el default seguro: si la hora elegida cae en el hueco del adelanto
 * de reloj, ese día no se publica y queda registrado. `next-valid` corre la
 * ocurrencia al primer instante que sí existe.
 */
export const publicationScheduleGapPolicies = Object.freeze([
  "next-valid",
  "skip",
] as const);

export type PublicationScheduleGapPolicy =
  (typeof publicationScheduleGapPolicies)[number];

/**
 * Qué hacer con una ocurrencia cuyo instante ya pasó sin despacharse.
 *
 * Existe porque un dispatcher caído no es una excepción teórica. Publicar una
 * promoción de la mañana a las once de la noche es peor que no publicarla, así
 * que la tolerancia es explícita y acotada.
 */
export const publicationMissedPolicies = Object.freeze([
  /** Se publica tarde mientras esté dentro de la tolerancia. */
  "run-late",
  /** Una ocurrencia vencida no se publica nunca. */
  "skip",
] as const);

export type PublicationMissedPolicy =
  (typeof publicationMissedPolicies)[number];

/**
 * Qué hacer cuando el día del mes no existe en ese mes.
 *
 * El 31 no existe en abril. `clamp` lo lleva al último día; `skip` saltea el
 * mes. Sin política explícita, cada implementación elige distinto y el
 * calendario deja de ser predecible.
 */
export const publicationMonthDayOverflows = Object.freeze([
  "clamp",
  "skip",
] as const);

export type PublicationMonthDayOverflow =
  (typeof publicationMonthDayOverflows)[number];

/** Días de la semana, con lunes en 1 y domingo en 7, como ISO-8601. */
export type PublicationWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Máximo de la separación entre repeticiones, en unidades de la frecuencia. */
export const publicationRecurrenceMaximumInterval = 52;

/**
 * Cuántas ocurrencias puede devolver una expansión.
 *
 * Un tope existe porque una ventana grande sobre una regla diaria produce miles
 * de filas, y porque una regla mal formada no debe poder agotar la memoria del
 * proceso que la expande.
 */
export const publicationOccurrenceWindowLimit = 366;

export type PublicationRecurrence =
  | {
      readonly kind: "daily";
      readonly interval: number;
    }
  /**
   * Una sola vez, en la fecha local con la que empieza la vigencia.
   *
   * Es una recurrencia con exactamente una ocurrencia y no un modelo aparte: el
   * dispatcher no debería tener que preguntar de qué tipo es una programación
   * para saber cómo materializarla.
   */
  | {
      readonly kind: "once";
    }
  | {
      readonly kind: "monthly";
      readonly interval: number;
      readonly monthDay: number;
      readonly overflow: PublicationMonthDayOverflow;
    }
  | {
      readonly kind: "weekly";
      readonly interval: number;
      readonly weekdays: readonly PublicationWeekday[];
    };

/**
 * La regla temporal, sin el contenido.
 *
 * `effectiveFrom` y `effectiveUntil` son instantes UTC porque así se guardan;
 * la fecha local que delimita la vigencia se deriva de ellos con `timeZone`.
 */
export interface PublicationScheduleRule {
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly gapPolicy: PublicationScheduleGapPolicy;
  readonly localTime: string;
  readonly recurrence: PublicationRecurrence;
  readonly timeZone: string;
}

/** Una programación, con su intención temporal y su contenido. */
export interface PublicationScheduleRecord {
  readonly approvalSnapshotId: string;
  readonly id: string;
  readonly lateToleranceMinutes: number;
  readonly missedPolicy: PublicationMissedPolicy;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly rule: PublicationScheduleRule;
  readonly status: PublicationScheduleStatus;
  readonly targets: readonly PublicationTarget[];
}

/** Cómo se resolvió la hora local contra la zona. */
export type PublicationOccurrenceResolution =
  /** La hora local ocurre dos veces; se tomó la primera. */
  | "ambiguous"
  /** La hora local existe una sola vez. */
  | "exact"
  /** La hora local no existía; se corrió al primer instante válido. */
  | "shifted";

/** Una ocurrencia planificada, antes de persistirse. */
export interface PublicationOccurrencePlan {
  /** Identidad estable: la hora civil local que la regla produjo. */
  readonly occurrenceKey: string;
  readonly resolution: PublicationOccurrenceResolution;
  /** Instante UTC en el que corresponde publicar. */
  readonly scheduledAt: string;
}

/** Una ocurrencia ya persistida. */
export interface PublicationOccurrenceRecord {
  readonly occurrenceKey: string;
  readonly publicationOrderId?: string;
  readonly resolution: PublicationOccurrenceResolution;
  readonly scheduledAt: string;
  readonly status: PublicationOccurrenceStatus;
}

/** Tópico transaccional que solicita transportar una ocurrencia a Redis. */
export const publicationOccurrenceDispatchTopic =
  "scheduling.occurrence.dispatch:v1" as const;

/** Cola BullMQ que transporta ocurrencias listas para `P6-T03`. */
export const publicationOccurrenceQueueName = "scheduled-publications" as const;

/** Nombre estable del job dentro de la cola de publicaciones programadas. */
export const publicationOccurrenceJobName =
  "dispatch-publication-occurrence" as const;

/**
 * Payload mínimo que cruza Redis.
 *
 * No copia snapshot, destinos ni permisos: el consumidor vuelve a leerlos de
 * PostgreSQL. Así un job viejo no puede convertirse en una segunda fuente de
 * verdad sobre qué corresponde publicar.
 */
export interface PublicationOccurrenceDispatchJob extends OrganizationScope {
  readonly dispatchEventId: string;
  readonly occurrenceId: string;
  readonly scheduleId: string;
}

export interface ClaimDuePublicationOccurrencesInput {
  readonly at: string;
  readonly limit: number;
  /** Scope interno opcional para particionar instancias o pruebas. */
  readonly organizationId?: string;
}

/** Resultado de la selección transaccional de ocurrencias vencidas. */
export interface PublicationOccurrenceClaimSummary {
  readonly dispatchRequested: number;
  readonly jobs: readonly PublicationOccurrenceDispatchJob[];
  readonly reviewed: number;
  readonly skipped: number;
}

/** Foto operativa del atraso que sigue en PostgreSQL. */
export interface PublicationScheduleDispatchMetrics {
  readonly backlog: number;
  readonly lagMilliseconds: number;
  readonly queued: number;
  readonly unclaimed: number;
}

/**
 * Puerto persistente del dispatcher.
 *
 * `claimDue` debe marcar la ocurrencia y crear su outbox en la misma
 * transacción. `pendingQueueJobs` es deliberadamente reconstruible: Redis
 * puede vaciarse y este listado vuelve a crear el transporte desde la verdad
 * guardada.
 */
export interface PublicationScheduleDispatchRepository {
  claimDue(
    input: ClaimDuePublicationOccurrencesInput,
  ): Promise<PublicationOccurrenceClaimSummary>;
  dispatchMetrics(at: string): Promise<PublicationScheduleDispatchMetrics>;
  pendingQueueJobs(
    input: Readonly<{ afterOccurrenceId?: string; limit: number }>,
  ): Promise<readonly PublicationOccurrenceDispatchJob[]>;
}

const millisecondsPerMinute = 60_000;
const millisecondsPerDay = 86_400_000;
const localTimePattern = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u;
const occurrenceKeyPattern =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** Fecha civil, sin zona ni instante: el terreno donde se hace la aritmética. */
interface CivilDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/**
 * Partes civiles de un instante en una zona.
 *
 * Se devuelve como «milisegundos si esa hora civil fuera UTC» porque así la
 * comparación entre lo pedido y lo obtenido es una resta y no una tabla de
 * casos.
 */
function zonedCivilMilliseconds(timeZone: string, instantMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instantMs));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    if (found === undefined) {
      throw new RangeError(`La zona ${timeZone} no produjo ${type}.`);
    }
    return Number.parseInt(found.value, 10);
  };
  // ICU puede devolver la medianoche como hora 24 con `hour12: false`.
  const hour = field("hour") % 24;
  const year = field("year");
  const civil = Date.UTC(
    year,
    field("month") - 1,
    field("day"),
    hour,
    field("minute"),
    field("second"),
  );
  // `Date.UTC` interpreta los años de dos dígitos como 19xx.
  if (year >= 0 && year < 100) {
    const corrected = new Date(civil);
    corrected.setUTCFullYear(year);
    return corrected.getTime();
  }
  return civil;
}

function zoneOffsetMilliseconds(timeZone: string, instantMs: number): number {
  return zonedCivilMilliseconds(timeZone, instantMs) - instantMs;
}

/**
 * Encuentra el instante exacto en que cambia el desfasaje.
 *
 * Se usa sólo cuando la hora pedida cae en un hueco, y devuelve el primer
 * instante que ya está del otro lado del salto. La búsqueda binaria evita
 * suponer cuánto dura el salto: hay zonas que se movieron treinta minutos y
 * zonas que se movieron una hora entera.
 */
function transitionInstant(
  timeZone: string,
  beforeMs: number,
  afterMs: number,
): number {
  const targetOffset = zoneOffsetMilliseconds(timeZone, afterMs);
  let low = beforeMs;
  let high = afterMs;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (zoneOffsetMilliseconds(timeZone, middle) === targetOffset) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/**
 * Convierte una hora civil local en un instante UTC.
 *
 * Devuelve `undefined` sólo cuando la hora no existe y la política es
 * saltearla. Las tres salidas —exacta, ambigua y corrida— son estados
 * legítimos del calendario y por eso viajan en el resultado en vez de perderse.
 */
export function resolveLocalInstant(
  occurrenceKey: string,
  timeZone: string,
  gapPolicy: PublicationScheduleGapPolicy,
): PublicationOccurrencePlan | undefined {
  if (!occurrenceKeyPattern.test(occurrenceKey)) {
    throw new RangeError(
      `La clave de ocurrencia ${occurrenceKey} no tiene forma YYYY-MM-DDTHH:mm.`,
    );
  }
  const civilMs = Date.parse(`${occurrenceKey}:00.000Z`);
  // Los candidatos salen de los desfasajes de un día antes y un día después, y
  // no de refinar una única suposición. Refinando se converge siempre al mismo
  // lado del salto, y entonces la hora repetida parece única: el segundo
  // instante válido nunca se genera y la ambigüedad pasa inadvertida. Un día de
  // margen cubre cualquier desfasaje real y cualquier transición conocida.
  const candidates = [
    ...new Set([
      civilMs - zoneOffsetMilliseconds(timeZone, civilMs - millisecondsPerDay),
      civilMs - zoneOffsetMilliseconds(timeZone, civilMs + millisecondsPerDay),
    ]),
  ].sort((left, right) => left - right);
  const valid = candidates.filter(
    (candidate) => zonedCivilMilliseconds(timeZone, candidate) === civilMs,
  );

  const first = valid[0];
  if (first !== undefined) {
    return Object.freeze({
      occurrenceKey,
      resolution: valid.length > 1 ? "ambiguous" : "exact",
      scheduledAt: new Date(first).toISOString(),
    });
  }

  if (gapPolicy === "skip") {
    return undefined;
  }
  const low = candidates[0];
  const high = candidates.at(-1);
  if (low === undefined || high === undefined || low === high) {
    // Sin dos candidatos distintos no hay salto que buscar: la hora pedida
    // simplemente no se pudo resolver y adivinar sería peor que fallar.
    throw new RangeError(
      `No se pudo resolver ${occurrenceKey} en la zona ${timeZone}.`,
    );
  }
  return Object.freeze({
    occurrenceKey,
    resolution: "shifted",
    scheduledAt: new Date(transitionInstant(timeZone, low, high)).toISOString(),
  });
}

function civilDateOf(timeZone: string, instant: string): CivilDate {
  const civilMs = zonedCivilMilliseconds(timeZone, Date.parse(instant));
  const civil = new Date(civilMs);
  return Object.freeze({
    day: civil.getUTCDate(),
    month: civil.getUTCMonth() + 1,
    year: civil.getUTCFullYear(),
  });
}

function civilDayNumber(date: CivilDate): number {
  return Math.floor(
    Date.UTC(date.year, date.month - 1, date.day) / millisecondsPerDay,
  );
}

function civilFromDayNumber(dayNumber: number): CivilDate {
  const civil = new Date(dayNumber * millisecondsPerDay);
  return Object.freeze({
    day: civil.getUTCDate(),
    month: civil.getUTCMonth() + 1,
    year: civil.getUTCFullYear(),
  });
}

/** Lunes en 1, domingo en 7. */
function civilWeekday(date: CivilDate): PublicationWeekday {
  const day = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return (day === 0 ? 7 : day) as PublicationWeekday;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function civilKey(date: CivilDate, localTime: string): string {
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}T${localTime}`;
}

function assertRule(rule: PublicationScheduleRule): void {
  if (!localTimePattern.test(rule.localTime)) {
    throw new RangeError(
      `La hora local ${rule.localTime} no tiene forma HH:mm.`,
    );
  }
  if (Number.isNaN(Date.parse(rule.effectiveFrom))) {
    throw new RangeError("La vigencia debe empezar en un instante válido.");
  }
  if (
    rule.effectiveUntil !== undefined &&
    Number.isNaN(Date.parse(rule.effectiveUntil))
  ) {
    throw new RangeError("La vigencia debe terminar en un instante válido.");
  }
  if (
    rule.effectiveUntil !== undefined &&
    Date.parse(rule.effectiveUntil) < Date.parse(rule.effectiveFrom)
  ) {
    throw new RangeError("La vigencia no puede terminar antes de empezar.");
  }
  if (rule.recurrence.kind !== "once") {
    const { interval } = rule.recurrence;
    if (
      !Number.isInteger(interval) ||
      interval < 1 ||
      interval > publicationRecurrenceMaximumInterval
    ) {
      throw new RangeError(
        `La separación debe ser un entero entre 1 y ${String(publicationRecurrenceMaximumInterval)}.`,
      );
    }
  }
  if (
    rule.recurrence.kind === "weekly" &&
    rule.recurrence.weekdays.length === 0
  ) {
    throw new RangeError("Una regla semanal necesita al menos un día.");
  }
  if (
    rule.recurrence.kind === "monthly" &&
    (!Number.isInteger(rule.recurrence.monthDay) ||
      rule.recurrence.monthDay < 1 ||
      rule.recurrence.monthDay > 31)
  ) {
    throw new RangeError("El día del mes debe estar entre 1 y 31.");
  }
  // Una zona inválida tiene que fallar acá y no cuando el calendario ya está
  // guardado: `Intl` lanza `RangeError` con el nombre adentro.
  zoneOffsetMilliseconds(rule.timeZone, Date.parse(rule.effectiveFrom));
}

/**
 * Decide si una fecha civil cae dentro de la recurrencia.
 *
 * La aritmética es sobre fechas civiles y no sobre instantes a propósito: «cada
 * dos semanas» cuenta semanas del calendario, no intervalos de 336 horas. Con
 * un cambio de horario en el medio las dos cuentas dejan de coincidir y la
 * segunda corre la hora.
 */
function matchesRecurrence(
  recurrence: PublicationRecurrence,
  anchor: CivilDate,
  candidate: CivilDate,
): boolean {
  switch (recurrence.kind) {
    case "once": {
      return civilDayNumber(candidate) === civilDayNumber(anchor);
    }
    case "daily": {
      const elapsed = civilDayNumber(candidate) - civilDayNumber(anchor);
      return elapsed >= 0 && elapsed % recurrence.interval === 0;
    }
    case "weekly": {
      if (!recurrence.weekdays.includes(civilWeekday(candidate))) {
        return false;
      }
      const anchorWeekStart =
        civilDayNumber(anchor) - (civilWeekday(anchor) - 1);
      const candidateWeekStart =
        civilDayNumber(candidate) - (civilWeekday(candidate) - 1);
      const elapsedWeeks = (candidateWeekStart - anchorWeekStart) / 7;
      return elapsedWeeks >= 0 && elapsedWeeks % recurrence.interval === 0;
    }
    case "monthly": {
      const elapsedMonths =
        (candidate.year - anchor.year) * 12 + (candidate.month - anchor.month);
      if (elapsedMonths < 0 || elapsedMonths % recurrence.interval !== 0) {
        return false;
      }
      const length = daysInMonth(candidate.year, candidate.month);
      if (recurrence.monthDay <= length) {
        return candidate.day === recurrence.monthDay;
      }
      return recurrence.overflow === "clamp" && candidate.day === length;
    }
  }
}

/**
 * Expande la regla dentro de una ventana.
 *
 * Devuelve las ocurrencias cuyo **instante** cae en `[from, to)`. Se filtra por
 * instante y no por fecha local porque la ventana la fija el dispatcher, que
 * razona en UTC; la fecha local sólo gobierna cuáles existen.
 */
export function planOccurrences(
  rule: PublicationScheduleRule,
  window: { readonly from: string; readonly to: string },
): readonly PublicationOccurrencePlan[] {
  assertRule(rule);
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    throw new RangeError("La ventana debe tener instantes válidos.");
  }
  if (toMs < fromMs) {
    throw new RangeError("La ventana no puede terminar antes de empezar.");
  }

  const anchor = civilDateOf(rule.timeZone, rule.effectiveFrom);
  // La vigencia se mide en **fechas civiles** y no en instantes. El negocio la
  // declara como «del 15 al 30», y comparar contra el instante exacto haría que
  // una vigencia que empieza a media tarde se comiera la publicación de esa
  // misma mañana. Con fechas civiles, el primer día vigente entra entero.
  const anchorDay = civilDayNumber(anchor);
  const untilDay =
    rule.effectiveUntil === undefined
      ? undefined
      : civilDayNumber(civilDateOf(rule.timeZone, rule.effectiveUntil));

  // Se recorren fechas civiles con un día de margen a cada lado: el desfasaje
  // de la zona puede meter en la ventana la ocurrencia del día anterior o del
  // siguiente.
  const firstDay =
    civilDayNumber(civilDateOf(rule.timeZone, new Date(fromMs).toISOString())) -
    1;
  const lastDay =
    civilDayNumber(civilDateOf(rule.timeZone, new Date(toMs).toISOString())) +
    1;

  const plans: PublicationOccurrencePlan[] = [];
  for (let dayNumber = firstDay; dayNumber <= lastDay; dayNumber += 1) {
    if (plans.length >= publicationOccurrenceWindowLimit) {
      break;
    }
    const candidate = civilFromDayNumber(dayNumber);
    if (!matchesRecurrence(rule.recurrence, anchor, candidate)) {
      continue;
    }
    const plan = resolveLocalInstant(
      civilKey(candidate, rule.localTime),
      rule.timeZone,
      rule.gapPolicy,
    );
    if (plan === undefined) {
      continue;
    }
    if (dayNumber < anchorDay) {
      continue;
    }
    if (untilDay !== undefined && dayNumber > untilDay) {
      continue;
    }
    const instantMs = Date.parse(plan.scheduledAt);
    if (instantMs < fromMs || instantMs >= toMs) {
      continue;
    }
    plans.push(plan);
  }
  return Object.freeze(plans);
}

/**
 * Próxima ocurrencia estrictamente posterior a un instante.
 *
 * Avanza por ventanas y no por días sueltos para que una regla mensual no
 * obligue a 31 conversiones de zona por mes consultado.
 */
export function nextOccurrenceAfter(
  rule: PublicationScheduleRule,
  after: string,
): PublicationOccurrencePlan | undefined {
  assertRule(rule);
  const afterMs = Date.parse(after);
  if (Number.isNaN(afterMs)) {
    throw new RangeError("El instante de referencia debe ser válido.");
  }
  const horizonMs =
    rule.effectiveUntil === undefined
      ? undefined
      : Date.parse(rule.effectiveUntil);
  // Cuatro saltos de 62 días cubren cualquier regla mensual con separación de
  // hasta dos meses; más allá, la regla no tiene próxima ocurrencia útil.
  const windowLengthMs = 62 * millisecondsPerDay;
  let cursor = Math.max(afterMs + 1, Date.parse(rule.effectiveFrom));
  for (let step = 0; step < 12; step += 1) {
    const end = cursor + windowLengthMs;
    if (horizonMs !== undefined && cursor > horizonMs) {
      return undefined;
    }
    const [first] = planOccurrences(rule, {
      from: new Date(cursor).toISOString(),
      to: new Date(end).toISOString(),
    });
    if (first !== undefined) {
      return first;
    }
    cursor = end;
  }
  return undefined;
}

/**
 * Arma la regla de una programación única a partir de la fecha local elegida.
 *
 * Existe para cerrar un filo de la API: `effectiveFrom` es un instante, y un
 * instante cerca de la medianoche pertenece a un día local distinto del que
 * quien programa tenía en mente. Quien elige «el 15 a las nueve» no debería
 * tener que calcular qué instante UTC cae dentro del 15 local.
 *
 * Devuelve `undefined` cuando esa hora local no existe y la política es
 * saltearla: una programación única sin ocurrencia posible no se crea.
 */
export function singleOccurrenceRule(input: {
  readonly gapPolicy: PublicationScheduleGapPolicy;
  readonly localDate: string;
  readonly localTime: string;
  readonly timeZone: string;
}): PublicationScheduleRule | undefined {
  if (!localTimePattern.test(input.localTime)) {
    throw new RangeError(
      `La hora local ${input.localTime} no tiene forma HH:mm.`,
    );
  }
  const plan = resolveLocalInstant(
    `${input.localDate}T${input.localTime}`,
    input.timeZone,
    input.gapPolicy,
  );
  if (plan === undefined) {
    return undefined;
  }
  return Object.freeze({
    effectiveFrom: plan.scheduledAt,
    effectiveUntil: plan.scheduledAt,
    gapPolicy: input.gapPolicy,
    localTime: input.localTime,
    recurrence: Object.freeze({ kind: "once" as const }),
    timeZone: input.timeZone,
  });
}

/** Una programación produce ocurrencias sólo mientras está activa y vigente. */
export function scheduleAcceptsOccurrences(
  schedule: PublicationScheduleRecord,
  at: string,
): boolean {
  if (schedule.status !== "active") {
    return false;
  }
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) {
    throw new RangeError("El instante de referencia debe ser válido.");
  }
  const until = schedule.rule.effectiveUntil;
  return until === undefined || atMs <= Date.parse(until);
}

/**
 * Si corresponde marcar la programación como vencida.
 *
 * La expiración es un estado explícito y no una condición derivada: una
 * programación vencida tiene que poder distinguirse de una pausada al leer la
 * fila, sin recalcular el calendario.
 */
export function scheduleExpirationDue(
  schedule: PublicationScheduleRecord,
  at: string,
): boolean {
  if (schedule.status !== "active" && schedule.status !== "paused") {
    return false;
  }
  const until = schedule.rule.effectiveUntil;
  if (until === undefined) {
    return false;
  }
  return Date.parse(at) > Date.parse(until);
}

/** Una ocurrencia congelada no la reescribe ninguna edición de la regla. */
export function occurrenceIsFrozen(
  occurrence: PublicationOccurrenceRecord,
): boolean {
  return (
    occurrence.status === "dispatched" ||
    occurrence.publicationOrderId !== undefined
  );
}

/** Resultado de comparar el calendario guardado contra la regla vigente. */
export interface PublicationOccurrenceDiff {
  /** Ocurrencias nuevas que la regla produce y todavía no existen. */
  readonly create: readonly PublicationOccurrencePlan[];
  /** Guardadas que la regla ya no produce y todavía se pueden retirar. */
  readonly obsolete: readonly string[];
  /** Guardadas que la regla sigue produciendo, con su instante recalculado. */
  readonly reschedule: readonly PublicationOccurrencePlan[];
  /** Guardadas intocables: ya se despacharon. */
  readonly frozen: readonly string[];
}

/**
 * Compara lo planificado con lo guardado.
 *
 * Es la función que sostiene «editar una regla no reescribe ocurrencias ya
 * publicadas»: lo despachado sale por `frozen` y no aparece en ninguna de las
 * otras listas, aunque la regla nueva ya no lo produzca. El pasado no se
 * reescribe ni se borra; se conserva y se marca.
 *
 * `reschedule` existe porque una ocurrencia puede seguir siendo la misma
 * —misma clave civil— y haber cambiado de instante: pasa cuando se corrige la
 * zona o cuando tzdata mueve un desfasaje.
 */
export function diffOccurrences(
  planned: readonly PublicationOccurrencePlan[],
  existing: readonly PublicationOccurrenceRecord[],
): PublicationOccurrenceDiff {
  const plannedByKey = new Map(
    planned.map((plan) => [plan.occurrenceKey, plan] as const),
  );
  const create: PublicationOccurrencePlan[] = [];
  const frozen: string[] = [];
  const obsolete: string[] = [];
  const reschedule: PublicationOccurrencePlan[] = [];

  const existingKeys = new Set<string>();
  for (const occurrence of existing) {
    existingKeys.add(occurrence.occurrenceKey);
    const plan = plannedByKey.get(occurrence.occurrenceKey);
    if (occurrenceIsFrozen(occurrence)) {
      frozen.push(occurrence.occurrenceKey);
      continue;
    }
    if (plan === undefined) {
      // Una ocurrencia que alguien ya sacó del calendario no vuelve a la lista
      // de obsoletas: retirarla otra vez no cambiaría nada y ensuciaría la
      // auditoría con una transición por cada edición de la regla.
      if (occurrence.status === "planned") {
        obsolete.push(occurrence.occurrenceKey);
      }
      continue;
    }
    if (
      occurrence.status === "planned" &&
      (occurrence.scheduledAt !== plan.scheduledAt ||
        occurrence.resolution !== plan.resolution)
    ) {
      reschedule.push(plan);
    }
  }

  for (const plan of planned) {
    if (!existingKeys.has(plan.occurrenceKey)) {
      create.push(plan);
    }
  }

  return Object.freeze({
    create: Object.freeze(create),
    frozen: Object.freeze(frozen),
    obsolete: Object.freeze(obsolete),
    reschedule: Object.freeze(reschedule),
  });
}

/** Qué hacer con una ocurrencia cuyo instante ya pasó. */
export type PublicationMissedDisposition = "run" | "skip";

/**
 * Decide si una ocurrencia vencida todavía puede publicarse.
 *
 * La tolerancia se mide desde el instante planificado y no desde que el
 * dispatcher despertó: lo que importa es cuán vieja es la publicación para
 * quien la va a leer, no cuánto tardó el sistema en darse cuenta.
 */
export function missedOccurrenceDisposition(
  schedule: Pick<
    PublicationScheduleRecord,
    "lateToleranceMinutes" | "missedPolicy"
  >,
  occurrence: Pick<PublicationOccurrenceRecord, "scheduledAt">,
  now: string,
): PublicationMissedDisposition {
  const scheduledMs = Date.parse(occurrence.scheduledAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(scheduledMs) || Number.isNaN(nowMs)) {
    throw new RangeError("Los instantes deben ser válidos.");
  }
  if (nowMs <= scheduledMs) {
    return "run";
  }
  if (schedule.missedPolicy === "skip") {
    return "skip";
  }
  const toleranceMs = schedule.lateToleranceMinutes * millisecondsPerMinute;
  return nowMs - scheduledMs <= toleranceMs ? "run" : "skip";
}
