import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  ConfigurationMutationResult,
  CreateRecurringStoryRuleCommand,
  CreateRecurringStoryRuleResult,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  RecurringStoryDesignVariant,
  RecurringStoryRuleRecord,
  RecurringStoryRuleRepository,
} from "@aramayo/domain";
import { defaultRecurringStoryDesignRotation } from "@aramayo/domain";
import { BadRequestException, ForbiddenException } from "@nestjs/common";

import { RecurringStoryService } from "./recurring-story.service.ts";

const primaryLocation = {
  addressLine: "Rivadavia 673",
  city: "Frías",
  id: "10000000-0000-4000-8000-000000000005",
  isActive: true,
  name: "Sucursal Rivadavia",
  openingHours: "Lun a sáb · 08:30 a 13:00",
  province: "Santiago del Estero",
  timeZone: "America/Argentina/Cordoba",
  version: 1,
} as const;

const configuration: OrganizationConfiguration = {
  brand: {
    claim: "Todo para tu obra",
    handle: "@aramayo",
    id: "brand-1",
    name: "Aramayo",
    shortName: "Aramayo",
    themeId: "taller",
    version: 1,
  },
  displayName: "Aramayo",
  id: "organization-1",
  legalName: "Aramayo",
  locations: [primaryLocation],
  version: 1,
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

const storedRule: RecurringStoryRuleRecord = {
  approvalPolicy: "human-each-cycle",
  createdByMembershipId: "membership-1",
  designRotation: defaultRecurringStoryDesignRotation,
  effectiveFrom: "2026-09-08T11:30:00.000Z",
  id: "rule-1",
  leadTimeMinutes: 120,
  localTime: "08:30",
  locationId: primaryLocation.id,
  name: "Apertura",
  organizationId: configuration.id,
  status: "active",
  timeZone: "America/Argentina/Cordoba",
  version: 1,
  weekdays: [1, 2, 3, 4, 5, 6],
};

class FakeConfiguration implements OrganizationConfigurationRepository {
  current: OrganizationConfiguration = configuration;

  findByOrganizationId(): Promise<OrganizationConfiguration | null> {
    return Promise.resolve(this.current);
  }
  updateBrand(): Promise<ConfigurationMutationResult> {
    throw new Error("not used");
  }
  updateLocation(): Promise<ConfigurationMutationResult> {
    throw new Error("not used");
  }
}

class FakeRules implements RecurringStoryRuleRepository {
  input:
    | (CreateRecurringStoryRuleCommand &
        Readonly<{ idempotencyKey: string; occurredAt: string }>)
    | undefined;
  designRotationInput:
    | Parameters<RecurringStoryRuleRepository["updateDesignRotation"]>[0]
    | undefined;

  create(
    input: CreateRecurringStoryRuleCommand &
      Readonly<{ idempotencyKey: string; occurredAt: string }>,
  ): Promise<CreateRecurringStoryRuleResult> {
    this.input = input;
    return Promise.resolve({ rule: storedRule, status: "created" });
  }

  list(): Promise<readonly RecurringStoryRuleRecord[]> {
    return Promise.resolve([storedRule]);
  }

  updateDesignRotation(
    input: Parameters<RecurringStoryRuleRepository["updateDesignRotation"]>[0],
  ): Promise<
    | Readonly<{ rule: RecurringStoryRuleRecord; status: "updated" }>
    | Readonly<{ status: "not-found" }>
    | Readonly<{ status: "version-conflict" }>
  > {
    this.designRotationInput = input;
    return Promise.resolve({
      rule: { ...storedRule, designRotation: input.designRotation, version: 2 },
      status: "updated",
    });
  }
}

const submission = {
  approvalPolicy: "human-each-cycle" as const,
  effectiveFromLocalDate: "2026-09-08",
  leadTimeMinutes: 120,
  localTime: "08:30",
  locationId: primaryLocation.id,
  name: " Apertura ",
  weekdays: [1, 2, 3, 4, 5, 6],
};

test("crea una regla anclada a la fecha civil de la sucursal", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  const result = await service.create(
    actor(["approver"]),
    submission,
    "rule-idempotency-1",
  );

  assert.equal(result.status, "created");
  assert.ok(rules.input);
  assert.equal(rules.input.effectiveFrom, "2026-09-08T11:30:00.000Z");
  assert.equal(rules.input.name, "Apertura");
});

