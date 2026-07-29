import type {
  PublicationApprovalResponse,
  PublicationRenderRequestResponse,
} from "@aramayo/contracts";
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
import { PublicationVersionCommandDto } from "./dto/publication-production.dto.ts";
import { PublicationProductionService } from "./publication-production.service.ts";

@Controller("publications")
export class PublicationProductionController {
  readonly #service: PublicationProductionService;

  constructor(service: PublicationProductionService) {
    this.#service = service;
  }

  @Post(":publicationId/render")
  @RequirePermission("content:edit")
  requestRender(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() body: PublicationVersionCommandDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationRenderRequestResponse> {
    return this.#service.requestRender(
      session.actor,
      publicationId,
      body.expectedVersion,
      idempotencyKey,
    );
  }

  @Post(":publicationId/approve")
  @RequirePermission("content:approve")
  approve(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() body: PublicationVersionCommandDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationApprovalResponse> {
    return this.#service.approve(
      session.actor,
      publicationId,
      body.expectedVersion,
      idempotencyKey,
    );
  }
}
