import type {
  ContentBrief,
  ContentBriefRunCancellationOutcome,
  ContentBriefRunCompletion,
  ContentBriefRunCompletionOutcome,
  ContentBriefRunEvidence,
  ContentBriefRunListFilter,
  ContentBriefRunRecord,
  ContentBriefRunRepository,
  ContentBriefRunReservation,
  ContentBriefRunToolInvocation,
  OrganizationScope,
  PaginatedRecords,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

/**
 * Convierte una estructura de dominio en JSON de Prisma.
 *
 * A diferencia del serializador de borradores, acepta `null` porque el brief lo
 * usa con significado propio: un subtítulo ausente y una evidencia documental
 * sin instante de lectura son datos, no huecos.
 */
function briefJson(value: unknown, path: string): Prisma.InputJsonValue | null {
  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} contiene un número no finito.`);
      }
      return value;
    case "object": {
      if (value === null) {
        return null;
      }
      return Array.isArray(value)
        ? briefJsonArray(value, path)
        : briefJsonObject(value, path);
    }
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new TypeError(`${path} no es serializable a JSON.`);
  }
}

function briefJsonArray(
  values: readonly unknown[],
  path: string,
): Prisma.InputJsonArray {
  return values.map((entry, index) =>
    briefJson(entry, `${path}[${String(index)}]`),
  );
}

function briefJsonObject(value: object, path: string): Prisma.InputJsonObject {
  const entries: Array<[string, Prisma.InputJsonValue | null]> = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) {
      throw new TypeError(`${path}.${key} es undefined.`);
    }
    entries.push([key, briefJson(entry, `${path}.${key}`)]);
  }
  return Object.fromEntries(entries);
}

const runSelection = {
  actorMembershipId: true,
  attempts: true,
  brief: true,
  cancelledAt: true,
  completedAt: true,
  estimatedCostUsd: true,
  evidence: true,
  id: true,
  cachedInputTokens: true,
  inputTokens: true,
  knowledgeStatus: true,
  latencyMilliseconds: true,
  locationId: true,
  model: true,
  organizationId: true,
  outputTokens: true,
  promptHash: true,
  promptVersion: true,
  reasoningTokens: true,
  rejectionCode: true,
  rejectionMessage: true,
  request: true,
  requestHash: true,
  requestId: true,
  requestedAt: true,
  responseId: true,
  schemaVersion: true,
  status: true,
  toolInvocations: true,
  toolNames: true,
  totalTokens: true,
} satisfies Prisma.ContentBriefRunSelect;

type ContentBriefRunRow = Prisma.ContentBriefRunGetPayload<{
  select: typeof runSelection;
}>;

function jsonArray<Value>(value: Prisma.JsonValue, label: string): Value[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} no conserva una lista JSON.`);
  }
  return value as Value[];
}

function toRecord(row: ContentBriefRunRow): ContentBriefRunRecord {
  return {
    actorMembershipId: row.actorMembershipId,
    attempts: row.attempts,
    brief: row.brief === null ? null : (row.brief as unknown as ContentBrief),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    estimatedCostUsd:
      row.estimatedCostUsd === null ? null : row.estimatedCostUsd.toNumber(),
    evidence: jsonArray<ContentBriefRunEvidence>(row.evidence, "evidence"),
    id: row.id,
    knowledgeStatus: row.knowledgeStatus,
    latencyMilliseconds: row.latencyMilliseconds,
    locationId: row.locationId,
    model: row.model,
    organizationId: row.organizationId,
    promptHash: row.promptHash,
    promptVersion: row.promptVersion,
    rejection:
      row.rejectionCode === null
        ? null
        : { code: row.rejectionCode, message: row.rejectionMessage ?? "" },
    request: row.request,
    requestHash: row.requestHash,
    requestId: row.requestId,
    requestedAt: row.requestedAt.toISOString(),
    responseId: row.responseId,
    schemaVersion: row.schemaVersion,
    status: row.status,
    toolInvocations: jsonArray<ContentBriefRunToolInvocation>(
      row.toolInvocations,
      "toolInvocations",
    ),
    toolNames: jsonArray<string>(row.toolNames, "toolNames"),
    usage: {
      cacheWriteInputTokens: 0,
      cachedInputTokens: row.cachedInputTokens,
      estimatedCostUsd:
        row.estimatedCostUsd === null ? null : row.estimatedCostUsd.toNumber(),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      reasoningTokens: row.reasoningTokens,
      totalTokens: row.totalTokens,
    },
  };
}

/**
 * Historial de ejecución del brief.
 *
 * La API reserva la ejecución y el worker la resuelve. Las filas son
 * append-only: reintentar crea otra ejecución en lugar de editar la anterior, y
 * cerrar una ejecución sólo es posible mientras siga pendiente.
 */
