import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  OperationalHealthRepository,
  OperationalHealthSignals,
} from "@aramayo/domain";
import { ForbiddenException } from "@nestjs/common";

import { OperationalHealthService } from "./operational-health.service.ts";

const quiet: OperationalHealthSignals = {
  ambiguousTargets: 0,
  deadLetterMessages: 0,
  generationBudgetMicrousd: 10_000_000,
  generationCommittedMicrousd: 0,
  maximumOccurrenceDelayMinutes: 0,
  oldestPendingOutboxMinutes: 0,
  openAttentionAlerts: 0,
  openUrgentAlerts: 0,
  overdueOccurrences: 0,
  partialPublications: 0,
  pendingOutboxMessages: 0,
};

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return {
    displayName: "Persona Aramayo",
    email: "persona@aramayo.invalid",
    membershipId: "membership-1",
    organizationId: "organization-1",
    roles,
    sessionId: "session-1",
    userId: "user-1",
  };
}

class FakeOperationalHealthRepository implements OperationalHealthRepository {
  organizationId: string | undefined;
  signals: OperationalHealthSignals = quiet;

  observe(organizationId: string): Promise<OperationalHealthSignals> {
    this.organizationId = organizationId;
    return Promise.resolve(this.signals);
  }
}

test("sólo quien publica puede consultar la salud operativa", async () => {
  const repository = new FakeOperationalHealthRepository();
  const service = new OperationalHealthService(repository);

  await assert.rejects(service.read(actor(["editor"])), ForbiddenException);
  await assert.rejects(service.read(actor(["admin"])), ForbiddenException);
  assert.equal(repository.organizationId, undefined);
});

test("el tablero explica cada umbral cruzado y no lo reinventa la pantalla", async () => {
  const repository = new FakeOperationalHealthRepository();
  const service = new OperationalHealthService(repository);
  repository.signals = {
    ...quiet,
    generationCommittedMicrousd: 9_000_000,
    maximumOccurrenceDelayMinutes: 40,
    overdueOccurrences: 2,
  };

  const health = await service.read(actor(["publisher"]));

  assert.equal(repository.organizationId, "organization-1");
  assert.equal(health.severity, "urgent");
  assert.equal(health.generationBudgetPercent, 90);
  assert.deepEqual(
    health.reasons.map((reason) => [reason.code, reason.severity]),
    [
      ["occurrence-backlog", "attention"],
      ["occurrence-delay", "urgent"],
      ["generation-budget", "attention"],
    ],
  );
  assert.equal(health.signals.overdueOccurrences, 2);
  assert.ok(!Number.isNaN(Date.parse(health.observedAt)));
});

test("un tablero sin señales informa salud sin motivos", async () => {
  const service = new OperationalHealthService(
    new FakeOperationalHealthRepository(),
  );

  const health = await service.read(actor(["publisher"]));

  assert.equal(health.severity, "healthy");
  assert.deepEqual(health.reasons, []);
});
