import type {
  BrandThemeId,
  ConfigurationMutationResult,
  LocationConfiguration,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  PersistBrandConfigurationInput,
  PersistLocationConfigurationInput,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";

const configurationSelection = {
  brands: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      profile: true,
      version: true,
    },
    take: 1,
  },
  displayName: true,
  id: true,
  legalName: true,
  locations: {
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      addressLine: true,
      city: true,
      id: true,
      isActive: true,
      name: true,
      openingHours: true,
      phone: true,
      province: true,
      timeZone: true,
      version: true,
      whatsapp: true,
    },
  },
  version: true,
} satisfies Prisma.OrganizationSelect;

type ConfigurationRow = Prisma.OrganizationGetPayload<{
  select: typeof configurationSelection;
}>;

class ConfigurationVersionConflict extends Error {}

function jsonObject(jsonValue: Prisma.JsonValue): Prisma.JsonObject {
  return typeof jsonValue === "object" &&
    jsonValue !== null &&
    !Array.isArray(jsonValue)
    ? jsonValue
    : {};
}

function jsonString(
  jsonValue: Prisma.JsonValue,
  field: string,
): string | undefined {
  if (
    typeof jsonValue !== "object" ||
    jsonValue === null ||
    Array.isArray(jsonValue)
  ) {
    return undefined;
  }
  const entry = Object.entries(jsonValue).find(([key]) => key === field);
  return typeof entry?.[1] === "string" ? entry[1] : undefined;
}

function themeIdFromProfile(profile: Prisma.JsonValue): BrandThemeId {
  const themeId = jsonString(profile, "themeId");
  switch (themeId) {
    case "claro":
    case "lubricentro":
    case "promo":
    case "taller":
      return themeId;
    case undefined:
    default:
      return "taller";
  }
}

function mapLocation(
  location: ConfigurationRow["locations"][number],
): LocationConfiguration {
  const phone = location.phone ?? undefined;
  const whatsapp = location.whatsapp ?? undefined;
  return Object.freeze({
    addressLine: location.addressLine,
    city: location.city,
    id: location.id,
    isActive: location.isActive,
    name: location.name,
    openingHours: jsonString(location.openingHours, "display") ?? "",
    ...(phone === undefined ? {} : { phone }),
    province: location.province,
    timeZone: location.timeZone,
    version: location.version,
    ...(whatsapp === undefined ? {} : { whatsapp }),
  });
}

function mapConfiguration(
  row: ConfigurationRow,
): OrganizationConfiguration | null {
  const brand = row.brands[0];
  if (brand === undefined) {
    return null;
  }

  return Object.freeze({
    brand: Object.freeze({
      claim: jsonString(brand.profile, "claim") ?? "",
      handle: jsonString(brand.profile, "handle") ?? "",
      id: brand.id,
      name: brand.name,
      shortName: jsonString(brand.profile, "shortName") ?? brand.name,
      themeId: themeIdFromProfile(brand.profile),
      version: brand.version,
    }),
    displayName: row.displayName,
    id: row.id,
    legalName: row.legalName,
    locations: Object.freeze(row.locations.map(mapLocation)),
    version: row.version,
  });
}

async function findConfiguration(
  database: DatabaseClient | Prisma.TransactionClient,
  organizationId: string,
): Promise<OrganizationConfiguration | null> {
  const row = await database.organization.findUnique({
    select: configurationSelection,
    where: { id: organizationId },
  });
  return row === null ? null : mapConfiguration(row);
}

export class PrismaOrganizationConfigurationRepository implements OrganizationConfigurationRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationConfiguration | null> {
    return findConfiguration(this.#database, organizationId);
  }

