import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { PublicationScheduleController } from "./publication-schedule.controller.ts";
import { PublicationSchedulingController } from "./publication-scheduling.controller.ts";
import { PublicationScheduleService } from "./publication-schedule.service.ts";
import { RecurringStoryController } from "./recurring-story.controller.ts";
import { RecurringStoryService } from "./recurring-story.service.ts";

@Module({
  controllers: [
    PublicationScheduleController,
    PublicationSchedulingController,
    RecurringStoryController,
  ],
  imports: [AuditModule],
  providers: [PublicationScheduleService, RecurringStoryService],
})
export class SchedulingModule {}
