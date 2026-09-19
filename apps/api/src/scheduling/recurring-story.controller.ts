import type {
  CreateRecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
  UpdateRecurringStoryVisualStyleResponse,
} from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { CreateRecurringStoryRuleDto } from "./dto/create-recurring-story-rule.dto.ts";
import { UpdateRecurringStoryVisualStyleDto } from "./dto/update-recurring-story-visual-style.dto.ts";
import { RecurringStoryService } from "./recurring-story.service.ts";

@Controller("scheduling/recurring-stories")
export class RecurringStoryController {
  readonly #service: RecurringStoryService;

  constructor(service: RecurringStoryService) {
    this.#service = service;
  }

  @Get()
  @RequirePermission("content:read")
  workspace(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<RecurringStoryWorkspaceResponse> {
    return this.#service.workspace(session.actor);
  }

  @Post()
  @RequirePermission("content:schedule")
  create(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() input: CreateRecurringStoryRuleDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<CreateRecurringStoryRuleResponse> {
    return this.#service.create(session.actor, input, idempotencyKey);
  }

  @Patch(":ruleId/visual-style")
  @RequirePermission("content:schedule")
  updateVisualStyle(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("ruleId") ruleId: string,
    @Body() input: UpdateRecurringStoryVisualStyleDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<UpdateRecurringStoryVisualStyleResponse> {
    return this.#service.updateVisualStyle(
      session.actor,
      ruleId,
      input,
      idempotencyKey,
    );
  }
}
