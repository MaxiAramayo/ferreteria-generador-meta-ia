import type {
  ClaimIdempotencyInput,
  ClaimOutboxBatchInput,
  FailOutboxMessageInput,
  IdempotencyClaimResult,
  OutboxMessageRecord,
  OutboxMessageStatus,
  OutboxRepository,
  ReliableOperationCommitInput,
  ReliableOperationRepository,
  SafeJsonObject,
  SafeJsonValue,
} from "@aramayo/domain";
import {
  reliableOperationLimits,
  validateAuditMetadata,
  validateIdempotencyResponse,
  validateOutboxPayload,
  validateOutboxTopic,
  validateReliableOperationName,
  validateSha256,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import { Prisma } from "./generated/prisma/client.ts";

function prismaNestedJson(value: SafeJsonValue): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(prismaNestedJson);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        prismaNestedJson(entry),
      ]),
    );
  }
  return value;
}

function prismaJsonObject(value: SafeJsonObject): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, prismaNestedJson(entry)]),
  );
}

function safeJsonValue(value: unknown, path: string): SafeJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry, index) =>
        safeJsonValue(entry, `${path}[${String(index)}]`),
      ),
    );
  }
  if (typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          safeJsonValue(entry, `${path}.${key}`),
        ]),
      ),
    );
  }
  throw new TypeError(`${path} no conserva JSON seguro.`);
}

function isSafeJsonArray(
  value: SafeJsonValue,
): value is readonly SafeJsonValue[] {
  return Array.isArray(value);
}

function safeJsonObject(value: unknown, path: string): SafeJsonObject {
  const parsed = safeJsonValue(value, path);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    isSafeJsonArray(parsed)
  ) {
    throw new TypeError(`${path} debe ser un objeto JSON.`);
  }
  return parsed;
}

function assertPositiveLimit(limit: number, maximum: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new RangeError(`Limit must be between 1 and ${String(maximum)}.`);
  }
}

function validateClaim(input: ClaimIdempotencyInput): void {
  validateReliableOperationName(input.operation);
  validateSha256(input.keyHash, "keyHash");
  validateSha256(input.requestHash, "requestHash");
  if (
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.now()
  ) {
    throw new RangeError("Idempotency expiry must be in the future.");
  }
}

type IdempotencyRow = Readonly<{
  expiresAt: Date;
  id: string;
  requestHash: string;
  responseBody: unknown;
  responseStatus: number | null;
  status: "completed" | "processing";
}>;

