import assert from "node:assert/strict";
import test from "node:test";

import type { OpenAIRuntimePolicy } from "@aramayo/configuration";
import {
  GenerationGatewayError,
  type GenerateStructuredCommand,
} from "@aramayo/domain";

import {
  DisabledTextGenerationGateway,
  OpenAITextGenerationGateway,
  type OpenAITelemetryEvent,
} from "./openai-text-generation.gateway.ts";
import {
  OpenAIToolLoopExhaustedError,
  OpenAITransportError,
  type OpenAIResponsesTransport,
  type OpenAIStructuredRequest,
  type OpenAIStructuredResponse,
  type OpenAIStructuredToolExecutor,
  type OpenAITransportRequest,
  type OpenAITransportResponse,
} from "./openai-transport.ts";

const runtimePolicy: OpenAIRuntimePolicy = Object.freeze({
  maximumInputCharacters: 1_000,
  maximumOutputTokens: 256,
  maximumRetries: 2,
  models: Object.freeze({
    brief: "gpt-5.6-terra",
    complex: "gpt-5.6-sol",
    routine: "gpt-5.6-luna",
  }),
  requestTimeoutMilliseconds: 5_000,
  retryBaseDelayMilliseconds: 500,
});

const successfulResponse: OpenAITransportResponse = Object.freeze({
  model: "gpt-5.6-luna",
  outputText: "Respuesta verificada.",
  requestId: "req_test",
  responseId: "resp_test",
  usage: Object.freeze({
    cacheWriteInputTokens: 0,
    cachedInputTokens: 10,
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 0,
    totalTokens: 120,
  }),
});

class FakeOpenAITransport implements OpenAIResponsesTransport {
  readonly requests: OpenAITransportRequest[] = [];
  readonly structuredRequests: OpenAIStructuredRequest[] = [];
  readonly #outcomes: Array<OpenAITransportResponse | Error>;
  readonly #structuredOutcomes: Array<OpenAIStructuredResponse | Error>;

  constructor(
    outcomes: Array<OpenAITransportResponse | Error>,
    structuredOutcomes: Array<OpenAIStructuredResponse | Error> = [],
  ) {
    this.#outcomes = [...outcomes];
    this.#structuredOutcomes = [...structuredOutcomes];
  }

