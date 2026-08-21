/**
 * Qué puede hacer el panel con una publicación, y por qué no.
 *
 * Publicar es la única acción del sistema que no se puede deshacer, así que
 * decidir si el botón existe no es cosmética. Toda esa decisión vive acá, en
 * funciones puras y comprobables, en vez de repartirse entre condiciones dentro
 * del JSX: una regla escondida en un `&&` no se puede probar y termina siendo
 * distinta de la del servidor.
 *
 * Lo que devuelven estas funciones nunca sustituye al control del servidor. El
 * panel puede estar mostrando una lista de hace un minuto, y entre que se
 * dibujó y alguien apretó el botón la publicación pudo cambiar de estado o la
 * conexión pudo perder un permiso. Acá se decide **qué se ofrece**; que la
 * acción sea legítima lo sigue decidiendo la API.
 */

import type {
  MetaConnectionResponse,
  PublicationManualActionResponse,
  PublicationOrderTargetResponse,
  PublicationSummaryResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  type AuthenticatedActor,
  type PublicationTarget,
} from "@aramayo/domain";

/** Por qué la publicación no se puede pedir todavía. */
export type PublishBlockReason =
  | "missing-role"
  | "not-approved"
  | "no-healthy-connection"
  | "no-target-available"
  | "already-publishing"
  | "already-published";

export type PublishGate =
  | Readonly<{
      /** Cuenta contra la que se va a publicar. Se muestra antes de confirmar. */
      accountName: string;
      kind: "ready";
      targets: readonly PublicationTarget[];
    }>
  | Readonly<{ kind: "blocked"; message: string; reason: PublishBlockReason }>;

const blockMessages: Readonly<Record<PublishBlockReason, string>> =
  Object.freeze({
    "already-published": "Esta pieza ya se publicó. No se publica dos veces.",
    "already-publishing":
      "La publicación está en curso. Esperá a que termine antes de volver a pedirla.",
    "missing-role": "Tu rol no permite publicar.",
    "no-healthy-connection":
      "No hay una conexión de Meta habilitada para publicar. Revisala en Configuración.",
    "no-target-available":
      "La conexión no tiene activos publicables. Revisala en Configuración.",
    "not-approved":
      "La pieza todavía no está aprobada. Sólo se publica un snapshot aprobado.",
  });

function blocked(reason: PublishBlockReason): PublishGate {
  return Object.freeze({
    kind: "blocked",
    message: blockMessages[reason],
    reason,
  });
}

/**
 * Destinos que la conexión puede atender.
 *
 * Se derivan de los activos y no se ofrecen fijos: prometer Instagram cuando la
 * conexión sólo tiene una Page es hacer que la persona descubra el problema
 * después de confirmar una acción irreversible.
 */
export function availablePublishTargets(
  connection: MetaConnectionResponse,
): readonly PublicationTarget[] {
  const active = new Set(
    connection.assets
      .filter((asset) => asset.status === "active")
      .map((asset) => asset.kind),
  );
  const targets: PublicationTarget[] = [];
  if (active.has("instagram_business")) {
    targets.push("instagram_feed", "instagram_story");
  }
  if (active.has("page")) {
    targets.push("facebook_page");
  }
  return Object.freeze(targets);
}

/**
 * Si se puede ofrecer publicar, y con qué.
 *
 * El orden de las preguntas es deliberado. El rol va primero porque una persona
 * sin permiso no tiene que enterarse del estado de la conexión ni de la pieza;
 * después el estado de la publicación, que es lo que la persona puede
 * arreglar sola; y recién al final la conexión, que es un problema de
 * configuración ajeno a la pieza.
 */
export function publishGate(
  actor: AuthenticatedActor,
  publication: PublicationSummaryResponse,
  connections: readonly MetaConnectionResponse[],
): PublishGate {
  if (
    !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
  ) {
    return blocked("missing-role");
  }
  if (publication.status === "publishing") return blocked("already-publishing");
  if (publication.status === "published") return blocked("already-published");
  if (publication.status !== "approved" && publication.status !== "scheduled") {
    return blocked("not-approved");
  }

  const connection = connections.find((entry) => entry.canPublish);
  if (connection === undefined) return blocked("no-healthy-connection");
  const targets = availablePublishTargets(connection);
  if (targets.length === 0) return blocked("no-target-available");

  return Object.freeze({
    accountName: connection.accountName,
    kind: "ready",
    targets,
  });
}

/**
 * Cómo terminó un destino, en las cuatro categorías que una persona necesita
 * distinguir de un vistazo.
 *
 * `unknown` existe separado de `failed` porque son decisiones distintas: un
 * fallo se puede reintentar y una duda no, y pintarlos igual haría que alguien
 * pidiera el reintento que duplica.
 */
