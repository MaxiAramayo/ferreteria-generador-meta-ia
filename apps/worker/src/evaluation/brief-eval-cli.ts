/**
 * Ejecuta la evaluación contra el modelo real y congela su resultado.
 *
 * La línea base se versiona en el repositorio porque es la evidencia que
 * habilita promover. Las muestras van a `output/`, que no se versiona: sirven
 * para la revisión humana y pueden contener texto generado.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseWorkerEnvironment } from "@aramayo/configuration/worker";
import {
  checkBriefEvaluationGate,
  type BriefEvaluationReport,
} from "@aramayo/domain";

import { contentBriefSchema } from "../brief/content-brief-schema.ts";
import { contentBriefPromptHash } from "../brief/content-brief-prompt.ts";
import { OpenAITextGenerationGateway } from "../generation/openai-text-generation.gateway.ts";
import { OfficialOpenAIResponsesTransport } from "../generation/openai-transport.ts";
import { briefEvaluationDatasetVersion } from "./brief-evaluation-dataset.ts";
import {
  BriefEvaluationService,
  evaluationScope,
} from "./brief-evaluation.service.ts";

const baselinePath = fileURLToPath(
  new URL("./brief-evaluation-baseline.json", import.meta.url),
);
const samplesDirectory = fileURLToPath(
  new URL("../../../../output/brief-evaluation/", import.meta.url),
);

function summarize(report: BriefEvaluationReport): string {
  const failed = report.cases
    .filter((entry) => !entry.passed)
    .map((entry) => entry.caseId);
  return [
    `casos=${String(report.metrics.cases)}`,
    `aprobados=${(report.metrics.caseSuccess * 100).toFixed(1)}%`,
    `verificaciones=${(report.metrics.checkSuccess * 100).toFixed(1)}%`,
    `bloqueantes=${String(report.metrics.blockingFailures)}`,
    failed.length === 0 ? "" : `fallaron=${failed.join(",")}`,
  ]
    .filter((entry) => entry.length > 0)
    .join(" ");
}

async function runEvaluation(): Promise<void> {
  const configuration = parseWorkerEnvironment(process.env);
  if (configuration.environment !== "staging") {
    throw new Error("La evaluación sólo admite NODE_ENV=staging.");
  }
  if (!configuration.openAi.enabled) {
    throw new Error("La evaluación requiere credenciales de OpenAI staging.");
  }
  const { openAi } = configuration;
  const model = openAi.policy.models.brief;

  const { report, samples } = await new BriefEvaluationService(
    new OpenAITextGenerationGateway(
      openAi.policy,
      new OfficialOpenAIResponsesTransport(openAi.credentials, openAi.policy),
    ),
    evaluationScope(),
  ).run(model);

  await mkdir(samplesDirectory, { recursive: true });
  await writeFile(
    new URL("samples.json", `file://${samplesDirectory}`),
    `${JSON.stringify(samples, null, 2)}\n`,
    "utf8",
  );

  const failures = checkBriefEvaluationGate({
    baseline: report,
    datasetVersion: briefEvaluationDatasetVersion,
    model,
    promptHash: contentBriefPromptHash,
    schemaVersion: contentBriefSchema.version,
  });

  // Una corrida que no supera los umbrales igual se informa, pero no se congela:
  // la línea base sólo puede contener un resultado que habilite promover.
  if (failures.length === 0) {
    await writeFile(
      baselinePath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `Evaluación aprobada y congelada. ${summarize(report)}\n`,
    );
    return;
  }

  process.stderr.write(
    `Evaluación por debajo del umbral: ${failures.join(", ")}. ${summarize(report)}\n`,
  );
  process.stderr.write(
    "La línea base no se actualizó. Revisá las muestras en output/brief-evaluation.\n",
  );
  process.exitCode = 1;
}

try {
  await runEvaluation();
} catch (cause: unknown) {
  process.stderr.write(
    `La evaluación falló: ${cause instanceof Error ? cause.message : "error desconocido"}\n`,
  );
  process.exitCode = 1;
}
