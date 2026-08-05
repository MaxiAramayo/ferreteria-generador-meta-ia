/**
 * Persistencia del lote de generación.
 *
 * PostgreSQL conserva el estado canónico: el outbox transporta el trabajo, pero
 * perder un mensaje no pierde el lote y reentregarlo no vuelve a gastar una
 * variante ya resuelta. Las escrituras del worker llevan siempre el estado
 * esperado en el `WHERE`, así que una cancelación que llegó antes gana sin
 * necesidad de bloquear la fila.
 */

import {
  generationRunTopic,
  type DeterministicVisualReason,
  type GenerationRunCancellationOutcome,
  type GenerationRunCompletion,
  type GenerationRunListFilter,
  type GenerationRunRecord,
  type GenerationRunRepository,
  type GenerationRunRequestRepository,
  type GenerationRunRequestResult,
  type GenerationRunReservation,
  type GenerationRunStatus,
  type GenerationRunWriteOutcome,
  type GenerationVariantCompletion,
  type GenerationVariantRecord,
  type ImageGenerationFailureCode,
  type OrganizationScope,
  type PaginatedRecords,
  type RequestGenerationRunInput,
  type GenerationDeterministicVariantWrite,
  type GenerationVariantSource,
  type SafeJsonObject,
  type VisualFormatId,
  type VisualProfileId,
  type VisualSubjectKind,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";
import {
  claimReliableOperation,
  commitReliableOperation,
} from "./reliable-operation-repository.ts";

/** Estados en los que el lote todavía admite escrituras del worker. */
const openStatuses = ["pending", "running"] as const;

const variantSelection = {
  attempts: true,
  completedAt: true,
  composedHeight: true,
  composedMediaAssetId: true,
  composedSha256: true,
  composedWidth: true,
  compositionHash: true,
  compositionLayout: true,
  compositionOverlayHash: true,
  compositionTheme: true,
  compositionVersion: true,
  failureCode: true,
  failureCorrection: true,
  failureDetail: true,
  height: true,
  id: true,
  latencyMilliseconds: true,
  mediaAssetId: true,
  model: true,
  position: true,
  requestId: true,
  sha256: true,
  source: true,
  status: true,
  width: true,
} satisfies Prisma.GenerationRunVariantSelect;

const runSelection = {
  actorMembershipId: true,
  cancelledAt: true,
  completedAt: true,
  contentBriefRunId: true,
  deterministicReason: true,
  estimatedCostUsd: true,
  format: true,
  id: true,
  organizationId: true,
  profileId: true,
  profileVersion: true,
  promptHash: true,
  promptVersion: true,
  requestedAt: true,
  resolutionDetail: true,
  startedAt: true,
  status: true,
  subjectKind: true,
  totalTokens: true,
  variants: { orderBy: { position: "asc" }, select: variantSelection },
} satisfies Prisma.GenerationRunSelect;

type GenerationRunRow = Prisma.GenerationRunGetPayload<{
  select: typeof runSelection;
}>;
type GenerationRunVariantRow = Prisma.GenerationRunVariantGetPayload<{
  select: typeof variantSelection;
}>;

function toVariant(row: GenerationRunVariantRow): GenerationVariantRecord {
  return {
    attempts: row.attempts,
    completedAt: row.completedAt?.toISOString() ?? null,
    // La composición es indivisible y la base lo garantiza: o están los nueve
    // campos o no está ninguno, así que alcanza con mirar uno para decidir.
    composition:
      row.compositionHash === null || row.composedMediaAssetId === null
        ? null
        : {
            compositionHash: row.compositionHash,
            height: row.composedHeight ?? 0,
            layout: row.compositionLayout ?? "",
            mediaAssetId: row.composedMediaAssetId,
            overlayHash: row.compositionOverlayHash ?? "",
            sha256: row.composedSha256 ?? "",
            theme: row.compositionTheme ?? "",
            version: row.compositionVersion ?? "",
            width: row.composedWidth ?? 0,
          },
    failure:
      row.failureCode === null
        ? null
        : {
            code: row.failureCode as ImageGenerationFailureCode,
            correction: row.failureCorrection ?? "",
            detail: row.failureDetail ?? "",
          },
    height: row.height,
    id: row.id,
    index: row.position,
    latencyMilliseconds: row.latencyMilliseconds,
    mediaAssetId: row.mediaAssetId,
    model: row.model,
    requestId: row.requestId,
    sha256: row.sha256,
    source: row.source as GenerationVariantSource,
    status: row.status,
    width: row.width,
  };
}

function toRecord(row: GenerationRunRow): GenerationRunRecord {
  return {
    actorMembershipId: row.actorMembershipId,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    contentBriefRunId: row.contentBriefRunId,
    estimatedCostUsd:
      row.estimatedCostUsd === null ? null : row.estimatedCostUsd.toNumber(),
    format: row.format as VisualFormatId,
    id: row.id,
    organizationId: row.organizationId,
    // El plan es indivisible y la base lo garantiza: o están los cuatro campos
    // o no está ninguno, así que alcanza con mirar uno para decidir.
    plan:
      row.profileId === null
        ? null
        : {
            format: row.format as VisualFormatId,
            profileId: row.profileId as VisualProfileId,
            profileVersion: row.profileVersion ?? "",
            promptHash: row.promptHash ?? "",
            promptVersion: row.promptVersion ?? "",
          },
    requestedAt: row.requestedAt.toISOString(),
    resolution:
      row.resolutionDetail === null
        ? null
        : {
            deterministicReason:
              row.deterministicReason as DeterministicVisualReason | null,
            detail: row.resolutionDetail,
          },
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
    subjectKind: row.subjectKind as VisualSubjectKind,
    totalTokens: row.totalTokens,
    variantIds: row.variants.map((variant) => variant.id),
    variants: row.variants.map(toVariant),
  };
}

/** Recupera de la respuesta guardada el lote que el pedido original creó. */
function replayedRunId(responseBody: SafeJsonObject): string {
  const runId = responseBody["runId"];
  if (typeof runId !== "string") {
    throw new TypeError("responseBody.runId no conserva texto.");
  }
  return runId;
}

/**
 * Traduce «no se pudo escribir» en el motivo real.
 *
 * Se consulta sólo cuando la escritura condicional no encontró fila, que es el
 * caso raro. Distinguir cancelación de estado ya resuelto importa: lo primero
 * es una decisión del editor y lo segundo, una reentrega.
 */
async function explainMissingWrite(
  database: DatabaseClient,
  scope: OrganizationScope & { readonly id: string },
): Promise<GenerationRunWriteOutcome> {
  const existing = await database.generationRun.findFirst({
    select: { status: true },
    where: { id: scope.id, organizationId: scope.organizationId },
  });
  if (existing === null) {
    return { status: "not-found" };
  }
  return {
    reason: existing.status === "cancelled" ? "cancelled" : "not-open",
    status: "discarded",
  };
}

/**
 * Pedido del lote.
 *
 * Reservar la ejecución con sus variantes y encolar su evento van en la misma
 * transacción: un pedido aceptado que no llegara al outbox quedaría pendiente
 * para siempre, y un evento sin lote reservado no tendría dónde escribir.
 */
export class PrismaGenerationRunRequestRepository implements GenerationRunRequestRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async request(
    input: RequestGenerationRunInput,
  ): Promise<GenerationRunRequestResult> {
    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          // El lote que devuelve el reintento es el de la respuesta guardada, no
          // el que este intento acaba de sortear: es lo que impide que la misma
          // clave idempotente termine facturando dos lotes.
          return {
            runId: replayedRunId(claim.responseBody),
            status: "accepted" as const,
          };
        case "request-conflict":
          return { status: "idempotency-conflict" as const };
        case "in-progress":
          return {
            retryAfter: claim.retryAfter,
            status: "in-progress" as const,
          };
        case "claimed":
          break;
      }

      await transaction.generationRun.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          contentBriefRunId: input.contentBriefRunId,
          format: input.format,
          id: input.id,
          organizationId: input.organizationId,
          requestedAt: new Date(input.requestedAt),
          status: "pending",
          subjectKind: input.subjectKind,
          totalTokens: 0,
          // La organización de la variante no se declara: Prisma la deriva del
          // lote, que es justamente lo que impide que una variante termine
          // colgando de otra organización.
          variants: {
            create: input.variantIds.map((variantId, position) => ({
              attempts: 0,
              id: variantId,
              latencyMilliseconds: 0,
              position,
              status: "pending" as const,
            })),
          },
        },
      });

      const committed = await commitReliableOperation(transaction, {
        audit: {
          actorMembershipId: input.actorMembershipId,
          entityId: input.id,
          entityType: "generation-run",
          eventId: input.reliableOperation.auditEventId,
          // La auditoría conserva el tamaño del lote y su origen, no el prompt:
          // el prompt todavía no existe y su contenido vive en la ejecución.
          metadata: {
            contentBriefRunId: input.contentBriefRunId,
            format: input.format,
            variants: input.variantIds.length,
          },
          occurredAt: input.reliableOperation.occurredAt,
          operation: input.reliableOperation.claim.operation,
          organizationId: input.organizationId,
          outcome: "success",
        },
        idempotency: {
          actorMembershipId: input.actorMembershipId,
          expiresAt: input.reliableOperation.completedExpiresAt,
          keyHash: input.reliableOperation.claim.keyHash,
          operation: input.reliableOperation.claim.operation,
          organizationId: input.organizationId,
          recordId: claim.recordId,
          responseBody: { runId: input.id },
          responseStatus: 202,
        },
        outbox: [
          {
            aggregateId: input.id,
            aggregateType: "generation-run",
            availableAt: input.reliableOperation.occurredAt,
            eventId: input.reliableOperation.outboxEventId,
            organizationId: input.organizationId,
            payload: { runId: input.id },
            topic: generationRunTopic,
          },
        ],
      });
      if (!committed) {
        throw new Error("No se pudo confirmar el pedido idempotente.");
      }
      return { runId: input.id, status: "accepted" as const };
    });
  }
}

