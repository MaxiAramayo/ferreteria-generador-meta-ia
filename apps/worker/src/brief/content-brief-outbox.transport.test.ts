import assert from "node:assert/strict";
import test from "node:test";

import {
  contentBriefGenerationTopic,
  publicationRenderTopic,
  type OutboxMessageRecord,
} from "@aramayo/domain";

import { TopicRoutingOutboxTransport } from "../outbox/topic-routing-outbox.transport.ts";
import type {
  ContentBriefGenerationService,
  GenerateContentBriefCommand,
} from "./content-brief-generation.service.ts";
import { ContentBriefOutboxTransport } from "./content-brief-outbox.transport.ts";
import { InMemoryContentBriefRunRepository } from "./in-memory-content-brief-runs.ts";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "10000000-0000-4000-8000-000000000002";
const LOCATION_ID = "10000000-0000-4000-8000-000000000003";
const RUN_ID = "10000000-0000-4000-8000-0000000000ff";
const REQUESTED_AT = "2026-07-30T12:00:00.000Z";

class RecordingGeneration {
  readonly commands: GenerateContentBriefCommand[] = [];

  generate(
    command: GenerateContentBriefCommand,
  ): ReturnType<ContentBriefGenerationService["generate"]> {
    this.commands.push(command);
    return Promise.resolve({
      runId: command.runId,
      status: "discarded",
    });
  }
}

function message(
  overrides: Partial<OutboxMessageRecord> = {},
): OutboxMessageRecord {
  return {
    aggregateId: RUN_ID,
    aggregateType: "content-brief-run",
    attempts: 0,
    availableAt: REQUESTED_AT,
    eventId: "20000000-0000-4000-8000-000000000001",
    organizationId: ORGANIZATION_ID,
    payload: { locationName: "Casa Central", runId: RUN_ID },
    status: "processing",
    topic: contentBriefGenerationTopic,
    ...overrides,
  };
}

async function reservedRuns(): Promise<InMemoryContentBriefRunRepository> {
  const runs = new InMemoryContentBriefRunRepository();
  await runs.reserve({
    actorMembershipId: MEMBERSHIP_ID,
    id: RUN_ID,
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    promptHash: "0".repeat(64),
    promptVersion: "content-brief/prueba",
    request: "Necesito una pieza para promocionar taladros percutores.",
    requestHash: "0".repeat(64),
    requestedAt: REQUESTED_AT,
    schemaVersion: "content-brief/prueba",
  });
  return runs;
}

function transport(
  generation: RecordingGeneration,
  runs: InMemoryContentBriefRunRepository,
): ContentBriefOutboxTransport {
  return new ContentBriefOutboxTransport(
    generation as unknown as ContentBriefGenerationService,
    runs,
  );
}

test("ejecuta la generación con el alcance que la API reservó", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();

  await transport(generation, runs).deliver(message());

  assert.deepEqual(generation.commands, [
    {
      actorMembershipId: MEMBERSHIP_ID,
      locationId: LOCATION_ID,
      locationName: "Casa Central",
      organizationId: ORGANIZATION_ID,
      request: "Necesito una pieza para promocionar taladros percutores.",
      requestedAt: REQUESTED_AT,
      runId: RUN_ID,
    },
  ]);
});

test("un pedido cancelado se considera entregado y no gasta una generación", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();
  await runs.cancel({
    cancelledAt: "2026-07-30T12:00:10.000Z",
    id: RUN_ID,
    organizationId: ORGANIZATION_ID,
  });

  await transport(generation, runs).deliver(message());

  assert.equal(generation.commands.length, 0);
});

test("un reintento sobre una ejecución ya resuelta no vuelve a generar", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();
  await runs.complete(
    {
      attempts: 1,
      brief: null,
      estimatedCostUsd: null,
      evidence: [],
      id: RUN_ID,
      knowledgeStatus: "grounded",
      latencyMilliseconds: 10,
      model: "gpt-5.6-terra",
      organizationId: ORGANIZATION_ID,
      rejection: { code: "evidence-stale", message: "vencida" },
      requestId: null,
      responseId: null,
      status: "rejected",
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
    },
    "2026-07-30T12:00:20.000Z",
  );

  await transport(generation, runs).deliver(message());

  assert.equal(generation.commands.length, 0);
});

test("un pedido de otra organización no se ejecuta", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();

  await assert.rejects(
    transport(generation, runs).deliver(
      message({ organizationId: "20000000-0000-4000-8000-000000000009" }),
    ),
    /no existe en su organización/u,
  );
  assert.equal(generation.commands.length, 0);
});

test("un evento sin runId falla en lugar de ejecutar a ciegas", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();

  await assert.rejects(
    transport(generation, runs).deliver(message({ payload: {} })),
    /no contiene runId/u,
  );
});

test("el ruteo entrega cada tópico a su consumidor y rechaza los ajenos", async () => {
  const generation = new RecordingGeneration();
  const runs = await reservedRuns();
  const delivered: string[] = [];
  const routing = new TopicRoutingOutboxTransport({
    [contentBriefGenerationTopic]: transport(generation, runs),
    [publicationRenderTopic]: {
      deliver: (received): Promise<void> => {
        delivered.push(received.topic);
        return Promise.resolve();
      },
    },
  });

  await routing.deliver(message());
  await routing.deliver(message({ topic: publicationRenderTopic }));
  assert.equal(generation.commands.length, 1);
  assert.deepEqual(delivered, [publicationRenderTopic]);

  await assert.rejects(
    routing.deliver(message({ topic: "content.brief.desconocido" })),
    /no tiene consumidor/u,
  );
});
