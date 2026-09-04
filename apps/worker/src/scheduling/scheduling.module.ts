import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import type { PublicationScheduleDispatchRepository } from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY } from "../database/database.tokens.ts";
import { PublicationOccurrenceQueueLifecycleService } from "./publication-occurrence-queue-lifecycle.service.ts";
import { BullMqPublicationOccurrenceQueue } from "./publication-occurrence.queue.ts";
import type {
  ManagedPublicationOccurrenceQueue,
  PublicationOccurrenceQueue,
} from "./publication-occurrence.queue.ts";
import { PublicationScheduleDispatchLoopService } from "./publication-schedule-dispatch-loop.service.ts";
import { PublicationScheduleDispatchService } from "./publication-schedule-dispatch.service.ts";
import { PUBLICATION_OCCURRENCE_QUEUE } from "./scheduling.tokens.ts";

@Module({})
export class SchedulingModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    return {
      exports: [PUBLICATION_OCCURRENCE_QUEUE],
      module: SchedulingModule,
      providers: [
        {
          provide: PUBLICATION_OCCURRENCE_QUEUE,
          useFactory: (): ManagedPublicationOccurrenceQueue =>
            new BullMqPublicationOccurrenceQueue(
              configuration.redisUrl.reveal(),
            ),
        },
        {
          inject: [PUBLICATION_OCCURRENCE_QUEUE],
          provide: PublicationOccurrenceQueueLifecycleService,
          useFactory: (
            queue: ManagedPublicationOccurrenceQueue,
          ): PublicationOccurrenceQueueLifecycleService =>
            new PublicationOccurrenceQueueLifecycleService(queue),
        },
        {
          inject: [
            PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY,
            PUBLICATION_OCCURRENCE_QUEUE,
          ],
          provide: PublicationScheduleDispatchService,
          useFactory: (
            repository: PublicationScheduleDispatchRepository,
            queue: PublicationOccurrenceQueue,
          ): PublicationScheduleDispatchService =>
            new PublicationScheduleDispatchService(repository, queue),
        },
        {
          inject: [PublicationScheduleDispatchService],
          provide: PublicationScheduleDispatchLoopService,
          useFactory: (
            dispatcher: PublicationScheduleDispatchService,
          ): PublicationScheduleDispatchLoopService =>
            new PublicationScheduleDispatchLoopService(dispatcher),
        },
      ],
    };
  }
}
