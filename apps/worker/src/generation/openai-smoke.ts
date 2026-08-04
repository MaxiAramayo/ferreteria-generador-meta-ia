import {
  parseOpenAiIntegration,
  type OpenAIIntegration,
} from "@aramayo/configuration";

import { OpenAITextGenerationGateway } from "./openai-text-generation.gateway.ts";
import { OfficialOpenAIResponsesTransport } from "./openai-transport.ts";

function requiredStagingIntegration(): Extract<
  OpenAIIntegration,
  { readonly enabled: true }
> {
  if (process.env["NODE_ENV"] !== "staging") {
    throw new Error("El smoke de OpenAI solo admite NODE_ENV=staging.");
  }
  const integration = parseOpenAiIntegration(
    process.env,
    "openai-staging-smoke",
  );
  if (!integration.enabled) {
    throw new Error(
      "El smoke requiere OPENAI_API_KEY y OPENAI_PROJECT_ID de staging.",
    );
  }
  return integration;
}

async function runOpenAISmoke(): Promise<void> {
  const integration = requiredStagingIntegration();
  const gateway = new OpenAITextGenerationGateway(
    integration.policy,
    new OfficialOpenAIResponsesTransport(
      integration.credentials,
      integration.policy,
    ),
  );
  const generated = await gateway.generateText({
    input:
      "Respondé con una sola palabra en español que confirme que el servicio está disponible.",
    maximumOutputTokens: 32,
    workload: "routine",
  });

  process.stdout.write(
    [
      "OpenAI staging verificado.",
      `model=${generated.execution.model}`,
      `requestId=${generated.execution.requestId}`,
      `latencyMs=${String(generated.execution.latencyMilliseconds)}`,
      `tokens=${String(generated.usage.totalTokens)}`,
      `estimatedCostUsd=${generated.usage.estimatedCostUsd?.toFixed(8) ?? "unavailable"}`,
    ].join(" "),
  );
  process.stdout.write("\n");
}

try {
  await runOpenAISmoke();
} catch (cause: unknown) {
  process.stderr.write(
    cause instanceof Error
      ? `OpenAI staging falló: ${cause.message}\n`
      : "OpenAI staging falló con una causa desconocida.\n",
  );
  process.exitCode = 1;
}
