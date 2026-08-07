import type {
  GenerationRunAcceptedResponse,
  GenerationRunCancellationResponse,
  GenerationRunListResponse,
  GenerationRunResponse,
  GenerationVariantSelectionResponse,
  GenerationPreflightResponse,
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
  RequestGenerationEditDto,
  RequestGenerationRunDto,
  SelectGenerationVariantDto,
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

  @Post("preflight")
  @HttpCode(200)
  @RequirePermission("content:edit")
  preflight(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() body: RequestGenerationRunDto,
  ): Promise<GenerationPreflightResponse> {
    return this.#service.preflight(session.actor, body);
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
      ...(query.lineageRootId === undefined
        ? {}
        : { lineageRootId: query.lineageRootId }),
      ...(query.mine === undefined ? {} : { mine: query.mine }),
      ...(query.page === undefined ? {} : { page: query.page }),
    });
  }

  @Post(":runId/edits")
  @HttpCode(202)
  @RequirePermission("content:edit")
  requestEdit(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: RequestGenerationEditDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<GenerationRunAcceptedResponse> {
    return this.#service.requestEdit(
      session.actor,
      runId,
      {
        instruction: body.instruction,
        kind: body.kind,
        parentVariantId: body.parentVariantId,
        ...(body.contentBriefRunId === undefined
          ? {}
          : { contentBriefRunId: body.contentBriefRunId }),
        ...(body.variants === undefined ? {} : { variants: body.variants }),
      },
      idempotencyKey,
    );
  }

  @Post(":runId/selection")
  @HttpCode(200)
  @RequirePermission("content:edit")
  selectVariant(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: SelectGenerationVariantDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<GenerationVariantSelectionResponse> {
    return this.#service.selectVariant(
      session.actor,
      runId,
      body,
      idempotencyKey,
    );
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
