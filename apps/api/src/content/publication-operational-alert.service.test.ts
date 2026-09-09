import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  OrganizationRole,
  PublicationOperationalAlertRecord,
  PublicationOperationalAlertRepository,
  PublicationOperationalAlertSweepResult,
  ResolvePublicationOperationalAlertResult,
} from "@aramayo/domain";
import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { PublicationOperationalAlertService } from "./publication-operational-alert.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const alertId = "20000000-0000-4000-8000-000000000002";

function actor(
  roles: readonly OrganizationRole[] = ["publisher"],
): AuthenticatedActor {
  return Object.freeze({
    displayName: "Persona que publica",
    email: "publica@aramayo.test",
    membershipId: "30000000-0000-4000-8000-000000000003",
    organizationId,
    roles,
    sessionId: "40000000-0000-4000-8000-000000000004",
    userId: "50000000-0000-4000-8000-000000000005",
  });
}

function alert(): PublicationOperationalAlertRecord {
  return Object.freeze({
    cause: "dispatch-not-requested",
    fingerprint: "occurrence-stuck:60000000-0000-4000-8000-000000000006",
    firstObservedAt: "2026-09-08T12:00:00.000Z",
    id: alertId,
    kind: "occurrence-stuck",
    lastObservedAt: "2026-09-08T12:05:00.000Z",
    observations: 2,
    publicationId: "70000000-0000-4000-8000-000000000007",
    publicationTarget: "instagram_feed",
    safeAction: "inspect-queue",
    scheduleOccurrenceId: "60000000-0000-4000-8000-000000000006",
    severity: "urgent",
  });
}

class RepositoryDouble implements PublicationOperationalAlertRepository {
  listedFor: string | null = null;
  resolved:
    Parameters<PublicationOperationalAlertRepository["resolve"]>[0] | null =
    null;
  result: ResolvePublicationOperationalAlertResult = Object.freeze({
    alert: alert(),
    status: "resolved",
  });

  listOpen(
    organization: string,
  ): Promise<readonly PublicationOperationalAlertRecord[]> {
    this.listedFor = organization;
    return Promise.resolve([alert()]);
  }

  resolve(
    input: Parameters<PublicationOperationalAlertRepository["resolve"]>[0],
  ): Promise<ResolvePublicationOperationalAlertResult> {
    this.resolved = input;
    return Promise.resolve(this.result);
  }

  sweep(): Promise<PublicationOperationalAlertSweepResult> {
    return Promise.reject(new Error("La API no ejecuta barridos."));
  }
}

test("la bandeja entrega causa, recurso y acción sin exponer la huella interna", async () => {
  const repository = new RepositoryDouble();
  const service = new PublicationOperationalAlertService(repository);

  const result = await service.list(actor());

  assert.equal(repository.listedFor, organizationId);
  assert.equal(result.items.length, 1);
  const [item] = result.items;
  assert.ok(item);
  assert.equal(item.publicationTarget, "instagram_feed");
  assert.equal(item.safeAction, "inspect-queue");
  assert.equal("fingerprint" in item, false);
});

test("reconocer una alerta conserva actor, tenant y auditoría del repositorio", async () => {
  const repository = new RepositoryDouble();
  const service = new PublicationOperationalAlertService(repository);

  const result = await service.resolve(actor(), alertId);

  assert.equal(result.status, "resolved");
  assert.equal(result.alert.id, alertId);
  const resolution = repository.resolved;
  if (resolution === null) throw new Error("La resolución no llegó al doble.");
  assert.equal(resolution.organizationId, organizationId);
  assert.equal(resolution.actorMembershipId, actor().membershipId);
});

test("la bandeja no cruza el permiso de publicación", async () => {
  const repository = new RepositoryDouble();
  const service = new PublicationOperationalAlertService(repository);

  await assert.rejects(service.list(actor(["viewer"])), ForbiddenException);
  await assert.rejects(
    service.resolve(actor(["editor"]), alertId),
    ForbiddenException,
  );
  assert.equal(repository.resolved, null);
});

test("una alerta ausente mantiene el 404 y no se presenta como resuelta", async () => {
  const repository = new RepositoryDouble();
  repository.result = Object.freeze({ status: "not-found" });
  const service = new PublicationOperationalAlertService(repository);

  await assert.rejects(service.resolve(actor(), alertId), NotFoundException);
});
