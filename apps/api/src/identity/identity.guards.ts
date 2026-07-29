import type { ApiConfiguration } from "@aramayo/configuration/api";
import { authorizeActor, type OrganizationPermission } from "@aramayo/domain";
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { parseCookie } from "cookie";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { AuthenticationService } from "./authentication.service.ts";
import {
  PUBLIC_ROUTE_METADATA,
  REQUIRED_PERMISSION_METADATA,
  type AuthenticatedRequest,
} from "./identity.decorators.ts";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicRoute(
  context: ExecutionContext,
  reflector: Reflector,
): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ROUTE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}

export function sessionCookieName(configuration: ApiConfiguration): string {
  return configuration.environment === "development" ||
    configuration.environment === "test"
    ? "aramayo_session"
    : "__Host-aramayo_session";
}

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  readonly #configuration: ApiConfiguration;

  constructor(
    @Inject(API_CONFIGURATION)
    configuration: ApiConfiguration,
  ) {
    this.#configuration = configuration;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (safeMethods.has(request.method)) {
      return true;
    }

    const origin = request.headers.origin;
    if (origin === undefined || origin === this.#configuration.webOrigin) {
      return true;
    }

    throw new ForbiddenException(
      "El origen de la solicitud no está permitido.",
    );
  }
}

@Injectable()
export class SessionAuthenticationGuard implements CanActivate {
  readonly #authentication: AuthenticationService;
  readonly #configuration: ApiConfiguration;
  readonly #reflector: Reflector;

  constructor(
    authentication: AuthenticationService,
    reflector: Reflector,
    @Inject(API_CONFIGURATION)
    configuration: ApiConfiguration,
  ) {
    this.#authentication = authentication;
    this.#configuration = configuration;
    this.#reflector = reflector;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(context, this.#reflector)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = parseCookie(request.headers.cookie ?? "");
    const sessionToken = cookies[sessionCookieName(this.#configuration)];
    if (sessionToken === undefined || sessionToken.length === 0) {
      throw new UnauthorizedException("La sesión no es válida.");
    }

    const session = await this.#authentication.authenticate(sessionToken);
    if (session === null) {
      throw new UnauthorizedException("La sesión no es válida.");
    }
    request.authenticationSession = session;
    return true;
  }
}

@Injectable()
export class CsrfGuard implements CanActivate {
  readonly #authentication: AuthenticationService;
  readonly #reflector: Reflector;

  constructor(authentication: AuthenticationService, reflector: Reflector) {
    this.#authentication = authentication;
    this.#reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(context, this.#reflector)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (safeMethods.has(request.method)) {
      return true;
    }

    const session = request.authenticationSession;
    const csrfToken = request.headers["x-csrf-token"];
    if (
      session === undefined ||
      typeof csrfToken !== "string" ||
      !this.#authentication.verifyCsrf(session, csrfToken)
    ) {
      throw new ForbiddenException("El token CSRF no es válido.");
    }

    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  readonly #reflector: Reflector;

  constructor(reflector: Reflector) {
    this.#reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const permission = this.#reflector.getAllAndOverride<
      OrganizationPermission | undefined
    >(REQUIRED_PERMISSION_METADATA, [context.getHandler(), context.getClass()]);
    if (permission === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.authenticationSession;
    if (session === undefined) {
      throw new UnauthorizedException("La sesión no es válida.");
    }

    const decision = authorizeActor(
      session.actor,
      permission,
      session.actor.organizationId,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(
        "No tenés permisos para realizar esta acción.",
      );
    }
    return true;
  }
}