test("la política automática exige administrador y aprobador", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  await assert.rejects(
    service.create(
      actor(["approver"]),
      { ...submission, approvalPolicy: "automatic-routine" },
      "rule-idempotency-2",
    ),
    ForbiddenException,
  );
  assert.equal(rules.input, undefined);

  const automaticRules = new FakeRules();
  const automaticService = new RecurringStoryService(
    automaticRules,
    new FakeConfiguration(),
  );
  await automaticService.create(
    actor(["admin", "approver"]),
    { ...submission, approvalPolicy: "automatic-routine" },
    "rule-idempotency-3",
  );
  assert.equal(automaticRules.input?.approvalPolicy, "automatic-routine");
});

test("actualiza la rotación de una regla con control de versión", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());
  const designRotation: RecurringStoryDesignVariant[] = [
    "locales",
    "horario",
    "cartel",
    "locales",
    "horario",
    "cartel",
    "locales",
  ];

  const result = await service.updateDesignRotation(
    actor(["approver"]),
    storedRule.id,
    { designRotation, expectedVersion: storedRule.version },
    "rule-design-idempotency-1",
  );

  assert.equal(result.status, "updated");
  assert.equal(result.rule.version, 2);
  assert.ok(rules.designRotationInput);
  const capturedDesignRotationInput = rules.designRotationInput;
  assert.deepEqual(capturedDesignRotationInput.designRotation, designRotation);
  assert.equal(capturedDesignRotationInput.expectedVersion, storedRule.version);
  assert.equal(
    capturedDesignRotationInput.idempotencyKey,
    "rule-design-idempotency-1",
  );
});

test("el workspace expone la capacidad automática sin ampliar permisos", async () => {
  const service = new RecurringStoryService(
    new FakeRules(),
    new FakeConfiguration(),
  );
  assert.equal(
    (await service.workspace(actor(["approver"]))).canUseAutomaticApproval,
    false,
  );
  assert.equal(
    (await service.workspace(actor(["admin", "approver"])))
      .canUseAutomaticApproval,
    true,
  );
});

const centralLocation = {
  ...primaryLocation,
  addressLine: "República de Siria 365",
  id: "10000000-0000-4000-8000-000000000004",
  name: "Casa central",
} as const;

test("sin sucursal, la regla es para todas las activas", async () => {
  const rules = new FakeRules();
  const configurations = new FakeConfiguration();
  configurations.current = {
    ...configuration,
    locations: [primaryLocation, centralLocation],
  };
  const service = new RecurringStoryService(rules, configurations);
  const { locationId, ...everyLocation } = submission;
  assert.equal(locationId, primaryLocation.id);

  const result = await service.create(
    actor(["approver"]),
    everyLocation,
    "rule-idempotency-every",
  );

  assert.equal(result.status, "created");
  assert.equal(rules.input?.locationId, null);
  assert.equal(rules.input.effectiveFrom, "2026-09-08T11:30:00.000Z");
});

test("una regla para todas exige que las sucursales compartan zona horaria", async () => {
  const rules = new FakeRules();
  const configurations = new FakeConfiguration();
  configurations.current = {
    ...configuration,
    locations: [
      primaryLocation,
      { ...centralLocation, timeZone: "America/Argentina/Salta" },
    ],
  };
  const service = new RecurringStoryService(rules, configurations);
  const { locationId, ...everyLocation } = submission;
  assert.equal(locationId, primaryLocation.id);

  await assert.rejects(
    service.create(actor(["approver"]), everyLocation, "rule-idempotency-zone"),
    BadRequestException,
  );
  assert.equal(rules.input, undefined);
});
