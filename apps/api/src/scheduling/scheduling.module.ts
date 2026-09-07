import { Module } from "@nestjs/common";

import { RecurringStoryController } from "./recurring-story.controller.ts";
import { RecurringStoryService } from "./recurring-story.service.ts";

@Module({
  controllers: [RecurringStoryController],
  providers: [RecurringStoryService],
})
export class SchedulingModule {}
