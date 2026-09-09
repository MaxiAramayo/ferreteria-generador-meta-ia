import type { LogEmitter } from "./structured-log.ts";

/**
 * Observación de una dependencia externa.
 *
 * Cada llamada a un proveedor deja una línea con su latencia y su desenlace,
 * dentro de la correlación de la intención que la provocó. Es lo que permite
 * responder «cuánto tardó Meta en esta publicación» sin abrir el proveedor.
 *
 * El nombre de la operación es de un conjunto acotado que escribe el código, no
 * la URL ni el mensaje del proveedor: una URL lleva identificadores del negocio
 * y un mensaje de error puede traer cualquier cosa.
 */

export const observedDependencies = [
  "cloudinary",
  "commercial",
  "meta",
  "openai",
  "postgres",
  "redis",
] as const;

export type ObservedDependency = (typeof observedDependencies)[number];

export interface DependencyCall {
  readonly dependency: ObservedDependency;
  readonly operation: string;
}

const failureCodePattern = /^[a-z0-9._-]{1,60}$/iu;

export function dependencyFailureCode(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "desconocido";
  }
  const code: unknown = (cause as { code?: unknown }).code;
  return typeof code === "string" && failureCodePattern.test(code)
    ? code
    : cause.name;
}

export function emitDependencyObservation(
  emitter: LogEmitter,
  call: DependencyCall,
  outcome: "failure" | "success",
  durationMs: number,
  failureCode?: string,
): void {
  emitter.emit({
    detail: {
      dependency: call.dependency,
      ...(failureCode === undefined ? {} : { failureCode }),
      operation: call.operation,
    },
    durationMs,
    event: "dependency.call",
    level: outcome === "success" ? "info" : "warn",
    outcome,
  });
}

export async function observeDependency<Result>(
  emitter: LogEmitter,
  call: DependencyCall,
  run: () => Promise<Result>,
  now: () => number = () => Date.now(),
): Promise<Result> {
  const startedAt = now();
  try {
    const result = await run();
    emitDependencyObservation(emitter, call, "success", now() - startedAt);
    return result;
  } catch (cause: unknown) {
    emitDependencyObservation(
      emitter,
      call,
      "failure",
      now() - startedAt,
      dependencyFailureCode(cause),
    );
    throw cause;
  }
}
