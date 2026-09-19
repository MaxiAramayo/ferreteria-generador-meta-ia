import type { AuthenticatedActor } from "./identity.ts";
import type {
  PublicationOccurrencePlan,
  PublicationWeekday,
} from "./publication-schedule.ts";

export const recurringStoryApprovalPolicies = Object.freeze([
  "human-each-cycle",
  "automatic-routine",
] as const);

export type RecurringStoryApprovalPolicy =
  (typeof recurringStoryApprovalPolicies)[number];

/**
 * Composiciones aprobadas para comunicar una apertura.
 *
 * `imagen` no es una composición: publica tal cual la imagen que subió quien
 * opera. El sistema no puede leer lo que esa imagen afirma, así que su borrador
 * siempre pide aprobación humana (`ADR-030`).
 */
export const recurringStoryDesignVariants = Object.freeze([
  "cartel",
  "horario",
  "locales",
  "imagen",
] as const);

export type RecurringStoryDesignVariant =
  (typeof recurringStoryDesignVariants)[number];

/** Temas permitidos para una apertura de Ferretería Aramayo. */
export const recurringStoryThemes = Object.freeze([
  "taller",
  "claro",
  "promo",
] as const);

export type RecurringStoryTheme = (typeof recurringStoryThemes)[number];

/**
 * Color de la etiqueta de estado y del botón. `marca` deja decidir al tema;
 * los otros dos son elecciones explícitas de quien opera.
 */
export const recurringStoryAccents = Object.freeze([
  "marca",
  "senal",
  "verde",
] as const);

export type RecurringStoryAccent = (typeof recurringStoryAccents)[number];

/**
 * Foto propia de una regla.
 *
 * Viaja embebida como `data:` porque el render no sale a la red y la revisión
 * aprobada tiene que poder recomponerse igual; el costo es que cada borrador
 * guarda su copia (`ADR-030`). `focusY` es el encuadre vertical, de 0 a 100.
 */
export interface RecurringStoryPhoto {
  readonly alt: string;
  readonly dataUrl: string;
  readonly focusY: number;
}

export const recurringStoryPhotoLimits = Object.freeze({
  altMaximum: 160,
  /**
   * Una foto de 1080×1920 en JPEG de calidad 0,86 ronda los 600 KB, unos
   * 800.000 caracteres en base64. Tres millones dejan margen sin admitir que
   * un archivo cualquiera termine en cada borrador.
   */
  dataUrlMaximum: 3_000_000,
  focusMaximum: 100,
  focusMinimum: 0,
});

export type RecurringStoryStyleIssue =
  | "photo-alt-invalid"
  | "photo-focus-invalid"
  | "photo-too-large"
  | "photo-type-invalid"
  | "photo-required";

const photoDataUrlPattern = /^data:image\/(?:jpeg|png);base64,/u;

/**
 * Límites de negocio de un estilo de apertura.
 *
 * Los bytes los vuelve a comprobar el motor al validar el documento; acá se
 * decide lo que es regla de la apertura: la imagen propia necesita su imagen y
 * la foto no puede ser un archivo arbitrario.
 */
export function recurringStoryStyleIssue(
  style: Readonly<{
    designVariant: RecurringStoryDesignVariant;
    photo: RecurringStoryPhoto | null;
  }>,
): RecurringStoryStyleIssue | null {
  const { photo } = style;
  if (photo === null) {
    return style.designVariant === "imagen" ? "photo-required" : null;
  }
  const alt = photo.alt.trim();
  if (alt.length === 0 || alt.length > recurringStoryPhotoLimits.altMaximum) {
    return "photo-alt-invalid";
  }
  if (
    !Number.isInteger(photo.focusY) ||
    photo.focusY < recurringStoryPhotoLimits.focusMinimum ||
    photo.focusY > recurringStoryPhotoLimits.focusMaximum
  ) {
    return "photo-focus-invalid";
  }
  if (!photoDataUrlPattern.test(photo.dataUrl)) {
    return "photo-type-invalid";
  }
  if (photo.dataUrl.length > recurringStoryPhotoLimits.dataUrlMaximum) {
    return "photo-too-large";
  }
  return null;
}

