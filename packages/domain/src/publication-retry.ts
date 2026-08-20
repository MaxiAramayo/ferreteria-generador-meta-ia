/**
 * Reintentos y reconciliación de una publicación.
 *
 * Un fallo de publicación no dice por sí solo qué hacer después. La diferencia
 * que importa no es «falló o no falló» sino **qué cambia si se vuelve a
 * intentar**: una pieza que Meta rechazó por formato va a ser rechazada igual
 * dentro de una hora, y un token vencido no se arregla esperando. Reintentar
 * esos casos gasta cuota y esconde el problema detrás de un error repetido.
 *
 * Por eso cada código de fallo se resuelve en una de tres salidas y no en un
 * booleano:
 *
 * - `scheduled`: la causa es temporal. Se reintenta con backoff.
 * - `manual`: la causa no cambia sola. Alguien tiene que arreglar algo, y el
 *   sistema tiene que decir qué.
 * - `reconcile`: **no se sabe si la publicación existe**. Volver a publicar
 *   podría duplicar, así que primero hay que preguntarle al proveedor.
 *
 * La tercera es la que justifica el módulo. Entre pedir la publicación y saber
 * el resultado hay una ventana, y una respuesta perdida ahí adentro no prueba
 * que la publicación no exista. La única salida honesta es consultar antes de
 * decidir, y el `retryable` que traen los adaptadores no alcanza para eso:
 * describe si conviene repetir la llamada en el acto, no si es seguro volver a
 * publicar más tarde. Son dos preguntas distintas y este módulo contesta la
 * segunda.
 */

import type {
  MetaPublishingAttemptRecord,
  MetaPublishingAttemptState,
  MetaPublishingFailureCode,
} from "./meta-publishing-attempt.ts";

/**
 * Qué se puede hacer con un fallo sin que intervenga una persona.
 *
 * `reconcile` no es un reintento: es la consulta que decide si corresponde
 * reintentar. Tratarla como un reintento más es exactamente lo que duplica.
 */
export type PublicationRetryDisposition = "manual" | "reconcile" | "scheduled";

/**
 * Salida de cada código de fallo.
 *
 * Está escrito como tabla y no como cadena de `if` porque el criterio se lee de
 * un vistazo y porque el tipo obliga a decidir cuando se agrega un código: un
 * `Record` completo no compila si falta uno. Un `default` silencioso habría
 * mandado a reintento automático códigos que nadie clasificó, que es la forma
 * más barata de duplicar una publicación.
 */
const retryDispositions: Readonly<
  Record<MetaPublishingFailureCode, PublicationRetryDisposition>
> = Object.freeze({
  /** La pieza puede volver a estar disponible; la dirección no cambió. */
  "media-unreachable": "scheduled",
  /** Formato, medida o peso: los mismos bytes fallan igual dentro de una hora. */
  "media-invalid": "manual",
  /** Un permiso no se recupera esperando: hay que volver a otorgarlo. */
  "permission-denied": "manual",
  /** Meta rechazó el contenedor. Reintentarlo reproduce el rechazo. */
  "processing-failed": "manual",
  /**
   * El contenedor no llegó a publicable dentro del plazo, pero puede haber
   * publicado después. Preguntar antes de volver a pedirlo.
   */
  "processing-timeout": "reconcile",
  /** La cuota se repone sola; sólo hay que esperar a la ventana siguiente. */
  "publishing-limit-reached": "scheduled",
  "provider-error": "scheduled",
  "rate-limit": "scheduled",
  /**
   * El caso ambiguo por definición: la llamada no respondió, así que no se sabe
   * si Meta la procesó. Nunca se reintenta a ciegas.
   */
  "request-timeout": "reconcile",
  /** Se prepara otro medio; el vencido ya no sirve para nada. */
  "staged-media-expired": "scheduled",
  /** Reconectar es una acción de una persona, no un reintento. */
  "token-expired": "manual",
  /** No se llamó al proveedor: el contenido no cumple las reglas. */
  "validation-failed": "manual",
});