  createResponse(
    request: OpenAITransportRequest,
  ): Promise<OpenAITransportResponse> {
    this.requests.push(request);
    return settle(this.#outcomes.shift());
  }

  createStructuredResponse(
    request: OpenAIStructuredRequest,
    executeTool: OpenAIStructuredToolExecutor,
  ): Promise<OpenAIStructuredResponse> {
    void executeTool;
    this.structuredRequests.push(request);
    return settle(this.#structuredOutcomes.shift());
  }
}

function settle<T>(outcome: T | Error | undefined): Promise<T> {
  if (outcome instanceof Error) {
    return Promise.reject(outcome);
  }
  if (outcome === undefined) {
    return Promise.reject(new Error("No fake outcome configured."));
  }
  return Promise.resolve(outcome);
}

test("selecciona el modelo por carga y conserva telemetría sin el prompt", async () => {
  const prompt = "contenido-comercial-sensible";
  const transport = new FakeOpenAITransport([successfulResponse]);
  const telemetry: OpenAITelemetryEvent[] = [];
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport, {
    now: ((): (() => number) => {
      const timestamps = [1_000, 1_125];
      return (): number => timestamps.shift() ?? 1_125;
    })(),
    telemetry: {
      record: (event): void => {
        telemetry.push(event);
      },
    },
  });

  const generated = await gateway.generateText({
    input: prompt,
    maximumOutputTokens: 64,
    workload: "routine",
  });

  const routineRequest = transport.requests[0];
  assert.ok(routineRequest);
  assert.equal(routineRequest.model, "gpt-5.6-luna");
  assert.equal(routineRequest.reasoningEffort, "none");
  assert.equal(generated.execution.latencyMilliseconds, 125);
  assert.equal(generated.execution.requestId, "req_test");
  assert.equal(generated.usage.estimatedCostUsd, 0.000_211);
  assert.equal(telemetry.length, 1);
  assert.equal(JSON.stringify(telemetry).includes(prompt), false);
  assert.equal(JSON.stringify(telemetry).includes("api-key"), false);
});

test("la política mantiene rutas distintas para brief y trabajo complejo", async () => {
  const briefTransport = new FakeOpenAITransport([
    { ...successfulResponse, model: "gpt-5.6-terra" },
  ]);
  const complexTransport = new FakeOpenAITransport([
    { ...successfulResponse, model: "gpt-5.6-sol" },
  ]);

  await new OpenAITextGenerationGateway(
    runtimePolicy,
    briefTransport,
  ).generateText({ input: "Brief de prueba", workload: "brief" });
  await new OpenAITextGenerationGateway(
    runtimePolicy,
    complexTransport,
  ).generateText({ input: "Campaña de prueba", workload: "complex" });

  const briefRequest = briefTransport.requests[0];
  const complexRequest = complexTransport.requests[0];
  assert.ok(briefRequest);
  assert.ok(complexRequest);
  assert.equal(briefRequest.model, "gpt-5.6-terra");
  assert.equal(briefRequest.reasoningEffort, "low");
  assert.equal(complexRequest.model, "gpt-5.6-sol");
  assert.equal(complexRequest.reasoningEffort, "medium");
});

for (const failure of [
  { code: "rate-limit", retryable: true },
  { code: "timeout", retryable: true },
  { code: "safety-rejection", retryable: false },
  { code: "provider-error", retryable: false },
] as const) {
  test(`normaliza ${failure.code} y reintenta sólo cuando corresponde`, async () => {
    const transport = new FakeOpenAITransport([
      new OpenAITransportError(failure.code, failure.retryable, "req_failure"),
      new OpenAITransportError(failure.code, failure.retryable, "req_failure"),
      new OpenAITransportError(failure.code, failure.retryable, "req_failure"),
    ]);
    const delays: number[] = [];
    const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport, {
      sleep: (milliseconds): Promise<void> => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    });

    await assert.rejects(
      gateway.generateText({ input: "Prueba segura", workload: "routine" }),
      (cause: unknown) =>
        cause instanceof GenerationGatewayError &&
        cause.code === failure.code &&
        cause.retryable === failure.retryable &&
        cause.requestId === "req_failure" &&
        cause.attempts === (failure.retryable ? 3 : 1),
    );
    assert.deepEqual(delays, failure.retryable ? [500, 1_000] : []);
  });
}

test("un error transitorio puede recuperarse sin exceder el backoff", async () => {
  const transport = new FakeOpenAITransport([
    new OpenAITransportError("provider-error", true),
    successfulResponse,
  ]);
  const delays: number[] = [];
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport, {
    sleep: (milliseconds): Promise<void> => {
      delays.push(milliseconds);
      return Promise.resolve();
    },
  });

  const generated = await gateway.generateText({
    input: "Prueba segura",
    workload: "routine",
  });

  assert.equal(generated.execution.attempts, 2);
  assert.deepEqual(delays, [500]);
});

test("rechaza límites inválidos y respuestas sin request ID o uso", async () => {
  const transport = new FakeOpenAITransport([
    { ...successfulResponse, requestId: null },
  ]);
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  await assert.rejects(
    gateway.generateText({ input: " ", workload: "routine" }),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "invalid-request" &&
      cause.attempts === 0,
  );
  await assert.rejects(
    gateway.generateText({
      input: "Prueba segura",
      maximumOutputTokens: 257,
      workload: "routine",
    }),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "invalid-request",
  );
  await assert.rejects(
    gateway.generateText({ input: "Prueba segura", workload: "routine" }),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "invalid-response",
  );
});

test("el adaptador deshabilitado falla de forma explícita", async () => {
  await assert.rejects(
    new DisabledTextGenerationGateway().generateText({
      input: "Prueba segura",
      workload: "routine",
    }),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "provider-disabled" &&
      !cause.retryable,
  );
  await assert.rejects(
    new DisabledTextGenerationGateway().generateStructured(structuredCommand()),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "provider-disabled",
  );
});

