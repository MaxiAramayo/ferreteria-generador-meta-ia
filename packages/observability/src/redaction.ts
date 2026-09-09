/**
 * Redacción de detalle observable.
 *
 * Un log operativo describe qué pasó, no con qué credencial pasó. La redacción
 * es conservadora a propósito: prefiere tapar un dato inocuo antes que dejar
 * pasar un token. Actúa por nombre de campo y por forma del valor, porque un
 * secreto puede llegar con cualquier nombre desde un proveedor externo.
 *
 * El detalle admite sólo escalares: un objeto anidado esconde profundidad
 * arbitraria y con ella cualquier cosa que nadie revisó.
 */

export type LogValue = boolean | number | string | null;

export type LogDetail = Readonly<Record<string, LogValue>>;

export const redactedPlaceholder = "[redactado]";

const maximumTextLength = 200;

const maximumDetailFields = 24;

const sensitiveKeyPattern =
  /authorization|cookie|credential|key|passphrase|password|secret|session|signature|token/iu;

const sensitiveValuePatterns: readonly RegExp[] = [
  // Token de usuario o página de Meta.
  /EAA[A-Za-z0-9]{20,}/u,
  // Clave de proyecto de OpenAI.
  /sk-[A-Za-z0-9_-]{20,}/u,
  // Cualquier URL con usuario y contraseña, incluidas las de PostgreSQL y Redis.
  /[a-z][a-z0-9+.-]*:\/\/[^/@\s:]+:[^/@\s]+@/iu,
  // Encabezado de autorización copiado entero.
  /bearer\s+\S{8,}/iu,
  // JSON Web Token.
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./u,
];

function truncate(text: string): string {
  return text.length <= maximumTextLength
    ? text
    : `${text.slice(0, maximumTextLength)}…`;
}

export function looksSensitive(value: string): boolean {
  return sensitiveValuePatterns.some((pattern) => pattern.test(value));
}

function redactValue(key: string, value: unknown): LogValue | undefined {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  if (sensitiveKeyPattern.test(key) || looksSensitive(value)) {
    return redactedPlaceholder;
  }
  return truncate(value);
}

export function redactDetail(
  detail: Readonly<Record<string, unknown>>,
): LogDetail {
  const safe: Record<string, LogValue> = {};
  let fields = 0;
  for (const [key, value] of Object.entries(detail)) {
    if (fields >= maximumDetailFields) {
      break;
    }
    const redacted = redactValue(key, value);
    if (redacted === undefined) {
      continue;
    }
    safe[key] = redacted;
    fields += 1;
  }
  return Object.freeze(safe);
}
