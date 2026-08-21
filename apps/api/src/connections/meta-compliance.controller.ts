import type {
  MetaDataDeletionCallbackResponse,
  MetaDataDeletionStatusResponse,
  MetaDeauthorizationResponse,
} from "@aramayo/contracts";
import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";

import { PublicRoute } from "../identity/identity.decorators.ts";
import {
  MetaDeletionStatusQueryDto,
  MetaSignedRequestDto,
} from "./dto/meta-compliance.dto.ts";
import { MetaComplianceService } from "./meta-compliance.service.ts";

@Controller("integrations/meta")
export class MetaComplianceController {
  readonly #service: MetaComplianceService;

  constructor(service: MetaComplianceService) {
    this.#service = service;
  }

  @Post("data-deletion")
  @HttpCode(200)
  @PublicRoute()
  deleteData(
    @Body() body: MetaSignedRequestDto,
  ): Promise<MetaDataDeletionCallbackResponse> {
    return this.#service.deleteData(body.signed_request);
  }

  @Get("data-deletion/status")
  @PublicRoute()
  deletionStatus(
    @Query() query: MetaDeletionStatusQueryDto,
  ): MetaDataDeletionStatusResponse {
    return this.#service.deletionStatus(query.code);
  }

  @Post("deauthorize")
  @HttpCode(200)
  @PublicRoute()
  deauthorize(
    @Body() body: MetaSignedRequestDto,
  ): Promise<MetaDeauthorizationResponse> {
    return this.#service.deauthorize(body.signed_request);
  }
}
