/**
 * Orden de publicación multidestino.
 *
 * Una orden convierte un snapshot aprobado en un intento por destino. Los
 * intentos no se coordinan entre sí a propósito: cada uno tiene su fila, su
 * clave y su estado, así que un fallo de Facebook no puede tocar el resultado de
 * Instagram. Lo único compartido es la orden que los agrupa y el estado agregado
 * que se calcula sobre ellos.
 *
 * El agregado es una función pura de los estados por destino y no un campo que
 * alguien actualiza. Un campo se puede desincronizar de lo que realmente pasó;
 * una función no. Y su regla más importante es negativa: `published` exige que
 * **todos** los destinos requeridos hayan salido. Basta uno sin confirmar para
 * que la orden no pueda declararse publicada, porque declararlo sería afirmar
 * algo que nadie comprobó.
 *
 * El caso que obliga a pensar es `outcome_unknown`. Un destino ambiguo no es
 * éxito ni fallo: Meta no puede decir si la publicación existe. La orden se
 * queda entonces en `publishing`, que es la única lectura honesta —el desenlace
 * sigue sin resolverse—, y el detalle por destino muestra cuál está en duda para
 * que una persona lo resuelva. Resolverlo automáticamente exigiría elegir entre
 * duplicar y abandonar, que es justamente lo que la vertical evita.
 */

import type { MetaPublishingAttemptState } from "./meta-publishing-attempt.ts";
import type { PublicationStatus, PublicationTarget } from "./publication.ts";
import type { ReliableMutationContext } from "./reliable-operations.ts";

/** Estado agregado que una orden puede alcanzar. */
export type PublicationOrderStatus = Extract<
  PublicationStatus,
  "partially_published" | "publish_failed" | "published" | "publishing"
>;

export interface PublicationOrderTargetRecord {
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly failureRetryable?: boolean;
  /** Clave idempotente del destino. Es lo que el diario de intentos usa. */
  readonly publicationTargetId: string;
  readonly remotePermalink?: string;
  readonly remotePostId?: string;
  readonly state: MetaPublishingAttemptState;
  readonly target: PublicationTarget;
  readonly updatedAt: string;
}

export interface PublicationOrderRecord {
  readonly approvalSnapshotId: string;
  readonly cancelledAt?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly requestedByMembershipId: string;
  readonly targets: readonly PublicationOrderTargetRecord[];
  readonly updatedAt: string;
}

/**
 * Un intento que ya no va a cambiar solo.
 *
 * `outcome_unknown` no entra: sigue esperando una decisión humana, y tratarlo
 * como resuelto haría que la orden se declarara terminada sin estarlo.
 */
export function isSettledPublicationTarget(
  state: MetaPublishingAttemptState,
): boolean {
  return (
    state === "published" ||
    state === "published_unconfirmed" ||
    state === "failed"
  );
}

/** Un destino que salió, con identificador confirmado o sin él. */
export function isSuccessfulPublicationTarget(
  state: MetaPublishingAttemptState,
): boolean {
  return state === "published" || state === "published_unconfirmed";
}

/**
 * Estado agregado de la orden.
 *
 * Se calcula, no se guarda. El orden de las preguntas es el que evita mentir:
 * primero si queda algo sin resolver —incluida la duda—, después si salió todo,
 * después si salió algo, y sólo al final el fallo total.
 *
 * Una orden sin destinos no existe como caso válido; se trata como fallida en
 * vez de como publicada, porque «todos los destinos salieron» sobre un conjunto
 * vacío es cierto por vacuidad y sería la peor respuesta posible.
 */
export function publicationOrderStatus(
  targets: readonly PublicationOrderTargetRecord[],
): PublicationOrderStatus {
  if (targets.length === 0) return "publish_failed";

  const succeeded = targets.filter((entry) =>
    isSuccessfulPublicationTarget(entry.state),
  ).length;
  const settled = targets.filter((entry) =>
    isSettledPublicationTarget(entry.state),
  ).length;

  // Algo sigue en curso o en duda: la orden no se resuelve.
  if (settled < targets.length) return "publishing";
  if (succeeded === targets.length) return "published";
  return succeeded === 0 ? "publish_failed" : "partially_published";
}

/**
 * Destinos que todavía admiten un intento.
 *
 * Un destino exitoso nunca se reintenta —esa es la garantía contra duplicar— y
 * uno en duda tampoco, porque puede haber salido. Una orden cancelada no admite
 * ninguno, aunque conserve los que ya salieron.
 */
export function pendingPublicationTargets(
  order: PublicationOrderRecord,
): readonly PublicationOrderTargetRecord[] {
  if (order.cancelledAt !== undefined) return Object.freeze([]);
  return Object.freeze(
    order.targets.filter(
      (entry) =>
        entry.state !== "published" &&
        entry.state !== "published_unconfirmed" &&
        entry.state !== "outcome_unknown",
    ),
  );
}

export const publicationOrderTopic = "content.publication.publish-requested";

export interface RequestPublicationOrderInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
  /** Destinos requeridos. Sin al menos uno la orden no tiene sentido. */
  readonly targets: readonly PublicationTarget[];
}

export type RequestPublicationOrderResult =
  | Readonly<{
      orderId: string;
      publicationId: string;
      replayed?: true;
      status: "accepted";
      version: number;
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  /** La publicación no está aprobada, o su snapshot no existe. */
  | Readonly<{ status: "not-approved" }>
  | Readonly<{ status: "invalid-target" }>
  | Readonly<{ status: "not-found" }>;

export interface CancelPublicationOrderInput {
  readonly actorMembershipId: string;
  readonly cancelledAt: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly reasonCode: string;
}

export type CancelPublicationOrderResult =
  /** Cancelada: no habrá intentos nuevos. Los éxitos previos se conservan. */
  | Readonly<{ order: PublicationOrderRecord; status: "cancelled" }>
  /** Ya no quedaba nada por intentar; cancelar no cambia lo que salió. */
  | Readonly<{ order: PublicationOrderRecord; status: "already-settled" }>
  | Readonly<{ status: "not-found" }>;

/**
 * Trabajo que el worker recibe por la orden.
 *
 * Trae el snapshot aprobado porque publicar no puede volver a leer el borrador:
 * lo que sale tiene que ser exactamente lo que se aprobó.
 */
export interface PublicationOrderJob {
  readonly approvalSnapshotId: string;
  readonly contentHash: string;
  readonly orderId: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly snapshot: unknown;
  readonly targets: readonly PublicationOrderTargetRecord[];
}

export type PublicationOrderCompletionResult =
  | Readonly<{ status: "completed"; version: number }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationOrderRepository {
  cancel(
    input: CancelPublicationOrderInput,
  ): Promise<CancelPublicationOrderResult>;
  findById(
    organizationId: string,
    orderId: string,
  ): Promise<PublicationOrderRecord | null>;
  findJob(
    organizationId: string,
    orderId: string,
  ): Promise<PublicationOrderJob | null>;
  request(
    input: RequestPublicationOrderInput,
  ): Promise<RequestPublicationOrderResult>;
  /**
   * Cierra la orden con el estado agregado que corresponde a sus destinos y
   * mueve la publicación al mismo estado. Se llama cuando ya no queda nada por
   * intentar.
   */
  settle(
    organizationId: string,
    orderId: string,
    settledAt: string,
  ): Promise<PublicationOrderCompletionResult>;
}
