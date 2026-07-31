import assert from "node:assert/strict";
import test from "node:test";

import {
  CommercialToolExecutionError,
  ContentBriefRequestError,
  GenerationGatewayError,
  type CommercialToolCall,
  type CommercialToolExecutionResult,
  type CommercialToolExecutionScope,
  type ContentBriefRunCompletionOutcome,
  type GenerateStructuredCommand,
  type GenerationToolInvocation,
  type KnowledgeRetrievalResult,
  type StructuredGeneration,
  type StructuredGenerationPort,
} from "@aramayo/domain";

import { commercialToolDefinitions } from "../catalog/commercial-tool-definitions.ts";
import type {
  CommercialToolExecutionPort,
  CommercialToolExecutionSession,
} from "../catalog/commercial-tool-execution.service.ts";
import type { RetrieveKnowledgeCommand } from "../knowledge/knowledge-retrieval.service.ts";
import {
  ContentBriefGenerationService,
  type KnowledgeRetrievalPort,
} from "./content-brief-generation.service.ts";
import { InMemoryContentBriefRunRepository } from "./in-memory-content-brief-runs.ts";
import { contentBriefPromptVersion } from "./content-brief-prompt.ts";
import { contentBriefSchemaVersion } from "./content-brief-schema.ts";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "10000000-0000-4000-8000-000000000002";
const LOCATION_ID = "10000000-0000-4000-8000-000000000003";
const RUN_ID = "10000000-0000-4000-8000-0000000000ff";
const REQUESTED_AT = "2026-07-30T12:00:00.000Z";
const CAPTION =
  "Pasá por el local y consultanos cuál te sirve para el trabajo que tenés entre manos.";

const command = Object.freeze({
  actorMembershipId: MEMBERSHIP_ID,
  locationId: LOCATION_ID,
  locationName: "Casa Central",
  organizationId: ORGANIZATION_ID,
  request: "Necesito una pieza para promocionar taladros percutores.",
  requestedAt: REQUESTED_AT,
  runId: RUN_ID,
});

const groundedRetrieval: KnowledgeRetrievalResult = Object.freeze({
  context: '{"sources":[]}',
  contextCharacters: 15,
  evidence: Object.freeze([
    Object.freeze({
      citationId: "K1",
      contentHash: "a".repeat(64),
      documentId: "30000000-0000-4000-8000-000000000001",
      documentTitle: "Servicios aprobados",
      documentType: "services",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveUntil: null,
      filename: "servicios.md",
      fragment: "La ferretería asesora sobre herramientas eléctricas.",
      locationIds: Object.freeze([LOCATION_ID]),
      score: 0.82,
      sourceKey: "operacion.servicios",
      sourceOwner: "Responsable de negocio",
      version: 2,
      versionId: "40000000-0000-4000-8000-000000000001",
    }),
  ]),
  question: "taladros percutores",
  status: "grounded",
});

const conflictingRetrieval: KnowledgeRetrievalResult = Object.freeze({
  context: "",
  contextCharacters: 0,
  evidence: Object.freeze([]),
  missingInformation: Object.freeze(["conflicting-evidence" as const]),
  question: "taladros percutores",
  status: "missing_information",
});

class FakeKnowledge implements KnowledgeRetrievalPort {
  readonly commands: RetrieveKnowledgeCommand[] = [];
  readonly #outcome: KnowledgeRetrievalResult | Error;

  constructor(outcome: KnowledgeRetrievalResult | Error) {
    this.#outcome = outcome;
  }

