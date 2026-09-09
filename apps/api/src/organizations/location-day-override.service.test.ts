import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  DeleteLocationDayOverrideResult,
  LocationDayOverride,
  LocationDayOverrideListQuery,
  LocationDayOverrideMutationResult,
  LocationDayOverridePreviewInput,
  LocationDayOverridePreviewResult,
  LocationDayOverrideRepository,
  PersistLocationDayOverrideDeletionInput,
  PersistLocationDayOverrideInput,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { LocationDayOverrideService } from "./location-day-override.service.ts";

const locationId = "0a2f2a3c-2c2a-4d6f-8f2f-2f2f2f2f2f2f";

const stored: LocationDayOverride = Object.freeze({
  id: "override-1",
  localDate: "2026-12-25",
  locationId,
  sourceLabel: "Feriado nacional",
  status: "closed",
  version: 1,
});

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

class FakeLocationDayOverrideRepository implements LocationDayOverrideRepository {
  deleteInput: PersistLocationDayOverrideDeletionInput | undefined;
  deleteResult: DeleteLocationDayOverrideResult = {
    impact: {
      affectedStoryCount: 0,
      localDate: "2026-12-25",
      timeZone: "America/Argentina/Cordoba",
      willBlockHoursSensitiveStories: true,
      willRequireHumanApproval: false,
    },
    status: "deleted",
  };
  listQuery: LocationDayOverrideListQuery | undefined;
  listResult: readonly LocationDayOverride[] | null = [stored];
  previewInput: LocationDayOverridePreviewInput | undefined;
  previewResult: LocationDayOverridePreviewResult = {
    impact: {
      affectedStoryCount: 2,
      localDate: "2026-12-25",
      timeZone: "America/Argentina/Cordoba",
      willBlockHoursSensitiveStories: true,
      willRequireHumanApproval: false,
    },
    status: "ready",
  };
  upsertInput: PersistLocationDayOverrideInput | undefined;
  upsertResult: LocationDayOverrideMutationResult = {
    impact: {
      affectedStoryCount: 1,
      localDate: "2026-12-25",
      timeZone: "America/Argentina/Cordoba",
      willBlockHoursSensitiveStories: false,
      willRequireHumanApproval: true,
    },
    override: stored,
    status: "updated",
  };

  deleteLocationDayOverride(
    input: PersistLocationDayOverrideDeletionInput,
  ): Promise<DeleteLocationDayOverrideResult> {
    this.deleteInput = input;
    return Promise.resolve(this.deleteResult);
  }

  listLocationDayOverrides(
    query: LocationDayOverrideListQuery,
  ): Promise<readonly LocationDayOverride[] | null> {
    this.listQuery = query;
    return Promise.resolve(this.listResult);
  }

  previewLocationDayOverride(
    input: LocationDayOverridePreviewInput,
  ): Promise<LocationDayOverridePreviewResult> {
    this.previewInput = input;
    return Promise.resolve(this.previewResult);
  }

  upsertLocationDayOverride(
    input: PersistLocationDayOverrideInput,
  ): Promise<LocationDayOverrideMutationResult> {
    this.upsertInput = input;
    return Promise.resolve(this.upsertResult);
  }
}

test("un rol con lectura consulta excepciones y no puede cambiarlas", async () => {
  const repository = new FakeLocationDayOverrideRepository();
  const service = new LocationDayOverrideService(repository);

  assert.deepEqual(
    await service.list(actor(["viewer"]), locationId, {
      endDate: "2026-12-31",
      startDate: "2026-12-01",
    }),
    {
      endDate: "2026-12-31",
      locationId,
      overrides: [
        {
          id: "override-1",
          localDate: "2026-12-25",
          locationId,
          sourceLabel: "Feriado nacional",
          status: "closed",
          version: 1,
        },
      ],
      startDate: "2026-12-01",
    },
  );
  await assert.rejects(
    service.upsert({
      actor: actor(["viewer"]),
      localDate: "2026-12-25",
      locationId,
      sourceLabel: "Feriado nacional",
      status: "closed",
    }),
    ForbiddenException,
  );
  await assert.rejects(
    service.remove({
      actor: actor(["approver"]),
      expectedVersion: 1,
      localDate: "2026-12-25",
      locationId,
    }),
    ForbiddenException,
  );
  assert.equal(repository.upsertInput, undefined);
  assert.equal(repository.deleteInput, undefined);
});

