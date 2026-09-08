import assert from "node:assert/strict";
import test from "node:test";

import type {
  ApplyPublicationScheduleTransitionInput,
  ApplyPublicationScheduleTransitionResult,
  AuthenticatedActor,
  CreatePublicationScheduleInput,
  CreatePublicationScheduleResult,
  IdempotencyClaimResult,
  PublicationScheduleManagementRepository,
  ReliableOperationRepository,
  UpdatePublicationScheduleInput,
  UpdatePublicationScheduleResult,
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
const publicationId = "10000000-0000-4000-8000-000000000006";

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
  createInput: CreatePublicationScheduleInput | undefined;
  createResult: CreatePublicationScheduleResult = Object.freeze({
    materializedOccurrenceCount: 3,
    publication: Object.freeze({ status: "scheduled", version: 8 }),
    scheduleId,
    status: "created",
    version: 1,
  });
  input: ApplyPublicationScheduleTransitionInput | undefined;
  updateInput: UpdatePublicationScheduleInput | undefined;
  updateResult: UpdatePublicationScheduleResult = Object.freeze({
    cancelledOccurrenceCount: 2,
    createdOccurrenceCount: 1,
    frozenOccurrenceCount: 1,
    rescheduledOccurrenceCount: 3,
    scheduleId,
    status: "updated",
    version: 6,
  });
  result: ApplyPublicationScheduleTransitionResult = Object.freeze({
    cancelledOccurrenceCount: 0,
    dispatchedOccurrenceCount: 0,
    publication: Object.freeze({ status: "scheduled", version: 7 }),
    scheduleId,
    status: "updated",
    version: 5,
  });

  create(
    input: CreatePublicationScheduleInput,
  ): Promise<CreatePublicationScheduleResult> {
    this.createInput = input;
    return Promise.resolve(this.createResult);
  }

  update(
    input: UpdatePublicationScheduleInput,
  ): Promise<UpdatePublicationScheduleResult> {
    this.updateInput = input;
    return Promise.resolve(this.updateResult);
  }

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

test("crear resuelve fecha civil y zona antes de materializar la programación", async () => {
  const repository = new FakeSchedules();
  const result = await service(repository).create(
    actor,
    publicationId,
    {
      effectiveFromLocalDate: "2030-01-15",
      expectedPublicationVersion: 7,
      gapPolicy: "skip",
      lateToleranceMinutes: 15,
      localTime: "09:00",
      missedPolicy: "run-late",
      recurrenceInterval: 2,
      recurrenceKind: "weekly",
      targets: ["instagram_feed"],
      timeZone: "America/Argentina/Cordoba",
      weekdays: [2, 5],
    },
    "schedule-create-idempotency-0001",
  );

  assert.deepEqual(result, {
    materializedOccurrenceCount: 3,
    publication: { status: "scheduled", version: 8 },
    scheduleId,
    status: "created",
    version: 1,
  });
  assert.ok(repository.createInput);
  assert.equal(repository.createInput.publicationId, publicationId);
  assert.equal(repository.createInput.expectedPublicationVersion, 7);
  assert.deepEqual(repository.createInput.rule, {
    effectiveFrom: "2030-01-15T12:00:00.000Z",
    gapPolicy: "skip",
    localTime: "09:00",
    recurrence: { interval: 2, kind: "weekly", weekdays: [2, 5] },
    timeZone: "America/Argentina/Cordoba",
  });
  assert.equal(
    repository.createInput.reliableOperation.claim.operation,
    "scheduling.schedule:create",
  );
});

test("una hora inexistente o campos de otra recurrencia no llegan al repositorio", async () => {
  const repository = new FakeSchedules();
  await assert.rejects(
    service(repository).create(
      actor,
      publicationId,
      {
        effectiveFromLocalDate: "2026-03-29",
        expectedPublicationVersion: 7,
        gapPolicy: "skip",
        lateToleranceMinutes: 0,
        localTime: "02:30",
        missedPolicy: "skip",
        recurrenceKind: "once",
        targets: ["instagram_feed"],
        timeZone: "Europe/Madrid",
      },
      "schedule-create-idempotency-0002",
    ),
    /no existen/u,
  );
  assert.equal(repository.createInput, undefined);
});

test("mover expone las consecuencias de ocurrencias sin ocultar las congeladas", async () => {
  const repository = new FakeSchedules();
  const result = await service(repository).update(
    actor,
    scheduleId,
    {
      effectiveFromLocalDate: "2030-01-15",
      expectedVersion: 5,
      gapPolicy: "skip",
      lateToleranceMinutes: 0,
      localTime: "09:00",
      missedPolicy: "skip",
      recurrenceKind: "once",
      targets: ["instagram_feed"],
      timeZone: "America/Argentina/Cordoba",
    },
    "schedule-update-idempotency-0001",
  );

  assert.deepEqual(result, {
    cancelledOccurrenceCount: 2,
    createdOccurrenceCount: 1,
    frozenOccurrenceCount: 1,
    rescheduledOccurrenceCount: 3,
    scheduleId,
    status: "updated",
    version: 6,
  });
  assert.ok(repository.updateInput);
  assert.equal(repository.updateInput.expectedVersion, 5);
  assert.equal(repository.updateInput.scheduleId, scheduleId);
  assert.equal(
    repository.updateInput.reliableOperation.claim.operation,
    "scheduling.schedule:update",
  );
});

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