export function publicationRetryDisposition(
  code: MetaPublishingFailureCode,
): PublicationRetryDisposition {
  return retryDispositions[code];
}

/**
 * Límites del reintento.
 *
 * Los pisos existen para no pelearse con Meta: volver antes de que se reponga
 * la ventana gasta el intento y suma otra llamada rechazada al mismo contador
 * que causó el rechazo. La cuota de publicación se repone por hora, así que
 * reintentarla en segundos no tiene ninguna chance de salir bien.
 */
export const publicationRetryLimits = Object.freeze({
  /** Intentos automáticos antes de exigir decisión humana. */
  attemptsMaximum: 5,
  baseDelayMilliseconds: 30_000,
  /** Ninguna espera automática supera la hora. */
  delayCapMilliseconds: 3_600_000,
  publishingLimitFloorMilliseconds: 3_600_000,
  rateLimitFloorMilliseconds: 600_000,
});

/** Espera mínima por código, para no volver dentro de la ventana que falló. */
function retryFloorMilliseconds(code: MetaPublishingFailureCode): number {
  if (code === "rate-limit") {
    return publicationRetryLimits.rateLimitFloorMilliseconds;
  }
  if (code === "publishing-limit-reached") {
    return publicationRetryLimits.publishingLimitFloorMilliseconds;
  }
  return 0;
}

/**
 * Espera del intento siguiente, con jitter.
 *
 * El backoff crece exponencialmente y se corta en el tope. El jitter reparte la
 * mitad superior de la ventana —«equal jitter»— en vez de sortear desde cero:
 * dos destinos que fallaron en la misma corrida no pueden volver en el mismo
 * instante, y ninguno vuelve tan pronto como para que la espera no signifique
 * nada. `jitter` entra como número entre 0 y 1 en lugar de sortearse acá para
 * que la función quede determinista y comprobable.
 */
export function publicationRetryDelayMilliseconds(
  code: MetaPublishingFailureCode,
  attempts: number,
  jitter: number,
): number {
  const bounded = Math.min(Math.max(jitter, 0), 1);
  const exponent = Math.max(attempts, 0);
  const window = Math.min(
    publicationRetryLimits.delayCapMilliseconds,
    publicationRetryLimits.baseDelayMilliseconds * 2 ** exponent,
  );
  const half = Math.floor(window / 2);
  return Math.max(
    retryFloorMilliseconds(code),
    half + Math.round(bounded * half),
  );
}

/**
 * Motivo por el que un destino dejó de reintentarse solo.
 *
 * Se separa de `failureCode` porque responden preguntas distintas: el código
 * dice qué contestó Meta y el motivo dice qué tiene que hacer una persona.
 */
export type PublicationManualReason =
  /** Se agotaron los intentos automáticos de una causa temporal. */
  | "attempts-exhausted"
  /** La causa no cambia sola: hay que corregir contenido, permiso o conexión. */
  | "permanent-failure"
  /** El desenlace remoto sigue sin resolverse después de reconciliar. */
  | "outcome-unresolved";

export type PublicationRetryPlan =
  | Readonly<{ nextAttemptAt: string; status: "scheduled" }>
  /** Hay que consultar al proveedor antes de decidir. No es un reintento. */
  | Readonly<{ status: "reconcile" }>
  | Readonly<{ reason: PublicationManualReason; status: "manual" }>;

export interface PlanPublicationRetryInput {
  /** Intentos ya consumidos por este destino. */
  readonly attempts: number;
  readonly code: MetaPublishingFailureCode;
  /** Número entre 0 y 1. Lo sortea quien llama. */
  readonly jitter: number;
  readonly now: string;
}