  retrieve(
    retrieval: RetrieveKnowledgeCommand,
  ): Promise<KnowledgeRetrievalResult> {
    this.commands.push(retrieval);
    return this.#outcome instanceof Error
      ? Promise.reject(this.#outcome)
      : Promise.resolve(this.#outcome);
  }
}

function productResult(callId: string): CommercialToolExecutionResult {
  return Object.freeze({
    callId,
    observations: Object.freeze([
      Object.freeze({
        evidenceReference: "odoo:product:42",
        externalProductId: "odoo-product-42",
        kind: "product",
        observedAt: "2026-07-30T11:59:30.000Z",
        resolution: "active",
        sourceKind: "odoo",
      }),
    ]),
    outcome: "success",
    output: '{"data":{"kind":"found"},"status":"ok"}',
    toolName: "get_product",
  });
}

function priceResult(
  callId: string,
  resolution: "missing" | "priced",
  observedAt = "2026-07-30T11:59:40.000Z",
): CommercialToolExecutionResult {
  return Object.freeze({
    callId,
    observations: Object.freeze([
      Object.freeze({
        evidenceReference: "odoo:price:42",
        externalProductId: "odoo-product-42",
        kind: "price",
        observedAt,
        resolution,
        sourceKind: "odoo",
      }),
    ]),
    outcome: "success",
    output: `{"data":{"kind":"${resolution}"},"status":"ok"}`,
    toolName: "get_current_price",
  });
}

const failedToolResult: CommercialToolExecutionResult = Object.freeze({
  callId: "call-fail",
  observations: Object.freeze([]),
  outcome: "failure",
  output: '{"error":{"code":"unavailable","retryable":false},"status":"error"}',
  toolName: "get_current_price",
});

class FakeCommercial implements CommercialToolExecutionPort {
  readonly definitions = commercialToolDefinitions;
  readonly scopes: CommercialToolExecutionScope[] = [];
  readonly calls: CommercialToolCall[] = [];
  readonly #results: Array<CommercialToolExecutionResult | Error>;

  constructor(results: Array<CommercialToolExecutionResult | Error> = []) {
    this.#results = [...results];
  }

  createSession(
    scope: CommercialToolExecutionScope,
  ): CommercialToolExecutionSession {
    this.scopes.push(scope);
    return {
      execute: (call): Promise<CommercialToolExecutionResult> => {
        this.calls.push(call);
        const result = this.#results.shift();
        if (result instanceof Error) {
          return Promise.reject(result);
        }
        return Promise.resolve(result ?? productResult(call.callId));
      },
    };
  }
}

class DisabledCommercial implements CommercialToolExecutionPort {
  readonly definitions = Object.freeze([]);

  createSession(): CommercialToolExecutionSession {
    throw new CommercialToolExecutionError(
      "invalid-scope",
      "El catálogo comercial no está configurado.",
    );
  }
}

class FakeGeneration implements StructuredGenerationPort {
  readonly commands: GenerateStructuredCommand[] = [];
  readonly #outcome: string | Error;
  readonly #toolCalls: readonly GenerationToolInvocation[];

  constructor(
    outcome: string | Error,
    toolCalls: readonly GenerationToolInvocation[] = [],
  ) {
    this.#outcome = outcome;
    this.#toolCalls = toolCalls;
  }

  async generateStructured(
    structured: GenerateStructuredCommand,
  ): Promise<StructuredGeneration> {
    this.commands.push(structured);
    for (const call of this.#toolCalls) {
      await structured.executeTool(call);
    }
    if (this.#outcome instanceof Error) {
      throw this.#outcome;
    }
    return Object.freeze({
      execution: Object.freeze({
        attempts: 1,
        latencyMilliseconds: 820,
        model: "gpt-5.6-terra",
        requestId: "req_brief",
        responseId: "resp_brief",
      }),
      outputText: this.#outcome,
      toolIterations: this.#toolCalls.length === 0 ? 0 : 1,
      usage: Object.freeze({
        cacheWriteInputTokens: 0,
        cachedInputTokens: 0,
        estimatedCostUsd: 0.004,
        inputTokens: 900,
        outputTokens: 220,
        reasoningTokens: 40,
        totalTokens: 1_160,
      }),
    });
  }
}

/**
 * Historial en memoria con la reserva ya hecha, como la deja la API antes de
 * encolar. `failure` simula que el historial no puede escribirse.
 */
class FakeRuns extends InMemoryContentBriefRunRepository {
  readonly #failure: Error | null;

  constructor(failure: Error | null = null) {
    super();
    this.#failure = failure;
  }

  override complete(
    completion: Parameters<InMemoryContentBriefRunRepository["complete"]>[0],
    completedAt: string,
  ): Promise<ContentBriefRunCompletionOutcome> {
    if (this.#failure !== null) {
      return Promise.reject(this.#failure);
    }
    return super.complete(completion, completedAt);
  }
}

async function reservedRuns(failure: Error | null = null): Promise<FakeRuns> {
  const runs = new FakeRuns(failure);
  await runs.reserve({
    actorMembershipId: MEMBERSHIP_ID,
    id: RUN_ID,
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    promptHash: "0".repeat(64),
    promptVersion: contentBriefPromptVersion,
    request: command.request,
    requestHash: "0".repeat(64),
    requestedAt: REQUESTED_AT,
    schemaVersion: contentBriefSchemaVersion,
  });
  return runs;
}

function briefJson(overrides: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    brand: "ferreteria",
    callToAction: { kind: "whatsapp", label: "Consultanos por WhatsApp" },
    caption: CAPTION,
    creativeProposal: "Tono directo, foco en el uso real de la herramienta.",
    missingInformation: [],
    objective: "product",
    products: [
      {
        evidenceId: "C1",
        externalProductId: "odoo-product-42",
        label: "Taladro percutor",
      },
    ],
    requiresHumanApproval: false,
    subtitle: null,
    title: "Taladro percutor para tu obra",
    verifiedFacts: [
      {
        claimKind: "product_attribute",
        evidenceId: "C1",
        statement: "El taladro percutor está activo en el catálogo.",
      },
    ],
    visualDirection: "clean_product",
    ...overrides,
  });
}

const productCall: GenerationToolInvocation = Object.freeze({
  arguments: '{"externalProductId":"odoo-product-42"}',
  callId: "call-product",
  name: "get_product",
});

const priceCall: GenerationToolInvocation = Object.freeze({
  arguments: '{"externalProductId":"odoo-product-42"}',
  callId: "call-price",
  name: "get_current_price",
});

function service(
  knowledge: KnowledgeRetrievalPort,
  commercial: CommercialToolExecutionPort,
  generation: StructuredGenerationPort,
  runs: InMemoryContentBriefRunRepository,
): ContentBriefGenerationService {
  return new ContentBriefGenerationService(
    knowledge,
    commercial,
    generation,
    runs,
    { clock: (): Date => new Date(REQUESTED_AT) },
  );
}

test("genera un brief y versiona prompt, esquema, modelo, herramientas y fuentes", async () => {
  const generation = new FakeGeneration(briefJson(), [productCall]);
  const commercial = new FakeCommercial([productResult("call-product")]);
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    commercial,
    generation,
    runs,
  ).generate(command);

  assert.equal(result.status, "generated");
  assert.equal(result.brief.title, "Taladro percutor para tu obra");
  assert.equal(result.runId, RUN_ID);

  const record = runs.records[0];
  assert.ok(record !== undefined);
  assert.equal(record.status, "generated");
  assert.equal(record.promptVersion, contentBriefPromptVersion);
  assert.equal(record.schemaVersion, contentBriefSchemaVersion);
  assert.equal(record.model, "gpt-5.6-terra");
  assert.equal(record.knowledgeStatus, "grounded");
  assert.equal(record.toolNames.length, 5);
  assert.deepEqual(
    record.toolInvocations.map((invocation) => invocation.toolName),
    ["get_product"],
  );
  assert.deepEqual(
    record.evidence.map((entry) => entry.citationId),
    ["K1", "C1"],
  );
  assert.equal(record.usage.totalTokens, 1_160);

  // La organización y la sucursal viajan desde la sesión, no desde el modelo.
  assert.deepEqual(commercial.scopes[0], {
    actorMembershipId: MEMBERSHIP_ID,
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    runId: RUN_ID,
  });
});