  async updateBrand(
    input: PersistBrandConfigurationInput,
  ): Promise<ConfigurationMutationResult> {
    try {
      return await this.#database.$transaction(async (transaction) => {
        const current = await findConfiguration(
          transaction,
          input.organizationId,
        );
        if (current === null) {
          return Object.freeze({ status: "not-found" });
        }
        const currentBrand = await transaction.brand.findFirst({
          select: { profile: true },
          where: {
            id: current.brand.id,
            organizationId: input.organizationId,
          },
        });
        if (currentBrand === null) {
          return Object.freeze({ status: "not-found" });
        }

        const organizationUpdate = await transaction.organization.updateMany({
          data: {
            displayName: input.update.displayName,
            legalName: input.update.legalName,
            version: { increment: 1 },
          },
          where: {
            id: input.organizationId,
            version: input.update.organizationVersion,
          },
        });
        const brandUpdate = await transaction.brand.updateMany({
          data: {
            name: input.update.name,
            profile: {
              ...jsonObject(currentBrand.profile),
              claim: input.update.claim,
              handle: input.update.handle,
              shortName: input.update.shortName,
              themeId: input.update.themeId,
            },
            version: { increment: 1 },
          },
          where: {
            id: current.brand.id,
            organizationId: input.organizationId,
            version: input.update.brandVersion,
          },
        });
        if (organizationUpdate.count !== 1 || brandUpdate.count !== 1) {
          throw new ConfigurationVersionConflict();
        }

        const occurredAt = new Date(input.changedAt);
        await transaction.organizationConfigurationEvent.createMany({
          data: [
            {
              actorMembershipId: input.actorMembershipId,
              after: {
                displayName: input.update.displayName,
                id: current.id,
                legalName: input.update.legalName,
                version: input.update.organizationVersion + 1,
              },
              before: {
                displayName: current.displayName,
                legalName: current.legalName,
                version: current.version,
              },
              occurredAt,
              organizationId: input.organizationId,
              targetId: current.id,
              targetType: "organization",
            },
            {
              actorMembershipId: input.actorMembershipId,
              after: {
                claim: input.update.claim,
                handle: input.update.handle,
                id: current.brand.id,
                name: input.update.name,
                shortName: input.update.shortName,
                themeId: input.update.themeId,
                version: input.update.brandVersion + 1,
              },
              before: { ...current.brand },
              occurredAt,
              organizationId: input.organizationId,
              targetId: current.brand.id,
              targetType: "brand",
            },
          ],
        });

        const updated = await findConfiguration(
          transaction,
          input.organizationId,
        );
        if (updated === null) {
          throw new Error("Updated organization configuration disappeared.");
        }
        return Object.freeze({ configuration: updated, status: "updated" });
      });
    } catch (cause: unknown) {
      if (cause instanceof ConfigurationVersionConflict) {
        return Object.freeze({ status: "conflict" });
      }
      throw cause;
    }
  }

  async updateLocation(
    input: PersistLocationConfigurationInput,
  ): Promise<ConfigurationMutationResult> {
    return this.#database.$transaction(async (transaction) => {
      const currentLocation = await transaction.location.findFirst({
        select: {
          addressLine: true,
          city: true,
          id: true,
          isActive: true,
          name: true,
          openingHours: true,
          phone: true,
          province: true,
          timeZone: true,
          version: true,
          whatsapp: true,
        },
        where: {
          id: input.locationId,
          organizationId: input.organizationId,
        },
      });
      if (currentLocation === null) {
        return Object.freeze({ status: "not-found" });
      }

      const updated = await transaction.location.updateMany({
        data: {
          addressLine: input.update.addressLine,
          city: input.update.city,
          isActive: input.update.isActive,
          name: input.update.name,
          openingHours: { display: input.update.openingHours },
          phone: input.update.phone ?? null,
          province: input.update.province,
          timeZone: input.update.timeZone,
          version: { increment: 1 },
          whatsapp: input.update.whatsapp ?? null,
        },
        where: {
          id: input.locationId,
          organizationId: input.organizationId,
          version: input.update.version,
        },
      });
      if (updated.count !== 1) {
        return Object.freeze({ status: "conflict" });
      }

      await transaction.organizationConfigurationEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          after: {
            ...input.update,
            id: input.locationId,
            version: input.update.version + 1,
          },
          before: {
            ...mapLocation(currentLocation),
          },
          occurredAt: new Date(input.changedAt),
          organizationId: input.organizationId,
          targetId: input.locationId,
          targetType: "location",
        },
      });

      const configuration = await findConfiguration(
        transaction,
        input.organizationId,
      );
      if (configuration === null) {
        throw new Error("Updated organization configuration disappeared.");
      }
      return Object.freeze({ configuration, status: "updated" });
    });
  }
}
