import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  ConfigurationMutationResult,
  CreateRecurringStoryRuleCommand,
  CreateRecurringStoryRuleResult,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  RecurringStoryRuleRecord,
  RecurringStoryRuleRepository,
} from "@aramayo/domain";
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
  accent: "marca",
  approvalPolicy: "human-each-cycle",
  createdByMembershipId: "membership-1",
  designVariant: "cartel",
  effectiveFrom: "2026-09-08T11:30:00.000Z",
  id: "rule-1",
  kind: "apertura",
  leadTimeMinutes: 120,
  localTime: "08:30",
  locationId: primaryLocation.id,
  name: "Apertura",
  organizationId: configuration.id,
  photo: null,
  status: "active",
  theme: "taller",
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
  visualStyleInput:
    | Parameters<RecurringStoryRuleRepository["updateVisualStyle"]>[0]
    | undefined;

  create(
    input: CreateRecurringStoryRuleCommand &
      Readonly<{ idempotencyKey: string; occurredAt: string }>,
  ): Promise<CreateRecurringStoryRuleResult> {
    this.input = input;
    return Promise.resolve({ rule: storedRule, status: "created" });
  }

  lifecycleInput:
    | Parameters<RecurringStoryRuleRepository["setStatus"]>[0]
    | Parameters<RecurringStoryRuleRepository["delete"]>[0]
    | undefined;

  list(): Promise<readonly RecurringStoryRuleRecord[]> {
    return Promise.resolve([storedRule]);
  }

  setStatus(
    input: Parameters<RecurringStoryRuleRepository["setStatus"]>[0],
  ): ReturnType<RecurringStoryRuleRepository["setStatus"]> {
    this.lifecycleInput = input;
    return Promise.resolve({
      rule: { ...storedRule, status: input.status, version: 2 },
      status: "updated",
    });
  }

  delete(
    input: Parameters<RecurringStoryRuleRepository["delete"]>[0],
  ): ReturnType<RecurringStoryRuleRepository["delete"]> {
    this.lifecycleInput = input;
    return Promise.resolve({ ruleId: input.ruleId, status: "deleted" });
  }

  updateVisualStyle(
    input: Parameters<RecurringStoryRuleRepository["updateVisualStyle"]>[0],
  ): Promise<
    | Readonly<{ rule: RecurringStoryRuleRecord; status: "updated" }>
    | Readonly<{ status: "not-found" }>
    | Readonly<{ status: "version-conflict" }>
  > {
    this.visualStyleInput = input;
    return Promise.resolve({
      rule: {
        ...storedRule,
        designVariant: input.designVariant,
        theme: input.theme,
        version: 2,
      },
      status: "updated",
    });
  }
}

/** Una regla para todas las sucursales activas: sin sucursal elegida. */
const everyLocationSubmission = {
  approvalPolicy: "human-each-cycle" as const,
  effectiveFromLocalDate: "2026-09-08",
  leadTimeMinutes: 120,
  localTime: "08:30",
  name: " Apertura ",
  weekdays: [1, 2, 3, 4, 5, 6],
};
const submission = {
  ...everyLocationSubmission,
  locationId: primaryLocation.id,
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

test("actualiza el estilo de una regla con control de versión", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());
  const result = await service.updateVisualStyle(
    actor(["approver"]),
    storedRule.id,
    {
      accent: "verde",
      designVariant: "locales",
      expectedVersion: storedRule.version,
      kind: "apertura",
      photo: null,
      theme: "promo",
    },
    "rule-design-idempotency-1",
  );

  assert.equal(result.status, "updated");
  assert.equal(result.rule.version, 2);
  assert.ok(rules.visualStyleInput);
  const capturedVisualStyleInput = rules.visualStyleInput;
  assert.equal(capturedVisualStyleInput.designVariant, "locales");
  assert.equal(capturedVisualStyleInput.theme, "promo");
  assert.equal(capturedVisualStyleInput.accent, "verde");
  assert.equal(capturedVisualStyleInput.photo, null);
  assert.equal(capturedVisualStyleInput.expectedVersion, storedRule.version);
  assert.equal(
    capturedVisualStyleInput.idempotencyKey,
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

// Cabecera real de un JPEG (FF D8 FF E0): el motor la reconoce como tal.
const jpegPhoto = {
  alt: " Nuestra gata en el mostrador ",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
  focusX: 50,
  focusY: 40,
  zoom: 100,
};

test("una regla guarda su foto propia y su acento", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  await service.create(
    actor(["approver"]),
    {
      ...submission,
      accent: "verde",
      designVariant: "imagen",
      photo: jpegPhoto,
    },
    "rule-idempotency-photo",
  );

  assert.equal(rules.input?.accent, "verde");
  assert.equal(rules.input.designVariant, "imagen");
  assert.deepEqual(rules.input.photo, {
    ...jpegPhoto,
    alt: "Nuestra gata en el mostrador",
  });
});

test("la imagen propia sin imagen y una foto falsa se rechazan antes de guardar", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  await assert.rejects(
    service.create(
      actor(["approver"]),
      { ...submission, designVariant: "imagen" },
      "rule-idempotency-own-image",
    ),
    BadRequestException,
  );
  // Los bytes de un JPEG declarados como PNG no son una foto que el render
  // pueda decodificar.
  await assert.rejects(
    service.create(
      actor(["approver"]),
      {
        ...submission,
        photo: {
          ...jpegPhoto,
          dataUrl: jpegPhoto.dataUrl.replace("image/jpeg", "image/png"),
        },
      },
      "rule-idempotency-fake-photo",
    ),
    BadRequestException,
  );
  await assert.rejects(
    service.updateVisualStyle(
      actor(["approver"]),
      storedRule.id,
      {
        accent: "marca",
        designVariant: "imagen",
        expectedVersion: storedRule.version,
        kind: "apertura",
        photo: null,
        theme: "promo",
      },
      "rule-design-idempotency-own-image",
    ),
    BadRequestException,
  );
  assert.equal(rules.input, undefined);
  assert.equal(rules.visualStyleInput, undefined);
});

