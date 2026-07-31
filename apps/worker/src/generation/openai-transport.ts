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
import type { ResponseFunctionToolCall } from "openai/resources/responses/responses";
import type {
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseUsage,
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

export interface OpenAIStructuredToolDefinition {
  readonly description: string;
  readonly name: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface OpenAIStructuredRequest {
  readonly input: string;
  readonly instructions: string;
  readonly maximumOutputTokens: number;
  readonly maximumToolIterations: number;
  readonly model: string;
  readonly reasoningEffort: OpenAIReasoningEffort;
  readonly schemaName: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly tools: readonly OpenAIStructuredToolDefinition[];
}

export interface OpenAIStructuredToolCall {
  readonly arguments: string;
  readonly callId: string;
  readonly name: string;
}

export interface OpenAIStructuredResponse extends OpenAITransportResponse {
  readonly toolIterations: number;
}

/**
 * Ejecutor de herramientas provisto por el caso de uso. El transporte nunca
 * decide qué hace una herramienta ni con qué alcance.
 */
export type OpenAIStructuredToolExecutor = (
  call: OpenAIStructuredToolCall,
) => Promise<string>;

export interface OpenAIResponsesTransport {
  createResponse(
    request: OpenAITransportRequest,
  ): Promise<OpenAITransportResponse>;
  createStructuredResponse(
    request: OpenAIStructuredRequest,
    executeTool: OpenAIStructuredToolExecutor,
  ): Promise<OpenAIStructuredResponse>;
}

export class OpenAIToolLoopExhaustedError extends Error {
  readonly requestId?: string;

  constructor(requestId?: string) {
    super("El modelo siguió pidiendo herramientas más allá del límite.");
    this.name = "OpenAIToolLoopExhaustedError";
    if (requestId !== undefined) {
      this.requestId = requestId;
    }
  }
}

/**
 * Envoltorio interno para no confundir un fallo del ejecutor de herramientas
 * —que pertenece al caso de uso— con un fallo del proveedor.
 */
class ToolExecutorFailure extends Error {
  readonly reason: unknown;

  constructor(reason: unknown) {
    super("La ejecución de una herramienta falló.");
    this.name = "ToolExecutorFailure";
    this.reason = reason;
  }
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

function functionCalls(
  output: readonly ResponseOutputItem[],
): readonly ResponseFunctionToolCall[] {
  return output.filter(
    (entry): entry is ResponseFunctionToolCall =>
      entry.type === "function_call",
  );
}

const emptyUsage: OpenAITransportUsage = Object.freeze({
  cacheWriteInputTokens: 0,
  cachedInputTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
});

function toTransportUsage(usage: ResponseUsage): OpenAITransportUsage {
  return Object.freeze({
    cacheWriteInputTokens: usage.input_tokens_details.cache_write_tokens,
    cachedInputTokens: usage.input_tokens_details.cached_tokens,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details.reasoning_tokens,
    totalTokens: usage.total_tokens,
  });
}

function addUsage(
  left: OpenAITransportUsage,
  right: OpenAITransportUsage,
): OpenAITransportUsage {
  return Object.freeze({
    cacheWriteInputTokens:
      left.cacheWriteInputTokens + right.cacheWriteInputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  });
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
        usage: usage === undefined ? null : toTransportUsage(usage),
      });
    } catch (cause: unknown) {
      if (cause instanceof OpenAITransportError) {
        throw cause;
      }
      throw normalizedProviderError(cause);
    }
  }

  /**
   * Ciclo de function calling con salida estructurada.
   *
   * El bucle vive acá porque necesita los items crudos de la Responses API.
   * Con `store: false` no hay estado remoto: cada vuelta reenvía la
   * conversación completa, agregando la llamada emitida por el modelo y el
   * resultado que produjo el ejecutor del caso de uso. Sólo se reenvían items
   * `function_call`, que es lo que el protocolo exige para cerrar cada llamada.
   */
  async createStructuredResponse(
    request: OpenAIStructuredRequest,
    executeTool: OpenAIStructuredToolExecutor,
  ): Promise<OpenAIStructuredResponse> {
    const conversation: ResponseInputItem[] = [
      { content: request.input, role: "user", type: "message" },
    ];
    let usage = emptyUsage;
    let toolIterations = 0;

    try {
      for (;;) {
        const response = await this.#client.responses.create({
          input: conversation,
          instructions: request.instructions,
          max_output_tokens: request.maximumOutputTokens,
          model: request.model,
          reasoning: { effort: request.reasoningEffort },
          service_tier: "default",
          store: false,
          text: {
            format: {
              name: request.schemaName,
              schema: { ...request.schema },
              strict: true,
              type: "json_schema",
            },
          },
          tools: request.tools.map((tool) => ({
            description: tool.description,
            name: tool.name,
            parameters: { ...tool.parameters },
            strict: true,
            type: "function",
          })),
        });

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
        if (response.usage !== undefined) {
          usage = addUsage(usage, toTransportUsage(response.usage));
        }
        // Una respuesta truncada no es progreso: cerrar el ciclo con lo que
        // haya produciría un brief construido sobre una vuelta incompleta.
        if (response.status === "incomplete") {
          throw new OpenAITransportError(
            "provider-error",
            false,
            response._request_id ?? undefined,
          );
        }

        const pendingCalls = functionCalls(response.output);
        if (pendingCalls.length === 0) {
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
          return Object.freeze({
            model: response.model,
            outputText: response.output_text,
            requestId: response._request_id ?? null,
            responseId: response.id,
            toolIterations,
            usage,
          });
        }

        toolIterations += 1;
        if (toolIterations > request.maximumToolIterations) {
          throw new OpenAIToolLoopExhaustedError(
            response._request_id ?? undefined,
          );
        }

        for (const call of pendingCalls) {
          conversation.push({
            arguments: call.arguments,
            call_id: call.call_id,
            name: call.name,
            type: "function_call",
          });
          let output: string;
          try {
            output = await executeTool({
              arguments: call.arguments,
              callId: call.call_id,
              name: call.name,
            });
          } catch (reason: unknown) {
            throw new ToolExecutorFailure(reason);
          }
          conversation.push({
            call_id: call.call_id,
            output,
            type: "function_call_output",
          });
        }
      }
    } catch (cause: unknown) {
      if (cause instanceof ToolExecutorFailure) {
        throw cause.reason;
      }
      if (
        cause instanceof OpenAITransportError ||
        cause instanceof OpenAIToolLoopExhaustedError
      ) {
        throw cause;
      }
      throw normalizedProviderError(cause);
    }
  }
}