export class PrismaContentBriefRunRepository implements ContentBriefRunRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async reserve(reservation: ContentBriefRunReservation): Promise<void> {
    await this.#database.contentBriefRun.create({
      data: {
        actorMembershipId: reservation.actorMembershipId,
        attempts: 0,
        cachedInputTokens: 0,
        evidence: [],
        id: reservation.id,
        inputTokens: 0,
        // Centinelas explícitos: la ejecución todavía no eligió modelo ni
        // consultó conocimiento. No son valores reales y no deben leerse así.
        knowledgeStatus: "pending",
        latencyMilliseconds: 0,
        locationId: reservation.locationId,
        model: "unselected",
        organizationId: reservation.organizationId,
        outputTokens: 0,
        promptHash: reservation.promptHash,
        promptVersion: reservation.promptVersion,
        reasoningTokens: 0,
        request: reservation.request,
        requestHash: reservation.requestHash,
        requestedAt: new Date(reservation.requestedAt),
        schemaVersion: reservation.schemaVersion,
        status: "pending",
        toolInvocations: [],
        toolNames: [],
        totalTokens: 0,
      },
    });
  }

  async complete(
    completion: ContentBriefRunCompletion,
    completedAt: string,
  ): Promise<ContentBriefRunCompletionOutcome> {
    // El filtro por `pending` es la defensa: si el editor canceló mientras el
    // modelo trabajaba, no hay fila que actualizar y el resultado se descarta.
    const updated = await this.#database.contentBriefRun.updateMany({
      data: {
        attempts: completion.attempts,
        brief:
          completion.brief === null
            ? Prisma.DbNull
            : briefJsonObject(completion.brief, "brief"),
        cachedInputTokens: completion.usage.cachedInputTokens,
        completedAt: new Date(completedAt),
        estimatedCostUsd:
          completion.estimatedCostUsd === null
            ? null
            : new Prisma.Decimal(completion.estimatedCostUsd.toFixed(6)),
        evidence: briefJsonArray(completion.evidence, "evidence"),
        inputTokens: completion.usage.inputTokens,
        knowledgeStatus: completion.knowledgeStatus,
        latencyMilliseconds: completion.latencyMilliseconds,
        model: completion.model,
        outputTokens: completion.usage.outputTokens,
        reasoningTokens: completion.usage.reasoningTokens,
        rejectionCode: completion.rejection?.code ?? null,
        rejectionMessage: completion.rejection?.message ?? null,
        requestId: completion.requestId,
        responseId: completion.responseId,
        status: completion.status,
        toolInvocations: briefJsonArray(
          completion.toolInvocations,
          "toolInvocations",
        ),
        toolNames: briefJsonArray(completion.toolNames, "toolNames"),
        totalTokens: completion.usage.totalTokens,
      },
      where: {
        id: completion.id,
        organizationId: completion.organizationId,
        status: "pending",
      },
    });
    if (updated.count === 1) {
      return { status: "completed" };
    }

    const existing = await this.#database.contentBriefRun.findFirst({
      select: { status: true },
      where: {
        id: completion.id,
        organizationId: completion.organizationId,
      },
    });
    if (existing === null) {
      return { status: "not-found" };
    }
    return {
      reason: existing.status === "cancelled" ? "cancelled" : "not-pending",
      status: "discarded",
    };
  }

  async cancel(input: {
    readonly id: string;
    readonly cancelledAt: string;
    readonly organizationId: string;
  }): Promise<ContentBriefRunCancellationOutcome> {
    const updated = await this.#database.contentBriefRun.updateMany({
      data: { cancelledAt: new Date(input.cancelledAt), status: "cancelled" },
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: "pending",
      },
    });
    if (updated.count === 1) {
      return { status: "cancelled" };
    }

    const existing = await this.#database.contentBriefRun.findFirst({
      select: { status: true },
      where: { id: input.id, organizationId: input.organizationId },
    });
    return existing === null
      ? { status: "not-found" }
      : { resolvedStatus: existing.status, status: "already-resolved" };
  }

  async findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    const row = await this.#database.contentBriefRun.findFirst({
      select: runSelection,
      where: { id: scope.id, organizationId: scope.organizationId },
    });
    return row === null ? null : toRecord(row);
  }

  async list(
    filter: ContentBriefRunListFilter,
  ): Promise<PaginatedRecords<ContentBriefRunRecord>> {
    const where = {
      organizationId: filter.organizationId,
      ...(filter.actorMembershipId === undefined
        ? {}
        : { actorMembershipId: filter.actorMembershipId }),
    };
    const [rows, total] = await Promise.all([
      this.#database.contentBriefRun.findMany({
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        select: runSelection,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        where,
      }),
      this.#database.contentBriefRun.count({ where }),
    ]);
    return {
      items: rows.map(toRecord),
      limit: filter.limit,
      page: filter.page,
      total,
    };
  }
}
