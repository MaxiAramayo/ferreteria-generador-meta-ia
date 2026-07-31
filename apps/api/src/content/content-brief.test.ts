import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { DESIGN_SCHEMA_VERSION } from "@aramayo/design-engine";
import type {
  AuthenticatedActor,
  AuthenticatedSessionRecord,
  ContentBrief,
  ContentBriefRequestRepository,
  ContentBriefRunCancellationOutcome,
  ContentBriefRunListFilter,
  ContentBriefRunRecord,
  ContentBriefRunRepository,
  ContentBriefRunRequestResult,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  OrganizationScope,
  PaginatedRecords,
  ReliableMutationContext,
  RequestContentBriefRunInput,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Response } from "express";
import supertest from "supertest";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import {
  CONTENT_BRIEF_REQUEST_REPOSITORY,
  CONTENT_BRIEF_RUN_REPOSITORY,
  ORGANIZATION_CONFIGURATION_REPOSITORY,
} from "../database/database.tokens.ts";
import type { AuthenticatedRequest } from "../identity/identity.decorators.ts";
import { ContentBriefController } from "./content-brief.controller.ts";
import { ContentBriefService } from "./content-brief.service.ts";
import {
  PublicationDraftService,
  type DraftDesignSubmission,
  type PublicationDraftSubmission,
} from "./publication-draft.service.ts";

const organizationId = "20000000-0000-4000-8000-000000000001";
const membershipId = "20000000-0000-4000-8000-000000000002";
const otherOrganizationId = "20000000-0000-4000-8000-000000000009";
const locationId = "20000000-0000-4000-8000-000000000003";
const idempotencyKey = "content-brief-test-key-0001";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Editora Aramayo",
  email: "editora@aramayo.invalid",
  membershipId,
  organizationId,
  roles: Object.freeze(["editor"] as const),
  sessionId: "20000000-0000-4000-8000-000000000004",
  userId: "20000000-0000-4000-8000-000000000005",
});

const session: AuthenticatedSessionRecord = Object.freeze({
  actor,
  csrfTokenHash: "hash",
  expiresAt: "2026-07-31T12:00:00.000Z",
});