test("previsualizar informa impacto sin escribir la excepción", async () => {
  const repository = new FakeLocationDayOverrideRepository();
  const service = new LocationDayOverrideService(repository);

  assert.deepEqual(
    await service.preview({
      actor: actor(["admin"]),
      localDate: "2026-12-25",
      locationId,
      sourceLabel: "  Feriado nacional  ",
      status: "closed",
    }),
    {
      impact: {
        affectedStoryCount: 2,
        localDate: "2026-12-25",
        timeZone: "America/Argentina/Cordoba",
        willBlockHoursSensitiveStories: true,
        willRequireHumanApproval: false,
      },
    },
  );
  assert.deepEqual(repository.previewInput?.update, {
    localDate: "2026-12-25",
    sourceLabel: "Feriado nacional",
    status: "closed",
  });
  assert.equal(repository.upsertInput, undefined);
  assert.equal(repository.deleteInput, undefined);
});

test("un administrador persiste horario especial normalizado con su versión esperada", async () => {
  const repository = new FakeLocationDayOverrideRepository();
  const service = new LocationDayOverrideService(repository);

  repository.upsertResult = {
    impact: {
      affectedStoryCount: 1,
      localDate: "2026-12-24",
      timeZone: "America/Argentina/Cordoba",
      willBlockHoursSensitiveStories: false,
      willRequireHumanApproval: true,
    },
    override: {
      id: "override-2",
      localDate: "2026-12-24",
      locationId,
      openingHours: "09:00 a 13:00",
      sourceLabel: "Horario reducido de Nochebuena",
      status: "open",
      version: 2,
    },
    status: "updated",
  };

  const response = await service.upsert({
    actor: actor(["admin"]),
    expectedVersion: 1,
    localDate: "2026-12-24",
    locationId,
    openingHours: " 09:00 a 13:00 ",
    sourceLabel: " Horario reducido de Nochebuena ",
    status: "open",
  });

  assert.deepEqual(response, {
    impact: {
      affectedStoryCount: 1,
      localDate: "2026-12-24",
      timeZone: "America/Argentina/Cordoba",
      willBlockHoursSensitiveStories: false,
      willRequireHumanApproval: true,
    },
    override: {
      id: "override-2",
      localDate: "2026-12-24",
      locationId,
      openingHours: "09:00 a 13:00",
      sourceLabel: "Horario reducido de Nochebuena",
      status: "open",
      version: 2,
    },
  });
  const persisted = repository.upsertInput;
  assert.ok(persisted);
  assert.equal(persisted.expectedVersion, 1);
  assert.equal(persisted.locationId, locationId);
  assert.equal(persisted.organizationId, "organization-1");
  assert.deepEqual(persisted.update, {
    localDate: "2026-12-24",
    openingHours: "09:00 a 13:00",
    sourceLabel: "Horario reducido de Nochebuena",
    status: "open",
  });
});

test("una fecha imposible o un rango excesivo se rechazan antes de persistir", async () => {
  const repository = new FakeLocationDayOverrideRepository();
  const service = new LocationDayOverrideService(repository);

  await assert.rejects(
    service.upsert({
      actor: actor(["admin"]),
      localDate: "2026-02-29",
      locationId,
      sourceLabel: "Cierre informado",
      status: "closed",
    }),
    BadRequestException,
  );
  await assert.rejects(
    service.list(actor(["admin"]), locationId, {
      endDate: "2027-12-31",
      startDate: "2026-12-01",
    }),
    BadRequestException,
  );
  assert.equal(repository.upsertInput, undefined);
  assert.equal(repository.listQuery, undefined);
});

test("una versión vencida, una sucursal ajena y una fecha sin excepción se distinguen", async () => {
  const repository = new FakeLocationDayOverrideRepository();
  const service = new LocationDayOverrideService(repository);
  repository.upsertResult = { status: "conflict" };
  repository.deleteResult = { status: "not-found" };
  repository.listResult = null;

  await assert.rejects(
    service.upsert({
      actor: actor(["admin"]),
      expectedVersion: 1,
      localDate: "2026-12-25",
      locationId,
      sourceLabel: "Feriado nacional",
      status: "closed",
    }),
    ConflictException,
  );
  await assert.rejects(
    service.remove({
      actor: actor(["admin"]),
      expectedVersion: 4,
      localDate: "2026-12-25",
      locationId,
    }),
    NotFoundException,
  );
  await assert.rejects(
    service.list(actor(["admin"]), locationId, {
      endDate: "2026-12-31",
      startDate: "2026-12-01",
    }),
    NotFoundException,
  );
});
