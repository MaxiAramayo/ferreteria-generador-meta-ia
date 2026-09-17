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

export const recurringStoryRuleStatuses = Object.freeze([
  "active",
  "paused",
  "cancelled",
] as const);

export type RecurringStoryRuleStatus =
  (typeof recurringStoryRuleStatuses)[number];

export interface RecurringStoryRuleRecord {
  readonly approvalPolicy: RecurringStoryApprovalPolicy;
  readonly createdByMembershipId: string;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null` es una regla para todas las sucursales activas. */
  readonly locationId: string | null;
  readonly name: string;
  readonly organizationId: string;
  readonly status: RecurringStoryRuleStatus;
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
      designContent: Readonly<{
        badge: string;
        callToAction: string;
        icon: "reloj";
        items: readonly string[];
        subtitle: string;
        title: string;
      }>;
      requiresHumanApproval: boolean;
      source: TSource;
      status: "ready";
    }>;

export interface CreateRecurringStoryRuleCommand {
  readonly actor: AuthenticatedActor;
  readonly approvalPolicy: RecurringStoryApprovalPolicy;
  readonly effectiveFrom: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null` es una regla para todas las sucursales activas. */
  readonly locationId: string | null;
  readonly name: string;
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

export function resolveRecurringStoryDraft(
  input: Readonly<{
    capturedAt: string;
    dayOverride?: RecurringStoryDayOverride;
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
      badge: isOverride ? "Horario especial" : "Estamos atendiendo",
      callToAction: "Consultanos por WhatsApp",
      icon: "reloj" as const,
      items: Object.freeze([hours, address]),
      subtitle: input.location.name,
      title: "Ya abrimos",
    }),
    // Una excepción siempre vuelve a revisión humana: una regla automática no
    // tiene autoridad para aprobar un horario excepcional por sí sola.
    requiresHumanApproval: input.policy === "human-each-cycle" || isOverride,
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
 * el mismo horario en todas, se dice una vez y después las direcciones; si
 * difiere, va un renglón por sucursal.
 */
export function resolveEveryLocationStoryDraft(
  input: Readonly<{
    capturedAt: string;
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
  const closed = entries.filter((entry) => entry.hours === null);
  const anyOverride = entries.some(
    (entry) => entry.sourceKind === "daily-override",
  );
  const sharedHours = open.every((entry) => entry.hours === open[0]?.hours)
    ? open[0]?.hours
    : undefined;
  const openNames = joinNames(open.map((entry) => entry.locationName));

  const items =
    sharedHours !== undefined &&
    closed.length === 0 &&
    open.length + 1 <= storyItemsMaximum
      ? [
          sharedHours,
          ...open.map((entry) => `${entry.locationName} · ${entry.address}`),
        ]
      : entries
          .map((entry) =>
            entry.hours === null
              ? `${entry.locationName} · Cerrada hoy`
              : `${entry.locationName} · ${entry.hours}`,
          )
          .slice(0, storyItemsMaximum);
  if (entries.length > storyItemsMaximum && items.length < entries.length) {
    // Más sucursales que renglones: nombrar sólo algunas mentiría por omisión.
    // No hay un motivo propio para esto y hoy son dos sucursales; se bloquea
    // con el más cercano antes que publicar una historia incompleta.
    return Object.freeze({ reason: "missing-hours", status: "blocked" });
  }

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
      badge: anyOverride ? "Horario especial" : "Estamos atendiendo",
      callToAction: "Consultanos por WhatsApp",
      icon: "reloj" as const,
      items: Object.freeze(items),
      subtitle: joinNames(entries.map((entry) => entry.locationName)),
      title: "Ya abrimos",
    }),
    requiresHumanApproval: input.policy === "human-each-cycle" || anyOverride,
    source: Object.freeze({
      capturedAt: input.capturedAt,
      localDate,
      locations: Object.freeze(entries),
      scope: "every-location" as const,
    }),
    status: "ready",
  });
}
