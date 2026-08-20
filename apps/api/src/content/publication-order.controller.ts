import type {
  PublicationOrderRequestResponse,
  PublicationOrderResponse,
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
  CancelPublicationOrderDto,
  RequestPublicationOrderDto,
} from "./dto/publication-order.dto.ts";
import { PublicationOrderService } from "./publication-order.service.ts";

@Controller()
export class PublicationOrderController {
  readonly #service: PublicationOrderService;

  constructor(service: PublicationOrderService) {
    this.#service = service;
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
