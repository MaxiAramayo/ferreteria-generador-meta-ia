import type { PublicationScheduleTransitionResponse } from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { TransitionPublicationScheduleDto } from "./dto/transition-publication-schedule.dto.ts";
import { PublicationScheduleService } from "./publication-schedule.service.ts";

@Controller("schedules")
export class PublicationScheduleController {
  readonly #service: PublicationScheduleService;

  constructor(service: PublicationScheduleService) {
    this.#service = service;
  }

  @Post(":scheduleId/transitions")
  @RequirePermission("content:schedule")
  transition(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("scheduleId", new ParseUUIDPipe()) scheduleId: string,
    @Body() input: TransitionPublicationScheduleDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationScheduleTransitionResponse> {
    return this.#service.transition(
      session.actor,
      scheduleId,
      input,
      idempotencyKey,
    );
  }
}
