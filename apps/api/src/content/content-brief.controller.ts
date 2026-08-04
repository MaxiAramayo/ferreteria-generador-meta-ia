import type {
  ContentBriefRunAcceptedResponse,
  ContentBriefRunCancellationResponse,
  ContentBriefRunListResponse,
  ContentBriefRunResponse,
  PublicationDraftResponse,
} from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { ContentBriefService } from "./content-brief.service.ts";
import {
  AcceptContentBriefDto,
  ContentBriefHistoryQueryDto,
  RequestContentBriefDto,
} from "./dto/content-brief.dto.ts";

/**
 * Pedir un brief no genera nada por sí solo: acepta el pedido y devuelve la
 * ejecución para consultarla. Generar, aceptar y publicar siguen siendo
 * acciones distintas y ninguna dispara a la siguiente.
 */
@Controller("content-briefs")
export class ContentBriefController {
  readonly #service: ContentBriefService;

  constructor(service: ContentBriefService) {
    this.#service = service;
  }

  @Post()
  @HttpCode(202)
  @RequirePermission("content:edit")
  request(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() body: RequestContentBriefDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<ContentBriefRunAcceptedResponse> {
    return this.#service.request(
      session.actor,
      { locationId: body.locationId ?? null, request: body.request },
      idempotencyKey,
    );
  }

  @Get()
  @RequirePermission("content:read")
  list(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Query() query: ContentBriefHistoryQueryDto,
  ): Promise<ContentBriefRunListResponse> {
    return this.#service.list(session.actor, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.mine === undefined ? {} : { mine: query.mine }),
      ...(query.page === undefined ? {} : { page: query.page }),
    });
  }

  @Get(":runId")
  @RequirePermission("content:read")
  findById(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<ContentBriefRunResponse> {
    return this.#service.findById(session.actor, runId);
  }

  @Post(":runId/cancel")
  @RequirePermission("content:edit")
  cancel(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<ContentBriefRunCancellationResponse> {
    return this.#service.cancel(session.actor, runId);
  }

  /** Aceptar deja una revisión en borrador; publicar sigue siendo otra acción. */
  @Post(":runId/acceptance")
  @HttpCode(201)
  @RequirePermission("content:edit")
  accept(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: AcceptContentBriefDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationDraftResponse> {
    return this.#service.accept(
      session.actor,
      runId,
      body.design,
      idempotencyKey,
    );
  }
}
