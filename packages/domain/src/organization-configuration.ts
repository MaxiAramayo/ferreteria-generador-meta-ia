import type { AuthenticatedActor } from "./identity.ts";

export const brandThemeIds = [
  "taller",
  "claro",
  "promo",
  "lubricentro",
] as const;

export type BrandThemeId = (typeof brandThemeIds)[number];

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

export type ConfigurationMutationResult =
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      configuration: OrganizationConfiguration;
      status: "updated";
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

function normalizeOpeningHours(openingHours: string): string {
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
    openingHours: normalizeOpeningHours(command.openingHours),
    ...(phone === undefined ? {} : { phone }),
    province: normalizeText("province", command.province, 2, 120),
    timeZone: normalizeTimeZone(command.timeZone),
    version: normalizeVersion("version", command.version),
    ...(whatsapp === undefined ? {} : { whatsapp }),
  });
}
