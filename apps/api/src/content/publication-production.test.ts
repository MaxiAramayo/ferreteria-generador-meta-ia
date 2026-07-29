import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  AuthenticatedActor,
  PublicationProductionRepository,
  ReliableOperationRepository,
} from "@aramayo/domain";
import { ForbiddenException } from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import { PublicationProductionService } from "./publication-production.service.ts";

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return {
    displayName: "Operadora",
    email: "operadora@example.invalid",
    membershipId: "membership-1",
    organizationId: "organization-1",
    roles,
    sessionId: "session-1",
    userId: "user-1",
  };
}

function service(
  repository: PublicationProductionRepository,
): PublicationProductionService {
  const reliableRepository: ReliableOperationRepository = {
    claim: () => Promise.resolve({ status: "request-conflict" }),
    commit: () => Promise.resolve(false),
    purgeExpired: () => Promise.resolve({ deleted: 0 }),
  };
  return new PublicationProductionService(
    repository,
    new ReliableOperationService(reliableRepository),
  );
}

function repositoryDouble(): PublicationProductionRepository {
  return {
    approve: (input) =>
      Promise.resolve({
        publicationId: input.publicationId,
        snapshotId: "snapshot-1",
        status: "approved",
        version: input.expectedVersion + 1,
      }),
    completeRender: () => Promise.resolve({ status: "conflict" }),
    failRender: () => Promise.resolve({ status: "conflict" }),
    findRenderJob: () => Promise.resolve(null),
    requestRender: (input) =>
      Promise.resolve({
        publicationId: input.publicationId,
        revisionId: "revision-1",
        status: "accepted",
        version: input.expectedVersion + 1,
      }),
  };
}

test("editor solicita render pero no puede aprobar", async () => {
  const production = service(repositoryDouble());
  assert.equal(
    (
      await production.requestRender(
        actor(["editor"]),
        "publication-1",
        1,
        "idempotency-key-0001",
      )
    ).status,
    "generating_assets",
  );
  await assert.rejects(
    production.approve(
      actor(["editor"]),
      "publication-1",
      3,
      "idempotency-key-0002",
    ),
    ForbiddenException,
  );
});

test("approver aprueba pero no obtiene edición implícita", async () => {
  const production = service(repositoryDouble());
  assert.equal(
    (
      await production.approve(
        actor(["approver"]),
        "publication-1",
        3,
        "idempotency-key-0003",
      )
    ).status,
    "approved",
  );
  await assert.rejects(
    production.requestRender(
      actor(["approver"]),
      "publication-1",
      1,
      "idempotency-key-0004",
    ),
    ForbiddenException,
  );
});