const recurringStoryDesignVariantSet: ReadonlySet<string> = new Set(
  recurringStoryDesignVariants,
);
const recurringStoryAccentSet: ReadonlySet<string> = new Set(
  recurringStoryAccents,
);
const recurringStoryThemeSet: ReadonlySet<string> = new Set(
  recurringStoryThemes,
);

export function isRecurringStoryDesignVariant(
  value: unknown,
): value is RecurringStoryDesignVariant {
  return typeof value === "string" && recurringStoryDesignVariantSet.has(value);
}

export function isRecurringStoryTheme(
  value: unknown,
): value is RecurringStoryTheme {
  return typeof value === "string" && recurringStoryThemeSet.has(value);
}

export function isRecurringStoryAccent(
  value: unknown,
): value is RecurringStoryAccent {
  return typeof value === "string" && recurringStoryAccentSet.has(value);
}

export type OpeningStoryLayout =
  | "historia-apertura-cartel"
  | "historia-apertura-horario"
  | "historia-apertura-imagen"
  | "historia-apertura-locales";

export function openingStoryLayoutFor(
  variant: RecurringStoryDesignVariant,
): OpeningStoryLayout {
  return `historia-apertura-${variant}`;
}

export const recurringStoryRuleStatuses = Object.freeze([
  "active",
  "paused",
  "cancelled",
] as const);

export type RecurringStoryRuleStatus =
  (typeof recurringStoryRuleStatuses)[number];

export interface RecurringStoryRuleRecord {
  readonly accent: RecurringStoryAccent;
  readonly approvalPolicy: RecurringStoryApprovalPolicy;
  readonly createdByMembershipId: string;
  readonly designVariant: RecurringStoryDesignVariant;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null` es una regla para todas las sucursales activas. */
  readonly locationId: string | null;
  readonly name: string;
  readonly organizationId: string;
  /** `null`: la historia usa la foto del local de la biblioteca de marca. */
  readonly photo: RecurringStoryPhoto | null;
  readonly status: RecurringStoryRuleStatus;
  readonly theme: RecurringStoryTheme;
  readonly timeZone: string;
  readonly version: number;
  readonly weekdays: readonly PublicationWeekday[];
}

export interface RecurringStoryLocationSource {
  readonly addressLine: string;
  readonly city: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly name: string;
  readonly openingHours?: string;
  readonly organizationId: string;
  readonly province: string;
  readonly timeZone: string;
  readonly version: number;
}

export type RecurringStoryDayOverride =
  | Readonly<{
      localDate: string;
      sourceLabel: string;
      status: "closed";
      version: number;
    }>
  | Readonly<{
      localDate: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
      version: number;
    }>;

export interface RecurringStoryLocationSourceSnapshot {
  readonly address: string;
  readonly capturedAt: string;
  readonly hours: string;
  readonly localDate: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly locationVersion: number;
  readonly sourceKind: "daily-override" | "location-configuration";
  readonly sourceLabel: string;
  readonly sourceVersion: number;
}

/**
 * Lo que una historia para todas las sucursales afirmó de cada una.
 *
 * `hours` es `null` cuando esa sucursal cierra el día por excepción: la
 * historia lo dice, y un cambio en esa excepción la tiene que invalidar igual
 * que un cambio de horario.
 */
export interface RecurringStoryLocationEntry {
  readonly address: string;
  readonly hours: string | null;
  readonly locationId: string;
  readonly locationName: string;
  readonly locationVersion: number;
  readonly sourceKind: "daily-override" | "location-configuration";
  readonly sourceLabel: string;
  readonly sourceVersion: number;
}

export interface RecurringStoryEveryLocationSourceSnapshot {
  readonly capturedAt: string;
  readonly localDate: string;
  readonly locations: readonly RecurringStoryLocationEntry[];
  readonly scope: "every-location";
}

export type RecurringStorySourceSnapshot =
  | RecurringStoryEveryLocationSourceSnapshot
  | RecurringStoryLocationSourceSnapshot;

export type RecurringStoryDraftResolution<
  TSource extends RecurringStorySourceSnapshot = RecurringStorySourceSnapshot,
> =
  | Readonly<{
      reason: "location-closed" | "location-inactive" | "missing-hours";
      status: "blocked";
    }>
  | Readonly<{
      caption: string;
      designContent: OpeningStoryContent;
      requiresHumanApproval: boolean;
      source: TSource;
      status: "ready";
    }>;

/**
 * Texto que la historia afirma, derivado de la fuente factual.
 *
 * Los renglones nombran cada sucursal con su calle; el horario va aparte en
 * `validity` cuando es el mismo para todas, y dentro de cada renglón cuando no.
 */
export interface OpeningStoryContent {
  readonly badge: string;
  readonly callToAction: string;
  readonly greeting: string;
  readonly icon: "reloj";
  readonly items: readonly string[];
  readonly subtitle: string;
  readonly title: string;
  readonly validity?: string;
}

export interface CreateRecurringStoryRuleCommand {
  readonly accent?: RecurringStoryAccent;
  readonly actor: AuthenticatedActor;
  readonly approvalPolicy: RecurringStoryApprovalPolicy;
  readonly designVariant?: RecurringStoryDesignVariant;
  readonly effectiveFrom: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null` es una regla para todas las sucursales activas. */
  readonly locationId: string | null;
  readonly name: string;
  readonly photo?: RecurringStoryPhoto | null;
  readonly theme?: RecurringStoryTheme;
  readonly weekdays: readonly PublicationWeekday[];
}

