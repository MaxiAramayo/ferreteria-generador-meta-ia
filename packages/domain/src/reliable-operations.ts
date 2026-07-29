import type { OrganizationScope } from "./persistence.ts";

export const reliableOperationLimits = Object.freeze({
  auditMetadataBytesMaximum: 16_384,
  auditMetadataDepthMaximum: 5,
  auditMetadataKeysMaximum: 64,
  idempotencyResponseBytesMaximum: 131_072,
  idempotencyResponseDepthMaximum: 10,
  idempotencyResponseKeysMaximum: 512,
  operationNameMaximum: 120,
  outboxAttemptsMaximum: 12,
  outboxBatchMaximum: 100,
  outboxPayloadBytesMaximum: 65_536,
  topicNameMaximum: 160,
});

export type SafeJsonPrimitive = boolean | number | string | null;
export type SafeJsonValue =
  | SafeJsonPrimitive
  | readonly SafeJsonValue[]
  | Readonly<{ readonly [key: string]: SafeJsonValue }>;
export type SafeJsonObject = Readonly<{
  readonly [key: string]: SafeJsonValue;
}>;

const sensitiveAuditKey =
  /(?:authorization|cookie|credential|password|secret|session|token)/iu;
const operationNamePattern = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/u;

function assertBoundedName(name: string, field: string, maximum: number): void {
  if (
    name.length < 1 ||
    name.length > maximum ||
    !operationNamePattern.test(name)
  ) {
    throw new ReliableOperationValidationError(
      "name-invalid",
      field,
      `${field} no tiene un identificador válido.`,
    );
  }
}

function isSafeJsonArray(
  value: SafeJsonValue,
): value is readonly SafeJsonValue[] {
  return Array.isArray(value);
}

