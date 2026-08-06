import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type {
  AuthenticatedActor,
  ContentBrief,
  ContentBriefRunRecord,
  ContentBriefRunRepository,
  GenerationRunCancellationOutcome,
  GenerationRunListFilter,
  GenerationRunRecord,
  GenerationRunRepository,
  GenerationPolicyRepository,
  GenerationRunRequestRepository,
  GenerationRunRequestResult,
  GenerationRunWriteOutcome,
  OrganizationScope,
  PaginatedRecords,
  ReliableMutationContext,
  RequestGenerationRunInput,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import {
  CONTENT_BRIEF_RUN_REPOSITORY,
  GENERATION_RUN_REPOSITORY,
  GENERATION_RUN_REQUEST_REPOSITORY,
  GENERATION_POLICY_REPOSITORY,
} from "../database/database.tokens.ts";
import { GenerationRunService } from "./generation-run.service.ts";

const organizationId = "30000000-0000-4000-8000-000000000001";
const membershipId = "30000000-0000-4000-8000-000000000002";
const otherOrganizationId = "30000000-0000-4000-8000-000000000009";
const briefRunId = "30000000-0000-4000-8000-000000000003";
const idempotencyKey = "generation-run-test-key-0001";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Editora Aramayo",
  email: "editora@aramayo.invalid",
  membershipId,
  organizationId,
  roles: Object.freeze(["editor"] as const),
  sessionId: "30000000-0000-4000-8000-000000000004",
  userId: "30000000-0000-4000-8000-000000000005",
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

function briefRun(
  overrides: Partial<ContentBriefRunRecord> = {},
): ContentBriefRunRecord {
  return {
    actorMembershipId: membershipId,
    attempts: 1,
    brief,
    cancelledAt: null,
    completedAt: "2026-08-03T11:00:00.000Z",
    estimatedCostUsd: null,
    evidence: [],
    id: briefRunId,
    knowledgeStatus: "grounded",
    latencyMilliseconds: 100,
    locationId: null,
    model: "gpt-5.6-terra",
    organizationId,
    promptHash: "a".repeat(64),
    promptVersion: "content-brief/2026-07-30.2",
    rejection: null,
    request: "Pieza para taladros.",
    requestHash: "b".repeat(64),
    requestId: null,
    requestedAt: "2026-08-03T11:00:00.000Z",
    responseId: null,
    schemaVersion: "content-brief/2026-07-30.1",
    status: "generated",
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

class FakeBriefs implements ContentBriefRunRepository {
  #record: ContentBriefRunRecord | null;

  constructor(record: ContentBriefRunRecord | null = briefRun()) {
    this.#record = record;
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    if (
      this.#record === null ||
      scope.organizationId !== this.#record.organizationId ||
      scope.id !== this.#record.id
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.#record);
  }

  cancel(): Promise<never> {
    throw new Error("no usado");
  }
  complete(): Promise<never> {
    throw new Error("no usado");
  }
  list(): Promise<never> {
    throw new Error("no usado");
  }
  reserve(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeRequests implements GenerationRunRequestRepository {
  lastInput: RequestGenerationRunInput | undefined;
  result: GenerationRunRequestResult = {
    admission: {
      mode: "provider",
      pricingVersion: "test-pricing",
      referenceCostMicrousd: 53_000,
      reservedCostMicrousd: 213_000,
    },
    runId: "",
    status: "accepted",
  };

  request(
    input: RequestGenerationRunInput,
  ): Promise<GenerationRunRequestResult> {
    this.lastInput = input;
    return Promise.resolve(
      this.result.status === "accepted"
        ? {
            admission: this.result.admission,
            runId: input.id,
            status: "accepted",
          }
        : this.result,
    );
  }
}

function runRecord(
  overrides: Partial<GenerationRunRecord> = {},
): GenerationRunRecord {
  const variantIds = [randomUUID(), randomUUID()];
  return {
    admission: {
      mode: "provider",
      pricingVersion: "test-pricing",
      referenceCostMicrousd: 106_000,
      reservedCostMicrousd: 426_000,
    },
    actorMembershipId: membershipId,
    cancelledAt: null,
    completedAt: null,
    contentBriefRunId: briefRunId,
    estimatedCostUsd: null,
    cost: {
      imageInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      pricingVersion: "test-pricing",
      reservedMicrousd: 426_000,
      settledMicrousd: 0,
      textInputTokens: 0,
      totalTokens: 0,
      unconfirmedMicrousd: 0,
    },
    format: "feed",
    id: randomUUID(),
    organizationId,
    plan: null,
    requestedAt: "2026-08-03T12:00:00.000Z",
    resolution: null,
    startedAt: null,
    status: "pending",
    subjectKind: "branded",
    totalTokens: 0,
    variantIds,
    variants: variantIds.map((id, index) => ({
      attempts: 0,
      completedAt: null,
      composition: null,
      failure: null,
      height: null,
      id,
      index,
      latencyMilliseconds: 0,
      mediaAssetId: null,
      model: null,
      requestId: null,
      sha256: null,
      source: "generated" as const,
      status: "pending" as const,
      width: null,
    })),
    ...overrides,
  };
}

class FakeRuns implements GenerationRunRepository {
  lastListFilter: GenerationRunListFilter | undefined;
  readonly records = new Map<string, GenerationRunRecord>();

  add(record: GenerationRunRecord): GenerationRunRecord {
    this.records.set(record.id, record);
    return record;
  }

  lastFilter(): GenerationRunListFilter {
    if (this.lastListFilter === undefined) {
      throw new Error("El servicio no consultó el historial.");
    }
    return this.lastListFilter;
  }

  cancel(input: {
    readonly cancelledAt: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<GenerationRunCancellationOutcome> {
    const existing = this.records.get(input.id);
    if (
      existing === undefined ||
      existing.organizationId !== input.organizationId
    ) {
      return Promise.resolve({ status: "not-found" });
    }
    if (existing.status !== "pending" && existing.status !== "running") {
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
    throw new Error("La API no cierra lotes.");
  }

  completeVariant(): Promise<never> {
    throw new Error("La API no cierra variantes.");
  }

  completeDeterministicVariant(): Promise<never> {
    throw new Error("La API no compone piezas.");
  }

  discardPendingVariants(): Promise<never> {
    throw new Error("La API no descarta variantes.");
  }

  start(): Promise<GenerationRunWriteOutcome> {
    throw new Error("La API no toma lotes.");
  }

  reserve(): Promise<void> {
    throw new Error("La API reserva dentro de la transacción del pedido.");
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<GenerationRunRecord | null> {
    const existing = this.records.get(scope.id);
    return Promise.resolve(
      existing === undefined || existing.organizationId !== scope.organizationId
        ? null
        : existing,
    );
  }

  list(
    filter: GenerationRunListFilter,
  ): Promise<PaginatedRecords<GenerationRunRecord>> {
    this.lastListFilter = filter;
    const matching = [...this.records.values()].filter(
      (run) =>
        run.organizationId === filter.organizationId &&
        (filter.actorMembershipId === undefined ||
          run.actorMembershipId === filter.actorMembershipId) &&
        (filter.contentBriefRunId === undefined ||
          run.contentBriefRunId === filter.contentBriefRunId),
    );
    return Promise.resolve({
      items: matching,
      limit: filter.limit,
      page: filter.page,
      total: matching.length,
    });
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
  briefs: FakeBriefs = new FakeBriefs(),
  policies?: GenerationPolicyRepository,
): Promise<GenerationRunService> {
  const testingModule = await Test.createTestingModule({
    providers: [
      GenerationRunService,
      { provide: GENERATION_RUN_REQUEST_REPOSITORY, useValue: requests },
      { provide: GENERATION_RUN_REPOSITORY, useValue: runs },
      { provide: CONTENT_BRIEF_RUN_REPOSITORY, useValue: briefs },
      { provide: ReliableOperationService, useValue: reliableOperationService },
      ...(policies === undefined
        ? []
        : [{ provide: GENERATION_POLICY_REPOSITORY, useValue: policies }]),
    ],
  }).compile();
  return testingModule.get(GenerationRunService);
}

function harness(): Promise<GenerationRunService> {
  return serviceFor(new FakeRequests(), new FakeRuns());
}

test("el pedido reserva el lote y toma el alcance de la sesión", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  const accepted = await service.request(
    actor,
    { contentBriefRunId: briefRunId, subjectKind: "generic", variants: 3 },
    idempotencyKey,
  );

  assert.equal(accepted.status, "pending");
  const input = requests.lastInput;
  assert.ok(input !== undefined);
  assert.equal(input.organizationId, organizationId);
  assert.equal(input.actorMembershipId, membershipId);
  assert.equal(input.contentBriefRunId, briefRunId);
  assert.equal(input.subjectKind, "generic");
  assert.equal(input.format, "feed");
  // Las variantes se sortean del lado del servidor: si el cliente las eligiera,
  // podría reusar identificadores de otro lote.
  assert.equal(input.variantIds.length, 3);
  assert.equal(new Set(input.variantIds).size, 3);
  assert.equal(accepted.runId, input.id);
});

test("preflight expone admisión y uso sin reservar ni llamar al proveedor", async () => {
  let preflightCalls = 0;
  const policies: GenerationPolicyRepository = {
    find: (): Promise<never> => Promise.reject(new Error("no usado")),
    preflight: (input) => {
      preflightCalls += 1;
      assert.equal(input.organizationId, organizationId);
      assert.equal(input.actorMembershipId, membershipId);
      assert.equal(input.size, "1024x1536");
      assert.equal(input.variants, 2);
      return Promise.resolve({
        admission: {
          mode: "deterministic",
          reason: "user-daily-limit",
        },
        model: "gpt-image-2",
        quality: "medium",
        size: "1024x1536",
        usage: {
          alertActive: false,
          committedMicrousd: 402_000,
          monthUtc: "2026-08",
          monthlyBudgetMicrousd: 20_000_000,
          organizationAttemptsRemaining: 18,
          reservedMicrousd: 402_000,
          settledMicrousd: 0,
          unconfirmedMicrousd: 0,
          userAttemptsRemaining: 0,
        },
        variants: 2,
      });
    },
    update: (): Promise<never> => Promise.reject(new Error("no usado")),
  };
  const requests = new FakeRequests();
  const service = await serviceFor(
    requests,
    new FakeRuns(),
    new FakeBriefs(),
    policies,
  );

  const preflight = await service.preflight(actor, {
    contentBriefRunId: briefRunId,
    format: "feed",
  });

  assert.deepEqual(preflight.admission, {
    mode: "deterministic",
    reason: "user-daily-limit",
  });
  assert.equal(preflight.usage.reservedMicrousd, 402_000);
  assert.equal(preflightCalls, 1);
  assert.equal(requests.lastInput, undefined);
});

test("el sujeto por defecto es el conservador", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  await service.request(
    actor,
    { contentBriefRunId: briefRunId },
    idempotencyKey,
  );

  const input = requests.lastInput;
  assert.ok(input !== undefined);
  // `branded` exige foto real en lugar de dejar que el modelo dibuje una
  // etiqueta de marca.
  assert.equal(input.subjectKind, "branded");
  assert.equal(input.variantIds.length, 2);
});

test("un lote fuera del tope de variantes se rechaza antes de reservar", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  await assert.rejects(
    () =>
      service.request(
        actor,
        { contentBriefRunId: briefRunId, variants: 9 },
        idempotencyKey,
      ),
    BadRequestException,
  );
  await assert.rejects(
    () =>
      service.request(
        actor,
        { contentBriefRunId: briefRunId, variants: 0 },
        idempotencyKey,
      ),
    BadRequestException,
  );
  // Cada variante es una llamada facturada: un lote sin tope convierte un
  // pedido en un gasto arbitrario.
  assert.equal(requests.lastInput, undefined);
});

test("un formato no aprobado se rechaza antes de reservar", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  await assert.rejects(
    () =>
      service.request(
        actor,
        { contentBriefRunId: briefRunId, format: "billboard" },
        idempotencyKey,
      ),
    BadRequestException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("un pedido sin cabecera idempotente no reserva lote", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  await assert.rejects(
    () => service.request(actor, { contentBriefRunId: briefRunId }),
    BadRequestException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("la misma clave con otro pedido responde conflicto", async () => {
  const requests = new FakeRequests();
  requests.result = { status: "idempotency-conflict" };
  const service = await serviceFor(requests, new FakeRuns());

  await assert.rejects(
    () =>
      service.request(actor, { contentBriefRunId: briefRunId }, idempotencyKey),
    ConflictException,
  );
});

test("un brief inexistente o ajeno no llega a reservar un lote", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(requests, new FakeRuns());

  await assert.rejects(
    () =>
      service.request(
        actor,
        { contentBriefRunId: randomUUID() },
        idempotencyKey,
      ),
    NotFoundException,
  );

  // Un brief de otra organización tampoco: el alcance sale de la sesión.
  const foreign = await serviceFor(
    requests,
    new FakeRuns(),
    new FakeBriefs(briefRun({ organizationId: otherOrganizationId })),
  );
  await assert.rejects(
    () =>
      foreign.request(actor, { contentBriefRunId: briefRunId }, idempotencyKey),
    NotFoundException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("un brief que no produjo contenido no puede ilustrarse", async () => {
  const requests = new FakeRequests();
  const service = await serviceFor(
    requests,
    new FakeRuns(),
    new FakeBriefs(briefRun({ brief: null, status: "rejected" })),
  );

  await assert.rejects(
    () =>
      service.request(actor, { contentBriefRunId: briefRunId }, idempotencyKey),
    ConflictException,
  );
  assert.equal(requests.lastInput, undefined);
});

test("la consulta expone progreso y no expone el hash del prompt", async () => {
  const runs = new FakeRuns();
  const record = runs.add(
    runRecord({
      completedAt: "2026-08-03T12:05:00.000Z",
      plan: {
        format: "feed",
        profileId: "ferreteria-producto-limpio",
        profileVersion: "visual-profile/2026-08-03.2",
        promptHash: "c".repeat(64),
        promptVersion: "visual-prompt/2026-08-03.2",
      },
      status: "completed",
      totalTokens: 200,
    }),
  );
  const service = await serviceFor(new FakeRequests(), runs);

  const response = await service.findById(actor, record.id);

  assert.equal(response.status, "completed");
  const plan = response.plan;
  assert.ok(plan !== null);
  assert.equal(plan.promptVersion, "visual-prompt/2026-08-03.2");
  // El hash queda en el historial pero no sale por la API.
  assert.ok(!Object.hasOwn(plan, "promptHash"));
  assert.deepEqual(response.progress, {
    discarded: 0,
    failed: 0,
    pending: 2,
    succeeded: 0,
    total: 2,
  });
  assert.equal(response.usage.totalTokens, 200);
});

test("la variante expone su pieza compuesta y no el hash de la base", async () => {
  const runs = new FakeRuns();
  const base = runRecord();
  const [first] = base.variants;
  assert.ok(first !== undefined);
  const record = runs.add({
    ...base,
    status: "completed",
    variants: [
      {
        ...first,
        composition: {
          compositionHash: "1".repeat(64),
          height: 1350,
          layout: "composicion-tercio-inferior",
          mediaAssetId: "88888888-8888-4888-8888-888888888888",
          overlayHash: "2".repeat(64),
          sha256: "3".repeat(64),
          theme: "taller",
          version: "visual-composition/2026-08-05.1",
          width: 1080,
        },
        height: 1536,
        mediaAssetId: "99999999-9999-4999-8999-999999999999",
        model: "gpt-image-1",
        sha256: "4".repeat(64),
        status: "succeeded" as const,
        width: 1024,
      },
      ...base.variants.slice(1),
    ],
  });
  const service = await serviceFor(new FakeRequests(), runs);

  const response = await service.findById(actor, record.id);
  const variant = response.variants[0];
  assert.ok(variant !== undefined);
  const composition = variant.composition;
  assert.ok(composition !== null);

  // La pieza es lo que se publica, así que su activo y sus medidas salen.
  assert.equal(composition.layout, "composicion-tercio-inferior");
  assert.equal(composition.width, 1080);
  assert.equal(composition.height, 1350);
  assert.equal(
    composition.mediaAssetId,
    "88888888-8888-4888-8888-888888888888",
  );
  // El hash de composición sale porque es lo que permite comparar variantes.
  assert.equal(composition.compositionHash, "1".repeat(64));
  // El de la base, el de la pieza y el modelo no: no le sirven a quien revisa.
  assert.ok(!Object.hasOwn(composition, "sha256"));
  assert.ok(!Object.hasOwn(composition, "overlayHash"));
  assert.ok(!Object.hasOwn(variant, "sha256"));
  assert.ok(!Object.hasOwn(variant, "model"));
  // De dónde salió sí, porque distingue lo que gastó proveedor de lo que no.
  assert.equal(variant.source, "generated");
});

test("el detalle interno de un fallo no sale por la API", async () => {
  const runs = new FakeRuns();
  const base = runRecord();
  const record = runs.add({
    ...base,
    status: "failed",
    variants: base.variants.map((variant, index) =>
      index === 0
        ? {
            ...variant,
            completedAt: "2026-08-03T12:04:00.000Z",
            failure: {
              code: "safety-rejection" as const,
              correction: "Revisá el brief y la propuesta creativa.",
              detail: "Texto interno del proveedor.",
            },
            status: "failed" as const,
          }
        : variant,
    ),
  });
  const service = await serviceFor(new FakeRequests(), runs);

  const response = await service.findById(actor, record.id);

  const firstVariant = response.variants[0];
  assert.ok(firstVariant !== undefined);
  const failure = firstVariant.failure;
  assert.ok(failure !== null);
  assert.equal(failure.code, "safety-rejection");
  assert.match(failure.correction, /Revisá el brief/u);
  // El detalle puede traer el prompt reflejado o una URL temporal.
  assert.ok(!Object.hasOwn(failure, "detail"));
});

test("un lote de otra organización no es visible", async () => {
  const runs = new FakeRuns();
  const record = runs.add(runRecord({ organizationId: otherOrganizationId }));
  const service = await serviceFor(new FakeRequests(), runs);

  await assert.rejects(
    () => service.findById(actor, record.id),
    NotFoundException,
  );
  await assert.rejects(
    () => service.cancel(actor, record.id),
    NotFoundException,
  );
});

test("cancelar un lote pendiente y uno ya resuelto informan estados distintos", async () => {
  const runs = new FakeRuns();
  const pending = runs.add(runRecord());
  const resolved = runs.add(
    runRecord({ completedAt: "2026-08-03T12:05:00.000Z", status: "completed" }),
  );
  const service = await serviceFor(new FakeRequests(), runs);

  assert.deepEqual(await service.cancel(actor, pending.id), {
    runId: pending.id,
    status: "cancelled",
  });
  // Si el lote terminó antes de que llegara la cancelación, la respuesta dice
  // el estado real en lugar de afirmar que canceló.
  assert.deepEqual(await service.cancel(actor, resolved.id), {
    runId: resolved.id,
    status: "completed",
  });
});

test("el historial acota el tamaño de página y filtra por autor y brief", async () => {
  const runs = new FakeRuns();
  runs.add(runRecord());
  const service = await serviceFor(new FakeRequests(), runs);

  await service.list(actor, { limit: 500, mine: true, page: 2 });
  const filter = runs.lastFilter();
  assert.equal(filter.limit, 50);
  assert.equal(filter.page, 2);
  assert.equal(filter.actorMembershipId, membershipId);
  assert.equal(filter.organizationId, organizationId);

  await service.list(actor, { contentBriefRunId: briefRunId });
  const briefFilter = runs.lastFilter();
  assert.equal(briefFilter.contentBriefRunId, briefRunId);
  // Sin `mine` el historial no se restringe al autor.
  assert.equal(briefFilter.actorMembershipId, undefined);
});

test("una sesión sin permiso de edición no pide ni cancela lotes", async () => {
  const service = await harness();
  const readOnly: AuthenticatedActor = {
    ...actor,
    roles: Object.freeze(["viewer" as const]),
  };

  await assert.rejects(() =>
    service.request(
      readOnly,
      { contentBriefRunId: briefRunId },
      idempotencyKey,
    ),
  );
  await assert.rejects(() => service.cancel(readOnly, randomUUID()));
});