export type CreateRecurringStoryRuleResult =
  | Readonly<{ rule: RecurringStoryRuleRecord; status: "created" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ status: "location-not-found" }>;

export interface RecurringStoryRuleRepository {
  create(
    command: CreateRecurringStoryRuleCommand &
      Readonly<{ idempotencyKey: string; occurredAt: string }>,
  ): Promise<CreateRecurringStoryRuleResult>;
  list(organizationId: string): Promise<readonly RecurringStoryRuleRecord[]>;
  updateVisualStyle(
    command: Readonly<{
      accent: RecurringStoryAccent;
      actor: AuthenticatedActor;
      designVariant: RecurringStoryDesignVariant;
      expectedVersion: number;
      idempotencyKey: string;
      occurredAt: string;
      /** El estilo se reemplaza entero: `null` vuelve a la foto del local. */
      photo: RecurringStoryPhoto | null;
      ruleId: string;
      theme: RecurringStoryTheme;
    }>,
  ): Promise<
    | Readonly<{ rule: RecurringStoryRuleRecord; status: "updated" }>
    | Readonly<{ status: "not-found" }>
    | Readonly<{ status: "version-conflict" }>
  >;
}

export interface RecurringStoryMaterializationRepository {
  materializeDue(
    input: Readonly<{
      at: string;
      limit: number;
      organizationId?: string;
    }>,
  ): Promise<
    Readonly<{
      blocked: number;
      created: number;
      reviewed: number;
    }>
  >;
}

