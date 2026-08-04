import type {
  GenerationRunAcceptedResponse,
  GenerationRunCancellationResponse,
  GenerationRunListResponse,
  GenerationRunResponse,
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
import {
  GenerationRunHistoryQueryDto,
  RequestGenerationRunDto,
} from "./dto/generation-run.dto.ts";
import { GenerationRunService } from "./generation-run.service.ts";

/**
 * Pedir un lote no genera nada por sí solo: acepta el pedido con 202 y devuelve
 * el lote para consultarlo. La imagen se resuelve en el worker, así que la
 * respuesta no espera al proveedor.
 */
@Controller("generation-runs")
export class GenerationRunController {
  readonly #service: GenerationRunService;

  constructor(service: GenerationRunService) {
    this.#service = service;
  }

  @Post()
  @HttpCode(202)
  @RequirePermission("content:edit")
  request(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() body: RequestGenerationRunDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<GenerationRunAcceptedResponse> {
    return this.#service.request(
      session.actor,
      {
        contentBriefRunId: body.contentBriefRunId,
        ...(body.format === undefined ? {} : { format: body.format }),
        ...(body.subjectKind === undefined
          ? {}
          : { subjectKind: body.subjectKind }),
        ...(body.variants === undefined ? {} : { variants: body.variants }),
      },
      idempotencyKey,
    );
  }

  @Get()
  @RequirePermission("content:read")
  list(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Query() query: GenerationRunHistoryQueryDto,
  ): Promise<GenerationRunListResponse> {
    return this.#service.list(session.actor, {
      ...(query.contentBriefRunId === undefined
        ? {}
        : { contentBriefRunId: query.contentBriefRunId }),
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
  ): Promise<GenerationRunResponse> {
    return this.#service.findById(session.actor, runId);
  }

  @Post(":runId/cancel")
  @RequirePermission("content:edit")
  cancel(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ): Promise<GenerationRunCancellationResponse> {
    return this.#service.cancel(session.actor, runId);
  }
}
