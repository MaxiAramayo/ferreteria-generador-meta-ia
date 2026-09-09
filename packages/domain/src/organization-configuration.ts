import type { AuthenticatedActor } from "./identity.ts";

export const brandThemeIds = [
  "taller",
  "claro",
  "promo",
  "lubricentro",
] as const;

export type BrandThemeId = (typeof brandThemeIds)[number];

export const locationDayOverrideStatuses = ["open", "closed"] as const;

export type LocationDayOverrideStatus =
  (typeof locationDayOverrideStatuses)[number];

export interface BrandConfiguration {
  readonly claim: string;
  readonly handle: string;
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly themeId: BrandThemeId;
  readonly version: number;
}

export interface OrganizationConfiguration {
  readonly brand: BrandConfiguration;
  readonly displayName: string;
  readonly id: string;
  readonly legalName: string;
  readonly locations: readonly LocationConfiguration[];
  readonly version: number;
}

export interface LocationConfiguration {
  readonly addressLine: string;
  readonly city: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly name: string;
  readonly openingHours: string;
  readonly phone?: string;
  readonly province: string;
  readonly timeZone: string;
  readonly version: number;
  readonly whatsapp?: string;
}

/**
 * Un horario excepcional pertenece a una fecha civil de la sucursal, no a un
 * instante UTC. La zona IANA se obtiene siempre de la sucursal que lo posee.
 */
export type LocationDayOverride =
  | Readonly<{
      id: string;
      localDate: string;
      locationId: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
      version: number;
    }>
  | Readonly<{
      id: string;
      localDate: string;
      locationId: string;
      sourceLabel: string;
      status: "closed";
      version: number;
    }>;

export interface LocationDayOverrideImpact {
  readonly affectedStoryCount: number;
  readonly localDate: string;
  readonly timeZone: string;
  readonly willBlockHoursSensitiveStories: boolean;
  readonly willRequireHumanApproval: boolean;
}

export interface LocationDayOverrideListQuery {
  readonly endDate: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly startDate: string;
}

export interface UpdateBrandConfigurationCommand {
  readonly actor: AuthenticatedActor;
  readonly brandVersion: number;
  readonly claim: string;
  readonly displayName: string;
  readonly handle: string;
  readonly legalName: string;
  readonly name: string;
  readonly organizationVersion: number;
  readonly shortName: string;
  readonly themeId: string;
}

export interface UpdateLocationConfigurationCommand {
  readonly actor: AuthenticatedActor;
  readonly addressLine: string;
  readonly city: string;
  readonly isActive: boolean;
  readonly locationId: string;
  readonly name: string;
  readonly openingHours: string;
  readonly phone?: string;
  readonly province: string;
  readonly timeZone: string;
  readonly version: number;
  readonly whatsapp?: string;
}

export type UpsertLocationDayOverrideCommand =
  | Readonly<{
      actor: AuthenticatedActor;
      expectedVersion?: number;
      localDate: string;
      locationId: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
    }>
  | Readonly<{
      actor: AuthenticatedActor;
      expectedVersion?: number;
      localDate: string;
      locationId: string;
      sourceLabel: string;
      status: "closed";
    }>;

export interface DeleteLocationDayOverrideCommand {
  readonly actor: AuthenticatedActor;
  readonly expectedVersion: number;
  readonly localDate: string;
  readonly locationId: string;
}

export type PreviewLocationDayOverrideCommand =
  | Readonly<{
      actor: AuthenticatedActor;
      localDate: string;
      locationId: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
    }>
  | Readonly<{
      actor: AuthenticatedActor;
      localDate: string;
      locationId: string;
      sourceLabel: string;
      status: "closed";
    }>;

export interface NormalizedBrandConfigurationUpdate {
  readonly brandVersion: number;
  readonly claim: string;
  readonly displayName: string;
  readonly handle: string;
  readonly legalName: string;
  readonly name: string;
  readonly organizationVersion: number;
  readonly shortName: string;
  readonly themeId: BrandThemeId;
}

export interface NormalizedLocationConfigurationUpdate {
  readonly addressLine: string;
  readonly city: string;
  readonly isActive: boolean;
  readonly name: string;
  readonly openingHours: string;
  readonly phone?: string;
  readonly province: string;
  readonly timeZone: string;
  readonly version: number;
  readonly whatsapp?: string;
}

export type NormalizedLocationDayOverrideUpdate =
  | Readonly<{
      localDate: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
    }>
  | Readonly<{
      localDate: string;
      sourceLabel: string;
      status: "closed";
    }>;

export interface PersistBrandConfigurationInput {
  readonly actorMembershipId: string;
  readonly changedAt: string;
  readonly organizationId: string;
  readonly update: NormalizedBrandConfigurationUpdate;
}

