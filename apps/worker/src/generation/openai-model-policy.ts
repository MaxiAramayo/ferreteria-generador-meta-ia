import type { OpenAIRuntimePolicy } from "@aramayo/configuration";
import type { GenerationWorkload } from "@aramayo/domain";

import type {
  OpenAIReasoningEffort,
  OpenAITransportUsage,
} from "./openai-transport.ts";

export interface OpenAIWorkloadPolicy {
  readonly model: string;
  readonly reasoningEffort: OpenAIReasoningEffort;
}

interface StandardTokenPrices {
  readonly cacheWriteInputUsdPerMillion: number;
  readonly cachedInputUsdPerMillion: number;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
}

const standardShortContextPrices = Object.freeze({
  "gpt-5.6-luna": Object.freeze({
    cacheWriteInputUsdPerMillion: 1.25,
    cachedInputUsdPerMillion: 0.1,
    inputUsdPerMillion: 1,
    outputUsdPerMillion: 6,
  }),
  "gpt-5.6-sol": Object.freeze({
    cacheWriteInputUsdPerMillion: 6.25,
    cachedInputUsdPerMillion: 0.5,
    inputUsdPerMillion: 5,
    outputUsdPerMillion: 30,
  }),
  "gpt-5.6-terra": Object.freeze({
    cacheWriteInputUsdPerMillion: 3.125,
    cachedInputUsdPerMillion: 0.25,
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
  }),
});

function tokenPrices(model: string): StandardTokenPrices | null {
  for (const [modelFamily, prices] of Object.entries(
    standardShortContextPrices,
  )) {
    if (model === modelFamily || model.startsWith(`${modelFamily}-`)) {
      return prices;
    }
  }
  return null;
}

export function estimateStandardCostUsd(
  model: string,
  usage: OpenAITransportUsage,
): number | null {
  const prices = tokenPrices(model);
  if (prices === null) {
    return null;
  }
  const uncachedInputTokens = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens,
  );
  return (
    (uncachedInputTokens * prices.inputUsdPerMillion +
      usage.cachedInputTokens * prices.cachedInputUsdPerMillion +
      usage.cacheWriteInputTokens * prices.cacheWriteInputUsdPerMillion +
      usage.outputTokens * prices.outputUsdPerMillion) /
    1_000_000
  );
}

export function workloadPolicy(
  policy: OpenAIRuntimePolicy,
  workload: GenerationWorkload,
): OpenAIWorkloadPolicy {
  switch (workload) {
    case "routine":
      return Object.freeze({
        model: policy.models.routine,
        reasoningEffort: "none",
      });
    case "brief":
      return Object.freeze({
        model: policy.models.brief,
        reasoningEffort: "low",
      });
    case "complex":
      return Object.freeze({
        model: policy.models.complex,
        reasoningEffort: "medium",
      });
  }
}
