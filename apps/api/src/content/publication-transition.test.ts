import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PublicationStateCommitResult,
  PublicationStateRepository,
  PublicationTransitionEvent,
  PublicationWorkflowState,
} from "@aramayo/domain";
import { Test } from "@nestjs/testing";

import { PublicationTransitionService } from "./publication-transition.service.ts";
import { PUBLICATION_STATE_REPOSITORY } from "../database/database.tokens.ts";

class FakePublicationStateRepository implements PublicationStateRepository {
  commitResult: PublicationStateCommitResult = { status: "committed" };
  committedEvent: PublicationTransitionEvent | undefined;
  current: PublicationWorkflowState | null = {
    id: "publication-1",
    organizationId: "organization-1",
    status: "draft",
    version: 1,
  };

  commit(
    _state: PublicationWorkflowState,
    event: PublicationTransitionEvent,
  ): Promise<PublicationStateCommitResult> {
    this.committedEvent = event;
    return Promise.resolve(this.commitResult);
  }

  findById(): Promise<PublicationWorkflowState | null> {
    return Promise.resolve(this.current);
  }
}

async function createService(
  repository: FakePublicationStateRepository,
): Promise<PublicationTransitionService> {
  const testingModule = await Test.createTestingModule({
    providers: [
      PublicationTransitionService,
      {
        provide: PUBLICATION_STATE_REPOSITORY,
        useValue: repository,
      },
    ],
  }).compile();

  return testingModule.get(PublicationTransitionService);
}

test("el caso de uso no persiste una transición de dominio inválida", async () => {
  const repository = new FakePublicationStateRepository();
  const service = await createService(repository);

  const result = await service.execute("organization-1", "publication-1", {
    actorMembershipId: "membership-1",
    expectedVersion: 1,
    occurredAt: "2026-07-28T12:00:00.000Z",
    targetStatus: "published",
    type: "advance",
  });

  assert.equal(result.ok ? undefined : result.error.code, "invalid-transition");
  assert.equal(repository.committedEvent, undefined);
});

test("un recurso de otra organización se representa como no encontrado", async () => {
  const repository = new FakePublicationStateRepository();
  repository.current = null;
  const service = await createService(repository);

  const result = await service.execute("organization-2", "publication-1", {
    actorMembershipId: "membership-2",
    expectedVersion: 1,
    occurredAt: "2026-07-28T12:00:00.000Z",
    targetStatus: "ready_for_review",
    type: "advance",
  });

  assert.equal(result.ok ? undefined : result.error.code, "not-found");
});

test("un compare-and-swap perdido devuelve conflicto y no éxito", async () => {
  const repository = new FakePublicationStateRepository();
  repository.commitResult = { status: "version-conflict" };
  const service = await createService(repository);

  const result = await service.execute("organization-1", "publication-1", {
    actorMembershipId: "membership-1",
    expectedVersion: 1,
    occurredAt: "2026-07-28T12:00:00.000Z",
    targetStatus: "ready_for_review",
    type: "advance",
  });

  assert.equal(result.ok ? undefined : result.error.code, "version-conflict");
  assert.equal(repository.committedEvent?.fromVersion, 1);
});
