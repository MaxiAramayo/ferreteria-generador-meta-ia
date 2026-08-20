import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { ContentBriefController } from "./content-brief.controller.ts";
import { ContentBriefService } from "./content-brief.service.ts";
import { GenerationRunController } from "./generation-run.controller.ts";
import { GenerationRunService } from "./generation-run.service.ts";
import { PublicationDraftController } from "./publication-draft.controller.ts";
import { PublicationDraftService } from "./publication-draft.service.ts";
import { PublicationManualActionService } from "./publication-manual-action.service.ts";
import { PublicationOrderController } from "./publication-order.controller.ts";
import { PublicationOrderService } from "./publication-order.service.ts";
import { PublicationProductionController } from "./publication-production.controller.ts";
import { PublicationProductionService } from "./publication-production.service.ts";
import { PublicationTransitionService } from "./publication-transition.service.ts";

@Module({
  controllers: [
    ContentBriefController,
    GenerationRunController,
    PublicationDraftController,
    PublicationOrderController,
    PublicationProductionController,
  ],
  imports: [AuditModule],
  providers: [
    ContentBriefService,
    GenerationRunService,
    PublicationDraftService,
    PublicationManualActionService,
    PublicationOrderService,
    PublicationProductionService,
    PublicationTransitionService,
  ],
})
export class ContentModule {}
