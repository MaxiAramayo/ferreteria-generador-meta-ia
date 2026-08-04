import type { OpenAIIntegration } from "@aramayo/configuration";
import {
  ImageGenerationError,
  type ContentBriefRunRepository,
  type GenerationRunRepository,
  type ImageGenerationPort,
  type StructuredGenerationPort,
  type TextGenerationPort,
} from "@aramayo/domain";
import { Logger, Module, type DynamicModule } from "@nestjs/common";

import {
  CONTENT_BRIEF_RUN_REPOSITORY,
  GENERATION_RUN_REPOSITORY,
} from "../database/database.tokens.ts";
import { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import {
  IMAGE_GENERATION_PORT,
  IMAGE_GENERATION_RUN_SERVICE,
  STRUCTURED_GENERATION_PORT,
  TEXT_GENERATION_PORT,
} from "./generation.tokens.ts";
import { ImageGenerationRunService } from "./image-generation-run.service.ts";
import { OfficialOpenAIImagesTransport } from "./openai-image-transport.ts";
import { OpenAIImageGenerationGateway } from "./openai-image.gateway.ts";
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

/**
 * Sin credenciales no hay generación de imágenes, y el proceso arranca igual: el
 * worker tiene otros trabajos que no dependen de OpenAI. Pedir una imagen en ese
 * estado es un fallo explícito y no una imagen vacía.
 */
class DisabledImageGenerationGateway implements ImageGenerationPort {
  edit(): Promise<never> {
    return this.#refuse();
  }

  generate(): Promise<never> {
    return this.#refuse();
  }

  #refuse(): Promise<never> {
    return Promise.reject(
      new ImageGenerationError(
        "provider-error",
        "La generación de imágenes no está configurada en este proceso.",
        false,
      ),
    );
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

    const imageGateway = (): ImageGenerationPort => {
      if (!openAi.enabled) {
        return new DisabledImageGenerationGateway();
      }
      return new OpenAIImageGenerationGateway(
        new OfficialOpenAIImagesTransport(openAi.credentials),
      );
    };

    return {
      exports: [
        IMAGE_GENERATION_PORT,
        IMAGE_GENERATION_RUN_SERVICE,
        STRUCTURED_GENERATION_PORT,
        TEXT_GENERATION_PORT,
      ],
      global: true,
      module: GenerationModule,
      providers: [
        {
          provide: IMAGE_GENERATION_PORT,
          useFactory: imageGateway,
        },
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
        {
          inject: [
            GENERATION_RUN_REPOSITORY,
            CONTENT_BRIEF_RUN_REPOSITORY,
            IMAGE_GENERATION_PORT,
            MediaLifecycleService,
          ],
          provide: IMAGE_GENERATION_RUN_SERVICE,
          useFactory: (
            runs: GenerationRunRepository,
            briefs: ContentBriefRunRepository,
            images: ImageGenerationPort,
            media: MediaLifecycleService,
          ): ImageGenerationRunService =>
            new ImageGenerationRunService(runs, briefs, images, media, {
              // Sin credenciales el lote se cierra con render determinista y
              // motivo `generation-disabled`, en lugar de gastar cada variante
              // contra un gateway que sólo sabe rechazar.
              generationEnabled: openAi.enabled,
            }),
        },
      ],
    };
  }
}