export interface PersistLocationConfigurationInput {
  readonly actorMembershipId: string;
  readonly changedAt: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly update: NormalizedLocationConfigurationUpdate;
}

export interface PersistLocationDayOverrideInput {
  readonly actorMembershipId: string;
  readonly changedAt: string;
  readonly expectedVersion?: number;
  readonly locationId: string;
  readonly organizationId: string;
  readonly update: NormalizedLocationDayOverrideUpdate;
}

export interface PersistLocationDayOverrideDeletionInput {
  readonly actorMembershipId: string;
  readonly changedAt: string;
  readonly expectedVersion: number;
  readonly localDate: string;
  readonly locationId: string;
  readonly organizationId: string;
}

export interface LocationDayOverridePreviewInput {
  readonly changedAt: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly update: NormalizedLocationDayOverrideUpdate;
}

export type ConfigurationMutationResult =
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      configuration: OrganizationConfiguration;
      status: "updated";
    }>;

export type LocationDayOverrideMutationResult =
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      impact: LocationDayOverrideImpact;
      override: LocationDayOverride;
      status: "updated";
    }>;

export type DeleteLocationDayOverrideResult =
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      impact: LocationDayOverrideImpact;
      status: "deleted";
    }>;

export type LocationDayOverridePreviewResult =
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      impact: LocationDayOverrideImpact;
      status: "ready";
    }>;

export interface OrganizationConfigurationRepository {
  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationConfiguration | null>;
  updateBrand(
    input: PersistBrandConfigurationInput,
  ): Promise<ConfigurationMutationResult>;
  updateLocation(
    input: PersistLocationConfigurationInput,
  ): Promise<ConfigurationMutationResult>;
}

export interface LocationDayOverrideRepository {
  deleteLocationDayOverride(
    input: PersistLocationDayOverrideDeletionInput,
  ): Promise<DeleteLocationDayOverrideResult>;
  listLocationDayOverrides(
    query: LocationDayOverrideListQuery,
  ): Promise<readonly LocationDayOverride[] | null>;
  previewLocationDayOverride(
    input: LocationDayOverridePreviewInput,
  ): Promise<LocationDayOverridePreviewResult>;
  upsertLocationDayOverride(
    input: PersistLocationDayOverrideInput,
  ): Promise<LocationDayOverrideMutationResult>;
}

export class ConfigurationValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "ConfigurationValidationError";
    this.field = field;
  }
}

const brandThemeIdSet: ReadonlySet<string> = new Set(brandThemeIds);

function isBrandThemeId(themeId: string): themeId is BrandThemeId {
  return brandThemeIdSet.has(themeId);
}

function normalizeVersion(field: string, version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new ConfigurationValidationError(
      field,
      `${field} debe ser un entero positivo.`,
    );
  }
  return version;
}

function normalizeText(
  field: string,
  text: string,
  minimum: number,
  maximum: number,
): string {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ConfigurationValidationError(
      field,
      `${field} debe tener entre ${String(minimum)} y ${String(maximum)} caracteres.`,
    );
  }
  return normalized;
}

function normalizePhone(
  field: string,
  phone: string | undefined,
): string | undefined {
  if (phone === undefined || phone.trim().length === 0) {
    return undefined;
  }

  let digits = phone.replace(/\D/gu, "");
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `54${digits}`;
  }
  if (!/^54\d{10}$/u.test(digits)) {
    throw new ConfigurationValidationError(
      field,
      `${field} debe ser un número argentino de diez dígitos.`,
    );
  }
  return `+${digits}`;
}

export function normalizeBusinessHours(openingHours: string): string {
  const normalized = normalizeText("openingHours", openingHours, 5, 180)
    .replace(/\s*·\s*/gu, " · ")
    .replace(/\s*\/\s*/gu, " / ");
  const matches = [...normalized.matchAll(/(\d{2}):(\d{2})/gu)];
  if (matches.length === 0 || matches.length % 2 !== 0) {
    throw new ConfigurationValidationError(
      "openingHours",
      "openingHours debe contener pares de apertura y cierre en formato HH:mm.",
    );
  }

  const minutes = matches.map((match) => {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
      throw new ConfigurationValidationError(
        "openingHours",
        "openingHours contiene una hora inválida.",
      );
    }
    return hour * 60 + minute;
  });

  for (let index = 0; index < minutes.length; index += 2) {
    const opensAt = minutes[index];
    const closesAt = minutes[index + 1];
    if (
      opensAt === undefined ||
      closesAt === undefined ||
      opensAt >= closesAt
    ) {
      throw new ConfigurationValidationError(
        "openingHours",
        "Cada horario de apertura debe ser anterior a su cierre.",
      );
    }
  }
  return normalized;
}

function normalizeCivilDate(field: string, localDate: string): string {
  const normalized = normalizeText(field, localDate, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    throw new ConfigurationValidationError(
      field,
      `${field} debe usar el formato AAAA-MM-DD.`,
    );
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new ConfigurationValidationError(
      field,
      `${field} debe ser una fecha civil válida.`,
    );
  }
  return normalized;
}

