import type {
  OpenAICredentials,
  OpenAIRuntimePolicy,
} from "@aramayo/configuration";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
} from "openai/resources/responses/responses";

export type OpenAIReasoningEffort = "low" | "medium" | "none";

export interface OpenAITransportRequest {
  readonly input: string;
  readonly instructions?: string;
  readonly maximumOutputTokens: number;
  readonly model: string;
  readonly reasoningEffort: OpenAIReasoningEffort;
}

export interface OpenAITransportUsage {
  readonly cacheWriteInputTokens: number;
  readonly cachedInputTokens: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
}

export interface OpenAITransportResponse {
  readonly model: string;
  readonly outputText: string;
  readonly requestId: string | null;
  readonly responseId: string;
  readonly usage: OpenAITransportUsage | null;
}

export type OpenAITransportFailureCode =
  "provider-error" | "rate-limit" | "safety-rejection" | "timeout";

export class OpenAITransportError extends Error {
  readonly code: OpenAITransportFailureCode;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(
    code: OpenAITransportFailureCode,
    retryable: boolean,
    requestId?: string,
  ) {
    super("La solicitud a OpenAI no pudo completarse.");
    this.code = code;
    this.name = "OpenAITransportError";
    this.retryable = retryable;
    if (requestId !== undefined) {
      this.requestId = requestId;
    }
  }
}

export interface OpenAIResponsesTransport {
  createResponse(
    request: OpenAITransportRequest,
  ): Promise<OpenAITransportResponse>;
}

function isSafetyCode(code: string | null | undefined): boolean {
  return (
    code === "content_filter" ||
    code === "content_policy_violation" ||
    code === "image_content_policy_violation" ||
    code === "safety_violation"
  );
}

function normalizedProviderError(cause: unknown): OpenAITransportError {
  if (cause instanceof APIError && isSafetyCode(cause.code)) {
    return new OpenAITransportError(
      "safety-rejection",
      false,
      cause.requestID ?? undefined,
    );
  }
  if (cause instanceof RateLimitError) {
    return new OpenAITransportError(
      "rate-limit",
      true,
      cause.requestID ?? undefined,
    );
  }
  if (cause instanceof APIConnectionTimeoutError) {
    return new OpenAITransportError(
      "timeout",
      true,
      cause.requestID ?? undefined,
    );
  }
  if (cause instanceof APIConnectionError) {
    return new OpenAITransportError(
      "provider-error",
      true,
      cause.requestID ?? undefined,
    );
  }
  if (cause instanceof APIError) {
    const retryable =
      cause.status === 408 ||
      cause.status === 409 ||
      (typeof cause.status === "number" && cause.status >= 500);
    return new OpenAITransportError(
      "provider-error",
      retryable,
      cause.requestID ?? undefined,
    );
  }
  return new OpenAITransportError("provider-error", false);
}

function containsRefusal(output: readonly ResponseOutputItem[]): boolean {
  return output.some(
    (entry) =>
      entry.type === "message" &&
      entry.content.some((content) => content.type === "refusal"),
  );
}

export class OfficialOpenAIResponsesTransport implements OpenAIResponsesTransport {
  readonly #client: OpenAI;

  constructor(credentials: OpenAICredentials, policy: OpenAIRuntimePolicy) {
    this.#client = new OpenAI({
      apiKey: credentials.apiKey.reveal(),
      logLevel: "off",
      maxRetries: 0,
      project: credentials.projectId,
      timeout: policy.requestTimeoutMilliseconds,
    });
  }

  async createResponse(
    request: OpenAITransportRequest,
  ): Promise<OpenAITransportResponse> {
    try {
      const requestBody: ResponseCreateParamsNonStreaming = {
        input: request.input,
        ...(request.instructions === undefined
          ? {}
          : { instructions: request.instructions }),
        max_output_tokens: request.maximumOutputTokens,
        model: request.model,
        reasoning: { effort: request.reasoningEffort },
        service_tier: "default",
        store: false,
      };
      const response = await this.#client.responses.create(requestBody);

      if (
        response.incomplete_details?.reason === "content_filter" ||
        containsRefusal(response.output) ||
        isSafetyCode(response.error?.code)
      ) {
        throw new OpenAITransportError(
          "safety-rejection",
          false,
          response._request_id ?? undefined,
        );
      }
      if (
        response.status !== "completed" ||
        response.error !== null ||
        response.output_text.trim().length === 0
      ) {
        const retryable =
          response.error?.code === "server_error" ||
          response.error?.code === "rate_limit_exceeded" ||
          response.error?.code === "vector_store_timeout";
        throw new OpenAITransportError(
          response.error?.code === "rate_limit_exceeded"
            ? "rate-limit"
            : "provider-error",
          retryable,
          response._request_id ?? undefined,
        );
      }

      const usage = response.usage;
      return Object.freeze({
        model: response.model,
        outputText: response.output_text,
        requestId: response._request_id ?? null,
        responseId: response.id,
        usage:
          usage === undefined
            ? null
            : Object.freeze({
                cacheWriteInputTokens:
                  usage.input_tokens_details.cache_write_tokens,
                cachedInputTokens: usage.input_tokens_details.cached_tokens,
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                reasoningTokens: usage.output_tokens_details.reasoning_tokens,
                totalTokens: usage.total_tokens,
              }),
      });
    } catch (cause: unknown) {
      if (cause instanceof OpenAITransportError) {
        throw cause;
      }
      throw normalizedProviderError(cause);
    }
  }
}
