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
 * Qué historia recurrente arma la regla.
 *
 * La apertura habla del local que abre; el lubricentro, del servicio. Cambian
 * el texto, la paleta y los marcos disponibles, no el mecanismo (`ADR-030`).
 */
export const recurringStoryKinds = Object.freeze([
  "apertura",
  "lubricentro",
] as const);

export type RecurringStoryKind = (typeof recurringStoryKinds)[number];

/**
 * Marcos aprobados para una historia recurrente.
 *
 * Cada marco deja libre una zona distinta de la foto: quien opera elige el que
 * no tapa lo que importa de la suya y encuadra la imagen desde el panel.
 * `horario` y `locales` son marcos heredados: siguen admitidos para que una
 * regla vieja se componga, con la plantilla estable de `cartel`.
 *
 * `imagen` no es un marco: publica tal cual la imagen que subió quien opera. El
 * sistema no puede leer lo que esa imagen afirma, así que su borrador siempre
 * pide aprobación humana (`ADR-030`).
 */
export const recurringStoryDesignVariants = Object.freeze([
  "cartel",
  "horario",
  "locales",
  "placa",
  "esquina",
  "ventana",
  "imagen",
] as const);

export type RecurringStoryDesignVariant =
  (typeof recurringStoryDesignVariants)[number];

const variantsByKind: Readonly<
  Record<RecurringStoryKind, readonly RecurringStoryDesignVariant[]>
> = Object.freeze({
  apertura: Object.freeze([
    "cartel",
    "placa",
    "esquina",
    "imagen",
    "horario",
    "locales",
  ] as const),
  lubricentro: Object.freeze([
    "ventana",
    "placa",
    "esquina",
    "imagen",
  ] as const),
});

/** Marcos que ofrece cada historia, en el orden en que se muestran. */
export function recurringStoryDesignVariantsFor(
  kind: RecurringStoryKind,
): readonly RecurringStoryDesignVariant[] {
  return variantsByKind[kind];
}

/** Temas permitidos: el lubricentro tiene el suyo, grafito y amarillo. */
export const recurringStoryThemes = Object.freeze([
  "taller",
  "claro",
  "promo",
  "lubricentro",
] as const);

export type RecurringStoryTheme = (typeof recurringStoryThemes)[number];

const themesByKind: Readonly<
  Record<RecurringStoryKind, readonly RecurringStoryTheme[]>
> = Object.freeze({
  apertura: Object.freeze(["taller", "claro", "promo"] as const),
  lubricentro: Object.freeze(["lubricentro"] as const),
});

/** Temas que ofrece cada historia; el primero es el que usa por defecto. */
export function recurringStoryThemesFor(
  kind: RecurringStoryKind,
): readonly RecurringStoryTheme[] {
  return themesByKind[kind];
}

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
 * guarda su copia (`ADR-030`).
 *
 * El encuadre viaja con la foto: `focusX` y `focusY` son el punto de la imagen
 * que queda fijo, de 0 a 100, y `zoom` el acercamiento en porcentaje. Sin
 * acercamiento, una foto con la misma proporción que la historia no tiene
 * sobrante que mover, así que el panel acerca antes de dejar arrastrar.
 */
export interface RecurringStoryPhoto {
  readonly alt: string;
  readonly dataUrl: string;
  readonly focusX: number;
  readonly focusY: number;
  readonly zoom: number;
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
  /** Más de dos veces y media, una foto de teléfono ya se ve blanda. */
  zoomMaximum: 250,
  zoomMinimum: 100,
});

