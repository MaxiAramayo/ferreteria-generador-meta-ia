/**
 * Pruebas del arnés de evaluación con un modelo guionado.
 *
 * No usan red: sustituyen el puerto de generación para poder provocar a
 * voluntad el comportamiento correcto y la regresión, y comprobar que la suite
 * distingue uno del otro.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkBriefEvaluationGate,
  type GenerateStructuredCommand,
  type StructuredGeneration,
  type StructuredGenerationPort,
} from "@aramayo/domain";

import { contentBriefPromptHash } from "../brief/content-brief-prompt.ts";
import { contentBriefSchema } from "../brief/content-brief-schema.ts";
import { defaultBriefModel } from "../generation/openai-model-policy.ts";
import {
  briefEvaluationDataset,
  briefEvaluationDatasetVersion,
  type BriefEvaluationDatasetEntry,
} from "./brief-evaluation-dataset.ts";
import {
  BriefEvaluationService,
  evaluationScope,
} from "./brief-evaluation.service.ts";

const CAPTION =
  "Pasá por el local y consultanos cuál te sirve para el trabajo que tenés entre manos.";

interface ScriptedBriefOptions {
  readonly claimStock?: boolean;
  readonly missingSubjects?: readonly string[];
  readonly products?: readonly Readonly<{ evidenceId: string; id: string }>[];
}

/**
 * Modelo guionado. Descubre los identificadores de evidencia leyendo el
 * catálogo que el servidor le entregó, igual que haría el modelo real.
 */
class ScriptedModel implements StructuredGenerationPort {
  readonly #options: ScriptedBriefOptions;

  constructor(options: ScriptedBriefOptions = {}) {
    this.#options = options;
  }

  async generateStructured(
    command: GenerateStructuredCommand,
  ): Promise<StructuredGeneration> {
    // Una búsqueda y una consulta de stock, como haría una corrida normal.
    await command.executeTool({
      arguments: JSON.stringify({ limit: 5, query: "perforadora" }),
      callId: "call-search",
      name: "search_products",
    });
    await command.executeTool({
      arguments: JSON.stringify({ externalProductId: "odoo-product-101" }),
      callId: "call-stock",
      name: "get_stock_by_location",
    });

    const products = this.#options.products ?? [];
    const missing = this.#options.missingSubjects ?? [];
    const brief = {
      brand: "ferreteria",
      callToAction: { kind: "whatsapp", label: "Consultanos por WhatsApp" },
      caption: CAPTION,
      creativeProposal: "Tono directo, foco en el uso real de la herramienta.",
      missingInformation: missing.map((subject) => ({
        detail: "Falta confirmar este dato con el responsable del local.",
        kind: "no_approved_source",
        subject,
      })),
      objective: "product",
      products: products.map((entry) => ({
        evidenceId: entry.evidenceId,
        externalProductId: entry.id,
        label: "Perforadora rotopercutora",
      })),
      requiresHumanApproval: missing.length > 0,
      subtitle: null,
      title: "Perforadora rotopercutora para tu obra",
      verifiedFacts:
        this.#options.claimStock === true
          ? [
              {
                claimKind: "stock",
                evidenceId: "C2",
                statement: "Hay unidades disponibles en la sucursal.",
              },
            ]
          : [],
      visualDirection: "clean_product",
    };

    return {
      execution: {
        attempts: 1,
        latencyMilliseconds: 100,
        model: defaultBriefModel,
        requestId: "req_eval",
        responseId: "resp_eval",
      },
      outputText: JSON.stringify(brief),
      toolIterations: 1,
      usage: {
        cacheWriteInputTokens: 0,
        cachedInputTokens: 0,
        estimatedCostUsd: 0.001,
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 0,
        totalTokens: 150,
      },
    };
  }
}

function datasetCase(id: string): BriefEvaluationDatasetEntry {
  const entry = briefEvaluationDataset.find(
    (candidate) => candidate.evaluationCase.id === id,
  );
  assert.ok(entry !== undefined, `El dataset no contiene el caso ${id}.`);
  return entry;
}