/**
 * Historial de ejecución de generación.
 *
 * Las filas son append-only hacia adelante: un lote nunca vuelve a un estado
 * anterior y reintentar crea otro. Cada escritura del worker exige que el lote
 * siga abierto, que es la defensa de cancelación.
 */
export class PrismaGenerationRunRepository implements GenerationRunRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async reserve(reservation: GenerationRunReservation): Promise<void> {
    await this.#database.generationRun.create({
      data: {
        actorMembershipId: reservation.actorMembershipId,
        contentBriefRunId: reservation.contentBriefRunId,
        format: reservation.format,
        id: reservation.id,
        organizationId: reservation.organizationId,
        requestedAt: new Date(reservation.requestedAt),
        status: "pending",
        subjectKind: reservation.subjectKind,
        totalTokens: 0,
        variants: {
          create: reservation.variantIds.map((variantId, position) => ({
            attempts: 0,
            id: variantId,
            latencyMilliseconds: 0,
            position,
            status: "pending" as const,
          })),
        },
      },
    });
  }

  /**
   * Toma el lote.
   *
   * La transición `pending → running` es además el candado de reentrega: dos
   * entregas del mismo evento compiten por ella y sólo una la gana, así que un
   * mensaje repetido no lanza el lote dos veces.
   */
  async start(input: {
    readonly id: string;
    readonly organizationId: string;
    readonly startedAt: string;
  }): Promise<GenerationRunWriteOutcome> {
    const updated = await this.#database.generationRun.updateMany({
      data: { startedAt: new Date(input.startedAt), status: "running" },
      where: {
        id: input.id,
        organizationId: input.organizationId,
        status: "pending",
      },
    });
    if (updated.count === 1) {
      return { status: "written" };
    }
    return explainMissingWrite(this.#database, {
      id: input.id,
      organizationId: input.organizationId,
    });
  }

  /**
   * Cierra una variante.
   *
   * La condición mira el estado del **lote**, no el de la variante: lo que la
   * cancelación protege es el lote entero, así que una respuesta que llega
   * después de cancelar no se promueve aunque la variante siguiera pendiente.
   */
  async completeVariant(
    completion: GenerationVariantCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const outcome =
      completion.status === "succeeded"
        ? {
            composedHeight: completion.composition.height,
            composedMediaAssetId: completion.composition.mediaAssetId,
            composedSha256: completion.composition.sha256,
            composedWidth: completion.composition.width,
            compositionHash: completion.composition.compositionHash,
            compositionLayout: completion.composition.layout,
            compositionOverlayHash: completion.composition.overlayHash,
            compositionTheme: completion.composition.theme,
            compositionVersion: completion.composition.version,
            failureCode: null,
            failureCorrection: null,
            failureDetail: null,
            height: completion.height,
            mediaAssetId: completion.mediaAssetId,
            model: completion.model,
            sha256: completion.sha256,
            width: completion.width,
          }
        : {
            composedHeight: null,
            composedMediaAssetId: null,
            composedSha256: null,
            composedWidth: null,
            compositionHash: null,
            compositionLayout: null,
            compositionOverlayHash: null,
            compositionTheme: null,
            compositionVersion: null,
            failureCode: completion.failure.code,
            failureCorrection: completion.failure.correction,
            failureDetail: completion.failure.detail,
            height: null,
            mediaAssetId: null,
            model: null,
            sha256: null,
            width: null,
          };
    const updated = await this.#database.generationRunVariant.updateMany({
      data: {
        ...outcome,
        attempts: completion.attempts,
        completedAt: new Date(completedAt),
        latencyMilliseconds: completion.latencyMilliseconds,
        requestId: completion.requestId,
        status: completion.status,
      },
      where: {
        id: completion.variantId,
        organizationId: completion.organizationId,
        run: { is: { status: { in: [...openStatuses] } } },
        runId: completion.runId,
        // Una variante ya resuelta no se reescribe: una reentrega no puede
        // pisar un resultado que ya se cobró.
        status: "pending",
      },
    });
    if (updated.count === 1) {
      return { status: "written" };
    }
    return explainMissingWrite(this.#database, {
      id: completion.runId,
      organizationId: completion.organizationId,
    });
  }

  /**
   * Resuelve una variante que no gastó proveedor.
   *
   * La pieza es enteramente del motor de marca, así que el resultado y su
   * composición se escriben juntos: no hay nada intermedio que valga la pena
   * conservar si algo falla en el medio.
   */
  async completeDeterministicVariant(
    write: GenerationDeterministicVariantWrite,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const { composition } = write;
    const updated = await this.#database.generationRunVariant.updateMany({
      data: {
        completedAt: new Date(completedAt),
        composedHeight: composition.height,
        composedMediaAssetId: composition.mediaAssetId,
        composedSha256: composition.sha256,
        composedWidth: composition.width,
        compositionHash: composition.compositionHash,
        compositionLayout: composition.layout,
        compositionOverlayHash: composition.overlayHash,
        compositionTheme: composition.theme,
        compositionVersion: composition.version,
        source: "deterministic",
        status: "succeeded",
      },
      where: {
        id: write.variantId,
        organizationId: write.organizationId,
        run: { is: { status: { in: [...openStatuses] } } },
        runId: write.runId,
        status: "pending",
      },
    });
    if (updated.count === 1) {
      return { status: "written" };
    }
    return explainMissingWrite(this.#database, {
      id: write.runId,
      organizationId: write.organizationId,
    });
  }

  /**
   * Descarta lo que quedó sin intentar.
   *
   * Una variante que nunca se pidió no gastó nada, así que se cierra como
   * `discarded` y no como fallida: presentarla como fallo sugeriría un problema
   * del proveedor que no ocurrió.
   */
  async discardPendingVariants(input: {
    readonly discardedAt: string;
    readonly organizationId: string;
    readonly runId: string;
  }): Promise<void> {
    await this.#database.generationRunVariant.updateMany({
      data: {
        completedAt: new Date(input.discardedAt),
        status: "discarded",
      },
      where: {
        organizationId: input.organizationId,
        runId: input.runId,
        status: "pending",
      },
    });
  }

  async complete(
    completion: GenerationRunCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const outcome = await this.#database.$transaction(async (transaction) => {
      const updated = await transaction.generationRun.updateMany({
        data: {
          completedAt: new Date(completedAt),
          deterministicReason:
            completion.resolution?.deterministicReason ?? null,
          estimatedCostUsd:
            completion.estimatedCostUsd === null
              ? null
              : new Prisma.Decimal(completion.estimatedCostUsd.toFixed(6)),
          profileId: completion.plan?.profileId ?? null,
          profileVersion: completion.plan?.profileVersion ?? null,
          promptHash: completion.plan?.promptHash ?? null,
          promptVersion: completion.plan?.promptVersion ?? null,
          resolutionDetail: completion.resolution?.detail ?? null,
          status: completion.status,
          totalTokens: completion.totalTokens,
        },
        where: {
          id: completion.id,
          organizationId: completion.organizationId,
          status: { in: [...openStatuses] },
        },
      });
      if (updated.count !== 1) {
        return null;
      }

      // Una variante que quedó pendiente al cerrar el lote nunca se intentó.
      // Dejarla `pending` mostraría progreso eterno sobre un lote terminado.
      await transaction.generationRunVariant.updateMany({
        data: { completedAt: new Date(completedAt), status: "discarded" },
        where: {
          organizationId: completion.organizationId,
          runId: completion.id,
          status: "pending",
        },
      });
      return { status: "written" as const };
    });
    if (outcome !== null) {
      return outcome;
    }
    return explainMissingWrite(this.#database, {
      id: completion.id,
      organizationId: completion.organizationId,
    });
  }

  /**
   * Cancela el lote.
   *
   * No detiene al proveedor —no hay forma— pero sí impide que su respuesta se
   * promueva: las variantes pendientes quedan descartadas y toda escritura
   * posterior encuentra el lote cerrado.
   */
  async cancel(input: {
    readonly cancelledAt: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<GenerationRunCancellationOutcome> {
    const cancelled = await this.#database.$transaction(async (transaction) => {
      const updated = await transaction.generationRun.updateMany({
        data: {
          cancelledAt: new Date(input.cancelledAt),
          status: "cancelled",
        },
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: { in: [...openStatuses] },
        },
      });
      if (updated.count !== 1) {
        return false;
      }
      await transaction.generationRunVariant.updateMany({
        data: { completedAt: new Date(input.cancelledAt), status: "discarded" },
        where: {
          organizationId: input.organizationId,
          runId: input.id,
          status: "pending",
        },
      });
      return true;
    });
    if (cancelled) {
      return { status: "cancelled" };
    }

    const existing = await this.#database.generationRun.findFirst({
      select: { status: true },
      where: { id: input.id, organizationId: input.organizationId },
    });
    return existing === null
      ? { status: "not-found" }
      : {
          resolvedStatus: existing.status satisfies GenerationRunStatus,
          status: "already-resolved",
        };
  }

  async findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<GenerationRunRecord | null> {
    const row = await this.#database.generationRun.findFirst({
      select: runSelection,
      where: { id: scope.id, organizationId: scope.organizationId },
    });
    return row === null ? null : toRecord(row);
  }

  async list(
    filter: GenerationRunListFilter,
  ): Promise<PaginatedRecords<GenerationRunRecord>> {
    const where = {
      organizationId: filter.organizationId,
      ...(filter.actorMembershipId === undefined
        ? {}
        : { actorMembershipId: filter.actorMembershipId }),
      ...(filter.contentBriefRunId === undefined
        ? {}
        : { contentBriefRunId: filter.contentBriefRunId }),
    };
    const [rows, total] = await Promise.all([
      this.#database.generationRun.findMany({
        orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
        select: runSelection,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        where,
      }),
      this.#database.generationRun.count({ where }),
    ]);
    return {
      items: rows.map(toRecord),
      limit: filter.limit,
      page: filter.page,
      total,
    };
  }
}
