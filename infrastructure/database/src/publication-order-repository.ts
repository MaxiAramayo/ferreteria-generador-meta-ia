/**
 * Persistencia de órdenes de publicación.
 *
 * Este repositorio implementa dos contratos sobre las mismas dos tablas, y no es
 * casualidad: `PublicationOrderRepository` gobierna el ciclo de la orden y
 * `MetaPublishingAttemptJournal` es la vista que los publicadores tienen de una
 * de sus filas. Separarlos en tablas distintas obligaría a mantener sincronizado
 * el estado del intento en dos lugares, que es exactamente la clase de
 * desincronización que hace publicar dos veces.
 *
 * La regla de secuencia vive en el `WHERE` del `UPDATE`, no en la aplicación.
 * Una escritura sólo entra si la fila todavía está en la secuencia anterior; dos
 * trabajadores sobre el mismo destino compiten en la base y uno pierde. Que la
 * condición esté en el motor y no en memoria es lo que la vuelve confiable bajo
 * concurrencia real.
 *
 * El estado agregado no se guarda: se calcula sobre los destinos con
 * `publicationOrderStatus`. Un campo agregado podría quedar diciendo `published`
 * sobre una orden cuyo destino falló.
 */

import {
  publicationOrderStatus,
  publicationOrderTopic,
  type CancelPublicationOrderInput,
  type CancelPublicationOrderResult,
  type MetaPublishingAttemptJournal,
  type MetaPublishingAttemptRecord,
  type MetaPublishingAttemptScope,
  type MetaPublishingAttemptWriteResult,
  type PublicationOrderCompletionResult,
  type PublicationOrderJob,
  type PublicationOrderRecord,
  type PublicationOrderRepository,
  type PublicationOrderTargetRecord,
  type PublicationTarget,
  type RequestPublicationOrderInput,
  type RequestPublicationOrderResult,
  type SafeJsonObject,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";
import {
  claimReliableOperation,
  commitReliableOperation,
  discardReliableOperationClaim,
  reliableCommit,
} from "./reliable-operation-repository.ts";

const targetSelection = {
  attemptId: true,
  failureCode: true,
  failureDetail: true,
  failureRetryable: true,
  remotePermalink: true,
  remotePostId: true,
  sequence: true,
  stagedMediaId: true,
  state: true,
  target: true,
  updatedAt: true,
} satisfies Prisma.PublicationOrderTargetSelect;

const orderSelection = {
  approvalSnapshotId: true,
  cancelledAt: true,
  createdAt: true,
  id: true,
  organizationId: true,
  publicationId: true,
  requestedByMembershipId: true,
  settledAt: true,
  targets: { orderBy: { target: "asc" }, select: targetSelection },
  updatedAt: true,
} satisfies Prisma.PublicationOrderSelect;

type OrderRow = Prisma.PublicationOrderGetPayload<{
  select: typeof orderSelection;
}>;
type TargetRow = Prisma.PublicationOrderTargetGetPayload<{
  select: typeof targetSelection;
}>;

/**
 * Identidad del intento tal como la conocen los publicadores.
 *
 * Se deriva de la orden y el destino en vez de guardarse: dos fuentes para la
 * misma clave se desincronizan, y esta clave es la que evita duplicar.
 */
export function publicationTargetKey(
  orderId: string,
  target: PublicationTarget,
): string {
  return `${orderId}:${target}`;
}

function mapTarget(
  orderId: string,
  row: TargetRow,
): PublicationOrderTargetRecord {
  return Object.freeze({
    ...(row.failureCode === null ? {} : { failureCode: row.failureCode }),
    ...(row.failureDetail === null ? {} : { failureDetail: row.failureDetail }),
    ...(row.failureRetryable === null
      ? {}
      : { failureRetryable: row.failureRetryable }),
    publicationTargetId: publicationTargetKey(orderId, row.target),
    ...(row.remotePermalink === null
      ? {}
      : { remotePermalink: row.remotePermalink }),
    ...(row.remotePostId === null ? {} : { remotePostId: row.remotePostId }),
    state: row.state,
    target: row.target,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function mapOrder(row: OrderRow): PublicationOrderRecord {
  return Object.freeze({
    approvalSnapshotId: row.approvalSnapshotId,
    ...(row.cancelledAt === null
      ? {}
      : { cancelledAt: row.cancelledAt.toISOString() }),
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    organizationId: row.organizationId,
    publicationId: row.publicationId,
    requestedByMembershipId: row.requestedByMembershipId,
    targets: Object.freeze(
      row.targets.map((entry) => mapTarget(row.id, entry)),
    ),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** `orden:destino`, partido en sus dos mitades. */
function splitTargetKey(
  publicationTargetId: string,
): Readonly<{ orderId: string; target: string }> | null {
  const separator = publicationTargetId.lastIndexOf(":");
  if (separator <= 0) return null;
  return Object.freeze({
    orderId: publicationTargetId.slice(0, separator),
    target: publicationTargetId.slice(separator + 1),
  });
}

function isPublicationTarget(value: string): value is PublicationTarget {
  return (
    value === "instagram_feed" ||
    value === "instagram_story" ||
    value === "facebook_page"
  );
}

function replayedOrder(responseBody: unknown): RequestPublicationOrderResult {
  if (typeof responseBody !== "object" || responseBody === null) {
    throw new Error("La respuesta idempotente almacenada es inválida.");
  }
  const body = responseBody as Record<string, unknown>;
  const orderId = body["orderId"];
  const publicationId = body["publicationId"];
  const version = body["version"];
  if (
    typeof orderId !== "string" ||
    typeof publicationId !== "string" ||
    typeof version !== "number"
  ) {
    throw new Error("La respuesta idempotente almacenada es inválida.");
  }
  return Object.freeze({
    orderId,
    publicationId,
    replayed: true,
    status: "accepted",
    version,
  });
}

export class PrismaPublicationOrderRepository
  implements PublicationOrderRepository, MetaPublishingAttemptJournal
{
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async request(
    input: RequestPublicationOrderInput,
  ): Promise<RequestPublicationOrderResult> {
    const targets = Object.freeze([...new Set(input.targets)]);
    if (targets.length === 0) {
      return Object.freeze({ status: "invalid-target" });
    }

    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedOrder(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }

      const publication = await transaction.publication.findFirst({
        select: { status: true, version: true },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
        },
      });
      if (publication === null) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      if (publication.version !== input.expectedVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      // Sólo un snapshot aprobado puede publicarse. La comprobación mira el
      // estado y el snapshot juntos: un estado aprobado sin snapshot sería una
      // aprobación que no dejó nada inmutable detrás.
      if (
        publication.status !== "approved" &&
        publication.status !== "scheduled"
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-approved" });
      }
      const snapshot = await transaction.approvalSnapshot.findFirst({
        orderBy: { approvedAt: "desc" },
        select: { id: true },
        where: {
          organizationId: input.organizationId,
          publicationId: input.publicationId,
        },
      });
      if (snapshot === null) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-approved" });
      }

      const version = publication.version + 1;
      const updated = await transaction.publication.updateMany({
        data: {
          failureCode: null,
          failureMessage: null,
          failureOccurredAt: null,
          failureRetryable: null,
          status: "publishing",
          version,
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
          status: publication.status,
          version: publication.version,
        },
      });
      if (updated.count !== 1) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }

      const order = await transaction.publicationOrder.create({
        data: {
          approvalSnapshotId: snapshot.id,
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          requestedByMembershipId: input.actorMembershipId,
          // `organizationId` no viaja acá: Prisma lo deriva de la orden padre a
          // través de la clave foránea compuesta del destino. Pasarlo explícito
          // es un argumento desconocido y la creación falla entera.
          targets: {
            create: targets.map((target) => ({ target })),
          },
        },
        select: { id: true },
      });
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          // El snapshot no viaja en la transición: `state_transitions_approval_check`
          // reserva esa columna al comando `approve`. La orden ya guarda a cuál
          // apunta, así que la trazabilidad no depende de repetirlo acá.
          commandType: "advance",
          fromStatus: publication.status,
          fromVersion: publication.version,
          occurredAt: new Date(input.reliableOperation.occurredAt),
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          toStatus: "publishing",
          toVersion: version,
        },
      });

      const responseBody = {
        orderId: order.id,
        publicationId: input.publicationId,
        version,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(input, claim.recordId, responseBody, {
        entityId: input.publicationId,
        entityType: "publication_order",
        metadata: { orderId: order.id, targetCount: targets.length },
        outbox: [
          {
            aggregateId: order.id,
            aggregateType: "publication_order",
            availableAt: input.reliableOperation.occurredAt,
            eventId: input.reliableOperation.outboxEventId,
            organizationId: input.organizationId,
            payload: {
              orderId: order.id,
              publicationId: input.publicationId,
            },
            topic: publicationOrderTopic,
          },
        ],
      });
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la solicitud idempotente.");
      }
      return Object.freeze({ ...responseBody, status: "accepted" });
    });
  }

  async findById(
    organizationId: string,
    orderId: string,
  ): Promise<PublicationOrderRecord | null> {
    const row = await this.#database.publicationOrder.findFirst({
      select: orderSelection,
      where: { id: orderId, organizationId },
    });
    return row === null ? null : mapOrder(row);
  }

  async findJob(
    organizationId: string,
    orderId: string,
  ): Promise<PublicationOrderJob | null> {
    const row = await this.#database.publicationOrder.findFirst({
      select: {
        ...orderSelection,
        approvalSnapshot: { select: { contentHash: true, snapshot: true } },
      },
      where: { id: orderId, organizationId },
    });
    if (row === null) return null;
    const order = mapOrder(row);
    return Object.freeze({
      approvalSnapshotId: row.approvalSnapshotId,
      contentHash: row.approvalSnapshot.contentHash,
      orderId: row.id,
      organizationId: row.organizationId,
      publicationId: row.publicationId,
      snapshot: row.approvalSnapshot.snapshot,
      targets: order.targets,
    });
  }

  /**
   * Cancela la orden.
   *
   * Marca la orden y no toca los destinos: lo que ya salió sigue publicado y lo
   * que no salió deja de admitir intentos porque `pendingPublicationTargets`
   * devuelve vacío para una orden cancelada. Borrar o reescribir destinos
   * exitosos sería perder la evidencia de una acción irreversible.
   */
  async cancel(
    input: CancelPublicationOrderInput,
  ): Promise<CancelPublicationOrderResult> {
    return this.#database.$transaction(async (transaction) => {
      const row = await transaction.publicationOrder.findFirst({
        select: { ...orderSelection, settledAt: true },
        where: { id: input.orderId, organizationId: input.organizationId },
      });
      if (row === null) return Object.freeze({ status: "not-found" });
      if (row.cancelledAt !== null || row.settledAt !== null) {
        return Object.freeze({
          order: mapOrder(row),
          status: "already-settled",
        });
      }
      const updated = await transaction.publicationOrder.updateMany({
        data: {
          cancelledAt: new Date(input.cancelledAt),
          cancelledReasonCode: input.reasonCode,
        },
        where: {
          cancelledAt: null,
          id: input.orderId,
          organizationId: input.organizationId,
          settledAt: null,
        },
      });
      if (updated.count !== 1) {
        return Object.freeze({
          order: mapOrder(row),
          status: "already-settled",
        });
      }
      const after = await transaction.publicationOrder.findFirstOrThrow({
        select: orderSelection,
        where: { id: input.orderId, organizationId: input.organizationId },
      });
      return Object.freeze({ order: mapOrder(after), status: "cancelled" });
    });
  }

  /**
   * Cierra la orden con el estado que sus destinos determinan y lleva la
   * publicación al mismo estado, en una sola transacción: dejar la orden
   * cerrada y la publicación en `publishing` mostraría dos verdades distintas.
   */
  async settle(
    organizationId: string,
    orderId: string,
    settledAt: string,
  ): Promise<PublicationOrderCompletionResult> {
    return this.#database.$transaction(async (transaction) => {
      const row = await transaction.publicationOrder.findFirst({
        select: orderSelection,
        where: { id: orderId, organizationId },
      });
      if (row === null) return Object.freeze({ status: "not-found" });
      const order = mapOrder(row);
      const status = publicationOrderStatus(order.targets);

      const publication = await transaction.publication.findFirst({
        select: { status: true, version: true },
        where: { id: order.publicationId, organizationId },
      });
      if (publication === null) return Object.freeze({ status: "not-found" });
      const version = publication.version + 1;
      const updated = await transaction.publication.updateMany({
        data: { status, version },
        where: {
          id: order.publicationId,
          organizationId,
          version: publication.version,
        },
      });
      if (updated.count !== 1) return Object.freeze({ status: "conflict" });

      await transaction.publicationOrder.updateMany({
        data: { settledAt: new Date(settledAt) },
        where: { id: orderId, organizationId, settledAt: null },
      });
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: order.requestedByMembershipId,
          commandType: "advance",
          fromStatus: publication.status,
          fromVersion: publication.version,
          occurredAt: new Date(settledAt),
          organizationId,
          publicationId: order.publicationId,
          toStatus: status,
          toVersion: version,
        },
      });
      return Object.freeze({ status: "completed", version });
    });
  }

  // --- MetaPublishingAttemptJournal ---

  async find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null> {
    const key = splitTargetKey(scope.publicationTargetId);
    if (key === null || !isPublicationTarget(key.target)) return null;
    const row = await this.#database.publicationOrderTarget.findFirst({
      select: targetSelection,
      where: {
        orderId: key.orderId,
        organizationId: scope.organizationId,
        target: key.target,
      },
    });
    if (row === null) return null;
    return Object.freeze({
      attemptId: row.attemptId ?? "",
      ...(row.failureCode === null
        ? {}
        : {
            failure: Object.freeze({
              code: row.failureCode,
              detail: row.failureDetail ?? "",
              retryable: row.failureRetryable ?? false,
            }),
          }),
      organizationId: scope.organizationId,
      publicationTargetId: scope.publicationTargetId,
      ...(row.remotePermalink === null
        ? {}
        : { remotePermalink: row.remotePermalink }),
      ...(row.remotePostId === null ? {} : { remotePostId: row.remotePostId }),
      sequence: row.sequence,
      ...(row.stagedMediaId === null
        ? {}
        : { stagedMediaId: row.stagedMediaId }),
      state: row.state,
      updatedAt: row.updatedAt.toISOString(),
    } as MetaPublishingAttemptRecord);
  }

  /**
   * Escribe el intento sólo si continúa a la secuencia almacenada.
   *
   * La condición viaja en el `WHERE`, así que la decide el motor y no la
   * aplicación: dos trabajadores que leyeron la misma fila compiten en la base
   * y exactamente uno gana. El que pierde recibe `conflict` y se detiene sin
   * publicar.
   */
  async save(
    record: MetaPublishingAttemptRecord,
  ): Promise<MetaPublishingAttemptWriteResult> {
    const key = splitTargetKey(record.publicationTargetId);
    if (key === null || !isPublicationTarget(key.target)) return "conflict";
    const updated = await this.#database.publicationOrderTarget.updateMany({
      data: {
        attemptId: record.attemptId,
        failureCode: record.failure?.code ?? null,
        failureDetail: record.failure?.detail ?? null,
        failureRetryable: record.failure?.retryable ?? null,
        remotePermalink: record.remotePermalink ?? null,
        remotePostId: record.remotePostId ?? null,
        sequence: record.sequence,
        stagedMediaId: record.stagedMediaId ?? null,
        state: record.state,
      },
      where: {
        orderId: key.orderId,
        organizationId: record.organizationId,
        sequence: record.sequence - 1,
        target: key.target,
      },
    });
    return updated.count === 1 ? "saved" : "conflict";
  }
}
