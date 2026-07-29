import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { PublicationDraftController } from "./publication-draft.controller.ts";
import { PublicationDraftService } from "./publication-draft.service.ts";
import { PublicationTransitionService } from "./publication-transition.service.ts";

@Module({
  controllers: [PublicationDraftController],
  imports: [AuditModule],
  providers: [PublicationDraftService, PublicationTransitionService],
})
export class ContentModule {}
