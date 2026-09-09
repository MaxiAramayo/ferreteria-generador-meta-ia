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
  readonly locationId: string;
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

export interface RecurringStorySourceSnapshot {
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

export type RecurringStoryDraftResolution =
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
      source: RecurringStorySourceSnapshot;
      status: "ready";
    }>;

export interface CreateRecurringStoryRuleCommand {
  readonly actor: AuthenticatedActor;
  readonly approvalPolicy: RecurringStoryApprovalPolicy;
  readonly effectiveFrom: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  readonly locationId: string;
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
): RecurringStoryDraftResolution {
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
