import { createHash, randomUUID } from "node:crypto";

import {
  planOccurrences,
  recurringStoryDesignDocument,
  recurringStorySourceToJson,
  resolveEveryLocationStoryDraft,
  resolveRecurringStoryDraft,
  type CreateRecurringStoryRuleCommand,
  type AuthenticatedActor,
  type CreateRecurringStoryRuleResult,
  type PublicationWeekday,
  type RecurringStoryAccent,
  type RecurringStoryApprovalPolicy,
  type RecurringStoryDayOverride,
  type RecurringStoryDesignVariant,
  type RecurringStoryDraftResolution,
  type RecurringStoryKind,
  type RecurringStoryLocationSource,
  type RecurringStoryMaterializationRepository,
  type RecurringStoryPhoto,
  type RecurringStoryRuleLifecycleCommand,
  type RecurringStoryRuleLifecycleResult,
  type RecurringStoryRuleRecord,
  type RecurringStoryRuleRepository,
  type RecurringStoryTheme,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";
import { prismaJson } from "./publication-draft-repository.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Huella de la foto para las comparaciones idempotentes: el pedido se compara
 * sin volver a serializar cientos de kilobytes en cada clave.
 */
function photoFingerprint(photo: RecurringStoryPhoto | null): string | null {
  return photo === null
    ? null
    : sha256(
        JSON.stringify([
          photo.alt,
          photo.dataUrl,
          photo.focusX,
          photo.focusY,
          photo.zoom,
        ]),
      );
}

function photoColumns(photo: RecurringStoryPhoto | null): Readonly<{
  photoAlt: string | null;
  photoDataUrl: string | null;
  photoFocusX: number | null;
  photoFocusY: number | null;
  photoZoom: number | null;
}> {
  return photo === null
    ? {
        photoAlt: null,
        photoDataUrl: null,
        photoFocusX: null,
        photoFocusY: null,
        photoZoom: null,
      }
    : {
        photoAlt: photo.alt,
        photoDataUrl: photo.dataUrl,
        photoFocusX: photo.focusX,
        photoFocusY: photo.focusY,
        photoZoom: photo.zoom,
      };
}

function requestHash(command: CreateRecurringStoryRuleCommand): string {
  return sha256(
    JSON.stringify({
      accent: command.accent ?? "marca",
      approvalPolicy: command.approvalPolicy,
      designVariant: command.designVariant ?? "cartel",
      effectiveFrom: command.effectiveFrom,
      kind: command.kind ?? "apertura",
      leadTimeMinutes: command.leadTimeMinutes,
      localTime: command.localTime,
      locationId: command.locationId,
      name: command.name,
      organizationId: command.actor.organizationId,
      photo: photoFingerprint(command.photo ?? null),
      theme: command.theme ?? "taller",
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

function mapPhoto(
  row: Readonly<{
    photoAlt: string | null;
    photoDataUrl: string | null;
    photoFocusX: number | null;
    photoFocusY: number | null;
    photoZoom: number | null;
  }>,
): RecurringStoryPhoto | null {
  // El CHECK de la tabla guarda la foto entera o nada.
  return row.photoDataUrl === null ||
    row.photoAlt === null ||
    row.photoFocusX === null ||
    row.photoFocusY === null ||
    row.photoZoom === null
    ? null
    : Object.freeze({
        alt: row.photoAlt,
        dataUrl: row.photoDataUrl,
        focusX: row.photoFocusX,
        focusY: row.photoFocusY,
        zoom: row.photoZoom,
      });
}

function mapRule(
  row: Readonly<{
    accent: RecurringStoryAccent;
    approvalPolicy: "automatic_routine" | "human_each_cycle";
    createdByMembershipId: string;
    designVariant: RecurringStoryDesignVariant;
    effectiveFrom: Date;
    id: string;
    kind: RecurringStoryKind;
    leadTimeMinutes: number;
    localTime: string;
    locationId: string | null;
    name: string;
    organizationId: string;
    photoAlt: string | null;
    photoDataUrl: string | null;
    photoFocusX: number | null;
    photoFocusY: number | null;
    photoZoom: number | null;
    status: "active" | "cancelled" | "paused";
    theme: RecurringStoryTheme;
    timeZone: string;
    version: number;
    weekdays: readonly number[];
  }>,
): RecurringStoryRuleRecord {
  return Object.freeze({
    accent: row.accent,
    approvalPolicy: approvalPolicyFromDatabase(row.approvalPolicy),
    createdByMembershipId: row.createdByMembershipId,
    designVariant: row.designVariant,
    effectiveFrom: row.effectiveFrom.toISOString(),
    id: row.id,
    kind: row.kind,
    leadTimeMinutes: row.leadTimeMinutes,
    localTime: row.localTime,
    locationId: row.locationId,
    name: row.name,
    organizationId: row.organizationId,
    photo: mapPhoto(row),
    status: row.status,
    theme: row.theme,
    timeZone: row.timeZone,
    version: row.version,
    weekdays: Object.freeze(row.weekdays as PublicationWeekday[]),
  });
}

type LocationRow = Readonly<{
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

type DayOverrideRow = Readonly<{
  openingHours: string | null;
  sourceLabel: string;
  status: "closed" | "open";
  version: number;
}>;

function locationSource(location: LocationRow): RecurringStoryLocationSource {
  const hoursValue = location.openingHours;
  const openingHours =
    typeof hoursValue === "object" &&
    hoursValue !== null &&
    !Array.isArray(hoursValue) &&
    typeof hoursValue["display"] === "string"
      ? hoursValue["display"]
      : undefined;
  return {
    addressLine: location.addressLine,
    city: location.city,
    id: location.id,
    isActive: location.isActive,
    name: location.name,
    ...(openingHours === undefined ? {} : { openingHours }),
    organizationId: location.organizationId,
    province: location.province,
    timeZone: location.timeZone,
    version: location.version,
  };
}

function dayOverrideSource(
  localDate: string,
  row: DayOverrideRow | null,
): RecurringStoryDayOverride | undefined {
  if (row === null) return undefined;
  return row.status === "closed"
    ? {
        localDate,
        sourceLabel: row.sourceLabel,
        status: "closed",
        version: row.version,
      }
    : {
        localDate,
        openingHours: row.openingHours ?? "",
        sourceLabel: row.sourceLabel,
        status: "open",
        version: row.version,
      };
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
    const accent = command.accent ?? "marca";
    const designVariant = command.designVariant ?? "cartel";
    const kind = command.kind ?? "apertura";
    const photo = command.photo ?? null;
    const theme =
      command.theme ?? (kind === "lubricentro" ? "lubricentro" : "taller");
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

      // Una regla para todas las sucursales toma la zona horaria que
      // comparten las activas; si no comparten una, no hay un instante local
      // que valga para todas.
      const candidates = await transaction.location.findMany({
        select: { id: true, timeZone: true },
        where: {
          organizationId: command.actor.organizationId,
          ...(command.locationId === null
            ? { isActive: true }
            : { id: command.locationId }),
        },
      });
      const timeZones = new Set(candidates.map((entry) => entry.timeZone));
      const [location] = candidates;
      if (location === undefined || timeZones.size !== 1) {
        return Object.freeze({ status: "location-not-found" });
      }
      const rule = await transaction.recurringStoryRule.create({
        data: {
          accent,
          approvalPolicy: approvalPolicyToDatabase(command.approvalPolicy),
          createdByMembershipId: command.actor.membershipId,
          designRotation: Array.from({ length: 7 }, () => designVariant),
          designVariant,
          ...photoColumns(photo),
          effectiveFrom: new Date(command.effectiveFrom),
          idempotencyKey: command.idempotencyKey,
          kind,
          leadTimeMinutes: command.leadTimeMinutes,
          localTime: command.localTime,
          locationId: command.locationId,
          name: command.name,
          organizationId: command.actor.organizationId,
          requestHash: hash,
          theme,
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
          // La auditoría nombra la foto por su huella, nunca por sus bytes.
          metadata: {
            accent,
            approvalPolicy: command.approvalPolicy,
            designVariant,
            kind,
            leadTimeMinutes: command.leadTimeMinutes,
            locationId: command.locationId,
            photo: photoFingerprint(photo),
            theme,
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

  async updateVisualStyle(
    command: Readonly<{
      accent: RecurringStoryAccent;
      actor: AuthenticatedActor;
      designVariant: RecurringStoryDesignVariant;
      expectedVersion: number;
      idempotencyKey: string;
      /** La historia de la regla: un marco de otra no se le puede aplicar. */
      kind: RecurringStoryKind;
      occurredAt: string;
      photo: RecurringStoryPhoto | null;
      ruleId: string;
      theme: RecurringStoryTheme;
    }>,
  ): Promise<
    | Readonly<{ rule: RecurringStoryRuleRecord; status: "updated" }>
    | Readonly<{ status: "not-found" }>
    | Readonly<{ status: "version-conflict" }>
  > {
    const photo = photoFingerprint(command.photo);
    const hash = sha256(
      JSON.stringify({
        accent: command.accent,
        designVariant: command.designVariant,
        expectedVersion: command.expectedVersion,
        kind: command.kind,
        organizationId: command.actor.organizationId,
        photo,
        ruleId: command.ruleId,
        theme: command.theme,
      }),
    );
    return this.#database.$transaction(async (transaction) => {
      const existing = await transaction.recurringStoryRule.findUnique({
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      // La historia de la regla no cambia con el estilo: un pedido que dice
      // otra viene de un panel desactualizado y no encuentra su regla.
      if (existing === null || existing.kind !== command.kind) {
        return Object.freeze({ status: "not-found" });
      }
      if (
        existing.lastVisualStyleIdempotencyKey === command.idempotencyKey &&
        existing.lastVisualStyleRequestHash === hash
      ) {
        return Object.freeze({ rule: mapRule(existing), status: "updated" });
      }
      if (existing.version !== command.expectedVersion) {
        return Object.freeze({ status: "version-conflict" });
      }
      const rule = await transaction.recurringStoryRule.update({
        data: {
          accent: command.accent,
          designRotation: Array.from(
            { length: 7 },
            () => command.designVariant,
          ),
          designVariant: command.designVariant,
          lastVisualStyleIdempotencyKey: command.idempotencyKey,
          lastVisualStyleRequestHash: hash,
          ...photoColumns(command.photo),
          theme: command.theme,
          version: { increment: 1 },
        },
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: command.actor.membershipId,
          entityId: rule.id,
          entityType: "recurring_story_rule",
          id: randomUUID(),
          metadata: {
            accent: command.accent,
            designVariant: command.designVariant,
            photo,
            theme: command.theme,
          },
          occurredAt: new Date(command.occurredAt),
          operation: "scheduling.recurring-story:visual-style:update",
          organizationId: command.actor.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ rule: mapRule(rule), status: "updated" });
    });
  }

  async setStatus(
    command: RecurringStoryRuleLifecycleCommand &
      Readonly<{ status: "active" | "paused" }>,
  ): Promise<RecurringStoryRuleLifecycleResult> {
    return this.#database.$transaction(async (transaction) => {
      const existing = await transaction.recurringStoryRule.findUnique({
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      if (existing === null) {
        return Object.freeze({ status: "not-found" });
      }
      // Pedir el estado que ya tiene no es un error ni gasta una versión:
      // dos toques al mismo botón dejan la regla como se pidió.
      if (existing.status === command.status) {
        return Object.freeze({ rule: mapRule(existing), status: "updated" });
      }
      if (existing.version !== command.expectedVersion) {
        return Object.freeze({ status: "version-conflict" });
      }
      const rule = await transaction.recurringStoryRule.update({
        data: { status: command.status, version: { increment: 1 } },
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: command.actor.membershipId,
          entityId: rule.id,
          entityType: "recurring_story_rule",
          id: randomUUID(),
          metadata: { from: existing.status, to: command.status },
          occurredAt: new Date(command.occurredAt),
          operation:
            command.status === "paused"
              ? "scheduling.recurring-story:pause"
              : "scheduling.recurring-story:resume",
          organizationId: command.actor.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ rule: mapRule(rule), status: "updated" });
    });
  }

  async delete(
    command: RecurringStoryRuleLifecycleCommand,
  ): Promise<RecurringStoryRuleLifecycleResult> {
    return this.#database.$transaction(async (transaction) => {
      const existing = await transaction.recurringStoryRule.findUnique({
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      if (existing === null) {
        return Object.freeze({ status: "not-found" });
      }
      if (existing.version !== command.expectedVersion) {
        return Object.freeze({ status: "version-conflict" });
      }
      // Las materializaciones son el vínculo entre la regla y cada borrador
      // que produjo. Se van con ella; las publicaciones no se tocan, y su
      // snapshot ya conserva la fuente que citaron.
      const { count } =
        await transaction.recurringStoryMaterialization.deleteMany({
          where: {
            organizationId: command.actor.organizationId,
            ruleId: command.ruleId,
          },
        });
      await transaction.recurringStoryRule.delete({
        where: {
          organizationId_id: {
            id: command.ruleId,
            organizationId: command.actor.organizationId,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: command.actor.membershipId,
          entityId: command.ruleId,
          entityType: "recurring_story_rule",
          id: randomUUID(),
          metadata: {
            materializations: count,
            name: existing.name,
            weekdays: existing.weekdays,
          },
          occurredAt: new Date(command.occurredAt),
          operation: "scheduling.recurring-story:delete",
          organizationId: command.actor.organizationId,
          outcome: "success",
        },
      });
      return Object.freeze({ ruleId: command.ruleId, status: "deleted" });
    });
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
      // El barrido corre cada minuto: la foto se lee sólo al crear un
      // borrador, no para descubrir que no hay nada nuevo.
      omit: { photoAlt: true, photoDataUrl: true, photoFocusY: true },
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
    rule: Omit<
      Awaited<
        ReturnType<DatabaseClient["recurringStoryRule"]["findMany"]>
      >[number],
      "photoAlt" | "photoDataUrl" | "photoFocusX" | "photoFocusY" | "photoZoom"
    > &
      Readonly<{ location: LocationRow | null }>,
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
        const localDateValue = new Date(`${localDate}T00:00:00.000Z`);
        const policy = approvalPolicyFromDatabase(rule.approvalPolicy);
        // El estilo se lee junto, dentro de la transacción: un cambio de
        // estilo entre el barrido y este borrador no puede mezclar el diseño
        // de antes con la foto de después.
        const style = await transaction.recurringStoryRule.findUniqueOrThrow({
          select: {
            accent: true,
            designVariant: true,
            kind: true,
            photoAlt: true,
            photoDataUrl: true,
            photoFocusX: true,
            photoFocusY: true,
            photoZoom: true,
            theme: true,
          },
          where: {
            organizationId_id: {
              id: rule.id,
              organizationId: rule.organizationId,
            },
          },
        });

        let resolution: RecurringStoryDraftResolution;
        let scopeName: string;
        let locationVersion: number | null;
        if (rule.location === null) {
          const locations = await transaction.location.findMany({
            include: { brand: { select: { profile: true } } },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            where: { organizationId: rule.organizationId },
          });
          const overrides = await transaction.locationDayOverride.findMany({
            where: {
              localDate: localDateValue,
              locationId: { in: locations.map((location) => location.id) },
              organizationId: rule.organizationId,
            },
          });
          const overrideByLocation = new Map(
            overrides.map((override) => [override.locationId, override]),
          );
          resolution = resolveEveryLocationStoryDraft({
            capturedAt,
            designVariant: style.designVariant,
            locations: locations.map((location) => {
              const dayOverride = dayOverrideSource(
                localDate,
                overrideByLocation.get(location.id) ?? null,
              );
              return {
                ...(dayOverride === undefined ? {} : { dayOverride }),
                location: locationSource(location),
              };
            }),
            occurrence,
            policy,
          });
          scopeName = "Todas las sucursales";
          locationVersion = null;
        } else {
          const location = rule.location;
          const dayOverride = dayOverrideSource(
            localDate,
            await transaction.locationDayOverride.findUnique({
              where: {
                organizationId_locationId_localDate: {
                  localDate: localDateValue,
                  locationId: location.id,
                  organizationId: rule.organizationId,
                },
              },
            }),
          );
          resolution = resolveRecurringStoryDraft({
            capturedAt,
            ...(dayOverride === undefined ? {} : { dayOverride }),
            designVariant: style.designVariant,
            kind: style.kind,
            location: locationSource(location),
            occurrence,
            policy,
          });
          scopeName = location.name;
          locationVersion = location.version;
        }

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
              locationVersion,
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
                locationVersion,
                reason: resolution.reason,
              },
              status,
            },
          });
          return "blocked" as const;
        }

        const publicationId = randomUUID();
        const revisionId = randomUUID();
        const content = { caption: resolution.caption, products: [] };
        const designDocument = recurringStoryDesignDocument({
          accent: style.accent,
          content: resolution.designContent,
          designVariant: style.designVariant,
          kind: style.kind,
          localDate,
          photo: mapPhoto(style),
          ruleId: rule.id,
          theme: style.theme,
        });
        const contentHash = sha256(JSON.stringify({ content, designDocument }));
        await transaction.publication.create({
          data: {
            createdByMembershipId: rule.createdByMembershipId,
            id: publicationId,
            locationId: rule.locationId,
            organizationId: rule.organizationId,
            scheduledFor: new Date(occurrence.scheduledAt),
            timeZone: rule.timeZone,
            title: `${style.kind === "lubricentro" ? "Lubricentro" : "Ya abrimos"} · ${scopeName} · ${localDate}`,
          },
        });
        await transaction.publicationRevision.create({
          data: {
            content,
            contentHash,
            createdByMembershipId: rule.createdByMembershipId,
            designDocument: prismaJson(designDocument),
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
            locationVersion,
            occurrenceKey: occurrence.occurrenceKey,
            organizationId: rule.organizationId,
            publicationId,
            resolution: occurrence.resolution,
            requiresHumanApproval: resolution.requiresHumanApproval,
            ruleId: rule.id,
            scheduledAt: new Date(occurrence.scheduledAt),
            sourceSnapshot: recurringStorySourceToJson(
              resolution.source,
            ) as Prisma.InputJsonObject,
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
              locationVersion,
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
