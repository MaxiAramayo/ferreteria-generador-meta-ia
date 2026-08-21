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

import {
  isMetaPublishingFailureCode,
  type MetaPublishingAttemptState,
} from "./meta-publishing-attempt.ts";
import {
  publicationRetryDisposition,
  publicationRetryLimits,
  type PublicationManualReason,
} from "./publication-retry.ts";
import type { PublicationStatus, PublicationTarget } from "./publication.ts";
import type { ReliableMutationContext } from "./reliable-operations.ts";

/** Estado agregado que una orden puede alcanzar. */
export type PublicationOrderStatus = Extract<
  PublicationStatus,
  "partially_published" | "publish_failed" | "published" | "publishing"
>;

export interface PublicationOrderTargetRecord {
  /** Intentos automáticos ya consumidos por este destino. */
  readonly attempts?: number;
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly failureRetryable?: boolean;
  /** Motivo por el que dejó de reintentarse solo, si ya se decidió. */
  readonly manualReason?: PublicationManualReason;
  /** Instante del reintento programado, si lo hay. */
  readonly nextAttemptAt?: string;
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
 * Un fallo del que la política ya no se va a ocupar sola.
 *
 * `failed` no alcanza para dar por cerrado un destino: desde `P5-T06` un fallo
 * temporal tiene reintento por delante, y declararlo resuelto cerraría la orden
 * antes de que ese reintento llegue a correr. La pregunta correcta no es «¿está
 * fallido?» sino «¿queda algo que el sistema vaya a hacer por su cuenta?».
 *
 * Un fallo sin código se trata como final porque no se puede clasificar, y uno
 * ambiguo nunca lo es: espera a que la reconciliación pregunte.
 */
function isFinalPublicationFailure(
  target: PublicationOrderTargetRecord,
): boolean {
  if (target.manualReason !== undefined) return true;
  if (target.failureCode === undefined) return true;
  if (!isMetaPublishingFailureCode(target.failureCode)) return true;
  const disposition = publicationRetryDisposition(target.failureCode);
  if (disposition === "reconcile") return false;
  if (disposition === "manual") return true;
  return (target.attempts ?? 0) >= publicationRetryLimits.attemptsMaximum;
}

/**
 * Un intento que ya no va a cambiar solo.
 *
 * `outcome_unknown` no entra: sigue esperando una decisión humana, y tratarlo
 * como resuelto haría que la orden se declarara terminada sin estarlo. Un
 * `failed` con reintento pendiente tampoco, por el mismo motivo.
 */
export function isSettledPublicationTarget(
  target: PublicationOrderTargetRecord,
): boolean {
  if (
    target.state === "published" ||
    target.state === "published_unconfirmed"
  ) {
    return true;
  }
  // Una persona lo dio por perdido: la orden puede cerrar aunque el intento
  // siga en duda. El estado no se reescribe, así que la orden queda cerrada sin
  // afirmar un desenlace que nadie comprobó.
  if (target.manualReason === "abandoned-by-operator") return true;
  return target.state === "failed" && isFinalPublicationFailure(target);
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
    isSettledPublicationTarget(entry),
  ).length;

  // Algo sigue en curso o en duda: la orden no se resuelve.
  if (settled < targets.length) return "publishing";
  if (succeeded === targets.length) return "published";
  return succeeded === 0 ? "publish_failed" : "partially_published";
}

/**
 * Destinos que admiten un intento **ahora**.
 *
 * Un destino exitoso nunca se reintenta —esa es la garantía contra duplicar— y
 * uno en duda tampoco, porque puede haber salido. Una orden cancelada no admite
 * ninguno, aunque conserve los que ya salieron.
 *
 * `failed` queda afuera desde `P5-T06`, y es un cambio con consecuencia: un
 * fallo vuelve a la cola sólo cuando el calendario lo devuelve a `pending`, en
 * su fecha. Dejarlo adentro haría que cualquier reentrega del evento reintentara
 * al instante todos los destinos caídos, que es precisamente el backoff que la
 * política acaba de calcular tirado a la basura.
 */
export function pendingPublicationTargets(
  order: PublicationOrderRecord,
): readonly PublicationOrderTargetRecord[] {
  if (order.cancelledAt !== undefined) return Object.freeze([]);
  return Object.freeze(
    order.targets.filter(
      (entry) => entry.state === "pending" || entry.state === "media_staged",
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
  /**
   * Órdenes de una publicación, de la más reciente a la más vieja.
   *
   * Una pieza puede tener más de una: si la primera salió a medias, reintentar
   * los destinos caídos no borra la evidencia de lo que ya se publicó. El
   * historial es lo que permite mirar atrás sin adivinar.
   */
  listByPublication(
    organizationId: string,
    publicationId: string,
    limit: number,
  ): Promise<readonly PublicationOrderRecord[]>;
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
