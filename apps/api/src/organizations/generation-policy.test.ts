import assert from "node:assert/strict";
import test from "node:test";

import {
  type AuthenticatedActor,
  type GenerationPolicy,
  type GenerationPolicyMutationResult,
  type GenerationPolicyRepository,
  type GenerationPolicySnapshot,
  type GenerationPreflight,
  type UpdateGenerationPolicyCommand,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";

import { GenerationPolicyService } from "./generation-policy.service.ts";

const organizationId = "71000000-0000-4000-8000-000000000001";
const membershipId = "71000000-0000-4000-8000-000000000002";

const admin: AuthenticatedActor = Object.freeze({
  displayName: "Administradora",
  email: "admin@example.invalid",
  membershipId,
  organizationId,
  roles: Object.freeze(["admin"] as const),
  sessionId: "71000000-0000-4000-8000-000000000003",
  userId: "71000000-0000-4000-8000-000000000004",
});

const policy: GenerationPolicy = Object.freeze({
  enabled: true,
  generatedOrphanRetentionHours: 24,
  monthlyBudgetMicrousd: 20_000_000,
  organizationDailyAttemptLimit: 20,
  organizationId,
  originalRetentionDays: 90,
  referenceRetentionDays: 30,
  timeZone: "UTC",
  updatedAt: "2026-08-06T12:00:00.000Z",
  userDailyAttemptLimit: 8,
  version: 1,
  warningThresholdPercent: 80,
});

const usage = Object.freeze({
  alertActive: false,
  committedMicrousd: 0,
  monthUtc: "2026-08",
  monthlyBudgetMicrousd: 20_000_000,
  organizationAttemptsRemaining: 20,
  reservedMicrousd: 0,
  settledMicrousd: 0,
  unconfirmedMicrousd: 0,
  userAttemptsRemaining: 8,
});

class StubPolicies implements GenerationPolicyRepository {
  mutation: GenerationPolicyMutationResult = { policy, status: "updated" };
  readonly scopes: string[] = [];

  find(
    input: Parameters<GenerationPolicyRepository["find"]>[0],
  ): Promise<GenerationPolicySnapshot | null> {
    this.scopes.push(input.organizationId);
    return Promise.resolve({ policy, usage });
  }

  preflight(): Promise<GenerationPreflight | null> {
    throw new Error("no usado");
  }

  update(
    input: Parameters<GenerationPolicyRepository["update"]>[0],
  ): Promise<GenerationPolicyMutationResult> {
    this.scopes.push(input.organizationId);
    return Promise.resolve(this.mutation);
  }
}

function updateCommand(): UpdateGenerationPolicyCommand {
  return {
    enabled: true,
    expectedVersion: 1,
    generatedOrphanRetentionHours: 24,
    monthlyBudgetMicrousd: 20_000_000,
    organizationDailyAttemptLimit: 20,
    originalRetentionDays: 90,
    referenceRetentionDays: 30,
    userDailyAttemptLimit: 8,
    warningThresholdPercent: 80,
  } as const;
}

test("sólo organization:manage lee y modifica la política de su organización", async () => {
  const repository = new StubPolicies();
  const service = new GenerationPolicyService(repository);
  const editor: AuthenticatedActor = { ...admin, roles: ["editor"] };

  await assert.rejects(() => service.read(editor), ForbiddenException);
  const response = await service.read(admin);
  assert.equal(response.organizationId, organizationId);
  assert.deepEqual(response.usage, usage);

  const updated = await service.update(admin, updateCommand());
  assert.equal(updated.version, 1);
  assert.ok(repository.scopes.every((scope) => scope === organizationId));
});

test("el CAS en conflicto y una política inválida producen errores públicos tipados", async () => {
  const repository = new StubPolicies();
  const service = new GenerationPolicyService(repository);
  repository.mutation = { status: "conflict" };

  await assert.rejects(
    () => service.update(admin, updateCommand()),
    ConflictException,
  );
  await assert.rejects(
    () =>
      service.update(admin, {
        ...updateCommand(),
        warningThresholdPercent: 101,
      }),
    BadRequestException,
  );
});