export type PublicationTargetOutcome =
  "published" | "failed" | "in-flight" | "unknown";

export function publicationTargetOutcome(
  target: PublicationOrderTargetResponse,
): PublicationTargetOutcome {
  if (
    target.state === "published" ||
    target.state === "published_unconfirmed"
  ) {
    return "published";
  }
  if (target.state === "failed") return "failed";
  if (target.state === "outcome_unknown") return "unknown";
  return "in-flight";
}

export const publicationTargetLabels: Readonly<
  Record<PublicationTarget, string>
> = Object.freeze({
  facebook_page: "Facebook",
  instagram_feed: "Instagram feed",
  instagram_story: "Instagram historia",
});

export const publicationTargetOutcomeLabels: Readonly<
  Record<PublicationTargetOutcome, string>
> = Object.freeze({
  failed: "No salió",
  "in-flight": "En curso",
  published: "Publicado",
  unknown: "Sin confirmar",
});

/**
 * Acciones manuales que el panel puede mostrar.
 *
 * `actions` viene del servidor y no se recalcula acá: la regla de qué es seguro
 * depende del motivo por el que el destino se detuvo, y tenerla en dos lugares
 * garantiza que en algún momento difieran. Lo único que se agrega es el rol,
 * porque el panel sí sabe quién está mirando.
 */
export function visibleManualActions(
  actor: AuthenticatedActor,
  entry: PublicationManualActionResponse,
): readonly PublicationManualActionResponse["actions"][number][] {
  if (
    !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
  ) {
    return Object.freeze([]);
  }
  return entry.actions;
}

export const manualActionLabels: Readonly<
  Record<PublicationManualActionResponse["actions"][number], string>
> = Object.freeze({
  abandon: "Dar por perdido",
  reconcile: "Volver a consultar",
  retry: "Reintentar",
});

export const manualReasonLabels: Readonly<
  Record<PublicationManualActionResponse["reason"], string>
> = Object.freeze({
  "attempts-exhausted": "Se agotaron los reintentos automáticos",
  "outcome-unresolved": "Meta no confirma si la publicación existe",
  "permanent-failure": "La causa no se arregla reintentando",
});

/**
 * Estado de un envío de publicación.
 *
 * Existe como máquina aparte y no como banderas sueltas dentro del componente
 * porque encierra la regla que protege una acción irreversible, y una regla que
 * no se puede probar no es una garantía. La clave idempotente vive acá adentro
 * a propósito: es parte del estado del intento, no un detalle del `submit`.
 */
export type PublishSubmission =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ idempotencyKey: string; kind: "sending" }>
  /** El pedido salió y no se supo el desenlace. Puede haber publicado. */
  | Readonly<{ idempotencyKey: string; kind: "indeterminate"; message: string }>
  | Readonly<{ idempotencyKey: string; kind: "rejected"; message: string }>;

/**
 * Empieza —o reintenta— un envío.
 *
 * Devuelve `null` cuando ya hay uno en curso, y ese `null` es la barrera contra
 * el doble clic: el segundo evento no produce una segunda llamada.
 *
 * Un reintento después de un rechazo **conserva la clave del intento anterior**.
 * Es lo que hace que la protección funcione de verdad: si el primer pedido llegó
 * al servidor y lo que se perdió fue la respuesta, el segundo llega con la misma
 * clave y la API devuelve la orden original en lugar de crear otra. Sortear una
 * clave nueva en cada clic convertiría el reintento en la duplicación que se
 * quiere evitar.
 */
export function beginPublishSubmission(
  current: PublishSubmission,
  mintKey: () => string,
): PublishSubmission | null {
  if (current.kind === "sending") return null;
  return Object.freeze({
    idempotencyKey:
      current.kind === "idle" ? mintKey() : current.idempotencyKey,
    kind: "sending",
  });
}

/** Cierra el envío con lo que contestó la API. */
export function settlePublishSubmission(
  current: PublishSubmission,
  outcome:
    | Readonly<{ kind: "accepted" }>
    | Readonly<{ kind: "indeterminate"; message: string }>
    | Readonly<{ kind: "rejected"; message: string }>,
): PublishSubmission {
  if (outcome.kind === "accepted") return Object.freeze({ kind: "idle" });
  // Sin clave previa no hay intento que continuar; se sortea una al empezar.
  const idempotencyKey = current.kind === "idle" ? "" : current.idempotencyKey;
  return Object.freeze({
    idempotencyKey,
    kind: outcome.kind,
    message: outcome.message,
  });
}