async function insertClaim(
  transaction: Prisma.TransactionClient,
  input: ClaimIdempotencyInput,
): Promise<readonly { id: string }[]> {
  return transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO "idempotency_records" (
      "organization_id",
      "actor_membership_id",
      "operation",
      "key_hash",
      "request_hash",
      "expires_at"
    )
    VALUES (
      ${input.organizationId}::uuid,
      ${input.actorMembershipId}::uuid,
      ${input.operation},
      ${input.keyHash},
      ${input.requestHash},
      ${new Date(input.expiresAt)}
    )
    ON CONFLICT (
      "organization_id",
      "actor_membership_id",
      "operation",
      "key_hash"
    ) DO NOTHING
    RETURNING "id"
  `);
}

function replayResult(row: IdempotencyRow): IdempotencyClaimResult {
  if (row.responseStatus === null || row.responseBody === null) {
    throw new Error("La operación completada no conserva su respuesta.");
  }
  return Object.freeze({
    responseBody: safeJsonObject(row.responseBody, "idempotency.responseBody"),
    responseStatus: row.responseStatus,
    status: "replayed",
  });
}

export async function claimReliableOperation(
  transaction: Prisma.TransactionClient,
  input: ClaimIdempotencyInput,
): Promise<IdempotencyClaimResult> {
  validateClaim(input);
  const inserted = await insertClaim(transaction, input);
  const created = inserted[0];
  if (created !== undefined) {
    return Object.freeze({ recordId: created.id, status: "claimed" });
  }

  const rows = await transaction.$queryRaw<IdempotencyRow[]>(Prisma.sql`
    SELECT
      "id",
      "request_hash" AS "requestHash",
      "status"::text AS "status",
      "response_status" AS "responseStatus",
      "response_body" AS "responseBody",
      "expires_at" AS "expiresAt"
    FROM "idempotency_records"
    WHERE "organization_id" = ${input.organizationId}::uuid
      AND "actor_membership_id" = ${input.actorMembershipId}::uuid
      AND "operation" = ${input.operation}
      AND "key_hash" = ${input.keyHash}
    FOR UPDATE
  `);
  const existing = rows[0];
  if (existing === undefined) {
    throw new Error("La clave idempotente desapareció durante el reclamo.");
  }
  if (existing.requestHash !== input.requestHash) {
    return Object.freeze({ status: "request-conflict" });
  }
  if (existing.status === "completed") {
    return replayResult(existing);
  }
  if (existing.expiresAt.getTime() > Date.now()) {
    return Object.freeze({
      retryAfter: existing.expiresAt.toISOString(),
      status: "in-progress",
    });
  }

  await transaction.idempotencyRecord.delete({
    where: { id: existing.id },
  });
  const retried = await insertClaim(transaction, input);
  const replacement = retried[0];
  if (replacement === undefined) {
    throw new Error("No se pudo recuperar la clave idempotente vencida.");
  }
  return Object.freeze({
    recordId: replacement.id,
    status: "claimed",
  });
}

export async function discardReliableOperationClaim(
  transaction: Prisma.TransactionClient,
  recordId: string,
): Promise<void> {
  const deleted = await transaction.idempotencyRecord.deleteMany({
    where: { id: recordId, status: "processing" },
  });
  if (deleted.count !== 1) {
    throw new Error("No se pudo descartar el reclamo idempotente.");
  }
}

export async function commitReliableOperation(
  transaction: Prisma.TransactionClient,
  input: ReliableOperationCommitInput,
): Promise<boolean> {
  validateReliableOperationName(input.audit.operation);
  validateAuditMetadata(input.audit.metadata);
  validateReliableOperationName(input.idempotency.operation);
  validateSha256(input.idempotency.keyHash, "keyHash");
  validateIdempotencyResponse(input.idempotency.responseBody);
  const idempotencyExpiresAt = new Date(input.idempotency.expiresAt);
  const occurredAt = new Date(input.audit.occurredAt);
  if (
    !Number.isFinite(idempotencyExpiresAt.getTime()) ||
    !Number.isFinite(occurredAt.getTime()) ||
    idempotencyExpiresAt <= occurredAt
  ) {
    throw new RangeError("Idempotency completion expiry is invalid.");
  }
  input.outbox.forEach((message) => {
    validateOutboxTopic(message.topic);
    validateOutboxPayload(message.payload);
  });

  const completed = await transaction.idempotencyRecord.updateMany({
    data: {
      completedAt: new Date(input.audit.occurredAt),
      expiresAt: idempotencyExpiresAt,
      responseBody: prismaJsonObject(input.idempotency.responseBody),
      responseStatus: input.idempotency.responseStatus,
      status: "completed",
    },
    where: {
      actorMembershipId: input.idempotency.actorMembershipId,
      id: input.idempotency.recordId,
      keyHash: input.idempotency.keyHash,
      operation: input.idempotency.operation,
      organizationId: input.idempotency.organizationId,
      status: "processing",
    },
  });
  if (completed.count !== 1) {
    return false;
  }

  await transaction.auditEvent.create({
    data: {
      actorMembershipId: input.audit.actorMembershipId ?? null,
      entityId: input.audit.entityId ?? null,
      entityType: input.audit.entityType,
      id: input.audit.eventId,
      metadata: prismaJsonObject(input.audit.metadata),
      occurredAt: new Date(input.audit.occurredAt),
      operation: input.audit.operation,
      organizationId: input.audit.organizationId,
      outcome: input.audit.outcome,
    },
  });
  if (input.outbox.length > 0) {
    await transaction.outboxMessage.createMany({
      data: input.outbox.map((message) => ({
        aggregateId: message.aggregateId,
        aggregateType: message.aggregateType,
        availableAt: new Date(message.availableAt),
        id: message.eventId,
        organizationId: message.organizationId,
        payload: prismaJsonObject(message.payload),
        topic: message.topic,
      })),
    });
  }
  return true;
}

export class PrismaReliableOperationRepository implements ReliableOperationRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async claim(input: ClaimIdempotencyInput): Promise<IdempotencyClaimResult> {
    return this.#database.$transaction((transaction) =>
      claimReliableOperation(transaction, input),
    );
  }

  async commit(input: ReliableOperationCommitInput): Promise<boolean> {
    return this.#database.$transaction((transaction) =>
      commitReliableOperation(transaction, input),
    );
  }

  async purgeExpired(
    expiredBefore: string,
    limit: number,
  ): Promise<Readonly<{ deleted: number }>> {
    assertPositiveLimit(limit, 1_000);
    const deleted = await this.#database.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH "expired" AS (
        SELECT "id"
        FROM "idempotency_records"
        WHERE "status" = 'completed'
          AND "expires_at" < ${new Date(expiredBefore)}
        ORDER BY "expires_at" ASC, "id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "idempotency_records" AS "record"
      USING "expired"
      WHERE "record"."id" = "expired"."id"
      RETURNING "record"."id"
    `);
    return Object.freeze({ deleted: deleted.length });
  }
}

type OutboxRow = Readonly<{
  aggregateId: string;
  aggregateType: string;
  attempts: number;
  availableAt: Date;
  id: string;
  organizationId: string;
  payload: unknown;
  status: OutboxMessageStatus;
  topic: string;
}>;