test("una salida fuera de esquema no cruza el límite y queda registrada como rechazo", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([productResult("call-product")]),
    new FakeGeneration(briefJson({ tone: "urgente" }), [productCall]),
    runs,
  ).generate(command);

  assert.equal(result.status, "rejected");
  assert.equal(result.code, "schema-mismatch");
  const record = runs.records[0];
  assert.ok(record !== undefined);
  assert.equal(record.status, "rejected");
  assert.equal(record.brief, null);
});

test("una salida que no es JSON tampoco produce brief", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([productResult("call-product")]),
    new FakeGeneration("No puedo ayudarte con eso.", [productCall]),
    runs,
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "invalid-json");
  assert.equal(runs.records[0]?.brief, null);
});

test("un precio ausente no habilita afirmar precio aunque la herramienta responda", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([priceResult("call-price", "missing")]),
    new FakeGeneration(
      briefJson({
        products: [],
        verifiedFacts: [
          {
            claimKind: "price",
            evidenceId: "C1",
            statement: "El precio vigente está informado por el sistema.",
          },
        ],
      }),
      [priceCall],
    ),
    runs,
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "evidence-unsupported-claim");
  assert.equal(runs.records[0]?.evidence[1]?.reference, "odoo:price:42");
});

test("un precio leído fuera de la ventana de frescura bloquea la afirmación", async () => {
  const stale = new Date(Date.parse(REQUESTED_AT) - 16 * 60_000).toISOString();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([priceResult("call-price", "priced", stale)]),
    new FakeGeneration(
      briefJson({
        products: [],
        verifiedFacts: [
          {
            claimKind: "price",
            evidenceId: "C1",
            statement: "El precio vigente está informado por el sistema.",
          },
        ],
      }),
      [priceCall],
    ),
    await reservedRuns(),
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "evidence-stale");
});

