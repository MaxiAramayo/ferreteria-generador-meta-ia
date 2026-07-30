import type { SafeJsonObject } from "./reliable-operations.ts";

export const commercialToolLimits = Object.freeze({
  argumentsCharactersMaximum: 2_048,
  outputCharactersMaximum: 12_000,
  searchResultsMaximum: 10,
});

export const commercialToolNames = [
  "search_products",
  "get_product",
  "get_current_price",
  "get_stock_by_location",
  "get_receipt_status",
] as const;

export type CommercialToolName = (typeof commercialToolNames)[number];

export interface CommercialToolCall {
  readonly arguments: string;
  readonly callId: string;
  readonly name: string;
}

export interface CommercialToolExecutionScope {
  readonly actorMembershipId: string;
  readonly locationId: string | null;
  readonly organizationId: string;
  readonly runId: string;
}

export interface CommercialToolExecutionResult {
  readonly callId: string;
  readonly outcome: "failure" | "success";
  readonly output: string;
  readonly toolName: CommercialToolName | null;
}

export interface CommercialToolAuditEvent {
  readonly actorMembershipId: string;
  readonly callId: string;
  readonly durationMilliseconds: number;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly outcome: "failure" | "success";
  readonly resultKind: string;
  readonly runId: string;
  readonly safeParameters: SafeJsonObject;
  readonly toolName: CommercialToolName | null;
}

export interface CommercialToolAuditPort {
  record(event: CommercialToolAuditEvent): Promise<void>;
}

export type CommercialToolExecutionErrorCode = "audit-failed" | "invalid-scope";

export class CommercialToolExecutionError extends Error {
  readonly code: CommercialToolExecutionErrorCode;

  constructor(code: CommercialToolExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CommercialToolExecutionError";
  }
}