function structuredCommand(
  overrides: Partial<GenerateStructuredCommand> = {},
): GenerateStructuredCommand {
  return {
    executeTool: (): Promise<{ callId: string; output: string }> =>
      Promise.resolve({ callId: "call-1", output: "{}" }),
    input: "Pedido editorial de prueba",
    instructions: "Instrucciones versionadas de prueba",
    maximumToolIterations: 2,
    schema: {
      name: "prueba",
      schema: { type: "object" },
      version: "prueba/1",
    },
    tools: [
      {
        description: "Herramienta de prueba",
        name: "search_products",
        parameters: {},
      },
    ],
    workload: "brief",
    ...overrides,
  };
}

const structuredResponse: OpenAIStructuredResponse = Object.freeze({
  model: "gpt-5.6-terra",
  outputText: '{"ok":true}',
  requestId: "req_structured",
  responseId: "resp_structured",
  toolIterations: 1,
  usage: Object.freeze({
    cacheWriteInputTokens: 0,
    cachedInputTokens: 0,
    inputTokens: 800,
    outputTokens: 200,
    reasoningTokens: 30,
    totalTokens: 1_000,
  }),
});

test("la generación estructurada usa el modelo de brief y acumula uso", async () => {
  const transport = new FakeOpenAITransport([], [structuredResponse]);
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  const result = await gateway.generateStructured(structuredCommand());

  const structuredRequest = transport.structuredRequests[0];
  assert.ok(structuredRequest !== undefined);
  assert.equal(structuredRequest.model, "gpt-5.6-terra");
  assert.equal(structuredRequest.schemaName, "prueba");
  assert.equal(structuredRequest.maximumToolIterations, 2);
  assert.equal(result.execution.attempts, 1);
  assert.equal(result.toolIterations, 1);
  assert.equal(result.usage.totalTokens, 1_000);
});

test("un ciclo de herramientas sin cierre falla sin reintentar", async () => {
  const transport = new FakeOpenAITransport(
    [],
    [new OpenAIToolLoopExhaustedError("req_loop")],
  );
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  await assert.rejects(
    gateway.generateStructured(structuredCommand()),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError &&
      cause.code === "tool-loop-exhausted" &&
      !cause.retryable,
  );
  assert.equal(transport.structuredRequests.length, 1);
});

test("un fallo transitorio no repite un run que ya ejecutó herramientas", async () => {
  const transport = new FakeOpenAITransport(
    [],
    [new OpenAITransportError("rate-limit", true, "req_limited")],
  );
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  await assert.rejects(
    gateway.generateStructured(structuredCommand()),
    (cause: unknown) =>
      cause instanceof GenerationGatewayError && cause.code === "rate-limit",
  );
  assert.equal(transport.structuredRequests.length, 1);
});

test("un fallo del ejecutor de herramientas llega intacto al caso de uso", async () => {
  const failure = new Error("La auditoría comercial falló.");
  const transport: OpenAIResponsesTransport = {
    createResponse: (): Promise<OpenAITransportResponse> =>
      Promise.reject(new Error("sin uso")),
    createStructuredResponse: (
      request: OpenAIStructuredRequest,
      executeTool: OpenAIStructuredToolExecutor,
    ): Promise<OpenAIStructuredResponse> => {
      void request;
      return executeTool({
        arguments: "{}",
        callId: "call-1",
        name: "search_products",
      }).then(() => structuredResponse);
    },
  };
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  await assert.rejects(
    gateway.generateStructured(
      structuredCommand({
        executeTool: (): Promise<{ callId: string; output: string }> =>
          Promise.reject(failure),
      }),
    ),
    (cause: unknown) => cause === failure,
  );
});

test("la generación estructurada valida límites antes de llamar al proveedor", async () => {
  const transport = new FakeOpenAITransport([], []);
  const gateway = new OpenAITextGenerationGateway(runtimePolicy, transport);

  for (const invalid of [
    structuredCommand({ tools: [] }),
    structuredCommand({ instructions: "   " }),
    structuredCommand({ maximumToolIterations: 0 }),
    structuredCommand({ maximumOutputTokens: 257 }),
  ]) {
    await assert.rejects(
      gateway.generateStructured(invalid),
      (cause: unknown) =>
        cause instanceof GenerationGatewayError &&
        cause.code === "invalid-request",
    );
  }
  assert.equal(transport.structuredRequests.length, 0);
});