export type RecurringStoryStyleIssue =
  | "photo-alt-invalid"
  | "photo-focus-invalid"
  | "photo-too-large"
  | "photo-type-invalid"
  | "photo-required"
  | "photo-zoom-invalid"
  | "variant-unavailable";

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
    kind?: RecurringStoryKind;
    photo: RecurringStoryPhoto | null;
  }>,
): RecurringStoryStyleIssue | null {
  const { photo } = style;
  const kind = style.kind ?? "apertura";
  if (!variantsByKind[kind].includes(style.designVariant)) {
    return "variant-unavailable";
  }
  if (photo === null) {
    return style.designVariant === "imagen" ? "photo-required" : null;
  }
  const alt = photo.alt.trim();
  if (alt.length === 0 || alt.length > recurringStoryPhotoLimits.altMaximum) {
    return "photo-alt-invalid";
  }
  const focusOutOfRange = (value: number): boolean =>
    !Number.isInteger(value) ||
    value < recurringStoryPhotoLimits.focusMinimum ||
    value > recurringStoryPhotoLimits.focusMaximum;
  if (focusOutOfRange(photo.focusX) || focusOutOfRange(photo.focusY)) {
    return "photo-focus-invalid";
  }
  if (
    !Number.isInteger(photo.zoom) ||
    photo.zoom < recurringStoryPhotoLimits.zoomMinimum ||
    photo.zoom > recurringStoryPhotoLimits.zoomMaximum
  ) {
    return "photo-zoom-invalid";
  }
  if (!photoDataUrlPattern.test(photo.dataUrl)) {
    return "photo-type-invalid";
  }
  if (photo.dataUrl.length > recurringStoryPhotoLimits.dataUrlMaximum) {
    return "photo-too-large";
  }
  return null;
}

const recurringStoryKindSet: ReadonlySet<string> = new Set(recurringStoryKinds);
const recurringStoryDesignVariantSet: ReadonlySet<string> = new Set(
  recurringStoryDesignVariants,
);
const recurringStoryAccentSet: ReadonlySet<string> = new Set(
  recurringStoryAccents,
);
const recurringStoryThemeSet: ReadonlySet<string> = new Set(
  recurringStoryThemes,
);

export function isRecurringStoryKind(
  value: unknown,
): value is RecurringStoryKind {
  return typeof value === "string" && recurringStoryKindSet.has(value);
}

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

export type RecurringStoryLayout =
  | "historia-apertura-cartel"
  | "historia-apertura-esquina"
  | "historia-apertura-horario"
  | "historia-apertura-imagen"
  | "historia-apertura-locales"
  | "historia-apertura-placa"
  | "historia-lubricentro-esquina"
  | "historia-lubricentro-imagen"
  | "historia-lubricentro-placa"
  | "historia-lubricentro-ventana";

/**
 * Layout del motor para cada marco.
 *
 * El mapa está completo a propósito: un marco que una historia no ofrece —el
 * cartel de la apertura en el lubricentro, por ejemplo— cae en el marco con la
 * foto al medio de esa historia, en vez de componer un identificador que el
 * motor no conoce. La validación de estilo ya rechaza esa combinación antes de
 * guardarla; esto sólo evita que un dato viejo rompa el render.
 */
const layoutsByVariant: Readonly<
  Record<
    RecurringStoryKind,
    Readonly<Record<RecurringStoryDesignVariant, RecurringStoryLayout>>
  >
> = Object.freeze({
  apertura: Object.freeze({
    cartel: "historia-apertura-cartel",
    esquina: "historia-apertura-esquina",
    horario: "historia-apertura-horario",
    imagen: "historia-apertura-imagen",
    locales: "historia-apertura-locales",
    placa: "historia-apertura-placa",
    ventana: "historia-apertura-cartel",
  } as const),
  lubricentro: Object.freeze({
    cartel: "historia-lubricentro-ventana",
    esquina: "historia-lubricentro-esquina",
    horario: "historia-lubricentro-ventana",
    imagen: "historia-lubricentro-imagen",
    locales: "historia-lubricentro-ventana",
    placa: "historia-lubricentro-placa",
    ventana: "historia-lubricentro-ventana",
  } as const),
});

