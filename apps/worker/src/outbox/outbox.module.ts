import { randomUUID } from "node:crypto";

import type { OutboxRepository, OutboxTransport } from "@aramayo/domain";
import { Module } from "@nestjs/common";

import { OutboxDispatcherService } from "./outbox-dispatcher.service.ts";
import { OUTBOX_REPOSITORY, OUTBOX_TRANSPORT } from "./outbox.tokens.ts";

class UnconfiguredOutboxTransport implements OutboxTransport {
  deliver(): Promise<void> {
    return Promise.reject(
      new Error("No hay un transporte outbox configurado para este evento."),
    );
  }
}

@Module({
  exports: [OutboxDispatcherService],
  providers: [
    {
      provide: OUTBOX_TRANSPORT,
      useFactory: (): OutboxTransport => new UnconfiguredOutboxTransport(),
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
  ],
})
export class OutboxModule {}