function normalizeOptionalVersion(
  field: string,
  version: number | undefined,
): number | undefined {
  return version === undefined ? undefined : normalizeVersion(field, version);
}

function normalizeTimeZone(timeZone: string): string {
  const normalized = normalizeText("timeZone", timeZone, 3, 80);
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: normalized });
  } catch {
    throw new ConfigurationValidationError(
      "timeZone",
      "timeZone debe ser una zona IANA válida.",
    );
  }
  return normalized;
}

export function normalizeBrandConfigurationUpdate(
  command: UpdateBrandConfigurationCommand,
): NormalizedBrandConfigurationUpdate {
  if (!isBrandThemeId(command.themeId)) {
    throw new ConfigurationValidationError(
      "themeId",
      "themeId no pertenece al catálogo aprobado.",
    );
  }
  const handle = normalizeText("handle", command.handle, 2, 80);
  if (!/^@[A-Za-z0-9._]+$/u.test(handle)) {
    throw new ConfigurationValidationError(
      "handle",
      "handle debe comenzar con @ y contener sólo letras, números, punto o guion bajo.",
    );
  }

  return Object.freeze({
    brandVersion: normalizeVersion("brandVersion", command.brandVersion),
    claim: normalizeText("claim", command.claim, 3, 180),
    displayName: normalizeText("displayName", command.displayName, 3, 120),
    handle,
    legalName: normalizeText("legalName", command.legalName, 3, 160),
    name: normalizeText("name", command.name, 2, 120),
    organizationVersion: normalizeVersion(
      "organizationVersion",
      command.organizationVersion,
    ),
    shortName: normalizeText("shortName", command.shortName, 2, 80),
    themeId: command.themeId,
  });
}

export function normalizeLocationConfigurationUpdate(
  command: UpdateLocationConfigurationCommand,
): NormalizedLocationConfigurationUpdate {
  const phone = normalizePhone("phone", command.phone);
  const whatsapp = normalizePhone("whatsapp", command.whatsapp);

  return Object.freeze({
    addressLine: normalizeText("addressLine", command.addressLine, 5, 200),
    city: normalizeText("city", command.city, 2, 120),
    isActive: command.isActive,
    name: normalizeText("name", command.name, 2, 120),
    openingHours: normalizeBusinessHours(command.openingHours),
    ...(phone === undefined ? {} : { phone }),
    province: normalizeText("province", command.province, 2, 120),
    timeZone: normalizeTimeZone(command.timeZone),
    version: normalizeVersion("version", command.version),
    ...(whatsapp === undefined ? {} : { whatsapp }),
  });
}

export function normalizeLocationDayOverrideUpdate(
  command: PreviewLocationDayOverrideCommand | UpsertLocationDayOverrideCommand,
): NormalizedLocationDayOverrideUpdate {
  const localDate = normalizeCivilDate("localDate", command.localDate);
  const sourceLabel = normalizeText("sourceLabel", command.sourceLabel, 3, 180);
  if (command.status === "closed") {
    return Object.freeze({ localDate, sourceLabel, status: "closed" });
  }
  return Object.freeze({
    localDate,
    openingHours: normalizeBusinessHours(command.openingHours),
    sourceLabel,
    status: "open",
  });
}

export function normalizeLocationDayOverrideExpectedVersion(
  command: UpsertLocationDayOverrideCommand,
): number | undefined {
  return normalizeOptionalVersion("expectedVersion", command.expectedVersion);
}

export function normalizeLocationDayOverrideDeletion(
  command: DeleteLocationDayOverrideCommand,
): Readonly<{ expectedVersion: number; localDate: string }> {
  return Object.freeze({
    expectedVersion: normalizeVersion(
      "expectedVersion",
      command.expectedVersion,
    ),
    localDate: normalizeCivilDate("localDate", command.localDate),
  });
}

export function normalizeLocationDayOverrideRange(
  startDate: string,
  endDate: string,
): Readonly<{ endDate: string; startDate: string }> {
  const normalizedStartDate = normalizeCivilDate("startDate", startDate);
  const normalizedEndDate = normalizeCivilDate("endDate", endDate);
  const start = Date.parse(`${normalizedStartDate}T00:00:00.000Z`);
  const end = Date.parse(`${normalizedEndDate}T00:00:00.000Z`);
  const maximumRangeDays = 93;
  if (end < start || end - start > maximumRangeDays * 86_400_000) {
    throw new ConfigurationValidationError(
      "endDate",
      "El rango de excepciones debe ser de hasta 93 días y terminar en la fecha inicial o después.",
    );
  }
  return Object.freeze({
    endDate: normalizedEndDate,
    startDate: normalizedStartDate,
  });
}
