import type {
  MetaConnectionResponse,
  MetaOAuthStartResponse,
} from "@aramayo/contracts";
import type { AuthenticatedSessionRecord } from "@aramayo/domain";
import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
} from "@nestjs/common";

import type { ApiConfiguration } from "@aramayo/configuration/api";
import { Inject } from "@nestjs/common";
import { API_CONFIGURATION } from "../configuration.tokens.ts";
import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { MetaOAuthCallbackQueryDto } from "./dto/meta-oauth.dto.ts";
import { MetaConnectionService } from "./meta-connection.service.ts";

@Controller()
export class MetaConnectionController {
  readonly #configuration: ApiConfiguration;
  readonly #service: MetaConnectionService;

  constructor(
    service: MetaConnectionService,
    @Inject(API_CONFIGURATION) configuration: ApiConfiguration,
  ) {
    this.#configuration = configuration;
    this.#service = service;
  }

  @Post("connections/meta/oauth")
  @RequirePermission("connections:manage")
  start(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<MetaOAuthStartResponse> {
    return this.#service.start(session.actor);
  }

  @Get("oauth/meta/callback")
  @Redirect()
  @RequirePermission("connections:manage")
  async callback(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Query() query: MetaOAuthCallbackQueryDto,
  ): Promise<Readonly<{ url: string }>> {
    await this.#service.callback(session.actor, {
      ...(query.code === undefined ? {} : { code: query.code }),
      ...(query.error === undefined ? {} : { error: query.error }),
      state: query.state,
    });
    const url = new URL("configuracion", this.#configuration.webOrigin);
    url.searchParams.set("meta", "connected");
    return Object.freeze({ url: url.toString() });
  }

  @Get("connections/meta")
  @RequirePermission("connections:manage")
  list(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<readonly MetaConnectionResponse[]> {
    return this.#service.list(session.actor);
  }

  @Post("connections/meta/:connectionId/health")
  @RequirePermission("connections:manage")
  checkHealth(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("connectionId", new ParseUUIDPipe()) connectionId: string,
  ): Promise<MetaConnectionResponse> {
    return this.#service.checkHealth(session.actor, connectionId);
  }

  @Post("connections/meta/:connectionId/renewal")
  @RequirePermission("connections:manage")
  renew(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("connectionId", new ParseUUIDPipe()) connectionId: string,
  ): Promise<MetaConnectionResponse> {
    return this.#service.renew(session.actor, connectionId);
  }

  @Delete("connections/meta/:connectionId")
  @RequirePermission("connections:manage")
  revoke(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("connectionId", new ParseUUIDPipe()) connectionId: string,
  ): Promise<MetaConnectionResponse> {
    return this.#service.revoke(session.actor, connectionId);
  }
}