test("el dataset cubre los escenarios que la fase exige", () => {
  const ids = briefEvaluationDataset.map((entry) => entry.evaluationCase.id);
  for (const required of [
    "similar-products",
    "zero-stock",
    "unknown-stock",
    "stale-price",
    "conflicting-sources",
  ]) {
    assert.ok(ids.includes(required), `Falta el caso ${required}.`);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test("un caso con stock no informado aprueba cuando el brief lo declara faltante", async () => {
  const run = await new BriefEvaluationService(
    new ScriptedModel({ missingSubjects: ["stock"] }),
    evaluationScope(),
    [datasetCase("unknown-stock")],
  ).run(defaultBriefModel);

  const result = run.report.cases[0];
  assert.ok(result !== undefined);
  assert.equal(result.passed, true);
  assert.equal(run.report.metrics.blockingFailures, 0);
});

test("detecta la regresión conocida: afirmar stock que la lectura no informa", async () => {
  const run = await new BriefEvaluationService(
    new ScriptedModel({ claimStock: true }),
    evaluationScope(),
    [datasetCase("unknown-stock")],
  ).run(defaultBriefModel);

  const result = run.report.cases[0];
  assert.ok(result !== undefined);
  assert.equal(result.passed, false);
  assert.ok(run.report.metrics.blockingFailures > 0);
  assert.equal(run.report.metrics.caseSuccess, 0);

  // La validación del brief ya rechaza citar una evidencia que no sustenta
  // stock; la suite lo reporta como resultado inesperado, no como aprobado.
  const outcome = result.checks.find(
    (entry) => entry.name === "expected-outcome",
  );
  assert.ok(outcome !== undefined);
  assert.equal(outcome.passed, false);
});

test("detecta la regresión de omitir un faltante obligatorio", async () => {
  const run = await new BriefEvaluationService(
    new ScriptedModel({ missingSubjects: [] }),
    evaluationScope(),
    [datasetCase("stale-price")],
  ).run(defaultBriefModel);

  const result = run.report.cases[0];
  assert.ok(result !== undefined);
  assert.equal(result.passed, false);
  const missing = result.checks.find(
    (entry) => entry.name === "missing-declaration",
  );
  assert.ok(missing !== undefined);
  assert.equal(missing.passed, false);
});

test("detecta la regresión de citar un producto ajeno al caso", async () => {
  const run = await new BriefEvaluationService(
    new ScriptedModel({
      missingSubjects: ["price"],
      products: [{ evidenceId: "C1", id: "odoo-product-999" }],
    }),
    evaluationScope(),
    [datasetCase("stale-price")],
  ).run(defaultBriefModel);

  const result = run.report.cases[0];
  assert.ok(result !== undefined);
  assert.equal(result.passed, false);
});

test("la puerta rechaza una línea base medida con otro prompt, esquema o modelo", async () => {
  const run = await new BriefEvaluationService(
    new ScriptedModel({ missingSubjects: ["stock"] }),
    evaluationScope(),
    [datasetCase("unknown-stock")],
  ).run(defaultBriefModel);

  const valid = checkBriefEvaluationGate({
    baseline: run.report,
    datasetVersion: briefEvaluationDatasetVersion,
    model: defaultBriefModel,
    promptHash: contentBriefPromptHash,
    schemaVersion: contentBriefSchema.version,
  });
  assert.deepEqual(valid, []);

  assert.deepEqual(
    checkBriefEvaluationGate({
      baseline: run.report,
      datasetVersion: briefEvaluationDatasetVersion,
      model: defaultBriefModel,
      promptHash: "otro-hash",
      schemaVersion: contentBriefSchema.version,
    }),
    ["stale-prompt"],
  );
  assert.deepEqual(
    checkBriefEvaluationGate({
      baseline: run.report,
      datasetVersion: briefEvaluationDatasetVersion,
      model: "gpt-5.6-sol",
      promptHash: contentBriefPromptHash,
      schemaVersion: contentBriefSchema.version,
    }),
    ["stale-model"],
  );
  assert.deepEqual(
    checkBriefEvaluationGate({
      baseline: run.report,
      datasetVersion: "brief-eval/otro",
      model: defaultBriefModel,
      promptHash: contentBriefPromptHash,
      schemaVersion: contentBriefSchema.version,
    }),
    ["stale-dataset"],
  );
});
