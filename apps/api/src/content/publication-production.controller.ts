import type {
  PublicationApprovalResponse,
  PublicationDeleteResponse,
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
import {
  ApprovePublicationDto,
  PublicationVersionCommandDto,
} from "./dto/publication-production.dto.ts";
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

  /**
   * Eliminar para siempre. Es `POST` y no `DELETE` porque lleva cuerpo —la
   * versión esperada— y encabezado de idempotencia, como el resto de los
   * comandos de esta API.
   */
  @Post(":publicationId/delete")
  @RequirePermission("content:edit")
  delete(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() body: PublicationVersionCommandDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationDeleteResponse> {
    return this.#service.delete(
      session.actor,
      publicationId,
      body.expectedVersion,
      idempotencyKey,
    );
  }

  /** Aprobar, y si viene el turno, programar en el mismo gesto. */
  @Post(":publicationId/approve")
  @RequirePermission("content:approve")
  approve(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() body: ApprovePublicationDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationApprovalResponse> {
    return this.#service.approve(
      session.actor,
      publicationId,
      body.expectedVersion,
      idempotencyKey,
      body.schedule,
    );
  }
}
