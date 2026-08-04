import { randomUUID } from "node:crypto";

import {
  contentBriefGenerationTopic,
  generationRunTopic,
  publicationRenderTopic,
  type ContentBriefRunRepository,
  type OutboxRepository,
  type OutboxTransport,
  type PublicationProductionRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { CONTENT_BRIEF_GENERATION_SERVICE } from "../brief/brief.tokens.ts";
import { ContentBriefOutboxTransport } from "../brief/content-brief-outbox.transport.ts";
import type { ContentBriefGenerationService } from "../brief/content-brief-generation.service.ts";
import {
  CONTENT_BRIEF_RUN_REPOSITORY,
  PUBLICATION_PRODUCTION_REPOSITORY,
} from "../database/database.tokens.ts";
import { IMAGE_GENERATION_RUN_SERVICE } from "../generation/generation.tokens.ts";
import { GenerationRunOutboxTransport } from "../generation/generation-run-outbox.transport.ts";
import type { ImageGenerationRunService } from "../generation/image-generation-run.service.ts";
import { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import { DESIGN_RENDERER } from "../rendering/rendering.module.ts";
import { PublicationRenderOutboxTransport } from "../rendering/publication-render.service.ts";
import type { DesignRenderer } from "@aramayo/design-engine";
import { OutboxConsumerService } from "./outbox-consumer.service.ts";
import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";
import { TopicRoutingOutboxTransport } from "./topic-routing-outbox.transport.ts";
import { OUTBOX_REPOSITORY, OUTBOX_TRANSPORT } from "./outbox.tokens.ts";

export interface OutboxModuleDependencies {
  /** Falso cuando el brief no está configurado; su tópico queda sin consumidor. */
  readonly briefAvailable: boolean;
  readonly imports: readonly DynamicModule[];
}

@Module({})
export class OutboxModule {
  static forConfiguration(
    dependencies: OutboxModuleDependencies,
  ): DynamicModule {
    const renderInjection = [
      PUBLICATION_PRODUCTION_REPOSITORY,
      DESIGN_RENDERER,
      MediaLifecycleService,
      IMAGE_GENERATION_RUN_SERVICE,
    ];
    const briefInjection = dependencies.briefAvailable
      ? [CONTENT_BRIEF_GENERATION_SERVICE, CONTENT_BRIEF_RUN_REPOSITORY]
      : [];

    return {
      exports: [OutboxDispatcherService],
      imports: [...dependencies.imports],
      module: OutboxModule,
      providers: [
        {
          inject: [...renderInjection, ...briefInjection],
          provide: OUTBOX_TRANSPORT,
          useFactory: (
            repository: PublicationProductionRepository,
            renderer: DesignRenderer,
            media: MediaLifecycleService,
            generation: ImageGenerationRunService,
            brief?: ContentBriefGenerationService,
            runs?: ContentBriefRunRepository,
          ): OutboxTransport =>
            new TopicRoutingOutboxTransport({
              [generationRunTopic]: new GenerationRunOutboxTransport(
                generation,
              ),
              [publicationRenderTopic]: new PublicationRenderOutboxTransport(
                repository,
                renderer,
                media,
              ),
              ...(brief === undefined || runs === undefined
                ? {}
                : {
                    [contentBriefGenerationTopic]:
                      new ContentBriefOutboxTransport(brief, runs),
                  }),
            }),
        },
        {
          inject: [OUTBOX_REPOSITORY, OUTBOX_TRANSPORT],
          provide: OutboxDispatcherService,
          useFactory: (
            repository: OutboxRepository,
            transport: OutboxTransport,
          ): OutboxDispatcherService =>
            new OutboxDispatcherService(repository, transport, randomUUID()),
        },
        OutboxConsumerService,
      ],
    };
  }
}