export function recurringStoryLayoutFor(
  kind: RecurringStoryKind,
  variant: RecurringStoryDesignVariant,
): RecurringStoryLayout {
  return layoutsByVariant[kind][variant];
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
  readonly kind: RecurringStoryKind;
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
      designContent: RecurringStoryContent;
      requiresHumanApproval: boolean;
      source: TSource;
      status: "ready";
    }>;

/**
 * Ícono de un rubro o servicio. Son los nombres que el motor sabe dibujar; el
 * dominio elige cuál corresponde a cada rubro del negocio.
 */
export type RecurringStoryFeatureIcon =
  | "aceite"
  | "automotor"
  | "bateria"
  | "buloneria"
  | "electricidad"
  | "herramientas"
  | "lubricentro"
  | "pintura"
  | "sanitarios";

export interface RecurringStoryFeature {
  readonly icon: RecurringStoryFeatureIcon;
  readonly label: string;
}

/**
 * Texto que la historia afirma, derivado de la fuente factual.
 *
 * Los renglones nombran cada sucursal con su calle; el horario va aparte en
 * `validity` cuando es el mismo para todas, y dentro de cada renglón cuando no.
 * Los rubros y los diferenciales no salen de la base: son la jerarquía que
 * definió el dueño para estas historias y quedan registrados en `ADR-030`.
 */
