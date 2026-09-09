import type { CreatePublicationScheduleResponse } from "@aramayo/contracts";
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
import { CreatePublicationScheduleDto } from "./dto/create-publication-schedule.dto.ts";
import { PublicationScheduleService } from "./publication-schedule.service.ts";

/** Mutaciones de agenda que empiezan desde una pieza concreta. */
@Controller("publications")
export class PublicationSchedulingController {
  readonly #service: PublicationScheduleService;

  constructor(service: PublicationScheduleService) {
    this.#service = service;
  }

  @Post(":publicationId/schedules")
  @RequirePermission("content:schedule")
  create(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() input: CreatePublicationScheduleDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<CreatePublicationScheduleResponse> {
    return this.#service.create(
      session.actor,
      publicationId,
      input,
      idempotencyKey,
    );
  }
}