function inspectSafeJson(
  value: SafeJsonValue,
  path: string,
  depth: number,
  counters: { keys: number },
  depthMaximum: number = reliableOperationLimits.auditMetadataDepthMaximum,
  keysMaximum: number = reliableOperationLimits.auditMetadataKeysMaximum,
): void {
  if (depth > depthMaximum) {
    throw new ReliableOperationValidationError(
      "payload-too-deep",
      path,
      "El payload supera la profundidad permitida.",
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ReliableOperationValidationError(
      "payload-invalid",
      path,
      "El payload contiene un número no finito.",
    );
  }
  if (isSafeJsonArray(value)) {
    value.forEach((entry, index) => {
      inspectSafeJson(
        entry,
        `${path}[${String(index)}]`,
        depth + 1,
        counters,
        depthMaximum,
        keysMaximum,
      );
    });
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    counters.keys += 1;
    if (counters.keys > keysMaximum) {
      throw new ReliableOperationValidationError(
        "payload-too-large",
        path,
        "El payload contiene demasiados campos.",
      );
    }
    if (sensitiveAuditKey.test(key)) {
      throw new ReliableOperationValidationError(
        "sensitive-field",
        `${path}.${key}`,
        "El payload contiene un campo sensible.",
      );
    }
    inspectSafeJson(
      entry,
      `${path}.${key}`,
      depth + 1,
      counters,
      depthMaximum,
      keysMaximum,
    );
  }
}

export type ReliableOperationValidationErrorCode =
  | "hash-invalid"
  | "name-invalid"
  | "payload-invalid"
  | "payload-too-deep"
  | "payload-too-large"
  | "sensitive-field";

export class ReliableOperationValidationError extends Error {
  readonly code: ReliableOperationValidationErrorCode;
  readonly field: string;

  constructor(
    code: ReliableOperationValidationErrorCode,
    field: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.field = field;
    this.name = "ReliableOperationValidationError";
  }
}

export function validateSha256(hash: string, field: string): string {
  if (!/^[a-f0-9]{64}$/u.test(hash)) {
    throw new ReliableOperationValidationError(
      "hash-invalid",
      field,
      `${field} debe ser un SHA-256 hexadecimal.`,
    );
  }
  return hash;
}

export function validateAuditMetadata(
  metadata: SafeJsonObject,
): SafeJsonObject {
  inspectSafeJson(metadata, "metadata", 0, { keys: 0 });
  if (
    new TextEncoder().encode(JSON.stringify(metadata)).byteLength >
    reliableOperationLimits.auditMetadataBytesMaximum
  ) {
    throw new ReliableOperationValidationError(
      "payload-too-large",
      "metadata",
      "La metadata de auditoría supera el límite permitido.",
    );
  }
  return metadata;
}

export function validateIdempotencyResponse(
  responseBody: SafeJsonObject,
): SafeJsonObject {
  inspectSafeJson(
    responseBody,
    "responseBody",
    0,
    { keys: 0 },
    reliableOperationLimits.idempotencyResponseDepthMaximum,
    reliableOperationLimits.idempotencyResponseKeysMaximum,
  );
  if (
    new TextEncoder().encode(JSON.stringify(responseBody)).byteLength >
    reliableOperationLimits.idempotencyResponseBytesMaximum
  ) {
    throw new ReliableOperationValidationError(
      "payload-too-large",
      "responseBody",
      "La respuesta idempotente supera el límite permitido.",
    );
  }
  return responseBody;
}

export function validateOutboxPayload(payload: SafeJsonObject): SafeJsonObject {
  inspectSafeJson(payload, "payload", 0, { keys: 0 });
  if (
    new TextEncoder().encode(JSON.stringify(payload)).byteLength >
    reliableOperationLimits.outboxPayloadBytesMaximum
  ) {
    throw new ReliableOperationValidationError(
      "payload-too-large",
      "payload",
      "El payload outbox supera el límite permitido.",
    );
  }
  return payload;
}

export function validateReliableOperationName(operation: string): string {
  assertBoundedName(
    operation,
    "operation",
    reliableOperationLimits.operationNameMaximum,
  );
  return operation;
}

export function validateOutboxTopic(topic: string): string {
  assertBoundedName(topic, "topic", reliableOperationLimits.topicNameMaximum);
  return topic;
}

export interface IdempotencyScope extends OrganizationScope {
  readonly actorMembershipId: string;
  readonly operation: string;
}

export interface ClaimIdempotencyInput extends IdempotencyScope {
  readonly expiresAt: string;
  readonly keyHash: string;
  readonly requestHash: string;
}

export type IdempotencyClaimResult =
  | Readonly<{ recordId: string; status: "claimed" }>
  | Readonly<{
      responseBody: SafeJsonObject;
      responseStatus: number;
      status: "replayed";
    }>
  | Readonly<{ status: "request-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>;

export interface CompleteIdempotencyInput extends IdempotencyScope {
  readonly expiresAt: string;
  readonly keyHash: string;
  readonly recordId: string;
  readonly responseBody: SafeJsonObject;
  readonly responseStatus: number;
}

export interface AuditEventInput extends OrganizationScope {
  readonly actorMembershipId?: string;
  readonly entityId?: string;
  readonly entityType: string;
  readonly eventId: string;
  readonly metadata: SafeJsonObject;
  readonly occurredAt: string;
  readonly operation: string;
  readonly outcome: "failure" | "success";
}

export interface EnqueueOutboxMessageInput extends OrganizationScope {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly availableAt: string;
  readonly eventId: string;
  readonly payload: SafeJsonObject;
  readonly topic: string;
}

export interface ReliableOperationCommitInput {
  readonly audit: AuditEventInput;
  readonly idempotency: CompleteIdempotencyInput;
  readonly outbox: readonly EnqueueOutboxMessageInput[];
}

export interface ReliableMutationContext {
  readonly auditEventId: string;
  readonly claim: ClaimIdempotencyInput;
  readonly completedExpiresAt: string;
  readonly occurredAt: string;
  readonly outboxEventId: string;
}

export interface ReliableOperationRepository {
  claim(input: ClaimIdempotencyInput): Promise<IdempotencyClaimResult>;
  commit(input: ReliableOperationCommitInput): Promise<boolean>;
  purgeExpired(
    expiredBefore: string,
    limit: number,
  ): Promise<Readonly<{ deleted: number }>>;
}

export type OutboxMessageStatus =
  "dead_letter" | "delivered" | "pending" | "processing";

export interface OutboxMessageRecord extends OrganizationScope {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly attempts: number;
  readonly availableAt: string;
  readonly eventId: string;
  readonly payload: SafeJsonObject;
  readonly status: OutboxMessageStatus;
  readonly topic: string;
}

export interface ClaimOutboxBatchInput {
  readonly at: string;
  readonly leaseExpiresAt: string;
  readonly limit: number;
  readonly workerId: string;
}

export interface FailOutboxMessageInput {
  readonly at: string;
  readonly errorCode: string;
  readonly errorMessage: string;
  readonly eventId: string;
  readonly retryAt: string;
  readonly workerId: string;
}

export interface OutboxRepository {
  claimBatch(
    input: ClaimOutboxBatchInput,
  ): Promise<readonly OutboxMessageRecord[]>;
  markDelivered(
    eventId: string,
    workerId: string,
    deliveredAt: string,
  ): Promise<boolean>;
  markFailed(input: FailOutboxMessageInput): Promise<OutboxMessageStatus>;
  purge(
    deliveredBefore: string,
    limit: number,
  ): Promise<Readonly<{ deleted: number }>>;
}

export interface OutboxTransport {
  deliver(message: OutboxMessageRecord): Promise<void>;
}