function mapOutbox(row: OutboxRow): OutboxMessageRecord {
  return Object.freeze({
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    attempts: row.attempts,
    availableAt: row.availableAt.toISOString(),
    eventId: row.id,
    organizationId: row.organizationId,
    payload: safeJsonObject(row.payload, "outbox.payload"),
    status: row.status,
    topic: row.topic,
  });
}

export class PrismaOutboxRepository implements OutboxRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async claimBatch(
    input: ClaimOutboxBatchInput,
  ): Promise<readonly OutboxMessageRecord[]> {
    assertPositiveLimit(
      input.limit,
      reliableOperationLimits.outboxBatchMaximum,
    );
    const at = new Date(input.at);
    const leaseExpiresAt = new Date(input.leaseExpiresAt);
    if (
      !Number.isFinite(at.getTime()) ||
      !Number.isFinite(leaseExpiresAt.getTime()) ||
      leaseExpiresAt <= at
    ) {
      throw new RangeError("Outbox lease is invalid.");
    }

    return this.#database.$transaction(async (transaction) => {
      await transaction.outboxMessage.updateMany({
        data: {
          lastErrorCode: "lease-exhausted",
          lastErrorMessage:
            "El mensaje agotó sus intentos después de perder el lease.",
          leaseExpiresAt: null,
          lockedAt: null,
          lockedBy: null,
          status: "dead_letter",
        },
        where: {
          attempts: { gte: reliableOperationLimits.outboxAttemptsMaximum },
          leaseExpiresAt: { lte: at },
          status: "processing",
        },
      });

      const rows = await transaction.$queryRaw<OutboxRow[]>(Prisma.sql`
        WITH "candidates" AS (
          SELECT "id"
          FROM "outbox_messages"
          WHERE "attempts" < ${reliableOperationLimits.outboxAttemptsMaximum}
            AND (
              (
                "status" = 'pending'
                AND "available_at" <= ${at}
              )
              OR (
                "status" = 'processing'
                AND "lease_expires_at" <= ${at}
              )
            )
          ORDER BY "available_at" ASC, "created_at" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "outbox_messages" AS "message"
        SET
          "status" = 'processing',
          "attempts" = "message"."attempts" + 1,
          "locked_at" = ${at},
          "lease_expires_at" = ${leaseExpiresAt},
          "locked_by" = ${input.workerId},
          "updated_at" = ${at}
        FROM "candidates"
        WHERE "message"."id" = "candidates"."id"
        RETURNING
          "message"."id",
          "message"."organization_id" AS "organizationId",
          "message"."topic",
          "message"."aggregate_type" AS "aggregateType",
          "message"."aggregate_id" AS "aggregateId",
          "message"."payload",
          "message"."status"::text AS "status",
          "message"."attempts",
          "message"."available_at" AS "availableAt"
      `);
      return Object.freeze(rows.map(mapOutbox));
    });
  }

  async markDelivered(
    eventId: string,
    workerId: string,
    deliveredAt: string,
  ): Promise<boolean> {
    const delivered = await this.#database.outboxMessage.updateMany({
      data: {
        deliveredAt: new Date(deliveredAt),
        lastErrorCode: null,
        lastErrorMessage: null,
        leaseExpiresAt: null,
        lockedAt: null,
        lockedBy: null,
        status: "delivered",
      },
      where: { id: eventId, lockedBy: workerId, status: "processing" },
    });
    return delivered.count === 1;
  }

  async markFailed(
    input: FailOutboxMessageInput,
  ): Promise<OutboxMessageStatus> {
    return this.#database.$transaction(async (transaction) => {
      const current = await transaction.outboxMessage.findFirst({
        select: { attempts: true },
        where: {
          id: input.eventId,
          lockedBy: input.workerId,
          status: "processing",
        },
      });
      if (current === null) {
        return "processing";
      }
      const exhausted =
        current.attempts >= reliableOperationLimits.outboxAttemptsMaximum;
      const status: OutboxMessageStatus = exhausted ? "dead_letter" : "pending";
      await transaction.outboxMessage.update({
        data: {
          availableAt: new Date(input.retryAt),
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage,
          leaseExpiresAt: null,
          lockedAt: null,
          lockedBy: null,
          status,
          updatedAt: new Date(input.at),
        },
        where: { id: input.eventId },
      });
      return status;
    });
  }

  async purge(
    deliveredBefore: string,
    limit: number,
  ): Promise<Readonly<{ deleted: number }>> {
    assertPositiveLimit(limit, 1_000);
    const deleted = await this.#database.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH "expired" AS (
        SELECT "id"
        FROM "outbox_messages"
        WHERE "status" = 'delivered'
          AND "delivered_at" < ${new Date(deliveredBefore)}
        ORDER BY "delivered_at" ASC, "id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "outbox_messages" AS "message"
      USING "expired"
      WHERE "message"."id" = "expired"."id"
      RETURNING "message"."id"
    `);
    return Object.freeze({ deleted: deleted.length });
  }
}