function nonEmpty(text: string | undefined): string | undefined {
  const normalized = text?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

export function recurringStoryLocalDate(
  occurrence: Pick<PublicationOccurrencePlan, "occurrenceKey">,
): string {
  return occurrence.occurrenceKey.slice(0, 10);
}

/** Voz de la historia: la misma que usa el negocio en su cartel. */
const openingTitle = "¡Ya abrimos!";
const openingCallToAction = "Escribinos";
const greetingMaximum = 26;

/**
 * Saludo según la hora civil de la publicación, con la localidad cuando entra.
 *
 * La historia se publica a la hora de la regla: «Buen día» a las 8:30 y
 * «Buenas tardes» a las 16:30. Una localidad larga se omite antes que partir
 * el saludo.
 */
export function openingStoryGreeting(
  occurrenceKey: string,
  city: string | null,
): string {
  const hour = Number(occurrenceKey.slice(11, 13));
  const greeting =
    hour < 12 ? "Buen día" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const withCity = city === null ? greeting : `${greeting}, ${city}`;
  return withCity.length <= greetingMaximum ? withCity : greeting;
}

const numberWords: ReadonlyMap<number, string> = new Map([
  [2, "dos"],
  [3, "tres"],
]);

/**
 * Mensaje de la historia.
 *
 * «Ya están atendiendo» sólo es cierto a la hora de la publicación si todas
 * abren a la misma hora; con horarios distintos, la historia dice que hoy se
 * atiende, que es cierto todo el día. «Tu auto» sólo se promete cuando habla de
 * todas las sucursales: el negocio completo tiene lubricentro, pero una
 * sucursal sola quizás no.
 */
function openingMessage(
  openNames: readonly string[],
  scope: "every-location" | "single-location",
  sameOpeningHours: boolean,
): string {
  const [onlyName] = openNames;
  const count = numberWords.get(openNames.length) ?? String(openNames.length);
  const who =
    openNames.length === 1 && onlyName !== undefined
      ? `${onlyName} ya está atendiendo.`
      : sameOpeningHours
        ? `Nuestros ${count} locales ya están atendiendo.`
        : `Hoy atendemos en nuestros ${count} locales.`;
  const what =
    scope === "every-location"
      ? "Vení a buscar lo que necesitás para tu casa, tu oficio o tu auto."
      : "Vení a buscar lo que necesitás para tu casa o tu oficio.";
  const message = `${who} ${what}`;
  // El motor rechaza un mensaje de más de 150 caracteres; un nombre largo de
  // sucursal no puede dejar la historia sin componer.
  return message.length <= 150 ? message : `Ya estamos atendiendo. ${what}`;
}

function approvalRequired(
  policy: RecurringStoryApprovalPolicy,
  isOverride: boolean,
  designVariant: RecurringStoryDesignVariant,
): boolean {
  // Una excepción siempre vuelve a revisión humana: una regla automática no
  // tiene autoridad para aprobar un horario excepcional por sí sola. La imagen
  // propia tampoco: el sistema no puede leer lo que afirma.
  return (
    policy === "human-each-cycle" || isOverride || designVariant === "imagen"
  );
}

export function resolveRecurringStoryDraft(
  input: Readonly<{
    capturedAt: string;
    dayOverride?: RecurringStoryDayOverride;
    designVariant?: RecurringStoryDesignVariant;
    location: RecurringStoryLocationSource;
    occurrence: PublicationOccurrencePlan;
    policy: RecurringStoryApprovalPolicy;
  }>,
): RecurringStoryDraftResolution<RecurringStoryLocationSourceSnapshot> {
  const localDate = recurringStoryLocalDate(input.occurrence);
  // Una excepción pertenece a una fecha civil de la sucursal. Aplicar la de
  // otro día produciría un horario equivocado en el borde de medianoche, así
  // que el desajuste se declara en vez de resolverse por conveniencia.
  if (
    input.dayOverride !== undefined &&
    input.dayOverride.localDate !== localDate
  ) {
    throw new RangeError(
      `La excepción del ${input.dayOverride.localDate} no corresponde a la fecha local ${localDate}.`,
    );
  }
  if (!input.location.isActive) {
    return Object.freeze({ reason: "location-inactive", status: "blocked" });
  }
  if (input.dayOverride?.status === "closed") {
    return Object.freeze({ reason: "location-closed", status: "blocked" });
  }

  const hours = nonEmpty(
    input.dayOverride?.status === "open"
      ? input.dayOverride.openingHours
      : input.location.openingHours,
  );
  if (hours === undefined) {
    return Object.freeze({ reason: "missing-hours", status: "blocked" });
  }

  const address = `${input.location.addressLine}, ${input.location.city}`;
  const isOverride = input.dayOverride?.status === "open";
  const sourceVersion = isOverride
    ? input.dayOverride.version
    : input.location.version;
  const sourceLabel = isOverride
    ? input.dayOverride.sourceLabel
    : "Configuración vigente de la sucursal";
  const source = Object.freeze({
    address,
    capturedAt: input.capturedAt,
    hours,
    localDate,
    locationId: input.location.id,
    locationName: input.location.name,
    locationVersion: input.location.version,
    sourceKind: isOverride
      ? ("daily-override" as const)
      : ("location-configuration" as const),
    sourceLabel,
    sourceVersion,
  });

  return Object.freeze({
    caption: `Ya abrimos en ${input.location.name}. Hoy te esperamos ${hours} en ${address}. Consultanos por WhatsApp.`,
    designContent: Object.freeze({
      badge: isOverride ? "Horario especial" : "Abierto hoy",
      callToAction: openingCallToAction,
      greeting: openingStoryGreeting(
        input.occurrence.occurrenceKey,
        input.location.city,
      ),
      icon: "reloj" as const,
      items: Object.freeze([
        `${input.location.name} · ${input.location.addressLine}`,
      ]),
      subtitle: openingMessage([input.location.name], "single-location", true),
      title: openingTitle,
      validity: hours,
    }),
    requiresHumanApproval: approvalRequired(
      input.policy,
      isOverride,
      input.designVariant ?? "cartel",
    ),
    source,
    status: "ready",
  });
}

export interface RecurringStoryLocationInput {
  readonly dayOverride?: RecurringStoryDayOverride;
  readonly location: RecurringStoryLocationSource;
}

/** Cuántos renglones muestra la historia de horario. */
const storyItemsMaximum = 3;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1) ?? ""}`;
}

/**
 * Historia de horario para todas las sucursales activas, en una sola pieza.
 *
 * Una sucursal inactiva no es parte de «todas» y se omite. Una que cierra el
 * día por excepción se nombra como cerrada: callarla haría pensar que abre. Si
 * todas cierran, o si a una abierta le falta el horario, no hay historia. Con
 * el mismo horario en todas, se dice una vez y cada renglón nombra una calle;
 * si difiere, cada renglón lleva el horario de su sucursal.
 */
export function resolveEveryLocationStoryDraft(
  input: Readonly<{
    capturedAt: string;
    designVariant?: RecurringStoryDesignVariant;
    locations: readonly RecurringStoryLocationInput[];
    occurrence: PublicationOccurrencePlan;
    policy: RecurringStoryApprovalPolicy;
  }>,
): RecurringStoryDraftResolution<RecurringStoryEveryLocationSourceSnapshot> {
  const localDate = recurringStoryLocalDate(input.occurrence);
  for (const entry of input.locations) {
    if (
      entry.dayOverride !== undefined &&
      entry.dayOverride.localDate !== localDate
    ) {
      throw new RangeError(
        `La excepción del ${entry.dayOverride.localDate} no corresponde a la fecha local ${localDate}.`,
      );
    }
  }
  const active = [...input.locations]
    .filter((entry) => entry.location.isActive)
    .toSorted((left, right) =>
      left.location.name.localeCompare(right.location.name, "es"),
    );
  if (active.length === 0) {
    return Object.freeze({ reason: "location-inactive", status: "blocked" });
  }

  const entries: RecurringStoryLocationEntry[] = [];
  const addressLines = new Map<string, string>();
  for (const { dayOverride, location } of active) {
    const isOverride = dayOverride !== undefined;
    const closed = dayOverride?.status === "closed";
    const hours = closed
      ? null
      : nonEmpty(
          dayOverride?.status === "open"
            ? dayOverride.openingHours
            : location.openingHours,
        );
    if (hours === undefined) {
      return Object.freeze({ reason: "missing-hours", status: "blocked" });
    }
    addressLines.set(location.id, location.addressLine);
    entries.push(
      Object.freeze({
        address: `${location.addressLine}, ${location.city}`,
        hours,
        locationId: location.id,
        locationName: location.name,
        locationVersion: location.version,
        sourceKind: isOverride
          ? ("daily-override" as const)
          : ("location-configuration" as const),
        sourceLabel: isOverride
          ? dayOverride.sourceLabel
          : "Configuración vigente de la sucursal",
        sourceVersion: isOverride ? dayOverride.version : location.version,
      }),
    );
  }

  const open = entries.filter(
    (entry): entry is RecurringStoryLocationEntry & { hours: string } =>
      entry.hours !== null,
  );
  if (open.length === 0) {
    return Object.freeze({ reason: "location-closed", status: "blocked" });
  }
  if (entries.length > storyItemsMaximum) {
    // Más sucursales que renglones: nombrar sólo algunas mentiría por omisión.
    // No hay un motivo propio para esto y hoy son dos sucursales; se bloquea
    // con el más cercano antes que publicar una historia incompleta.
    return Object.freeze({ reason: "missing-hours", status: "blocked" });
  }
  const closed = entries.filter((entry) => entry.hours === null);
  const anyOverride = entries.some(
    (entry) => entry.sourceKind === "daily-override",
  );
  const sharedHours = open.every((entry) => entry.hours === open[0]?.hours)
    ? open[0]?.hours
    : undefined;
  const openNames = joinNames(open.map((entry) => entry.locationName));
  const items = entries.map((entry) =>
    entry.hours === null
      ? `${entry.locationName} · Cerrada hoy`
      : sharedHours === undefined
        ? `${entry.locationName} · ${entry.hours}`
        : `${entry.locationName} · ${addressLines.get(entry.locationId) ?? entry.address}`,
  );
  const cities = new Set(active.map((entry) => entry.location.city));
  const [sharedCity] = cities.size === 1 ? [...cities] : [];

  const whereAndWhen =
    sharedHours === undefined
      ? `Hoy te esperamos ${joinNames(
          open.map(
            (entry) =>
              `en ${entry.locationName} (${entry.address}): ${entry.hours}`,
          ),
        )}.`
      : `Hoy te esperamos ${sharedHours} en ${joinNames(
          open.map((entry) => entry.address),
        )}.`;
  const closedSentence =
    closed.length === 0
      ? ""
      : ` ${joinNames(closed.map((entry) => entry.locationName))} ${
          closed.length === 1 ? "permanece cerrada" : "permanecen cerradas"
        } hoy.`;

  return Object.freeze({
    caption: `Ya abrimos en ${openNames}. ${whereAndWhen}${closedSentence} Consultanos por WhatsApp.`,
    designContent: Object.freeze({
      badge: anyOverride ? "Horario especial" : "Abierto hoy",
      callToAction: openingCallToAction,
      greeting: openingStoryGreeting(
        input.occurrence.occurrenceKey,
        sharedCity ?? null,
      ),
      icon: "reloj" as const,
      items: Object.freeze(items),
      subtitle: openingMessage(
        open.map((entry) => entry.locationName),
        "every-location",
        sharedHours !== undefined,
      ),
      title: openingTitle,
      ...(sharedHours === undefined ? {} : { validity: sharedHours }),
    }),
    requiresHumanApproval: approvalRequired(
      input.policy,
      anyOverride,
      input.designVariant ?? "cartel",
    ),
    source: Object.freeze({
      capturedAt: input.capturedAt,
      localDate,
      locations: Object.freeze(entries),
      scope: "every-location" as const,
    }),
    status: "ready",
  });
}

/** Foto del local que usa una regla sin foto propia. */
export const openingStoryDefaultPhoto = Object.freeze({
  alt: "Pared de herramientas de Ferretería Aramayo",
  assetId: "brand/interior-herramientas",
});

/**
 * Documento de diseño de una historia de apertura.
 *
 * Es el único lugar que junta el copy resuelto con el estilo de la regla: el
 * repositorio lo persiste tal cual y el worker lo valida con el motor antes de
 * renderizar. Sin foto propia se usa la del local; la imagen propia no puede
 * quedarse sin la suya.
 */
export function openingStoryDesignDocument(
  input: Readonly<{
    accent: RecurringStoryAccent;
    content: OpeningStoryContent;
    designVariant: RecurringStoryDesignVariant;
    localDate: string;
    photo: RecurringStoryPhoto | null;
    ruleId: string;
    theme: RecurringStoryTheme;
  }>,
): Readonly<{
  content: OpeningStoryContent & Readonly<{ accent: RecurringStoryAccent }>;
  format: "historia";
  layout: OpeningStoryLayout;
  media: readonly Readonly<Record<string, unknown>>[];
  schemaVersion: 1;
  slug: string;
  theme: RecurringStoryTheme;
}> {
  if (input.designVariant === "imagen" && input.photo === null) {
    throw new RangeError("La imagen propia necesita la imagen de la regla.");
  }
  const media =
    input.photo === null
      ? Object.freeze({
          alt: openingStoryDefaultPhoto.alt,
          fit: "cover",
          focus: Object.freeze({ x: 50, y: 50 }),
          reference: Object.freeze({
            assetId: openingStoryDefaultPhoto.assetId,
            source: "brand-library",
          }),
          zoom: 1,
        })
      : Object.freeze({
          alt: input.photo.alt,
          fit: "cover",
          focus: Object.freeze({ x: 50, y: input.photo.focusY }),
          reference: Object.freeze({
            dataUrl: input.photo.dataUrl,
            source: "inline",
          }),
          zoom: 1,
        });

  return Object.freeze({
    content: Object.freeze({ ...input.content, accent: input.accent }),
    format: "historia",
    layout: openingStoryLayoutFor(input.designVariant),
    media: Object.freeze([media]),
    schemaVersion: 1,
    slug: `story-${input.ruleId.slice(0, 8)}-${input.localDate.replaceAll("-", "")}`,
    theme: input.theme,
  });
}
