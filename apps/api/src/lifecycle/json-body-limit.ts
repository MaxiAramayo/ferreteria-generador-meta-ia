import type { NextFunction, Request, Response } from "express";

/**
 * Tamaño de los pedidos JSON.
 *
 * Toda la API conserva el límite de Express, 100 KB, incluido el login. Sólo
 * las tres rutas que llevan la foto propia de una apertura (`ADR-030`) aceptan
 * hasta 4 MB: una foto de hasta 3 MB en base64 más el resto del documento.
 *
 * El analizador se registra con el límite mayor y este filtro corre antes:
 * rechaza por el largo declarado sin leer el cuerpo. Un pedido sin largo
 * declarado sigue acotado por el analizador.
 */
export const defaultJsonBodyLimitBytes = 100 * 1024;
export const photoJsonBodyLimitBytes = 4 * 1024 * 1024;

const photoRoutes: readonly (readonly [method: string, path: RegExp])[] = [
  ["POST", /^\/scheduling\/recurring-stories\/?$/u],
  ["PATCH", /^\/scheduling\/recurring-stories\/[^/]+\/visual-style\/?$/u],
  ["PATCH", /^\/publications\/[^/]+\/?$/u],
];

export function jsonBodyLimitFor(method: string, path: string): number {
  return photoRoutes.some(
    ([routeMethod, pattern]) => routeMethod === method && pattern.test(path),
  )
    ? photoJsonBodyLimitBytes
    : defaultJsonBodyLimitBytes;
}

export function limitJsonBodies(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (
    Number.isFinite(declared) &&
    declared > jsonBodyLimitFor(request.method, request.path)
  ) {
    response.status(413).json({
      message: "La solicitud supera el tamaño permitido.",
      statusCode: 413,
    });
    return;
  }
  next();
}