export interface RecurringStoryContent {
  readonly callToAction: string;
  readonly features: readonly RecurringStoryFeature[];
  readonly greeting?: string;
  readonly highlights: readonly string[];
  /** Sin renglones no va el campo: el motor rechaza una lista vacía. */
  readonly items?: readonly string[];
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
  readonly kind?: RecurringStoryKind;
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

/**
 * Pausar, reanudar o borrar una regla.
 *
 * Pausar deja de materializar y se puede volver atrás; borrar saca la regla y
 * sus materializaciones, que son el vínculo entre la regla y cada borrador que
 * produjo. Las publicaciones no se tocan: lo que ya salió sigue existiendo, y
 * su snapshot conserva la fuente que citó.
 */
export interface RecurringStoryRuleLifecycleCommand {
  readonly actor: AuthenticatedActor;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly ruleId: string;
}

export type RecurringStoryRuleLifecycleResult =
  | Readonly<{ rule: RecurringStoryRuleRecord; status: "updated" }>
  | Readonly<{ ruleId: string; status: "deleted" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "version-conflict" }>;

export interface RecurringStoryRuleRepository {
  create(
    command: CreateRecurringStoryRuleCommand &
      Readonly<{ idempotencyKey: string; occurredAt: string }>,
  ): Promise<CreateRecurringStoryRuleResult>;
  delete(
    command: RecurringStoryRuleLifecycleCommand,
  ): Promise<RecurringStoryRuleLifecycleResult>;
  list(organizationId: string): Promise<readonly RecurringStoryRuleRecord[]>;
  /** `paused` frena la materialización; `active` la retoma. */
  setStatus(
    command: RecurringStoryRuleLifecycleCommand &
      Readonly<{ status: "active" | "paused" }>,
  ): Promise<RecurringStoryRuleLifecycleResult>;
  updateVisualStyle(
    command: Readonly<{
      accent: RecurringStoryAccent;
      actor: AuthenticatedActor;
      designVariant: RecurringStoryDesignVariant;
      expectedVersion: number;
      /** La historia no cambia con el estilo; viaja para validar el marco. */
      kind: RecurringStoryKind;
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
const openingCallToAction = "¿Buscás algo? Escribinos";
const greetingMaximum = 26;

/**
 * Rubros y diferenciales de la apertura.
 *
 * Son la jerarquía que pidió el dueño el 2026-09-19: primero el mensaje, después
 * los rubros que le hacen acordar a alguien lo que necesita, y en chico los
 * argumentos secundarios. Los seis rubros salen de los que comercializa el
 * negocio (`KN-004`); los tres diferenciales, de lo que el dueño afirma de su
 * atención. Nada de esto se deduce de la base, así que vive acá y no se inventa
 * por pieza.
 */
const openingFeatures: readonly RecurringStoryFeature[] = Object.freeze([
  Object.freeze({ icon: "herramientas" as const, label: "Herramientas" }),
  Object.freeze({ icon: "electricidad" as const, label: "Electricidad" }),
  Object.freeze({ icon: "sanitarios" as const, label: "Sanitarios" }),
  Object.freeze({ icon: "pintura" as const, label: "Pinturas" }),
  Object.freeze({
    icon: "buloneria" as const,
    label: "Bulonería y fijaciones",
  }),
  Object.freeze({ icon: "automotor" as const, label: "Lubricentro" }),
]);

const openingHighlights: readonly string[] = Object.freeze([
  "Asesoramiento personalizado",
  "Variedad de marcas",
  "Distintos medios de pago",
]);

/**
 * Voz del lubricentro.
 *
 * Todo lo que afirma sale de los servicios aprobados (`KN-004`): cambio de
 * aceite con fosa, venta de lubricantes, filtros y baterías, y los vehículos que
 * se atienden. El turno se pide por WhatsApp o en el local, así que el botón
 * nombra una acción real (`KN-002`).
 */
const lubricentroTitle = "¿Toca el service?";
const lubricentroCallToAction = "Pedí tu turno";
const lubricentroFeatures: readonly RecurringStoryFeature[] = Object.freeze([
  Object.freeze({ icon: "aceite" as const, label: "Lubricantes" }),
  Object.freeze({ icon: "lubricentro" as const, label: "Filtros" }),
  Object.freeze({ icon: "bateria" as const, label: "Baterías" }),
]);
const lubricentroVehicles: readonly string[] = Object.freeze([
  "Autos",
  "Motos",
  "Utilitarios",
  "Autoelevadoras",
]);

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
 * Bajada de la apertura: dónde se atiende hoy, en un renglón.
 *
 * Es la línea chica que acompaña a «¡Ya abrimos!». Lo que se vende ya lo dicen
 * los rubros, así que acá sólo va el dónde. Con alguna sucursal cerrada por
 * excepción, se nombran las que abren en vez de contarlas: decir «nuestros dos
 * locales» ese día sería falso.
 */
function openingSubtitle(
  openNames: readonly string[],
  everyLocationOpen: boolean,
): string {
  if (!everyLocationOpen) {
    return `Hoy te esperamos en ${joinNames(openNames)}`;
  }
  const [onlyName] = openNames;
  if (openNames.length === 1 && onlyName !== undefined) {
    return `Te esperamos en ${onlyName}`;
  }
  const count = numberWords.get(openNames.length) ?? String(openNames.length);
  return `Te esperamos en nuestros ${count} locales`;
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
    kind?: RecurringStoryKind;
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

  const kind = input.kind ?? "apertura";
  const designContent: RecurringStoryContent =
    kind === "lubricentro"
      ? Object.freeze({
          callToAction: lubricentroCallToAction,
          features: lubricentroFeatures,
          highlights: lubricentroVehicles,
          // La dirección ya va en la bajada: un renglón más la repetiría.
          subtitle: `Cambio de aceite con fosa en ${input.location.addressLine}`,
          title: lubricentroTitle,
          validity: hours,
        })
      : Object.freeze({
          callToAction: openingCallToAction,
          features: openingFeatures,
          greeting: openingStoryGreeting(
            input.occurrence.occurrenceKey,
            input.location.city,
          ),
          highlights: openingHighlights,
          items: Object.freeze([
            `${input.location.name} · ${input.location.addressLine}`,
          ]),
          subtitle: openingSubtitle([input.location.name], true),
          title: openingTitle,
          validity: hours,
        });

  return Object.freeze({
    caption:
      kind === "lubricentro"
        ? `${lubricentroTitle} Cambio de aceite con fosa en ${address}. Hoy atendemos ${hours}. Pedí tu turno por WhatsApp.`
        : `Ya abrimos en ${input.location.name}. Hoy te esperamos ${hours} en ${address}. Consultanos por WhatsApp.`,
    designContent,
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
      callToAction: openingCallToAction,
      features: openingFeatures,
      greeting: openingStoryGreeting(
        input.occurrence.occurrenceKey,
        sharedCity ?? null,
      ),
      highlights: openingHighlights,
      items: Object.freeze(items),
      subtitle: openingSubtitle(
        open.map((entry) => entry.locationName),
        closed.length === 0,
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

/**
 * Foto que usa una regla sin foto propia: la del local para la apertura y la
 * del mostrador de lubricantes para el lubricentro. Las dos están en la
 * biblioteca aprobada, así que el render no depende de que alguien suba algo.
 */
export const recurringStoryDefaultPhotos: Readonly<
  Record<RecurringStoryKind, Readonly<{ alt: string; assetId: string }>>
> = Object.freeze({
  apertura: Object.freeze({
    alt: "Pared de herramientas de Ferretería Aramayo",
    assetId: "brand/interior-herramientas",
  }),
  lubricentro: Object.freeze({
    alt: "Lubricantes y filtros del lubricentro Aramayo",
    assetId: "brand/lubricentro-filtros",
  }),
});

/**
 * Documento de diseño de una historia recurrente.
 *
 * Es el único lugar que junta el copy resuelto con el estilo de la regla: el
 * repositorio lo persiste tal cual y el worker lo valida con el motor antes de
 * renderizar. Sin foto propia se usa la de la biblioteca; la imagen propia no
 * puede quedarse sin la suya. El encuadre viaja con la foto, así que el
 * borrador se recompone igual que se vio en el panel.
 */
export function recurringStoryDesignDocument(
  input: Readonly<{
    accent: RecurringStoryAccent;
    content: RecurringStoryContent;
    designVariant: RecurringStoryDesignVariant;
    kind: RecurringStoryKind;
    localDate: string;
    photo: RecurringStoryPhoto | null;
    ruleId: string;
    theme: RecurringStoryTheme;
  }>,
): Readonly<{
  content: RecurringStoryContent & Readonly<{ accent: RecurringStoryAccent }>;
  format: "historia";
  layout: RecurringStoryLayout;
  media: readonly Readonly<Record<string, unknown>>[];
  schemaVersion: 1;
  slug: string;
  theme: RecurringStoryTheme;
}> {
  if (input.designVariant === "imagen" && input.photo === null) {
    throw new RangeError("La imagen propia necesita la imagen de la regla.");
  }
  const fallback = recurringStoryDefaultPhotos[input.kind];
  const media =
    input.photo === null
      ? Object.freeze({
          alt: fallback.alt,
          fit: "cover",
          focus: Object.freeze({ x: 50, y: 50 }),
          reference: Object.freeze({
            assetId: fallback.assetId,
            source: "brand-library",
          }),
          zoom: 1,
        })
      : Object.freeze({
          alt: input.photo.alt,
          fit: "cover",
          focus: Object.freeze({
            x: input.photo.focusX,
            y: input.photo.focusY,
          }),
          reference: Object.freeze({
            dataUrl: input.photo.dataUrl,
            source: "inline",
          }),
          zoom: input.photo.zoom / 100,
        });

  return Object.freeze({
    content: Object.freeze({ ...input.content, accent: input.accent }),
    format: "historia",
    layout: recurringStoryLayoutFor(input.kind, input.designVariant),
    media: Object.freeze([media]),
    schemaVersion: 1,
    slug: `story-${input.ruleId.slice(0, 8)}-${input.localDate.replaceAll("-", "")}`,
    theme: input.theme,
  });
}
