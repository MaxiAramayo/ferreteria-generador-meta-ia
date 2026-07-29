import type { OpenAIIntegration } from "@aramayo/configuration";
import type { TextGenerationPort } from "@aramayo/domain";
import { Logger, Module, type DynamicModule } from "@nestjs/common";

import { TEXT_GENERATION_PORT } from "./generation.tokens.ts";
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
    return {
      exports: [TEXT_GENERATION_PORT],
      global: true,
      module: GenerationModule,
      providers: [
        {
          provide: TEXT_GENERATION_PORT,
          useFactory: (): TextGenerationPort => {
            if (!openAi.enabled) {
              return new DisabledTextGenerationGateway();
            }
            return new OpenAITextGenerationGateway(
              openAi.policy,
              new OfficialOpenAIResponsesTransport(
                openAi.credentials,
                openAi.policy,
              ),
              { telemetry: new SafeOpenAITelemetry() },
            );
          },
        },
      ],
    };
  }
}
