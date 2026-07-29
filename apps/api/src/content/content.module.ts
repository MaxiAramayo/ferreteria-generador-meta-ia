import { Module } from "@nestjs/common";

import { PublicationDraftController } from "./publication-draft.controller.ts";
import { PublicationDraftService } from "./publication-draft.service.ts";
import { PublicationTransitionService } from "./publication-transition.service.ts";

@Module({
  controllers: [PublicationDraftController],
  providers: [PublicationDraftService, PublicationTransitionService],
})
export class ContentModule {}
