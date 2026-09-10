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

export const AUTHENTICATED_ROUTE_METADATA = "aramayo:authenticated-route";
export const PUBLIC_ROUTE_METADATA = "aramayo:public-route";
export const REQUIRED_PERMISSION_METADATA = "aramayo:required-permission";

export interface AuthenticatedRequest extends Request {
  authenticationSession?: AuthenticatedSessionRecord;
}

export const PublicRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_METADATA, true);

/**
 * Ruta que exige sesión y ningún permiso adicional: leer la propia sesión,
 * pedir un token CSRF, cerrar sesión. Existe para que olvidar `RequirePermission`
 * no se confunda con decidir que la ruta no necesita permiso; sin una de las
 * tres marcas, la solicitud se rechaza.
 */
export const AuthenticatedRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ROUTE_METADATA, true);

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
