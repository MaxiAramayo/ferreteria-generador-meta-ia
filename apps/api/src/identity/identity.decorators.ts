import type {
  AuthenticatedSessionRecord,
  OrganizationPermission,
} from "@aramayo/domain";
import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";

export const PUBLIC_ROUTE_METADATA = "aramayo:public-route";
export const REQUIRED_PERMISSION_METADATA = "aramayo:required-permission";

export interface AuthenticatedRequest extends Request {
  authenticationSession?: AuthenticatedSessionRecord;
}

export const PublicRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_METADATA, true);

export const RequirePermission = (
  permission: OrganizationPermission,
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_METADATA, permission);

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSessionRecord => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.authenticationSession === undefined) {
      throw new UnauthorizedException("La sesión no es válida.");
    }
    return request.authenticationSession;
  },
);
