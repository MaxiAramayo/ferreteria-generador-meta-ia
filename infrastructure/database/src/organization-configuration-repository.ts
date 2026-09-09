import { randomUUID } from "node:crypto";

import type {
  BrandThemeId,
  ConfigurationMutationResult,
  DeleteLocationDayOverrideResult,
  LocationConfiguration,
  LocationDayOverride,
  LocationDayOverrideImpact,
  LocationDayOverrideListQuery,
  LocationDayOverrideMutationResult,
  LocationDayOverridePreviewInput,
  LocationDayOverridePreviewResult,
  LocationDayOverrideRepository,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  PersistBrandConfigurationInput,
  PersistLocationDayOverrideDeletionInput,
  PersistLocationDayOverrideInput,
  PersistLocationConfigurationInput,
} from "@aramayo/domain";

import type { DatabaseClient, DatabaseTransactionClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

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

const locationDayOverrideSelection = {
  id: true,
  localDate: true,
  locationId: true,
  openingHours: true,
  sourceLabel: true,
  status: true,
  version: true,
} satisfies Prisma.LocationDayOverrideSelect;

type LocationDayOverrideRow = Prisma.LocationDayOverrideGetPayload<{
  select: typeof locationDayOverrideSelection;
}>;

const invalidatablePublicationStatuses: Array<
  "draft" | "generating_assets" | "ready_for_review" | "approved" | "scheduled"
> = ["draft", "generating_assets", "ready_for_review", "approved", "scheduled"];

const invalidatableMaterializationStatuses: Array<
  "draft_created" | "approved_scheduled"
> = ["draft_created", "approved_scheduled"];

class ConfigurationVersionConflict extends Error {}

interface RecurringStoryInvalidationInput {
  readonly actorMembershipId: string;
  readonly auditMetadata: Prisma.InputJsonObject;
  readonly invalidatedAt: Date;
  readonly invalidatedReasonCode: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly publicationFailureMessage: string;
  readonly transitionFailureMessage: string;
  readonly updatedLocationVersion?: number;
  readonly localDate?: string;
}

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

function formatCivilDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapLocationDayOverride(
  override: LocationDayOverrideRow,
): LocationDayOverride {
  const base = {
    id: override.id,
    localDate: formatCivilDate(override.localDate),
    locationId: override.locationId,
    sourceLabel: override.sourceLabel,
    version: override.version,
  };
  if (override.status === "closed") {
    return Object.freeze({ ...base, status: "closed" as const });
  }
  if (override.openingHours === null || override.openingHours.trim() === "") {
    throw new Error("Un horario especial abierto no tiene horas utilizables.");
  }
  return Object.freeze({
    ...base,
    openingHours: override.openingHours,
    status: "open" as const,
  });
}

function dayOverrideImpact(
  timeZone: string,
  localDate: string,
  status: "closed" | "open",
  affectedStoryCount: number,
): LocationDayOverrideImpact {
  return Object.freeze({
    affectedStoryCount,
    localDate,
    timeZone,
    willBlockHoursSensitiveStories: status === "closed",
    willRequireHumanApproval: status === "open",
  });
}

async function countAffectedFutureStories(
  transaction: DatabaseTransactionClient,
  input: Readonly<{
    invalidatedAt: Date;
    localDate: string;
    locationId: string;
    organizationId: string;
  }>,
): Promise<number> {
  return transaction.recurringStoryMaterialization.count({
    where: {
      locationId: input.locationId,
      occurrenceKey: { startsWith: `${input.localDate}T` },
      organizationId: input.organizationId,
      publication: { status: { in: invalidatablePublicationStatuses } },
      scheduledAt: { gte: input.invalidatedAt },
      status: { in: invalidatableMaterializationStatuses },
    },
  });
}

async function invalidateRecurringStories(
  transaction: DatabaseTransactionClient,
  input: RecurringStoryInvalidationInput,
): Promise<number> {
  const query = {
    include: {
      publication: { select: { status: true, version: true } },
    },
    where: {
      locationId: input.locationId,
      ...(input.localDate === undefined
        ? {}
        : { occurrenceKey: { startsWith: `${input.localDate}T` } }),
      organizationId: input.organizationId,
      publication: { status: { in: invalidatablePublicationStatuses } },
      ...(input.localDate === undefined
        ? {}
        : { scheduledAt: { gte: input.invalidatedAt } }),
      status: { in: invalidatableMaterializationStatuses },
    },
  } satisfies Prisma.RecurringStoryMaterializationFindManyArgs;
  const materializations =
    await transaction.recurringStoryMaterialization.findMany<typeof query>(
      query,
    );
  for (const materialization of materializations) {
    const publication = materialization.publication;
    if (publication === null || materialization.publicationId === null) {
      continue;
    }
    if (materialization.scheduleId !== null) {
      await transaction.publicationScheduleOccurrence.updateMany({
        data: {
          cancelledAt: input.invalidatedAt,
          status: "cancelled",
        },
        where: {
          organizationId: input.organizationId,
          scheduleId: materialization.scheduleId,
          status: "planned",
        },
      });
      await transaction.publicationSchedule.updateMany({
        data: {
          cancelledAt: input.invalidatedAt,
          cancelledReasonCode: input.invalidatedReasonCode,
          status: "cancelled",
        },
        where: {
          id: materialization.scheduleId,
          organizationId: input.organizationId,
          status: { in: ["active", "paused"] },
        },
      });
    }
    const nextVersion = publication.version + 1;
    const publicationUpdate = await transaction.publication.updateMany({
      data: {
        failureCode: input.invalidatedReasonCode,
        failureMessage: input.publicationFailureMessage,
        failureOccurredAt: input.invalidatedAt,
        failureRetryable: false,
        status: "validation_failed",
        version: nextVersion,
      },
      where: {
        id: materialization.publicationId,
        organizationId: input.organizationId,
        status: publication.status,
        version: publication.version,
      },
    });
    if (publicationUpdate.count !== 1) {
      throw new Error(
        "Una historia recurrente cambió durante su invalidación.",
      );
    }
    await transaction.publicationStateTransition.create({
      data: {
        actorMembershipId: input.actorMembershipId,
        commandType: "fail",
        failureCode: input.invalidatedReasonCode,
        failureMessage: input.transitionFailureMessage,
        failureRetryable: false,
        fromStatus: publication.status,
        fromVersion: publication.version,
        occurredAt: input.invalidatedAt,
        organizationId: input.organizationId,
        publicationId: materialization.publicationId,
        toStatus: "validation_failed",
        toVersion: nextVersion,
      },
    });
    await transaction.recurringStoryMaterialization.update({
      data: {
        invalidatedAt: input.invalidatedAt,
        invalidatedReasonCode: input.invalidatedReasonCode,
        scheduleId: null,
        status: "invalidated",
      },
      where: { id: materialization.id },
    });
    await transaction.auditEvent.create({
      data: {
        actorMembershipId: input.actorMembershipId,
        entityId: materialization.publicationId,
        entityType: "publication",
        id: randomUUID(),
        metadata: {
          ...input.auditMetadata,
          materializationId: materialization.id,
          sourceLocationVersion: materialization.locationVersion,
          ...(input.updatedLocationVersion === undefined
            ? {}
            : { updatedLocationVersion: input.updatedLocationVersion }),
        },
        occurredAt: input.invalidatedAt,
        operation: "scheduling.recurring-story:invalidate",
        organizationId: input.organizationId,
        outcome: "failure",
      },
    });
  }
  return materializations.length;
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
  database: DatabaseClient | DatabaseTransactionClient,
  organizationId: string,
): Promise<OrganizationConfiguration | null> {
  const row = await database.organization.findUnique({
    select: configurationSelection,
    where: { id: organizationId },
  });
  return row === null ? null : mapConfiguration(row);
}

export class PrismaOrganizationConfigurationRepository
  implements OrganizationConfigurationRepository, LocationDayOverrideRepository
{
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationConfiguration | null> {
    return findConfiguration(this.#database, organizationId);
  }

  async listLocationDayOverrides(
    query: LocationDayOverrideListQuery,
  ): Promise<readonly LocationDayOverride[] | null> {
    const location = await this.#database.location.findFirst({
      select: { id: true },
      where: {
        id: query.locationId,
        organizationId: query.organizationId,
      },
    });
    if (location === null) {
      return null;
    }
    const rows = await this.#database.locationDayOverride.findMany({
      orderBy: [{ localDate: "asc" }, { id: "asc" }],
      select: locationDayOverrideSelection,
      where: {
        localDate: {
          gte: new Date(`${query.startDate}T00:00:00.000Z`),
          lte: new Date(`${query.endDate}T00:00:00.000Z`),
        },
        locationId: query.locationId,
        organizationId: query.organizationId,
      },
    });
    return Object.freeze(rows.map(mapLocationDayOverride));
  }

  async previewLocationDayOverride(
    input: LocationDayOverridePreviewInput,
  ): Promise<LocationDayOverridePreviewResult> {
    const location = await this.#database.location.findFirst({
      select: { id: true, timeZone: true },
      where: {
        id: input.locationId,
        organizationId: input.organizationId,
      },
    });
    if (location === null) {
      return Object.freeze({ status: "not-found" });
    }
    const invalidatedAt = new Date(input.changedAt);
    const affectedStoryCount = await this.#database.$transaction(
      (transaction) =>
        countAffectedFutureStories(transaction, {
          invalidatedAt,
          localDate: input.update.localDate,
          locationId: input.locationId,
          organizationId: input.organizationId,
        }),
    );
    return Object.freeze({
      impact: dayOverrideImpact(
        location.timeZone,
        input.update.localDate,
        input.update.status,
        affectedStoryCount,
      ),
      status: "ready",
    });
  }

  async upsertLocationDayOverride(
    input: PersistLocationDayOverrideInput,
  ): Promise<LocationDayOverrideMutationResult> {
    try {
      return await this.#database.$transaction(async (transaction) => {
        const location = await transaction.location.findFirst({
          select: { id: true, timeZone: true },
          where: {
            id: input.locationId,
            organizationId: input.organizationId,
          },
        });
        if (location === null) {
          return Object.freeze({ status: "not-found" });
        }
        const localDate = new Date(`${input.update.localDate}T00:00:00.000Z`);
        const current = await transaction.locationDayOverride.findUnique({
          select: locationDayOverrideSelection,
          where: {
            organizationId_locationId_localDate: {
              localDate,
              locationId: input.locationId,
              organizationId: input.organizationId,
            },
          },
        });
        if (
          (current === null && input.expectedVersion !== undefined) ||
          (current !== null &&
            (input.expectedVersion === undefined ||
              current.version !== input.expectedVersion))
        ) {
          return Object.freeze({ status: "conflict" });
        }

        let saved: LocationDayOverrideRow;
        if (current === null) {
          saved = await transaction.locationDayOverride.create({
            data: {
              localDate,
              locationId: input.locationId,
              openingHours:
                input.update.status === "open"
                  ? input.update.openingHours
                  : null,
              organizationId: input.organizationId,
              sourceLabel: input.update.sourceLabel,
              status: input.update.status,
            },
            select: locationDayOverrideSelection,
          });
        } else {
          const updated = await transaction.locationDayOverride.updateMany({
            data: {
              openingHours:
                input.update.status === "open"
                  ? input.update.openingHours
                  : null,
              sourceLabel: input.update.sourceLabel,
              status: input.update.status,
              version: { increment: 1 },
            },
            where: {
              id: current.id,
              organizationId: input.organizationId,
              version: current.version,
            },
          });
          if (updated.count !== 1) {
            return Object.freeze({ status: "conflict" });
          }
          const refreshed = await transaction.locationDayOverride.findUnique({
            select: locationDayOverrideSelection,
            where: {
              organizationId_id: {
                id: current.id,
                organizationId: input.organizationId,
              },
            },
          });
          if (refreshed === null) {
            throw new Error("La excepción actualizada ya no existe.");
          }
          saved = refreshed;
        }

        const invalidatedAt = new Date(input.changedAt);
        const override = mapLocationDayOverride(saved);
        const affectedStoryCount = await invalidateRecurringStories(
          transaction,
          {
            actorMembershipId: input.actorMembershipId,
            auditMetadata: {
              localDate: input.update.localDate,
              locationDayOverrideId: saved.id,
              locationId: input.locationId,
              sourceLabel: input.update.sourceLabel,
              status: input.update.status,
            },
            invalidatedAt,
            invalidatedReasonCode: "location-day-override-changed",
            localDate: input.update.localDate,
            locationId: input.locationId,
            organizationId: input.organizationId,
            publicationFailureMessage:
              "El horario excepcional cambió después de crear esta historia. Revisala antes de aprobar o publicar.",
            transitionFailureMessage:
              "La excepción de horario cambió después de crear la historia.",
          },
        );
        const impact = dayOverrideImpact(
          location.timeZone,
          input.update.localDate,
          input.update.status,
          affectedStoryCount,
        );
        await transaction.organizationConfigurationEvent.create({
          data: {
            actorMembershipId: input.actorMembershipId,
            after: override,
            before:
              current === null
                ? { localDate: input.update.localDate, status: "none" }
                : mapLocationDayOverride(current),
            occurredAt: invalidatedAt,
            organizationId: input.organizationId,
            targetId: input.locationId,
            targetType: "location",
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorMembershipId: input.actorMembershipId,
            entityId: saved.id,
            entityType: "location_day_override",
            id: randomUUID(),
            metadata: {
              affectedStoryCount,
              localDate: input.update.localDate,
              locationId: input.locationId,
              status: input.update.status,
            },
            occurredAt: invalidatedAt,
            operation: "scheduling.location-day-override:upsert",
            organizationId: input.organizationId,
            outcome: "success",
          },
        });
        return Object.freeze({ impact, override, status: "updated" });
      });
    } catch (cause: unknown) {
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      ) {
        return Object.freeze({ status: "conflict" });
      }
      throw cause;
    }
  }

  async deleteLocationDayOverride(
    input: PersistLocationDayOverrideDeletionInput,
  ): Promise<DeleteLocationDayOverrideResult> {
    return this.#database.$transaction(async (transaction) => {
      const location = await transaction.location.findFirst({
        select: { id: true, timeZone: true },
        where: {
          id: input.locationId,
          organizationId: input.organizationId,
        },
      });
      if (location === null) {
        return Object.freeze({ status: "not-found" });
      }
      const localDate = new Date(`${input.localDate}T00:00:00.000Z`);
      const current = await transaction.locationDayOverride.findUnique({
        select: locationDayOverrideSelection,
        where: {
          organizationId_locationId_localDate: {
            localDate,
            locationId: input.locationId,
            organizationId: input.organizationId,
          },
        },
      });
      if (current === null) {
        return Object.freeze({ status: "not-found" });
      }
      if (current.version !== input.expectedVersion) {
        return Object.freeze({ status: "conflict" });
      }
      const deleted = await transaction.locationDayOverride.deleteMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          version: current.version,
        },
      });
      if (deleted.count !== 1) {
        return Object.freeze({ status: "conflict" });
      }

      const invalidatedAt = new Date(input.changedAt);
      const affectedStoryCount = await invalidateRecurringStories(transaction, {
        actorMembershipId: input.actorMembershipId,
        auditMetadata: {
          localDate: input.localDate,
          locationDayOverrideId: current.id,
          locationId: input.locationId,
          operation: "deleted",
        },
        invalidatedAt,
        invalidatedReasonCode: "location-day-override-removed",
        localDate: input.localDate,
        locationId: input.locationId,
        organizationId: input.organizationId,
        publicationFailureMessage:
          "Se quitó el horario excepcional después de crear esta historia. Revisala antes de aprobar o publicar.",
        transitionFailureMessage:
          "Se quitó la excepción de horario después de crear la historia.",
      });
      const impact = dayOverrideImpact(
        location.timeZone,
        input.localDate,
        current.status,
        affectedStoryCount,
      );
      await transaction.organizationConfigurationEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          after: { localDate: input.localDate, status: "none" },
          before: mapLocationDayOverride(current),
          occurredAt: invalidatedAt,
          organizationId: input.organizationId,
          targetId: input.locationId,
          targetType: "location",
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          entityId: current.id,
          entityType: "location_day_override",
          id: randomUUID(),
          metadata: {
            affectedStoryCount,
            localDate: input.localDate,
            locationId: input.locationId,
            status: current.status,
          },
          occurredAt: invalidatedAt,
          operation: "scheduling.location-day-override:delete",
          organizationId: input.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ impact, status: "deleted" });
    });
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

      const previous = mapLocation(currentLocation);
      const factualSourceChanged =
        previous.addressLine !== input.update.addressLine ||
        previous.city !== input.update.city ||
        previous.isActive !== input.update.isActive ||
        previous.name !== input.update.name ||
        previous.openingHours !== input.update.openingHours ||
        previous.province !== input.update.province ||
        previous.timeZone !== input.update.timeZone;
      if (factualSourceChanged) {
        const invalidatedAt = new Date(input.changedAt);
        await invalidateRecurringStories(transaction, {
          actorMembershipId: input.actorMembershipId,
          auditMetadata: { locationId: input.locationId },
          invalidatedAt,
          invalidatedReasonCode: "factual-source-changed",
          locationId: input.locationId,
          organizationId: input.organizationId,
          publicationFailureMessage:
            "La sucursal cambió después de crear esta historia. Volvé a materializarla antes de aprobar o publicar.",
          transitionFailureMessage:
            "La fuente factual de la sucursal cambió después de crear la historia.",
          updatedLocationVersion: input.update.version + 1,
        });
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
            ...previous,
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
