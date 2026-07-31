import type { OpenAIIntegration } from "@aramayo/configuration";
import type {
  StructuredGenerationPort,
  TextGenerationPort,
} from "@aramayo/domain";
import { Logger, Module, type DynamicModule } from "@nestjs/common";

import {
  STRUCTURED_GENERATION_PORT,
  TEXT_GENERATION_PORT,
} from "./generation.tokens.ts";
import {
  DisabledTextGenerationGateway,
  OpenAITextGenerationGateway,
  type OpenAITelemetryEvent,
  type OpenAITelemetryPort,
} from "./openai-text-generation.gateway.ts";
import { OfficialOpenAIResponsesTransport } from "./openai-transport.ts";

class SafeOpenAITelemetry implements OpenAITelemetryPort {
  readonly #logger = new Logger("worker");

  record(event: OpenAITelemetryEvent): void {
    this.#logger.log(`openai.execution ${JSON.stringify(event)}`);
  }
}

@Module({})
export class GenerationModule {
  static forConfiguration(openAi: OpenAIIntegration): DynamicModule {
    // El mismo gateway resuelve texto y salida estructurada; se expone bajo dos
    // tokens para que cada caso de uso dependa sólo del puerto que necesita.
    const gateway = (): TextGenerationPort & StructuredGenerationPort => {
      if (!openAi.enabled) {
        return new DisabledTextGenerationGateway();
      }
      return new OpenAITextGenerationGateway(
        openAi.policy,
        new OfficialOpenAIResponsesTransport(openAi.credentials, openAi.policy),
        { telemetry: new SafeOpenAITelemetry() },
      );
    };

    return {
      exports: [STRUCTURED_GENERATION_PORT, TEXT_GENERATION_PORT],
      global: true,
      module: GenerationModule,
      providers: [
        {
          provide: TEXT_GENERATION_PORT,
          useFactory: gateway,
        },
        {
          inject: [TEXT_GENERATION_PORT],
          provide: STRUCTURED_GENERATION_PORT,
          useFactory: (
            port: TextGenerationPort & StructuredGenerationPort,
          ): StructuredGenerationPort => port,
        },
      ],
    };
  }
}
