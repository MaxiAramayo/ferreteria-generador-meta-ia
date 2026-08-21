import type {
  PublicationManualActionListResponse,
  PublicationOrderListResponse,
  PublicationOrderRequestResponse,
  PublicationOrderResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Body,
  Controller,
  Get,
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
  ApplyPublicationManualActionDto,
  CancelPublicationOrderDto,
  RequestPublicationOrderDto,
} from "./dto/publication-order.dto.ts";
import { PublicationManualActionService } from "./publication-manual-action.service.ts";
import { PublicationOrderService } from "./publication-order.service.ts";
import { PublishingReadinessService } from "./publishing-readiness.service.ts";

@Controller()
export class PublicationOrderController {
  readonly #manual: PublicationManualActionService;
  readonly #readiness: PublishingReadinessService;
  readonly #service: PublicationOrderService;

  constructor(
    service: PublicationOrderService,
    manual: PublicationManualActionService,
    readiness: PublishingReadinessService,
  ) {
    this.#manual = manual;
    this.#readiness = readiness;
    this.#service = service;
  }

  /** Lo mínimo para decidir si ofrecer publicar, con el permiso de publicar. */
  @Get("publishing/readiness")
  @RequirePermission("publishing:execute")
  readiness(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<PublishingReadinessResponse> {
    return this.#readiness.read(session.actor);
  }

  /** La alerta: destinos detenidos esperando que alguien decida. */
  @Get("publication-targets/pending-actions")
  @RequirePermission("publishing:execute")
  pendingActions(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<PublicationManualActionListResponse> {
    return this.#manual.list(session.actor);
  }

  @Post("publication-targets/:publicationTargetId/actions")
  @RequirePermission("publishing:execute")
  applyAction(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationTargetId") publicationTargetId: string,
    @Body() body: ApplyPublicationManualActionDto,
  ): Promise<PublicationManualActionListResponse> {
    return this.#manual.apply(session.actor, publicationTargetId, body.action);
  }

  @Post("publications/:publicationId/publish")
  @RequirePermission("publishing:execute")
  request(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
    @Body() body: RequestPublicationOrderDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<PublicationOrderRequestResponse> {
    return this.#service.request(
      session.actor,
      publicationId,
      body.expectedVersion,
      body.targets,
      idempotencyKey,
    );
  }

  @Get("publications/:publicationId/orders")
  @RequirePermission("publishing:execute")
  history(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe()) publicationId: string,
  ): Promise<PublicationOrderListResponse> {
    return this.#service.list(session.actor, publicationId);
  }

  @Get("publication-orders/:orderId")
  @RequirePermission("publishing:execute")
  find(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
  ): Promise<PublicationOrderResponse> {
    return this.#service.find(session.actor, orderId);
  }

  @Post("publication-orders/:orderId/cancellation")
  @RequirePermission("publishing:execute")
  cancel(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("orderId", new ParseUUIDPipe()) orderId: string,
    @Body() body: CancelPublicationOrderDto,
  ): Promise<PublicationOrderResponse> {
    return this.#service.cancel(session.actor, orderId, body.reasonCode);
  }
}
