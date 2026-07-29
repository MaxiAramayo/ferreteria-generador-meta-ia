import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  ConfigurationMutationResult,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  PersistBrandConfigurationInput,
  UpdateBrandConfigurationCommand,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";

import { OrganizationConfigurationService } from "./organization-configuration.service.ts";

const configuration: OrganizationConfiguration = {
  brand: {
    claim: "Todo para tu obra y tu vehículo",
    handle: "@aramayo",
    id: "brand-1",
    name: "Aramayo",
    shortName: "Aramayo",
    themeId: "taller",
    version: 2,
  },
  displayName: "Ferretería y Lubricentro Aramayo",
  id: "organization-1",
  legalName: "Aramayo S.R.L.",
  locations: [],
  version: 3,
};

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return {
    displayName: "Persona Aramayo",
    email: "persona@aramayo.invalid",
    membershipId: "membership-1",
    organizationId: configuration.id,
    roles,
    sessionId: "session-1",
    userId: "user-1",
  };
}

function brandCommand(
  authenticatedActor: AuthenticatedActor,
): UpdateBrandConfigurationCommand {
  return {
    actor: authenticatedActor,
    brandVersion: configuration.brand.version,
    claim: "  Todo para tu obra   y tu vehículo  ",
    displayName: "  Ferretería y Lubricentro Aramayo ",
    handle: " @aramayo ",
    legalName: " Aramayo S.R.L. ",
    name: " Aramayo ",
    organizationVersion: configuration.version,
    shortName: " Aramayo ",
    themeId: "taller",
  };
}

class FakeOrganizationConfigurationRepository implements OrganizationConfigurationRepository {
  brandInput: PersistBrandConfigurationInput | undefined;
  brandResult: ConfigurationMutationResult = {
    configuration,
    status: "updated",
  };
  findResult: OrganizationConfiguration | null = configuration;

  findByOrganizationId(): Promise<OrganizationConfiguration | null> {
    return Promise.resolve(this.findResult);
  }

  updateBrand(
    input: PersistBrandConfigurationInput,
  ): Promise<ConfigurationMutationResult> {
    this.brandInput = input;
    return Promise.resolve(this.brandResult);
  }

  updateLocation(): Promise<ConfigurationMutationResult> {
    return Promise.resolve({
      configuration,
      status: "updated",
    });
  }
}

test("un rol con lectura obtiene sólo la configuración de su organización", async () => {
  const repository = new FakeOrganizationConfigurationRepository();
  const service = new OrganizationConfigurationService(repository);

  assert.equal(await service.read(actor(["viewer"])), configuration);
});

test("un editor no puede mutar la identidad ni alcanzar persistencia", async () => {
  const repository = new FakeOrganizationConfigurationRepository();
  const service = new OrganizationConfigurationService(repository);

  await assert.rejects(
    service.updateBrand(brandCommand(actor(["editor"]))),
    ForbiddenException,
  );
  assert.equal(repository.brandInput, undefined);
});

test("un administrador persiste texto normalizado y versiones esperadas", async () => {
  const repository = new FakeOrganizationConfigurationRepository();
  const service = new OrganizationConfigurationService(repository);

  assert.equal(
    await service.updateBrand(brandCommand(actor(["admin"]))),
    configuration,
  );
  assert.deepEqual(repository.brandInput?.update, {
    brandVersion: 2,
    claim: "Todo para tu obra y tu vehículo",
    displayName: "Ferretería y Lubricentro Aramayo",
    handle: "@aramayo",
    legalName: "Aramayo S.R.L.",
    name: "Aramayo",
    organizationVersion: 3,
    shortName: "Aramayo",
    themeId: "taller",
  });
});

test("una versión perdida se expone como conflicto y nunca como éxito", async () => {
  const repository = new FakeOrganizationConfigurationRepository();
  repository.brandResult = { status: "conflict" };
  const service = new OrganizationConfigurationService(repository);

  await assert.rejects(
    service.updateBrand(brandCommand(actor(["admin"]))),
    ConflictException,
  );
});

test("un tema fuera del catálogo se representa como error de borde", async () => {
  const repository = new FakeOrganizationConfigurationRepository();
  const service = new OrganizationConfigurationService(repository);

  await assert.rejects(
    service.updateBrand({
      ...brandCommand(actor(["admin"])),
      themeId: "inventado",
    }),
    (cause: unknown) =>
      cause instanceof BadRequestException && cause.getStatus() === 400,
  );
  assert.equal(repository.brandInput, undefined);
});
