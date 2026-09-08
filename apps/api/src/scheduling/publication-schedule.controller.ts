import type {
  PublicationScheduleTransitionResponse,
  UpdatePublicationScheduleResponse,
} from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { TransitionPublicationScheduleDto } from "./dto/transition-publication-schedule.dto.ts";
import { UpdatePublicationScheduleDto } from "./dto/update-publication-schedule.dto.ts";
import { PublicationScheduleService } from "./publication-schedule.service.ts";

@Controller("schedules")
export class PublicationScheduleController {
  readonly #service: PublicationScheduleService;

  constructor(service: PublicationScheduleService) {
    this.#service = service;
  }

  @Patch(":scheduleId")
  @RequirePermission("content:schedule")
  update(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("scheduleId", new ParseUUIDPipe()) scheduleId: string,
    @Body() input: UpdatePublicationScheduleDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<UpdatePublicationScheduleResponse> {
    return this.#service.update(
      session.actor,
      scheduleId,
      input,
      idempotencyKey,
    );
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
