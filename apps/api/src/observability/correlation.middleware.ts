import { AsyncResource } from "node:async_hooks";

import {
  acceptCorrelationId,
  runWithCorrelation,
  type LogEmitter,
} from "@aramayo/observability";
import type { NextFunction, Request, Response } from "express";

/**
 * Abre el alcance de correlación de cada solicitud y registra su desenlace.
 *
 * Va antes que los guards para que un rechazo por sesión, origen o CSRF quede
 * observado igual que una respuesta exitosa: si el registro viviera en un
 * interceptor, los 401 y 403 no aparecerían en ningún lado.
 *
 * El log nombra la plantilla de ruta y nunca la URL concreta: la URL lleva
 * identificadores y filtros del negocio, y un log no es el lugar donde
 * guardarlos.
 */

export const correlationHeader = "x-correlation-id";

function routeTemplate(request: Request): string {
  const route: unknown = (request as { route?: { path?: unknown } }).route;
  const path =
    typeof route === "object" && route !== null && "path" in route
      ? (route as { path?: unknown }).path
      : undefined;
  return typeof path === "string" ? `${request.baseUrl}${path}` : "desconocida";
}

export function createCorrelationMiddleware(
  emitter: LogEmitter,
  now: () => number = () => Date.now(),
): (request: Request, response: Response, next: NextFunction) => void {
  return function correlate(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const correlationId = acceptCorrelationId(
      request.headers[correlationHeader],
    );
    const startedAt = now();
    response.setHeader(correlationHeader, correlationId);

    runWithCorrelation({ correlationId }, () => {
      // `finish` lo emite un objeto creado fuera de este alcance, así que el
      // contexto se ata explícitamente. Sin esto el registro del desenlace sale
      // sin correlación, que es justo lo que se quiere observar.
      const report = AsyncResource.bind(() => {
        emitter.emit({
          detail: {
            method: request.method,
            route: routeTemplate(request),
            status: response.statusCode,
          },
          durationMs: now() - startedAt,
          event: "api.request",
          level: response.statusCode >= 500 ? "error" : "info",
          outcome: response.statusCode < 400 ? "success" : "failure",
        });
      });
      response.on("finish", report);
      next();
    });
  };
}