test("una herramienta fallida se registra y no deja evidencia citable", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([failedToolResult]),
    new FakeGeneration(briefJson(), [priceCall]),
    runs,
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "evidence-unknown");
  const record = runs.records[0];
  assert.ok(record !== undefined);
  assert.deepEqual(
    record.toolInvocations.map((invocation) => invocation.outcome),
    ["failure"],
  );
  assert.deepEqual(
    record.evidence.map((entry) => entry.citationId),
    ["K1"],
  );
});

test("una fuente documental conflictiva no aporta contexto ni citas", async () => {
  const generation = new FakeGeneration(briefJson(), [productCall]);
  const runs = await reservedRuns();
  await service(
    new FakeKnowledge(conflictingRetrieval),
    new FakeCommercial([productResult("call-product")]),
    generation,
    runs,
  ).generate(command);

  const record = runs.records[0];
  assert.ok(record !== undefined);
  assert.equal(
    record.knowledgeStatus,
    "missing_information:conflicting-evidence",
  );
  assert.deepEqual(
    record.evidence.map((entry) => entry.citationId),
    ["C1"],
  );
});

test("un fallo del proveedor termina el run con su código y sin brief", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial(),
    new FakeGeneration(
      new GenerationGatewayError("rate-limit", "Límite de uso.", true, {
        attempts: 1,
        latencyMilliseconds: 300,
        model: "gpt-5.6-terra",
      }),
    ),
    runs,
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "rate-limit");
  const record = runs.records[0];
  assert.ok(record !== undefined);
  assert.equal(record.status, "rejected");
  assert.equal(record.model, "gpt-5.6-terra");
});

test("una recuperación documental caída no se convierte en brief sin fuentes", async () => {
  const runs = await reservedRuns();
  const result = await service(
    new FakeKnowledge(new Error("File Search no responde.")),
    new FakeCommercial(),
    new FakeGeneration(briefJson()),
    runs,
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "knowledge-unavailable");
  assert.equal(runs.records[0]?.status, "rejected");
});

test("sin catálogo comercial no se genera ni se llama al proveedor", async () => {
  const generation = new FakeGeneration(briefJson());
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new DisabledCommercial(),
    generation,
    await reservedRuns(),
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "commercial-unavailable");
  assert.equal(generation.commands.length, 0);
});

test("un fallo de auditoría comercial detiene el run", async () => {
  const result = await service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial([
      new CommercialToolExecutionError(
        "audit-failed",
        "La invocación comercial no pudo auditarse.",
      ),
    ]),
    new FakeGeneration(briefJson(), [productCall]),
    await reservedRuns(),
  ).generate(command);

  assert.ok(result.status === "rejected");
  assert.equal(result.code, "commercial-audit-failed");
});

test("si el historial no puede escribirse, no se devuelve brief", async () => {
  await assert.rejects(
    service(
      new FakeKnowledge(groundedRetrieval),
      new FakeCommercial([productResult("call-product")]),
      new FakeGeneration(briefJson(), [productCall]),
      await reservedRuns(new Error("PostgreSQL no disponible.")),
    ).generate(command),
    /PostgreSQL no disponible/u,
  );
});

test("rechaza pedidos con alcance o forma inválidos antes de gastar una llamada", async () => {
  const generation = new FakeGeneration(briefJson());
  const target = service(
    new FakeKnowledge(groundedRetrieval),
    new FakeCommercial(),
    generation,
    await reservedRuns(),
  );

  for (const invalid of [
    { ...command, organizationId: "no-es-uuid" },
    { ...command, actorMembershipId: "no-es-uuid" },
    { ...command, locationId: "no-es-uuid" },
    { ...command, request: "corto" },
    { ...command, requestedAt: "30/07/2026" },
  ]) {
    await assert.rejects(
      target.generate(invalid),
      (cause: unknown) => cause instanceof ContentBriefRequestError,
    );
  }
  assert.equal(generation.commands.length, 0);
});
