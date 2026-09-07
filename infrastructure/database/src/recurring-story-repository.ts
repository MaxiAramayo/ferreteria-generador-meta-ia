import { createHash, randomUUID } from "node:crypto";

import {
  planOccurrences,
  resolveRecurringStoryDraft,
  type CreateRecurringStoryRuleCommand,
  type CreateRecurringStoryRuleResult,
  type PublicationWeekday,
  type RecurringStoryApprovalPolicy,
  type RecurringStoryMaterializationRepository,
  type RecurringStoryRuleRecord,
  type RecurringStoryRuleRepository,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestHash(command: CreateRecurringStoryRuleCommand): string {
  return sha256(
    JSON.stringify({
      approvalPolicy: command.approvalPolicy,
      effectiveFrom: command.effectiveFrom,
      leadTimeMinutes: command.leadTimeMinutes,
      localTime: command.localTime,
      locationId: command.locationId,
      name: command.name,
      organizationId: command.actor.organizationId,
      weekdays: [...command.weekdays].sort((left, right) => left - right),
    }),
  );
}

function approvalPolicyToDatabase(
  policy: RecurringStoryApprovalPolicy,
): "automatic_routine" | "human_each_cycle" {
  return policy === "automatic-routine"
    ? "automatic_routine"
    : "human_each_cycle";
}

function approvalPolicyFromDatabase(
  policy: "automatic_routine" | "human_each_cycle",
): RecurringStoryApprovalPolicy {
  return policy === "automatic_routine"
    ? "automatic-routine"
    : "human-each-cycle";
}

function mapRule(
  row: Readonly<{
    approvalPolicy: "automatic_routine" | "human_each_cycle";
    createdByMembershipId: string;
    effectiveFrom: Date;
    id: string;
    leadTimeMinutes: number;
    localTime: string;
    locationId: string;
    name: string;
    organizationId: string;
    status: "active" | "cancelled" | "paused";
    timeZone: string;
    version: number;
    weekdays: readonly number[];
  }>,
): RecurringStoryRuleRecord {
  return Object.freeze({
    approvalPolicy: approvalPolicyFromDatabase(row.approvalPolicy),
    createdByMembershipId: row.createdByMembershipId,
    effectiveFrom: row.effectiveFrom.toISOString(),
    id: row.id,
    leadTimeMinutes: row.leadTimeMinutes,
    localTime: row.localTime,
    locationId: row.locationId,
    name: row.name,
    organizationId: row.organizationId,
    status: row.status,
    timeZone: row.timeZone,
    version: row.version,
    weekdays: Object.freeze(row.weekdays as PublicationWeekday[]),
  });
}

/**
 * Reglas que puede recorrer una pasada.
 *
 * Es una cota de lectura, no de trabajo: `limit` acota cuántas
 * materializaciones nuevas se crean, y este máximo evita que una base con
 * muchas reglas activas convierta el barrido en una consulta sin techo.
 */
const ruleScanMaximum = 500;

function isPrismaUniqueConflict(cause: unknown): boolean {
  return (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    cause.code === "P2002"
  );
}

export class PrismaRecurringStoryRepository
  implements
    RecurringStoryRuleRepository,
    RecurringStoryMaterializationRepository
{
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async create(
    command: CreateRecurringStoryRuleCommand &
      Readonly<{ idempotencyKey: string; occurredAt: string }>,
  ): Promise<CreateRecurringStoryRuleResult> {
    const hash = requestHash(command);
    return this.#database.$transaction(async (transaction) => {
      const existing = await transaction.recurringStoryRule.findUnique({
        where: {
          organizationId_idempotencyKey: {
            idempotencyKey: command.idempotencyKey,
            organizationId: command.actor.organizationId,
          },
        },
      });
      if (existing !== null) {
        return existing.requestHash === hash
          ? Object.freeze({ rule: mapRule(existing), status: "created" })
          : Object.freeze({ status: "idempotency-conflict" });
      }

      const location = await transaction.location.findFirst({
        select: { id: true, timeZone: true },
        where: {
          id: command.locationId,
          organizationId: command.actor.organizationId,
        },
      });
      if (location === null) {
        return Object.freeze({ status: "location-not-found" });
      }
      const rule = await transaction.recurringStoryRule.create({
        data: {
          approvalPolicy: approvalPolicyToDatabase(command.approvalPolicy),
          createdByMembershipId: command.actor.membershipId,
          effectiveFrom: new Date(command.effectiveFrom),
          idempotencyKey: command.idempotencyKey,
          leadTimeMinutes: command.leadTimeMinutes,
          localTime: command.localTime,
          locationId: location.id,
          name: command.name,
          organizationId: command.actor.organizationId,
          requestHash: hash,
          timeZone: location.timeZone,
          weekdays: [...command.weekdays],
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: command.actor.membershipId,
          entityId: rule.id,
          entityType: "recurring_story_rule",
          id: randomUUID(),
          metadata: {
            approvalPolicy: command.approvalPolicy,
            leadTimeMinutes: command.leadTimeMinutes,
            locationId: command.locationId,
            weekdays: [...command.weekdays],
          },
          occurredAt: new Date(command.occurredAt),
          operation: "scheduling.recurring-story:create",
          organizationId: command.actor.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ rule: mapRule(rule), status: "created" });
    });
  }

  async list(
    organizationId: string,
  ): Promise<readonly RecurringStoryRuleRecord[]> {
    const rows = await this.#database.recurringStoryRule.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100,
      where: { organizationId },
    });
    return Object.freeze(rows.map(mapRule));
  }

  async materializeDue(
    input: Readonly<{
      at: string;
      limit: number;
      organizationId?: string;
    }>,
  ): Promise<Readonly<{ blocked: number; created: number; reviewed: number }>> {
    const at = new Date(input.at);
    if (Number.isNaN(at.getTime())) {
      throw new RangeError("El instante de materialización no es válido.");
    }
    const rules = await this.#database.recurringStoryRule.findMany({
      include: {
        location: { include: { brand: { select: { profile: true } } } },
      },
      orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
      take: ruleScanMaximum,
      where: {
        ...(input.organizationId === undefined
          ? {}
          : { organizationId: input.organizationId }),
        // La regla entra antes que su primer instante: de otro modo una
        // anticipación de un día recién se descubriría a la hora de publicar.
        effectiveFrom: {
          lte: new Date(at.getTime() + 10_080 * 60_000),
        },
        status: "active",
      },
    });
    let blocked = 0;
    let created = 0;
    let reviewed = 0;
    for (const rule of rules) {
      // El límite acota trabajo nuevo, no relecturas: contar las ocurrencias ya
      // materializadas dejaría a las reglas más recientes sin turno para
      // siempre, porque el barrido siempre empieza por las más antiguas.
      if (created + blocked >= input.limit) {
        break;
      }
      const horizon = new Date(at.getTime() + rule.leadTimeMinutes * 60_000);
      const occurrences = planOccurrences(
        {
          effectiveFrom: rule.effectiveFrom.toISOString(),
          gapPolicy: "skip",
          localTime: rule.localTime,
          recurrence: {
            interval: 1,
            kind: "weekly",
            weekdays: rule.weekdays as PublicationWeekday[],
          },
          timeZone: rule.timeZone,
        },
        { from: at.toISOString(), to: horizon.toISOString() },
      );
      // Una sola consulta descarta lo ya resuelto. Abrir una transacción por
      // ocurrencia para descubrir que ya existía es el caso normal del barrido.
      const settled = new Set(
        (
          await this.#database.recurringStoryMaterialization.findMany({
            select: { occurrenceKey: true },
            where: {
              occurrenceKey: {
                in: occurrences.map((occurrence) => occurrence.occurrenceKey),
              },
              organizationId: rule.organizationId,
              ruleId: rule.id,
            },
          })
        ).map((row) => row.occurrenceKey),
      );
      for (const occurrence of occurrences) {
        if (created + blocked >= input.limit) {
          break;
        }
        reviewed += 1;
        if (settled.has(occurrence.occurrenceKey)) {
          continue;
        }
        const result = await this.#materialize(rule, occurrence, input.at);
        if (result === "created") {
          created += 1;
        } else if (result === "blocked") {
          blocked += 1;
        }
      }
    }
    return Object.freeze({ blocked, created, reviewed });
  }

  async #materialize(
    rule: Awaited<
      ReturnType<DatabaseClient["recurringStoryRule"]["findMany"]>
    >[number] &
      Readonly<{
        location: Readonly<{
          addressLine: string;
          brand: Readonly<{ profile: Prisma.JsonValue }>;
          city: string;
          id: string;
          isActive: boolean;
          name: string;
          openingHours: Prisma.JsonValue;
          organizationId: string;
          province: string;
          timeZone: string;
          version: number;
        }>;
      }>,
    occurrence: Readonly<{
      occurrenceKey: string;
      resolution: "ambiguous" | "exact" | "shifted";
      scheduledAt: string;
    }>,
    capturedAt: string,
  ): Promise<"blocked" | "created" | "existing"> {
    try {
      return await this.#database.$transaction(async (transaction) => {
        const existing =
          await transaction.recurringStoryMaterialization.findUnique({
            where: {
              organizationId_ruleId_occurrenceKey: {
                occurrenceKey: occurrence.occurrenceKey,
                organizationId: rule.organizationId,
                ruleId: rule.id,
              },
            },
          });
        if (existing !== null) {
          return "existing" as const;
        }
        const localDate = occurrence.occurrenceKey.slice(0, 10);
        const dayOverride = await transaction.locationDayOverride.findUnique({
          where: {
            organizationId_locationId_localDate: {
              localDate: new Date(`${localDate}T00:00:00.000Z`),
              locationId: rule.locationId,
              organizationId: rule.organizationId,
            },
          },
        });
        const hoursValue = rule.location.openingHours;
        const openingHours =
          typeof hoursValue === "object" &&
          hoursValue !== null &&
          !Array.isArray(hoursValue) &&
          typeof hoursValue["display"] === "string"
            ? hoursValue["display"]
            : undefined;
        const resolution = resolveRecurringStoryDraft({
          capturedAt,
          ...(dayOverride === null
            ? {}
            : dayOverride.status === "closed"
              ? {
                  dayOverride: {
                    localDate,
                    sourceLabel: dayOverride.sourceLabel,
                    status: "closed" as const,
                    version: dayOverride.version,
                  },
                }
              : {
                  dayOverride: {
                    localDate,
                    openingHours: dayOverride.openingHours ?? "",
                    sourceLabel: dayOverride.sourceLabel,
                    status: "open" as const,
                    version: dayOverride.version,
                  },
                }),
          location: {
            addressLine: rule.location.addressLine,
            city: rule.location.city,
            id: rule.location.id,
            isActive: rule.location.isActive,
            name: rule.location.name,
            ...(openingHours === undefined ? {} : { openingHours }),
            organizationId: rule.location.organizationId,
            province: rule.location.province,
            timeZone: rule.location.timeZone,
            version: rule.location.version,
          },
          occurrence,
          policy: approvalPolicyFromDatabase(rule.approvalPolicy),
        });
        if (resolution.status === "blocked") {
          const status =
            resolution.reason === "location-closed"
              ? "blocked_location_closed"
              : resolution.reason === "location-inactive"
                ? "blocked_location_inactive"
                : "blocked_missing_hours";
          await transaction.recurringStoryMaterialization.create({
            data: {
              blockedReasonCode: resolution.reason,
              locationId: rule.locationId,
              locationVersion: rule.location.version,
              occurrenceKey: occurrence.occurrenceKey,
              organizationId: rule.organizationId,
              resolution: occurrence.resolution,
              requiresHumanApproval: true,
              ruleId: rule.id,
              scheduledAt: new Date(occurrence.scheduledAt),
              sourceSnapshot: {
                capturedAt,
                localDate,
                locationId: rule.locationId,
                locationVersion: rule.location.version,
                reason: resolution.reason,
              },
              status,
            },
          });
          return "blocked" as const;
        }

        const profile = rule.location.brand.profile;
        const theme =
          typeof profile === "object" &&
          profile !== null &&
          !Array.isArray(profile) &&
          (profile["themeId"] === "taller" ||
            profile["themeId"] === "claro" ||
            profile["themeId"] === "promo" ||
            profile["themeId"] === "lubricentro")
            ? profile["themeId"]
            : undefined;
        if (theme === undefined) {
          throw new Error("La marca no tiene un tema visual vigente.");
        }
        const publicationId = randomUUID();
        const revisionId = randomUUID();
        const content = { caption: resolution.caption, products: [] };
        const designDocument = {
          content: resolution.designContent,
          format: "historia",
          layout: "historia-tip",
          media: [],
          schemaVersion: 1,
          slug: `story-${rule.id.slice(0, 8)}-${localDate.replaceAll("-", "")}`,
          theme,
        };
        const contentHash = sha256(JSON.stringify({ content, designDocument }));
        await transaction.publication.create({
          data: {
            createdByMembershipId: rule.createdByMembershipId,
            id: publicationId,
            locationId: rule.locationId,
            organizationId: rule.organizationId,
            scheduledFor: new Date(occurrence.scheduledAt),
            timeZone: rule.timeZone,
            title: `Ya abrimos · ${rule.location.name} · ${localDate}`,
          },
        });
        await transaction.publicationRevision.create({
          data: {
            content,
            contentHash,
            createdByMembershipId: rule.createdByMembershipId,
            designDocument,
            id: revisionId,
            organizationId: rule.organizationId,
            publicationId,
            revisionNumber: 1,
            schemaVersion: 1,
          },
        });
        await transaction.recurringStoryMaterialization.create({
          data: {
            locationId: rule.locationId,
            locationVersion: rule.location.version,
            occurrenceKey: occurrence.occurrenceKey,
            organizationId: rule.organizationId,
            publicationId,
            resolution: occurrence.resolution,
            requiresHumanApproval: resolution.requiresHumanApproval,
            ruleId: rule.id,
            scheduledAt: new Date(occurrence.scheduledAt),
            sourceSnapshot: { ...resolution.source },
            status: "draft_created",
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorMembershipId: rule.createdByMembershipId,
            entityId: publicationId,
            entityType: "publication",
            id: randomUUID(),
            metadata: {
              locationVersion: rule.location.version,
              occurrenceKey: occurrence.occurrenceKey,
              requiresHumanApproval: resolution.requiresHumanApproval,
              ruleId: rule.id,
            },
            occurredAt: new Date(capturedAt),
            operation: "scheduling.recurring-story:materialize",
            organizationId: rule.organizationId,
            outcome: "success",
          },
        });
        return "created" as const;
      });
    } catch (cause: unknown) {
      if (isPrismaUniqueConflict(cause)) {
        return "existing";
      }
      throw cause;
    }
  }
}
