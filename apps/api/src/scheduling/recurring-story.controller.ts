import type {
  CreateRecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
  UpdateRecurringStoryDesignRotationResponse,
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
import { UpdateRecurringStoryDesignRotationDto } from "./dto/update-recurring-story-design-rotation.dto.ts";
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

  @Patch(":ruleId/design-rotation")
  @RequirePermission("content:schedule")
  updateDesignRotation(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("ruleId") ruleId: string,
    @Body() input: UpdateRecurringStoryDesignRotationDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<UpdateRecurringStoryDesignRotationResponse> {
    return this.#service.updateDesignRotation(
      session.actor,
      ruleId,
      input,
      idempotencyKey,
    );
  }
}
