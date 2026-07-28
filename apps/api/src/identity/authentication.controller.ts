import type { ApiConfiguration } from "@aramayo/configuration/api";
import type {
  AuthenticatedActor,
  AuthenticatedSessionRecord,
} from "@aramayo/domain";
import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { stringifySetCookie } from "cookie";
import type { Request, Response } from "express";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import {
  AuthenticationService,
  type LoginResult,
} from "./authentication.service.ts";
import { CurrentSession, PublicRoute } from "./identity.decorators.ts";
import { clientFingerprintHash } from "./identity-http.ts";
import { csrfCookieName, sessionCookieName } from "./identity.guards.ts";
import { LoginDto } from "./dto/login.dto.ts";

interface SessionResponse {
  readonly actor: AuthenticatedActor;
  readonly csrfToken?: string;
  readonly expiresAt: string;
}

interface LogoutAllResponse {
  readonly revokedSessions: number;
}

function publicLoginResult(result: LoginResult): SessionResponse {
  return Object.freeze({
    actor: result.actor,
    csrfToken: result.csrfToken,
    expiresAt: result.expiresAt,
  });
}

@Controller("auth")
export class AuthenticationController {
  readonly #authentication: AuthenticationService;
  readonly #configuration: ApiConfiguration;

  constructor(
    authentication: AuthenticationService,
    @Inject(API_CONFIGURATION)
    configuration: ApiConfiguration,
  ) {
    this.#authentication = authentication;
    this.#configuration = configuration;
  }

  @PublicRoute()
  @Post("login")
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponse> {
    const result = await this.#authentication.login({
      clientFingerprintHash: clientFingerprintHash(request),
      email: input.email,
      ...(input.organizationSlug === undefined
        ? {}
        : { organizationSlug: input.organizationSlug }),
      password: input.password,
    });
    response.setHeader("Set-Cookie", [
      stringifySetCookie({
        name: sessionCookieName(this.#configuration),
        value: result.sessionToken,
        httpOnly: true,
        maxAge: this.#configuration.authenticationSessionTtlSeconds,
        path: "/",
        sameSite: "lax",
        secure:
          this.#configuration.environment !== "development" &&
          this.#configuration.environment !== "test",
      }),
      stringifySetCookie({
        name: csrfCookieName(this.#configuration),
        value: result.csrfToken,
        httpOnly: false,
        maxAge: this.#configuration.authenticationSessionTtlSeconds,
        path: "/",
        sameSite: "lax",
        secure:
          this.#configuration.environment !== "development" &&
          this.#configuration.environment !== "test",
      }),
    ]);
    return publicLoginResult(result);
  }

  @Get("session")
  readSession(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): SessionResponse {
    return Object.freeze({
      actor: session.actor,
      expiresAt: session.expiresAt,
    });
  }

  @Post("logout")
  async logout(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.#authentication.logout(session);
    this.#clearSessionCookie(response);
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutAllResponse> {
    const revokedSessions = await this.#authentication.logoutAll(session);
    this.#clearSessionCookie(response);
    return Object.freeze({ revokedSessions });
  }

  #clearSessionCookie(response: Response): void {
    response.setHeader("Set-Cookie", [
      stringifySetCookie({
        name: sessionCookieName(this.#configuration),
        value: "",
        httpOnly: true,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure:
          this.#configuration.environment !== "development" &&
          this.#configuration.environment !== "test",
      }),
      stringifySetCookie({
        name: csrfCookieName(this.#configuration),
        value: "",
        httpOnly: false,
        maxAge: 0,
        path: "/",
        sameSite: "lax",
        secure:
          this.#configuration.environment !== "development" &&
          this.#configuration.environment !== "test",
      }),
    ]);
  }
}
