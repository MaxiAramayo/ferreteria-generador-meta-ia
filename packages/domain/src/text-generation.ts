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

/** Esquema estricto que la salida debe cumplir; `version` viaja al historial. */
export interface StructuredOutputSchema {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly version: string;
}

export interface GenerationToolDefinition {
  readonly description: string;
  readonly name: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface GenerationToolInvocation {
  readonly arguments: string;
  readonly callId: string;
  readonly name: string;
}

export interface GenerationToolResult {
  readonly callId: string;
  readonly output: string;
}

export interface GenerateStructuredCommand {
  readonly executeTool: (
    invocation: GenerationToolInvocation,
  ) => Promise<GenerationToolResult>;
  readonly input: string;
  readonly instructions: string;
  readonly maximumOutputTokens?: number;
  readonly maximumToolIterations: number;
  readonly schema: StructuredOutputSchema;
  readonly tools: readonly GenerationToolDefinition[];
  readonly workload: GenerationWorkload;
}

export interface StructuredGeneration {
  readonly execution: GenerationExecution;
  readonly outputText: string;
  readonly toolIterations: number;
  readonly usage: GenerationTokenUsage;
}

export interface StructuredGenerationPort {
  generateStructured(
    command: GenerateStructuredCommand,
  ): Promise<StructuredGeneration>;
}

export type GenerationGatewayErrorCode =
  | "invalid-request"
  | "invalid-response"
  | "provider-disabled"
  | "provider-error"
  | "rate-limit"
  | "safety-rejection"
  | "timeout"
  | "tool-loop-exhausted";

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