const brief: ContentBrief = Object.freeze({
  brand: "ferreteria" as const,
  callToAction: Object.freeze({
    kind: "whatsapp" as const,
    label: "Consultanos por WhatsApp",
  }),
  caption: "Pasá por el local y consultanos cuál te sirve.",
  creativeProposal: "Tono directo.",
  missingInformation: Object.freeze([]),
  objective: "product" as const,
  products: Object.freeze([
    Object.freeze({
      evidenceId: "C1",
      externalProductId: "odoo:product:42",
      label: "Taladro percutor 13 mm",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Taladro percutor para tu obra",
  verifiedFacts: Object.freeze([]),
  visualDirection: "clean_product" as const,
});

const design: DraftDesignSubmission = Object.freeze({
  content: Object.freeze({ title: "Taladro percutor" }),
  format: "feed",
  layout: "producto-destacado",
  media: Object.freeze([]),
  schemaVersion: DESIGN_SCHEMA_VERSION,
  slug: "producto-destacado-taladro",
  theme: "taller",
});

function runRecord(
  overrides: Partial<ContentBriefRunRecord> = {},
): ContentBriefRunRecord {
  return {
    actorMembershipId: membershipId,
    attempts: 0,
    brief: null,
    cancelledAt: null,
    completedAt: null,
    estimatedCostUsd: null,
    evidence: [],
    id: randomUUID(),
    knowledgeStatus: "pending",
    latencyMilliseconds: 0,
    locationId,
    model: "unselected",
    organizationId,
    promptHash: null,
    promptVersion: null,
    rejection: null,
    request: "Necesito una pieza para promocionar taladros percutores.",
    requestHash: "a".repeat(64),
    requestId: null,
    requestedAt: "2026-07-30T12:00:00.000Z",
    responseId: null,
    schemaVersion: null,
    status: "pending",
    toolInvocations: [],
    toolNames: [],
    usage: {
      cacheWriteInputTokens: 0,
      cachedInputTokens: 0,
      estimatedCostUsd: null,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    },
    ...overrides,
  };
}

/** Un run cerrado con brief: el único estado que la aceptación admite. */
function generatedRun(
  overrides: Partial<ContentBriefRunRecord> = {},
): ContentBriefRunRecord {
  return runRecord({
    brief,
    completedAt: "2026-07-30T12:00:20.000Z",
    knowledgeStatus: "grounded",
    latencyMilliseconds: 820,
    model: "gpt-5.6-terra",
    promptHash: "b".repeat(64),
    promptVersion: "content-brief/2026-07-30.2",
    requestId: "req_brief",
    responseId: "resp_brief",
    schemaVersion: "content-brief/2026-07-30.1",
    status: "generated",
    ...overrides,
  });
}

class FakeRequests implements ContentBriefRequestRepository {
  lastInput: RequestContentBriefRunInput | undefined;
  result: ContentBriefRunRequestResult = { runId: "", status: "accepted" };

  request(
    input: RequestContentBriefRunInput,
  ): Promise<ContentBriefRunRequestResult> {
    this.lastInput = input;
    return Promise.resolve(
      this.result.status === "accepted"
        ? { runId: input.id, status: "accepted" }
        : this.result,
    );
  }
}

class FakeRuns implements ContentBriefRunRepository {
  lastListFilter: ContentBriefRunListFilter | undefined;
  readonly records = new Map<string, ContentBriefRunRecord>();

  add(record: ContentBriefRunRecord): ContentBriefRunRecord {
    this.records.set(record.id, record);
    return record;
  }

  /** El filtro con el que el servicio consultó, ya sin la duda de si consultó. */
  lastFilter(): ContentBriefRunListFilter {
    if (this.lastListFilter === undefined) {
      throw new Error("El servicio no consultó el historial.");
    }
    return this.lastListFilter;
  }

  cancel(input: {
    readonly id: string;
    readonly cancelledAt: string;
    readonly organizationId: string;
  }): Promise<ContentBriefRunCancellationOutcome> {
    const existing = this.records.get(input.id);
    if (
      existing === undefined ||
      existing.organizationId !== input.organizationId
    ) {
      return Promise.resolve({ status: "not-found" });
    }
    if (existing.status !== "pending") {
      return Promise.resolve({
        resolvedStatus: existing.status,
        status: "already-resolved",
      });
    }
    this.records.set(input.id, {
      ...existing,
      cancelledAt: input.cancelledAt,
      status: "cancelled",
    });
    return Promise.resolve({ status: "cancelled" });
  }

  complete(): Promise<never> {
    throw new Error("La API no cierra ejecuciones.");
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    const existing = this.records.get(scope.id);
    return Promise.resolve(
      existing === undefined || existing.organizationId !== scope.organizationId
        ? null
        : existing,
    );
  }

  list(
    filter: ContentBriefRunListFilter,
  ): Promise<PaginatedRecords<ContentBriefRunRecord>> {
    this.lastListFilter = filter;
    const matching = [...this.records.values()].filter(
      (record) =>
        record.organizationId === filter.organizationId &&
        (filter.actorMembershipId === undefined ||
          record.actorMembershipId === filter.actorMembershipId),
    );
    return Promise.resolve({
      items: matching,
      limit: filter.limit,
      page: filter.page,
      total: matching.length,
    });
  }

  reserve(): Promise<void> {
    throw new Error("La API reserva dentro de la transacción del pedido.");
  }
}

class FakeConfiguration implements OrganizationConfigurationRepository {
  findByOrganizationId(
    requestedOrganizationId: string,
  ): Promise<OrganizationConfiguration | null> {
    if (requestedOrganizationId !== organizationId) {
      return Promise.resolve(null);
    }
    const configuration: OrganizationConfiguration = {
      brand: {
        claim: "Todo para tu obra.",
        handle: "aramayo",
        id: "20000000-0000-4000-8000-000000000006",
        name: "Aramayo",
        shortName: "Aramayo",
        themeId: "taller",
        version: 1,
      },
      displayName: "Ferretería Aramayo",
      id: organizationId,
      legalName: "Aramayo S.R.L.",
      locations: [
        {
          addressLine: "Av. Siempreviva 742",
          city: "Salta",
          id: locationId,
          isActive: true,
          name: "Sucursal Centro",
          openingHours: "Lunes a viernes de 8 a 18",
          province: "Salta",
          timeZone: "America/Argentina/Salta",
          version: 1,
        },
      ],
      version: 1,
    };
    return Promise.resolve(configuration);
  }

  updateBrand(): Promise<never> {
    throw new Error("El brief no edita la configuración.");
  }

  updateLocation(): Promise<never> {
    throw new Error("El brief no edita la configuración.");
  }
}

class FakeDrafts {
  lastSubmission: PublicationDraftSubmission | undefined;

  create(
    _actor: AuthenticatedActor,
    submission: PublicationDraftSubmission,
  ): Promise<{ publicationId: string }> {
    this.lastSubmission = submission;
    return Promise.resolve({ publicationId: "created" });
  }
}

const reliableOperationService = {
  prepare(
    preparedActor: AuthenticatedActor,
    operation: string,
  ): ReliableMutationContext {
    return {
      auditEventId: randomUUID(),
      claim: {
        actorMembershipId: preparedActor.membershipId,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        keyHash: "a".repeat(64),
        operation,
        organizationId: preparedActor.organizationId,
        requestHash: "b".repeat(64),
      },
      completedExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      occurredAt: new Date().toISOString(),
      outboxEventId: randomUUID(),
    };
  },
} satisfies Pick<ReliableOperationService, "prepare">;

async function serviceFor(
  requests: FakeRequests,
  runs: FakeRuns,
  drafts: FakeDrafts,
): Promise<ContentBriefService> {
  const testingModule = await Test.createTestingModule({
    providers: [
      ContentBriefService,
      { provide: CONTENT_BRIEF_REQUEST_REPOSITORY, useValue: requests },
      { provide: CONTENT_BRIEF_RUN_REPOSITORY, useValue: runs },
      {
        provide: ORGANIZATION_CONFIGURATION_REPOSITORY,
        useValue: new FakeConfiguration(),
      },
      { provide: ReliableOperationService, useValue: reliableOperationService },
      { provide: PublicationDraftService, useValue: drafts },
    ],
  }).compile();
  return testingModule.get(ContentBriefService);
}

function harness(): Promise<ContentBriefService> {
  return serviceFor(new FakeRequests(), new FakeRuns(), new FakeDrafts());
}

test("el pedido normaliza el texto y toma el alcance de la sesión", async () => {
  const requests = new FakeRequests();
  const runs = new FakeRuns();
  const service = await serviceFor(requests, runs, new FakeDrafts());

  const accepted = await service.request(
    actor,
    {
      locationId,
      request: "  Necesito   una pieza\npara taladros percutores.  ",
    },
    idempotencyKey,
  );

  assert.equal(accepted.status, "pending");
  const input = requests.lastInput;
  assert.ok(input !== undefined);
  assert.equal(input.request, "Necesito una pieza para taladros percutores.");
  // El nombre de la sucursal lo resuelve el servidor: el pedido sólo trae su id.
  assert.equal(input.locationName, "Sucursal Centro");
  // El hash acompaña al texto ya normalizado: dos pedidos que sólo difieren en
  // espacios deben ser el mismo pedido.
  assert.equal(
    input.requestHash,
    createHash("sha256").update(input.request).digest("hex"),
  );
  assert.equal(input.organizationId, organizationId);
  assert.equal(input.actorMembershipId, membershipId);
  assert.equal(accepted.runId, input.id);
});

test("un pedido fuera de los límites de longitud se rechaza", async () => {
  const service = await harness();

  await assert.rejects(
    () =>
      service.request(
        actor,
        { locationId: null, request: "corto" },
        idempotencyKey,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      service.request(
        actor,
        { locationId: null, request: "a".repeat(601) },
        idempotencyKey,
      ),
    BadRequestException,
  );
});

test("un pedido sin cabecera idempotente no reserva ejecución", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns(), new FakeDrafts());

  await assert.rejects(
    () =>
      service.request(actor, {
        locationId: null,
        request: "Necesito una pieza para promocionar taladros.",
      }),
    BadRequestException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("una sucursal con formato inválido no llega al repositorio", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns(), new FakeDrafts());

  await assert.rejects(
    () =>
      service.request(
        actor,
        {
          locationId: "no-es-uuid",
          request: "Necesito una pieza para promocionar taladros.",
        },
        idempotencyKey,
      ),
    BadRequestException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("una sucursal que no pertenece a la organización se detiene antes de reservar", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns(), new FakeDrafts());

  // La clave foránea compuesta ya impide el cruce, pero fallar acá devuelve un
  // 404 en lugar de romper dentro de la transacción.
  await assert.rejects(
    () =>
      service.request(
        actor,
        {
          locationId: "20000000-0000-4000-8000-00000000000a",
          request: "Necesito una pieza para promocionar taladros.",
        },
        idempotencyKey,
      ),
    NotFoundException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("una clave idempotente reutilizada y un pedido en curso son conflictos", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns(), new FakeDrafts());
  const command = {
    locationId: null,
    request: "Necesito una pieza para promocionar taladros.",
  };

  requests.result = { status: "idempotency-conflict" };
  await assert.rejects(
    () => service.request(actor, command, idempotencyKey),
    ConflictException,
  );

  requests.result = {
    retryAfter: "2026-07-30T12:00:30.000Z",
    status: "in-progress",
  };
  await assert.rejects(
    () => service.request(actor, command, idempotencyKey),
    ConflictException,
  );
});

test("cancelar una ejecución pendiente la deja cancelada", async () => {
  const runs = new FakeRuns();
  const record = runs.add(runRecord());
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  const outcome = await service.cancel(actor, record.id);

  assert.deepEqual(outcome, { runId: record.id, status: "cancelled" });
});

test("cancelar una ejecución ya resuelta informa el estado real sin fallar", async () => {
  const runs = new FakeRuns();
  const record = runs.add(generatedRun());
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  const outcome = await service.cancel(actor, record.id);

  // Cancelar no puede revertir un resultado ya confirmado.
  assert.deepEqual(outcome, { runId: record.id, status: "generated" });
});

test("una ejecución de otra organización no se consulta ni se cancela", async () => {
  const runs = new FakeRuns();
  const foreign = runs.add(runRecord({ organizationId: otherOrganizationId }));
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  await assert.rejects(
    () => service.findById(actor, foreign.id),
    NotFoundException,
  );
  await assert.rejects(
    () => service.cancel(actor, foreign.id),
    NotFoundException,
  );
});

test("la proyección oculta el rastro interno y admite una ejecución sin prompt", async () => {
  const runs = new FakeRuns();
  const record = runs.add(runRecord());
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  const response = await service.findById(actor, record.id);

  assert.equal(response.status, "pending");
  // Pendiente todavía no eligió prompt, esquema ni modelo: hacia afuera es
  // ausencia, no el centinela con el que se reservó.
  assert.equal(response.promptVersion, null);
  assert.equal(response.schemaVersion, null);
  assert.equal(response.model, null);
  assert.ok(!Object.hasOwn(response, "requestHash"));
  assert.ok(!Object.hasOwn(response, "requestId"));
  assert.ok(!Object.hasOwn(response, "responseId"));
});

test("el historial acota por organización y sólo filtra por autor si se pide", async () => {
  const runs = new FakeRuns();
  runs.add(runRecord());
  runs.add(runRecord({ actorMembershipId: "otra-membresia" }));
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  const all = await service.list(actor, {});
  assert.equal(all.total, 2);
  const unfiltered = runs.lastFilter();
  assert.equal(unfiltered.actorMembershipId, undefined);
  assert.equal(unfiltered.limit, 20);

  const mine = await service.list(actor, { mine: true });
  assert.equal(mine.total, 1);
  assert.equal(runs.lastFilter().actorMembershipId, membershipId);
});

test("el historial recorta el tamaño de página al máximo permitido", async () => {
  const runs = new FakeRuns();
  const service = await serviceFor(new FakeRequests(), runs, new FakeDrafts());

  await service.list(actor, { limit: 500, page: 0 });

  const clamped = runs.lastFilter();
  assert.equal(clamped.limit, 50);
  assert.equal(clamped.page, 1);
});

test("aceptar arma la revisión con el copy del brief, no con el del cliente", async () => {
  const runs = new FakeRuns();
  const drafts = new FakeDrafts();
  const record = runs.add(generatedRun());
  const service = await serviceFor(new FakeRequests(), runs, drafts);

  await service.accept(actor, record.id, design, idempotencyKey);

  const submission = drafts.lastSubmission;
  assert.ok(submission !== undefined);
  assert.equal(submission.title, brief.title);
  assert.equal(submission.content.caption, brief.caption);
  assert.deepEqual(submission.content.products, [
    { label: "Taladro percutor 13 mm", reference: "odoo:product:42" },
  ]);
  // La sucursal sale de la ejecución, que ya la derivó de la sesión.
  assert.equal(submission.locationId, locationId);
  assert.equal(submission.design, design);
});

test("aceptar una ejecución que no generó brief es un conflicto", async () => {
  const runs = new FakeRuns();
  const drafts = new FakeDrafts();
  const pending = runs.add(runRecord());
  const cancelled = runs.add(runRecord({ status: "cancelled" }));
  const rejected = runs.add(
    runRecord({
      rejection: { code: "evidence-stale", message: "Evidencia vencida." },
      status: "rejected",
    }),
  );
  const service = await serviceFor(new FakeRequests(), runs, drafts);

  for (const record of [pending, cancelled, rejected]) {
    await assert.rejects(
      () => service.accept(actor, record.id, design, idempotencyKey),
      ConflictException,
    );
  }
  assert.equal(drafts.lastSubmission, undefined);
});

test("aceptar una ejecución inexistente o ajena no crea revisión", async () => {
  const runs = new FakeRuns();
  const drafts = new FakeDrafts();
  const foreign = runs.add(
    generatedRun({ organizationId: otherOrganizationId }),
  );
  const service = await serviceFor(new FakeRequests(), runs, drafts);

  await assert.rejects(
    () => service.accept(actor, randomUUID(), design, idempotencyKey),
    NotFoundException,
  );
  await assert.rejects(
    () => service.accept(actor, foreign.id, design, idempotencyKey),
    NotFoundException,
  );
  assert.equal(drafts.lastSubmission, undefined);
});

let application: INestApplication;
let baseUrl: string;
let httpRuns: FakeRuns;
let httpDrafts: FakeDrafts;

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an HTTP JSON object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

before(async () => {
  httpRuns = new FakeRuns();
  httpDrafts = new FakeDrafts();
  const testingModule = await Test.createTestingModule({
    controllers: [ContentBriefController],
    providers: [
      ContentBriefService,
      {
        provide: CONTENT_BRIEF_REQUEST_REPOSITORY,
        useValue: new FakeRequests(),
      },
      { provide: CONTENT_BRIEF_RUN_REPOSITORY, useValue: httpRuns },
      {
        provide: ORGANIZATION_CONFIGURATION_REPOSITORY,
        useValue: new FakeConfiguration(),
      },
      { provide: ReliableOperationService, useValue: reliableOperationService },
      { provide: PublicationDraftService, useValue: httpDrafts },
    ],
  }).compile();

  application = testingModule.createNestApplication();
  application.use(
    (
      request: AuthenticatedRequest,
      _response: Response,
      next: NextFunction,
    ) => {
      request.authenticationSession = session;
      next();
    },
  );
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await application.listen(0, "127.0.0.1");
  baseUrl = await application.getUrl();
});

after(async () => {
  await application.close();
});

test("el flujo HTTP acepta el pedido, consulta e informa el estado", async () => {
  const missingKey = await supertest(baseUrl)
    .post("/content-briefs")
    .send({ request: "Necesito una pieza para promocionar taladros." });
  assert.equal(missingKey.status, 400);

  // Pedir no genera: responde 202 y deja la ejecución consultable.
  const accepted = await supertest(baseUrl)
    .post("/content-briefs")
    .set("idempotency-key", idempotencyKey)
    .send({ request: "Necesito una pieza para promocionar taladros." });
  assert.equal(accepted.status, 202);
  assert.equal(jsonObject(accepted.body).status, "pending");

  const identifier = "no-es-uuid";
  const malformed = await supertest(baseUrl).get(
    `/content-briefs/${identifier}`,
  );
  assert.equal(malformed.status, 400);

  const record = httpRuns.add(runRecord());
  const detail = await supertest(baseUrl).get(`/content-briefs/${record.id}`);
  assert.equal(detail.status, 200);
  assert.equal(jsonObject(detail.body).status, "pending");
  assert.equal(jsonObject(detail.body).promptVersion, null);

  const cancelled = await supertest(baseUrl).post(
    `/content-briefs/${record.id}/cancel`,
  );
  assert.equal(cancelled.status, 201);
  assert.equal(jsonObject(cancelled.body).status, "cancelled");
});

test("el pedido HTTP rechaza campos que el contrato no declara", async () => {
  // `promptVersion` es exactamente lo que un cliente podría intentar imponer;
  // el prompt lo elige el worker, así que el body no puede nombrarlo.
  const response = await supertest(baseUrl)
    .post("/content-briefs")
    .set("idempotency-key", idempotencyKey)
    .send({
      promptVersion: "content-brief/propia",
      request: "Necesito una pieza para promocionar taladros.",
    });

  assert.equal(response.status, 400);
});

test("aceptar por HTTP responde 201 y no toca el copy del brief", async () => {
  const record = httpRuns.add(generatedRun());

  const response = await supertest(baseUrl)
    .post(`/content-briefs/${record.id}/acceptance`)
    .set("idempotency-key", idempotencyKey)
    .send({ design, title: "Título del cliente" });

  // `title` no pertenece al contrato de aceptación: el copy sale del brief.
  assert.equal(response.status, 400);

  const valid = await supertest(baseUrl)
    .post(`/content-briefs/${record.id}/acceptance`)
    .set("idempotency-key", idempotencyKey)
    .send({ design });
  assert.equal(valid.status, 201);
  assert.equal(httpDrafts.lastSubmission?.title, brief.title);
});
