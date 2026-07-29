import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { PublicationDraftController } from "./publication-draft.controller.ts";
import { PublicationDraftService } from "./publication-draft.service.ts";
import { PublicationProductionController } from "./publication-production.controller.ts";
import { PublicationProductionService } from "./publication-production.service.ts";
import { PublicationTransitionService } from "./publication-transition.service.ts";

@Module({
  controllers: [PublicationDraftController, PublicationProductionController],
  imports: [AuditModule],
  providers: [
    PublicationDraftService,
    PublicationProductionService,
    PublicationTransitionService,
  ],
})
export class ContentModule {}
