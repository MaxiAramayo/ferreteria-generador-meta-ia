export type GenerationWorkload = "brief" | "complex" | "routine";

export interface GenerateTextCommand {
  readonly input: string;
  readonly instructions?: string;
  readonly maximumOutputTokens?: number;
  readonly workload: GenerationWorkload;
}

export interface GenerationTokenUsage {
  readonly cacheWriteInputTokens: number;
  readonly cachedInputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

export interface GenerationExecution {
  readonly attempts: number;
  readonly latencyMilliseconds: number;
  readonly model: string;
  readonly requestId: string;
  readonly responseId: string;
}

export interface GeneratedText {
  readonly execution: GenerationExecution;
  readonly outputText: string;
  readonly usage: GenerationTokenUsage;
}

export interface TextGenerationPort {
  generateText(command: GenerateTextCommand): Promise<GeneratedText>;
}

export type GenerationGatewayErrorCode =
  | "invalid-request"
  | "invalid-response"
  | "provider-disabled"
  | "provider-error"
  | "rate-limit"
  | "safety-rejection"
  | "timeout";

export interface GenerationFailureContext {
  readonly attempts: number;
  readonly latencyMilliseconds: number;
  readonly model?: string;
  readonly requestId?: string;
}

export class GenerationGatewayError extends Error {
  readonly attempts: number;
  readonly code: GenerationGatewayErrorCode;
  readonly latencyMilliseconds: number;
  readonly model?: string;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(
    code: GenerationGatewayErrorCode,
    message: string,
    retryable: boolean,
    context: GenerationFailureContext,
  ) {
    super(message);
    this.attempts = context.attempts;
    this.code = code;
    this.latencyMilliseconds = context.latencyMilliseconds;
    this.name = "GenerationGatewayError";
    this.retryable = retryable;
    if (context.model !== undefined) {
      this.model = context.model;
    }
    if (context.requestId !== undefined) {
      this.requestId = context.requestId;
    }
  }
}