/**
 * Qué hacer con un destino que falló.
 *
 * El orden de las preguntas importa. La ambigüedad se resuelve antes que el
 * conteo de intentos: un desenlace desconocido no se puede dar por agotado
 * porque nadie sabe todavía si hubo que reintentarlo. Y agotar intentos no
 * vuelve permanente a la causa; la deja en manos de una persona, que es otra
 * cosa y se informa distinto.
 */
export function planPublicationRetry(
  input: PlanPublicationRetryInput,
): PublicationRetryPlan {
  const disposition = publicationRetryDisposition(input.code);
  if (disposition === "reconcile") {
    return Object.freeze({ status: "reconcile" });
  }
  if (disposition === "manual") {
    return Object.freeze({ reason: "permanent-failure", status: "manual" });
  }
  if (input.attempts >= publicationRetryLimits.attemptsMaximum) {
    return Object.freeze({ reason: "attempts-exhausted", status: "manual" });
  }
  const delay = publicationRetryDelayMilliseconds(
    input.code,
    input.attempts,
    input.jitter,
  );
  return Object.freeze({
    nextAttemptAt: new Date(Date.parse(input.now) + delay).toISOString(),
    status: "scheduled",
  });
}

/**
 * Lo que el proveedor contesta cuando se le pregunta si la publicación existe.
 *
 * `indeterminate` no es un error de la consulta: es la respuesta honesta cuando
 * el proveedor no puede afirmar ni negar. Colapsarla contra `absent` sería
 * decidir por él, y esa decisión termina en una publicación duplicada.
 */
export type RemotePublicationEvidence =
  | Readonly<{
      remotePermalink?: string;
      remotePostId: string;
      status: "published";
    }>
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "indeterminate" }>;

export type PublicationReconciliation =
  /** El proveedor la tiene. Se anota la evidencia y el destino queda cerrado. */
  | Readonly<{
      remotePermalink?: string;
      remotePostId: string;
      status: "confirmed";
    }>
  /** El proveedor no la tiene: recién ahora es seguro volver a publicar. */
  | Readonly<{ status: "republishable" }>
  /** Sigue sin saberse. Queda para una persona. */
  | Readonly<{ status: "unresolved" }>
  /** Ya estaba resuelto; reconciliar no cambia nada. */
  | Readonly<{ status: "already-settled" }>;

/** Estados cuyo desenlace remoto conviene volver a mirar. */
export function needsPublicationReconciliation(
  state: MetaPublishingAttemptState,
): boolean {
  return (
    state === "media_staged" ||
    state === "outcome_unknown" ||
    state === "published_unconfirmed"
  );
}

/**
 * Qué hacer con un destino después de preguntarle al proveedor.
 *
 * La regla que gobierna todo lo demás es que **la evidencia remota gana**. Si
 * Meta dice que la publicación existe, existe, aunque acá figure como fallida:
 * ese es justamente el caso divergente que la reconciliación tiene que
 * arreglar, y arreglarlo es anotar el identificador, no publicar de nuevo.
 *
 * `published_unconfirmed` es el único estado que no se vuelve republicable
 * jamás. El proveedor ya confirmó que publicó; que después no aparezca es una
 * contradicción que puede venir de un índice atrasado, y volver a publicar
 * sobre esa duda produce la segunda publicación que toda la vertical evita.
 */
export function reconcilePublicationTarget(
  attempt: MetaPublishingAttemptRecord,
  evidence: RemotePublicationEvidence,
): PublicationReconciliation {
  if (attempt.state === "published") {
    return Object.freeze({ status: "already-settled" });
  }
  if (evidence.status === "published") {
    return Object.freeze({
      ...(evidence.remotePermalink === undefined
        ? {}
        : { remotePermalink: evidence.remotePermalink }),
      remotePostId: evidence.remotePostId,
      status: "confirmed",
    });
  }
  if (evidence.status === "indeterminate") {
    return Object.freeze({ status: "unresolved" });
  }
  return attempt.state === "published_unconfirmed"
    ? Object.freeze({ status: "unresolved" })
    : Object.freeze({ status: "republishable" });
}
