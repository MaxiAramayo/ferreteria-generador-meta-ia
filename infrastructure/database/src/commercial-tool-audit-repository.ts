import {
  validateAuditMetadata,
  validateReliableOperationName,
  type CommercialToolAuditPort,
  type CommercialToolName,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";

function operation(toolName: CommercialToolName | null): string {
  return validateReliableOperationName(
    toolName === null
      ? "commercial.tool.rejected"
      : `commercial.tool.${toolName.replaceAll("_", "-")}`,
  );
}

export class PrismaCommercialToolAuditRepository implements CommercialToolAuditPort {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async record(
    event: Parameters<CommercialToolAuditPort["record"]>[0],
  ): Promise<void> {
    const metadata = validateAuditMetadata({
      callId: event.callId,
      durationMilliseconds: event.durationMilliseconds,
      resultKind: event.resultKind,
      runId: event.runId,
      safeParameters: event.safeParameters,
      toolName: event.toolName ?? "unknown",
    });
    await this.#database.auditEvent.create({
      data: {
        actorMembershipId: event.actorMembershipId,
        entityId: event.runId,
        entityType: "commercial-tool-run",
        id: event.eventId,
        metadata: { ...metadata },
        occurredAt: new Date(event.occurredAt),
        operation: operation(event.toolName),
        organizationId: event.organizationId,
        outcome: event.outcome,
      },
    });
  }
}
