import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApplyPublicationScheduleTransitionInput,
  ApplyPublicationScheduleTransitionResult,
  AuthenticatedActor,
  IdempotencyClaimResult,
  PublicationScheduleManagementRepository,
  ReliableOperationRepository,
} from "@aramayo/domain";
import { ForbiddenException } from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import { PublicationScheduleService } from "./publication-schedule.service.ts";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Aprobadora Aramayo",
  email: "aprobadora@aramayo.invalid",
  membershipId: "10000000-0000-4000-8000-000000000001",
  organizationId: "10000000-0000-4000-8000-000000000002",
  roles: Object.freeze(["approver"] as const),
  sessionId: "10000000-0000-4000-8000-000000000003",
  userId: "10000000-0000-4000-8000-000000000004",
});

const scheduleId = "10000000-0000-4000-8000-000000000005";

class FakeReliableOperationRepository implements ReliableOperationRepository {
  claim(): Promise<IdempotencyClaimResult> {
    throw new Error("not used");
  }

  commit(): Promise<boolean> {
    throw new Error("not used");
  }

  purgeExpired(): Promise<Readonly<{ deleted: number }>> {
    return Promise.resolve({ deleted: 0 });
  }
}

class FakeSchedules implements PublicationScheduleManagementRepository {
  input: ApplyPublicationScheduleTransitionInput | undefined;
  result: ApplyPublicationScheduleTransitionResult = Object.freeze({
    cancelledOccurrenceCount: 0,
    dispatchedOccurrenceCount: 0,
    publication: Object.freeze({ status: "scheduled", version: 7 }),
    scheduleId,
    status: "updated",
    version: 5,
  });

  transition(
    input: ApplyPublicationScheduleTransitionInput,
  ): Promise<ApplyPublicationScheduleTransitionResult> {
    this.input = input;
    return Promise.resolve(this.result);
  }
}

function service(repository: FakeSchedules): PublicationScheduleService {
  return new PublicationScheduleService(
    repository,
    new ReliableOperationService(new FakeReliableOperationRepository()),
  );
}

test("pausar exige permiso, versión e idempotencia antes de tocar calendario", async () => {
  const repository = new FakeSchedules();
  const result = await service(repository).transition(
    actor,
    scheduleId,
    { expectedVersion: 4, type: "pause" },
    "schedule-pause-idempotency-0001",
  );

  assert.deepEqual(result, {
    cancelledOccurrenceCount: 0,
    dispatchedOccurrenceCount: 0,
    publication: { status: "scheduled", version: 7 },
    scheduleId,
    status: "updated",
    version: 5,
  });
  assert.ok(repository.input);
  assert.equal(repository.input.command.type, "pause");
  assert.equal(repository.input.command.expectedVersion, 4);
  assert.equal(repository.input.command.actorMembershipId, actor.membershipId);
  assert.equal(
    repository.input.command.occurredAt,
    repository.input.reliableOperation.occurredAt,
  );
  assert.equal(
    repository.input.reliableOperation.claim.operation,
    "scheduling.schedule:pause",
  );
});

test("cancelar conserva el resultado parcial y exige un código de motivo", async () => {
  const repository = new FakeSchedules();
  repository.result = Object.freeze({
    cancelledOccurrenceCount: 3,
    dispatchedOccurrenceCount: 1,
    publication: Object.freeze({ status: "approved", version: 8 }),
    scheduleId,
    status: "updated",
    version: 6,
  });
  const result = await service(repository).transition(
    actor,
    scheduleId,
    {
      expectedVersion: 5,
      reasonCode: "operator-cancelled",
      type: "cancel",
    },
    "schedule-cancel-idempotency-0001",
  );

  assert.equal(result.cancelledOccurrenceCount, 3);
  assert.equal(result.dispatchedOccurrenceCount, 1);
  assert.equal(repository.input?.command.type, "cancel");
  assert.equal(repository.input.command.reasonCode, "operator-cancelled");
});

test("un rol sin content:schedule no alcanza el repositorio", async () => {
  const repository = new FakeSchedules();
  const editor: AuthenticatedActor = { ...actor, roles: ["editor"] };

  await assert.rejects(
    service(repository).transition(
      editor,
      scheduleId,
      { expectedVersion: 4, type: "pause" },
      "schedule-forbidden-idempotency-01",
    ),
    ForbiddenException,
  );
  assert.equal(repository.input, undefined);
});