test("el lubricentro necesita su sucursal y no toma marcos de la apertura", async () => {
  const rejected = new RecurringStoryService(
    new FakeRules(),
    new FakeConfiguration(),
  );
  // El servicio funciona únicamente en casa central: no hay historia del
  // lubricentro «para todas las sucursales».
  await assert.rejects(
    rejected.create(
      actor(["approver"]),
      {
        ...everyLocationSubmission,
        designVariant: "ventana",
        kind: "lubricentro",
      },
      "rule-idempotency-lubricentro-scope",
    ),
    BadRequestException,
  );
  await assert.rejects(
    rejected.create(
      actor(["approver"]),
      { ...submission, designVariant: "cartel", kind: "lubricentro" },
      "rule-idempotency-lubricentro-frame",
    ),
    BadRequestException,
  );
  // La paleta de la ferretería tampoco: publicaría con la marca equivocada.
  await assert.rejects(
    rejected.create(
      actor(["approver"]),
      {
        ...submission,
        designVariant: "ventana",
        kind: "lubricentro",
        theme: "promo",
      },
      "rule-idempotency-lubricentro-theme",
    ),
    BadRequestException,
  );

  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());
  await service.create(
    actor(["approver"]),
    {
      ...submission,
      designVariant: "esquina",
      kind: "lubricentro",
      photo: jpegPhoto,
      theme: "lubricentro",
    },
    "rule-idempotency-lubricentro",
  );
  assert.equal(rules.input?.kind, "lubricentro");
  assert.equal(rules.input.designVariant, "esquina");
  assert.equal(rules.input.theme, "lubricentro");
  assert.deepEqual(rules.input.photo, {
    ...jpegPhoto,
    alt: "Nuestra gata en el mostrador",
  });
});

test("cambiar el estilo exige decir qué pasa con la foto", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());
  const withoutPhoto = {
    accent: "marca" as const,
    designVariant: "cartel" as const,
    expectedVersion: storedRule.version,
    kind: "apertura" as const,
    theme: "promo" as const,
  };

  await assert.rejects(
    service.updateVisualStyle(
      actor(["approver"]),
      storedRule.id,
      // Un cliente viejo que no conoce la foto no puede borrarla sin querer.
      withoutPhoto,
      "rule-design-idempotency-missing-photo",
    ),
    BadRequestException,
  );
  assert.equal(rules.visualStyleInput, undefined);
});

test("pausar y reanudar cambian el estado y dejan la clave idempotente", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  const pausada = await service.setStatus(
    actor(["approver"]),
    storedRule.id,
    { expectedVersion: storedRule.version, status: "paused" },
    "rule-pause-idempotency-0001",
  );

  assert.equal(pausada.rule.status, "paused");
  const pedido = rules.lifecycleInput;
  assert.ok(pedido);
  assert.equal(pedido.idempotencyKey, "rule-pause-idempotency-0001");
  assert.equal(pedido.expectedVersion, storedRule.version);

  const activa = await service.setStatus(
    actor(["approver"]),
    storedRule.id,
    { expectedVersion: storedRule.version, status: "active" },
    "rule-resume-idempotency-0001",
  );
  assert.equal(activa.rule.status, "active");
});

test("borrar la regla devuelve su identificador y exige permiso de programación", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  assert.deepEqual(
    await service.delete(
      actor(["approver"]),
      storedRule.id,
      storedRule.version,
      "rule-delete-idempotency-0001",
    ),
    { ruleId: storedRule.id, status: "deleted" },
  );
});

test("sin clave idempotente no se pausa ni se borra", async () => {
  const rules = new FakeRules();
  const service = new RecurringStoryService(rules, new FakeConfiguration());

  await assert.rejects(
    service.setStatus(actor(["approver"]), storedRule.id, {
      expectedVersion: storedRule.version,
      status: "paused",
    }),
    BadRequestException,
  );
  await assert.rejects(
    service.delete(actor(["approver"]), storedRule.id, storedRule.version),
    BadRequestException,
  );
  assert.equal(rules.lifecycleInput, undefined);
});
