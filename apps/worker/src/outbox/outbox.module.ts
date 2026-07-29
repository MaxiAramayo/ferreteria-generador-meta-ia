import { randomUUID } from "node:crypto";

import type {
  OutboxRepository,
  OutboxTransport,
  PublicationProductionRepository,
} from "@aramayo/domain";
import { Module } from "@nestjs/common";

import { PUBLICATION_PRODUCTION_REPOSITORY } from "../database/database.tokens.ts";
import { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import { DESIGN_RENDERER } from "../rendering/rendering.module.ts";
import { PublicationRenderOutboxTransport } from "../rendering/publication-render.service.ts";
import type { DesignRenderer } from "@aramayo/design-engine";
import { OutboxConsumerService } from "./outbox-consumer.service.ts";
import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";
import { OUTBOX_REPOSITORY, OUTBOX_TRANSPORT } from "./outbox.tokens.ts";

@Module({
  exports: [OutboxDispatcherService],
  providers: [
    {
      inject: [
        PUBLICATION_PRODUCTION_REPOSITORY,
        DESIGN_RENDERER,
        MediaLifecycleService,
      ],
      provide: OUTBOX_TRANSPORT,
      useFactory: (
        repository: PublicationProductionRepository,
        renderer: DesignRenderer,
        media: MediaLifecycleService,
      ): OutboxTransport =>
        new PublicationRenderOutboxTransport(repository, renderer, media),
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
})
export class OutboxModule {}
