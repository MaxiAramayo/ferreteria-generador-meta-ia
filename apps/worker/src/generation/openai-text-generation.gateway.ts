import type { OpenAIRuntimePolicy } from "@aramayo/configuration";
import {
  GenerationGatewayError,
  type GeneratedText,
  type GenerateTextCommand,
  type GenerationGatewayErrorCode,
  type TextGenerationPort,
} from "@aramayo/domain";

import {
  estimateStandardCostUsd,
  workloadPolicy,
} from "./openai-model-policy.ts";
import {
  OpenAITransportError,
  type OpenAIResponsesTransport,
  type OpenAITransportUsage,
} from "./openai-transport.ts";

export interface OpenAITelemetryEvent {
  readonly attempts: number;
  readonly code?: GenerationGatewayErrorCode;
  readonly estimatedCostUsd?: number | null;
  readonly inputTokens?: number;
  readonly latencyMilliseconds: number;
  readonly model: string;
  readonly outputTokens?: number;
  readonly requestId?: string;
  readonly responseId?: string;
  readonly retryable?: boolean;
  readonly status: "failure" | "success";
}

export interface OpenAITelemetryPort {
  record(event: OpenAITelemetryEvent): void;
}

interface GatewayDependencies {
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly telemetry?: OpenAITelemetryPort;
}

const noOpTelemetry: OpenAITelemetryPort = Object.freeze({
  record(): void {},
});

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function failureMessage(code: GenerationGatewayErrorCode): string {
  switch (code) {
    case "invalid-request":
      return "La solicitud de generación no cumple los límites configurados.";
    case "invalid-response":
      return "OpenAI devolvió una respuesta que no puede confirmarse.";
    case "provider-disabled":
      return "OpenAI no está configurado en este ambiente.";
    case "rate-limit":
      return "OpenAI rechazó temporalmente la solicitud por límite de uso.";
    case "safety-rejection":
      return "OpenAI rechazó la solicitud por sus controles de seguridad.";
    case "timeout":
      return "OpenAI no respondió dentro del tiempo permitido.";
    case "provider-error":
      return "OpenAI no pudo completar la solicitud.";
  }
}

function safeUsage(
  model: string,
  usage: OpenAITransportUsage,
): GeneratedText["usage"] {
  return Object.freeze({
    ...usage,
    estimatedCostUsd: estimateStandardCostUsd(model, usage),
  });
}

export class OpenAITextGenerationGateway implements TextGenerationPort {
  readonly #now: () => number;
  readonly #policy: OpenAIRuntimePolicy;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #telemetry: OpenAITelemetryPort;
  readonly #transport: OpenAIResponsesTransport;

  constructor(
    policy: OpenAIRuntimePolicy,
    transport: OpenAIResponsesTransport,
    dependencies: GatewayDependencies = {},
  ) {
    this.#now = dependencies.now ?? Date.now;
    this.#policy = policy;
    this.#sleep = dependencies.sleep ?? defaultSleep;
    this.#telemetry = dependencies.telemetry ?? noOpTelemetry;
    this.#transport = transport;
  }

  async generateText(command: GenerateTextCommand): Promise<GeneratedText> {
    this.#validateCommand(command);
    const selectedPolicy = workloadPolicy(this.#policy, command.workload);
    const startedAt = this.#now();
    const maximumOutputTokens =
      command.maximumOutputTokens ?? this.#policy.maximumOutputTokens;
    let attempts = 0;

    for (;;) {
      attempts += 1;
      try {
        const response = await this.#transport.createResponse({
          input: command.input,
          ...(command.instructions === undefined
            ? {}
            : { instructions: command.instructions }),
          maximumOutputTokens,
          model: selectedPolicy.model,
          reasoningEffort: selectedPolicy.reasoningEffort,
        });
        const latencyMilliseconds = Math.max(0, this.#now() - startedAt);
        if (response.requestId === null || response.usage === null) {
          throw new GenerationGatewayError(
            "invalid-response",
            failureMessage("invalid-response"),
            false,
            {
              attempts,
              latencyMilliseconds,
              model: response.model,
              ...(response.requestId === null
                ? {}
                : { requestId: response.requestId }),
            },
          );
        }
        const usage = safeUsage(response.model, response.usage);
        this.#telemetry.record(
          Object.freeze({
            attempts,
            estimatedCostUsd: usage.estimatedCostUsd,
            inputTokens: usage.inputTokens,
            latencyMilliseconds,
            model: response.model,
            outputTokens: usage.outputTokens,
            requestId: response.requestId,
            responseId: response.responseId,
            status: "success",
          }),
        );
        return Object.freeze({
          execution: Object.freeze({
            attempts,
            latencyMilliseconds,
            model: response.model,
            requestId: response.requestId,
            responseId: response.responseId,
          }),
          outputText: response.outputText,
          usage,
        });
      } catch (cause: unknown) {
        if (cause instanceof GenerationGatewayError) {
          this.#recordFailure(cause);
          throw cause;
        }
        const transportError =
          cause instanceof OpenAITransportError
            ? cause
            : new OpenAITransportError("provider-error", false);
        if (
          transportError.retryable &&
          attempts <= this.#policy.maximumRetries
        ) {
          await this.#sleep(
            this.#policy.retryBaseDelayMilliseconds * 2 ** (attempts - 1),
          );
          continue;
        }
        const gatewayError = new GenerationGatewayError(
          transportError.code,
          failureMessage(transportError.code),
          transportError.retryable,
          {
            attempts,
            latencyMilliseconds: Math.max(0, this.#now() - startedAt),
            model: selectedPolicy.model,
            ...(transportError.requestId === undefined
              ? {}
              : { requestId: transportError.requestId }),
          },
        );
        this.#recordFailure(gatewayError);
        throw gatewayError;
      }
    }
  }

  #recordFailure(cause: GenerationGatewayError): void {
    this.#telemetry.record(
      Object.freeze({
        attempts: cause.attempts,
        code: cause.code,
        latencyMilliseconds: cause.latencyMilliseconds,
        model: cause.model ?? "unselected",
        ...(cause.requestId === undefined
          ? {}
          : { requestId: cause.requestId }),
        retryable: cause.retryable,
        status: "failure",
      }),
    );
  }

  #validateCommand(command: GenerateTextCommand): void {
    const inputLength =
      command.input.length + (command.instructions?.length ?? 0);
    const maximumOutputTokens =
      command.maximumOutputTokens ?? this.#policy.maximumOutputTokens;
    if (
      command.input.trim().length === 0 ||
      inputLength > this.#policy.maximumInputCharacters ||
      !Number.isSafeInteger(maximumOutputTokens) ||
      maximumOutputTokens < 1 ||
      maximumOutputTokens > this.#policy.maximumOutputTokens
    ) {
      throw new GenerationGatewayError(
        "invalid-request",
        failureMessage("invalid-request"),
        false,
        { attempts: 0, latencyMilliseconds: 0 },
      );
    }
  }
}

export class DisabledTextGenerationGateway implements TextGenerationPort {
  generateText(command: GenerateTextCommand): Promise<GeneratedText> {
    void command;
    return Promise.reject(
      new GenerationGatewayError(
        "provider-disabled",
        failureMessage("provider-disabled"),
        false,
        { attempts: 0, latencyMilliseconds: 0 },
      ),
    );
  }
}
