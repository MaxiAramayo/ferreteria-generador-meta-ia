import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import type {
  PublicationOccurrenceExecutionRepository,
  PublicationScheduleDispatchRepository,
  RecurringStoryMaterializationRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import {
  PUBLICATION_OCCURRENCE_EXECUTION_REPOSITORY,
  PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY,
  RECURRING_STORY_MATERIALIZATION_REPOSITORY,
} from "../database/database.tokens.ts";
import { RecurringStoryMaterializationLoopService } from "./recurring-story-materialization-loop.service.ts";
import { RecurringStoryMaterializationService } from "./recurring-story-materialization.service.ts";
import { PublicationOccurrenceExecutionService } from "./publication-occurrence-execution.service.ts";
import { PublicationOccurrenceQueueLifecycleService } from "./publication-occurrence-queue-lifecycle.service.ts";
import { PublicationOccurrenceWorkerService } from "./publication-occurrence-worker.service.ts";
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
          inject: [RECURRING_STORY_MATERIALIZATION_REPOSITORY],
          provide: RecurringStoryMaterializationService,
          useFactory: (
            repository: RecurringStoryMaterializationRepository,
          ): RecurringStoryMaterializationService =>
            new RecurringStoryMaterializationService(repository),
        },
        {
          inject: [RecurringStoryMaterializationService],
          provide: RecurringStoryMaterializationLoopService,
          useFactory: (
            service: RecurringStoryMaterializationService,
          ): RecurringStoryMaterializationLoopService =>
            new RecurringStoryMaterializationLoopService(service),
        },
        {
          provide: PUBLICATION_OCCURRENCE_QUEUE,
          useFactory: (): ManagedPublicationOccurrenceQueue =>
            new BullMqPublicationOccurrenceQueue(
              configuration.redisUrl.reveal(),
            ),
        },
        {
          inject: [PUBLICATION_OCCURRENCE_EXECUTION_REPOSITORY],
          provide: PublicationOccurrenceExecutionService,
          useFactory: (
            repository: PublicationOccurrenceExecutionRepository,
          ): PublicationOccurrenceExecutionService =>
            new PublicationOccurrenceExecutionService(repository),
        },
        {
          inject: [PublicationOccurrenceExecutionService],
          provide: PublicationOccurrenceWorkerService,
          useFactory: (
            executor: PublicationOccurrenceExecutionService,
          ): PublicationOccurrenceWorkerService =>
            new PublicationOccurrenceWorkerService(
              configuration.redisUrl.reveal(),
              configuration.concurrency,
              executor,
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
