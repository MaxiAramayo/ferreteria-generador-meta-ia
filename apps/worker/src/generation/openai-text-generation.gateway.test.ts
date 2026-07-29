import assert from "node:assert/strict";
import test from "node:test";

import type { OpenAIRuntimePolicy } from "@aramayo/configuration";
import { GenerationGatewayError } from "@aramayo/domain";

import {
  DisabledTextGenerationGateway,
  OpenAITextGenerationGateway,
  type OpenAITelemetryEvent,
} from "./openai-text-generation.gateway.ts";
import {
  OpenAITransportError,
  type OpenAIResponsesTransport,
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
  readonly #outcomes: Array<OpenAITransportResponse | Error>;

  constructor(outcomes: Array<OpenAITransportResponse | Error>) {
    this.#outcomes = [...outcomes];
  }

  createResponse(
    request: OpenAITransportRequest,
  ): Promise<OpenAITransportResponse> {
    this.requests.push(request);
    const outcome = this.#outcomes.shift();
    if (outcome instanceof Error) {
      return Promise.reject(outcome);
    }
    if (outcome === undefined) {
      return Promise.reject(new Error("No fake outcome configured."));
    }
    return Promise.resolve(outcome);
  }
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
});
