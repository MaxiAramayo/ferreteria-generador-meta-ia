/**
 * Identificador de medio derivado de su origen.
 *
 * El identificador tiene que ser el mismo cada vez que se procesa la misma
 * entrada: es lo que convierte una carga en idempotente. Si el worker pierde el
 * lease después de subir el archivo pero antes de confirmarlo, el reintento
 * llega al mismo activo y lo reconoce en lugar de crear un duplicado y volver a
 * pagar la subida.
 *
 * La forma es UUID v5-like: se marcan versión y variante sobre los primeros 16
 * bytes de un SHA-256, para que la base lo acepte como UUID sin que sea
 * aleatorio.
 */

import { createHash } from "node:crypto";

export function deterministicMediaId(namespace: string, key: string): string {
  const bytes = createHash("sha256")
    .update(`aramayo:${namespace}:${key}`)
    .digest()
    .subarray(0, 16);
  const sixth = bytes.at(6);
  const eighth = bytes.at(8);
  if (sixth === undefined || eighth === undefined) {
    throw new Error("No se pudo derivar el identificador de medio.");
  }
  bytes[6] = (sixth & 0x0f) | 0x50;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
