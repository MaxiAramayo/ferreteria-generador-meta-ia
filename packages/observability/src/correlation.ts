import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Correlación de extremo a extremo.
 *
 * Un identificador acompaña una intención desde la solicitud HTTP hasta el
 * intento contra el proveedor externo, atravesando procesos distintos. Vive en
 * un `AsyncLocalStorage` para que ningún repositorio ni adaptador tenga que
 * recibirlo como argumento: quien escribe un log o una fila lo encuentra.
 *
 * La forma es fija —32 hexadecimales— y un identificador entrante que no la
 * cumpla se descarta en lugar de propagarse. Aceptar texto libre de un cliente
 * permitiría inyectar contenido en los logs y en la base.
 */

const correlationIdPattern = /^[0-9a-f]{32}$/u;

export interface CorrelationContext {
  readonly actorMembershipId?: string;
  readonly correlationId: string;
  readonly organizationId?: string;
}

interface MutableCorrelationContext {
  actorMembershipId?: string;
  correlationId: string;
  organizationId?: string;
}

const storage = new AsyncLocalStorage<MutableCorrelationContext>();

export function newCorrelationId(): string {
  return randomUUID().replaceAll("-", "");
}

export function isCorrelationId(value: unknown): value is string {
  return typeof value === "string" && correlationIdPattern.test(value);
}

/**
 * Acepta el identificador entrante sólo si tiene la forma exacta; si no, emite
 * uno nuevo. Nunca devuelve el valor recibido sin comprobarlo.
 */
export function acceptCorrelationId(value: unknown): string {
  return isCorrelationId(value) ? value : newCorrelationId();
}

export function runWithCorrelation<Result>(
  context: CorrelationContext,
  run: () => Result,
): Result {
  return storage.run(
    {
      ...(context.actorMembershipId === undefined
        ? {}
        : { actorMembershipId: context.actorMembershipId }),
      correlationId: context.correlationId,
      ...(context.organizationId === undefined
        ? {}
        : { organizationId: context.organizationId }),
    },
    run,
  );
}

export function currentCorrelation(): CorrelationContext | undefined {
  const context = storage.getStore();
  return context === undefined ? undefined : Object.freeze({ ...context });
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/**
 * Completa el contexto vigente cuando la sesión ya se resolvió.
 *
 * El tenant y el actor se conocen después de autenticar, y abrir otro alcance
 * en ese punto dejaría fuera al resto de la solicitud. Sin contexto activo no
 * hace nada: un trabajo sin correlación no debe inventarse una.
 */
export function attachCorrelationActor(
  actor: Readonly<{ actorMembershipId?: string; organizationId?: string }>,
): void {
  const context = storage.getStore();
  if (context === undefined) {
    return;
  }
  if (actor.actorMembershipId !== undefined) {
    context.actorMembershipId = actor.actorMembershipId;
  }
  if (actor.organizationId !== undefined) {
    context.organizationId = actor.organizationId;
  }
}
