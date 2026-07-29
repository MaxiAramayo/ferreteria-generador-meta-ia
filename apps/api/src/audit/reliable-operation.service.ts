import { createHash, randomUUID } from "node:crypto";

import type {
  AuthenticatedActor,
  IdempotencyClaimResult,
  ReliableMutationContext,
  ReliableOperationRepository,
  SafeJsonObject,
} from "@aramayo/domain";
import {
  validateAuditMetadata,
  validateIdempotencyResponse,
  validateOutboxPayload,
  validateOutboxTopic,
  validateReliableOperationName,
  validateSha256,
} from "@aramayo/domain";
import { Inject, Injectable } from "@nestjs/common";

import { RELIABLE_OPERATION_REPOSITORY } from "../database/database.tokens.ts";

const idempotencyLifetimeMilliseconds = 24 * 60 * 60 * 1_000;
const idempotencyProcessingLeaseMilliseconds = 5 * 60 * 1_000;

export interface ReliableOperationClaim {
  readonly actor: AuthenticatedActor;
  readonly completedExpiresAt: string;
  readonly keyHash: string;
  readonly operation: string;
  readonly recordId: string;
}

export type BeginReliableOperationResult =
  | Readonly<{ claim: ReliableOperationClaim; status: "claimed" }>
  | Exclude<IdempotencyClaimResult, Readonly<{ status: "claimed" }>>;

export interface CompleteReliableOperationInput {
  readonly audit: Readonly<{
    entityId?: string;
    entityType: string;
    metadata: SafeJsonObject;
    outcome: "failure" | "success";
  }>;
  readonly claim: ReliableOperationClaim;
  readonly occurredAt: string;
  readonly outbox: readonly Readonly<{
    aggregateId: string;
    aggregateType: string;
    payload: SafeJsonObject;
    topic: string;
  }>[];
  readonly responseBody: SafeJsonObject;
  readonly responseStatus: number;
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function validateIdempotencyKey(idempotencyKey: string): void {
  if (
    idempotencyKey.length < 16 ||
    idempotencyKey.length > 200 ||
    /\s/u.test(idempotencyKey)
  ) {
    throw new RangeError("Idempotency key is invalid.");
  }
}

function canonicalJson(value: unknown, path = "request"): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`${path} contiene un número no finito.`);
      }
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) {
        return `[${value
          .map((entry, index) =>
            canonicalJson(entry, `${path}[${String(index)}]`),
          )
          .join(",")}]`;
      }
      return `{${Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => {
          if (entry === undefined) {
            throw new TypeError(`${path}.${key} no está definido.`);
          }
          return `${JSON.stringify(key)}:${canonicalJson(entry, `${path}.${key}`)}`;
        })
        .join(",")}}`;
    case "bigint":
    case "function":
    case "symbol":
    case "undefined":
      throw new TypeError(`${path} no es serializable.`);
  }
  throw new TypeError(`${path} no es serializable.`);
}

@Injectable()
export class ReliableOperationService {
  readonly #repository: ReliableOperationRepository;

  constructor(
    @Inject(RELIABLE_OPERATION_REPOSITORY)
    repository: ReliableOperationRepository,
  ) {
    this.#repository = repository;
  }

  prepare(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string,
    requestPayload: unknown,
    at: Date,
  ): ReliableMutationContext {
    validateReliableOperationName(operation);
    validateIdempotencyKey(idempotencyKey);
    const occurredAt = at.toISOString();
    return Object.freeze({
      auditEventId: randomUUID(),
      claim: Object.freeze({
        actorMembershipId: actor.membershipId,
        expiresAt: new Date(
          at.getTime() + idempotencyProcessingLeaseMilliseconds,
        ).toISOString(),
        keyHash: hash(idempotencyKey),
        operation,
        organizationId: actor.organizationId,
        requestHash: hash(canonicalJson(requestPayload)),
      }),
      completedExpiresAt: new Date(
        at.getTime() + idempotencyLifetimeMilliseconds,
      ).toISOString(),
      occurredAt,
      outboxEventId: randomUUID(),
    });
  }

  async begin(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string,
    requestHash: string,
    at: Date,
  ): Promise<BeginReliableOperationResult> {
    validateReliableOperationName(operation);
    validateSha256(requestHash, "requestHash");
    validateIdempotencyKey(idempotencyKey);
    const keyHash = hash(idempotencyKey);
    const result = await this.#repository.claim({
      actorMembershipId: actor.membershipId,
      expiresAt: new Date(
        at.getTime() + idempotencyProcessingLeaseMilliseconds,
      ).toISOString(),
      keyHash,
      operation,
      organizationId: actor.organizationId,
      requestHash,
    });
    return result.status === "claimed"
      ? Object.freeze({
          claim: Object.freeze({
            actor,
            completedExpiresAt: new Date(
              at.getTime() + idempotencyLifetimeMilliseconds,
            ).toISOString(),
            keyHash,
            operation,
            recordId: result.recordId,
          }),
          status: "claimed",
        })
      : result;
  }

  complete(input: CompleteReliableOperationInput): Promise<boolean> {
    validateAuditMetadata(input.audit.metadata);
    validateIdempotencyResponse(input.responseBody);
    input.outbox.forEach((message) => {
      validateOutboxTopic(message.topic);
      validateOutboxPayload(message.payload);
    });
    return this.#repository.commit({
      audit: {
        actorMembershipId: input.claim.actor.membershipId,
        ...(input.audit.entityId === undefined
          ? {}
          : { entityId: input.audit.entityId }),
        entityType: input.audit.entityType,
        eventId: randomUUID(),
        metadata: input.audit.metadata,
        occurredAt: input.occurredAt,
        operation: input.claim.operation,
        organizationId: input.claim.actor.organizationId,
        outcome: input.audit.outcome,
      },
      idempotency: {
        actorMembershipId: input.claim.actor.membershipId,
        expiresAt: input.claim.completedExpiresAt,
        keyHash: input.claim.keyHash,
        operation: input.claim.operation,
        organizationId: input.claim.actor.organizationId,
        recordId: input.claim.recordId,
        responseBody: input.responseBody,
        responseStatus: input.responseStatus,
      },
      outbox: input.outbox.map((message) => ({
        aggregateId: message.aggregateId,
        aggregateType: message.aggregateType,
        availableAt: input.occurredAt,
        eventId: randomUUID(),
        organizationId: input.claim.actor.organizationId,
        payload: message.payload,
        topic: message.topic,
      })),
    });
  }
}
