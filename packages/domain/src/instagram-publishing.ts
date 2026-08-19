/**
 * Publicación en Instagram: reglas, puerto y taxonomía de fallos.
 *
 * Publicar en Instagram no es una llamada sino tres, y entre ellas hay estado
 * que sobrevive a la caída del proceso. Meta recibe una URL, la descarga por su
 * cuenta y devuelve un contenedor; el contenedor procesa; recién después se
 * publica. Un contenedor creado y no publicado es trabajo pago que sigue
 * existiendo del lado de Meta durante veinticuatro horas, y un contenedor
 * publicado dos veces son dos publicaciones. Por eso el identificador de
 * contenedor se guarda antes de cualquier intento de publicar: es el único dato
 * que permite distinguir, después de un timeout, «no llegué a publicar» de «ya
 * publiqué y no me enteré».
 *
 * La validación vive acá y no en el adaptador porque una imagen que Meta va a
 * rechazar no debe gastar una llamada: la cuota de publicación se consume por
 * contenedor creado, no por publicación exitosa.
 *
 * Los límites provienen de la documentación oficial consultada el 2026-08-19 y
 * se citan en `docs/integrations/META.md`. Los que la plataforma agrega por
 * decisión propia están marcados como tales: Meta escala una imagen angosta en
 * lugar de rechazarla, pero una pieza de Aramayo escalada hacia arriba pierde
 * la legibilidad del precio y del llamado a la acción, que es justamente lo que
 * la pieza viene a decir.
 *
 * Qué queda deliberadamente afuera: la orden multidestino, su estado agregado y
 * la persistencia del intento son de `P5-T05`; recuperar el identificador de
 * una publicación que Meta confirmó pero la plataforma no llegó a registrar es
 * de `P5-T06`. Este módulo define el diario de intentos como puerto para que
 * esas tareas lo implementen sobre su propio modelo sin que el publicador
 * cambie.
 */

import type { PublicationTarget } from "./publication.ts";

/**
 * Destinos de Instagram del alcance inicial. Se derivan de `PublicationTarget`
 * para que agregar un destino nuevo allí obligue a decidir acá si Instagram lo
 * soporta, en vez de que la lista se desincronice en silencio.
 */
export type InstagramPublishTarget = Extract<
  PublicationTarget,
  "instagram_feed" | "instagram_story"
>;

export const instagramPublishTargets = Object.freeze([
  "instagram_feed",
  "instagram_story",
] as const);

export const instagramMediaPolicy = Object.freeze({
  /** Máximo de menciones que Meta acepta en un pie. */
  captionMaximumMentions: 20,
  /** Máximo de etiquetas que Meta acepta en un pie. */
  captionMaximumHashtags: 30,
  /** Longitud máxima del pie, en caracteres. */
  captionMaximumLength: 2_200,
  /** Vida de un contenedor sin publicar, en segundos. */
  containerLifetimeSeconds: 24 * 60 * 60,
  /** Proporción máxima que Meta admite en el feed (1.91:1). */
  feedAspectRatioMaximum: 1.91,
  /** Proporción mínima que Meta admite en el feed (4:5). */
  feedAspectRatioMinimum: 4 / 5,
  /** Tamaño máximo del archivo que Meta descarga. */
  maximumByteSize: 8 * 1024 * 1024,
  /** Único formato de imagen que admite la API de publicación. */
  mimeType: "image/jpeg",
  /**
   * Ancho mínimo. Regla de la plataforma, no de Meta: Meta escala hacia arriba
   * lo que llega más angosto, y una pieza escalada pierde la legibilidad del
   * precio y del llamado a la acción.
   */
  minimumWidth: 320,
  /**
   * Proporción exacta que se exige a una historia (9:16). Regla de la
   * plataforma: Meta acepta otras proporciones y las recuadra o recorta por su
   * cuenta, y ese recorte no lo revisó nadie. El catálogo aprobado tiene un
   * único formato de historia y es este.
   */
  storyAspectRatio: 9 / 16,
  /** Tolerancia de la proporción de historia, para absorber el redondeo. */
  storyAspectRatioTolerance: 0.01,
});

export const instagramMediaRejectionCodes = Object.freeze([
  "aspect-ratio-unsupported",
  "caption-too-long",
  "caption-unsupported",
  "file-too-large",
  "hashtags-exceeded",
  "mentions-exceeded",
  "resolution-insufficient",
  "type-not-allowed",
  "url-not-public",
] as const);

export type InstagramMediaRejectionCode =
  (typeof instagramMediaRejectionCodes)[number];

export interface InstagramMediaRejection {
  readonly code: InstagramMediaRejectionCode;
  /** Qué hacer para que la próxima pieza sirva. */
  readonly correction: string;
  readonly reason: string;
}

/**
 * Geometría y dirección de la pieza.
 *
 * `height` y `width` describen lo que entrega la URL, no lo que guarda el
 * activo: una variante de entrega puede reducir la pieza, y validar el original
 * dejaría pasar una medida que nunca se envía. Quien arma el candidato es
 * responsable de esa diferencia.
 *
 * Va separado de lo que entrega el servidor porque se conoce antes: permite
 * descartar una pieza del formato equivocado sin gastar siquiera la consulta de
 * encabezados.
 */
export interface InstagramMediaGeometry {
  readonly height: number;
  readonly url: string;
  readonly width: number;
}

/** Lo que el servidor declara al entregar la pieza. */
export interface InstagramMediaDelivery {
  readonly byteSize: number;
  readonly mimeType: string;
}

export type InstagramMediaCandidate = InstagramMediaDelivery &
  InstagramMediaGeometry;

export type InstagramMediaDecision =
  | Readonly<{ status: "accepted" }>
  | Readonly<{ rejection: InstagramMediaRejection; status: "rejected" }>;

function rejected(
  code: InstagramMediaRejectionCode,
  reason: string,
  correction: string,
): InstagramMediaDecision {
  return Object.freeze({
    rejection: Object.freeze({ code, correction, reason }),
    status: "rejected" as const,
  });
}

/**
 * Una URL sirve si Meta puede descargarla desde afuera.
 *
 * `localhost`, una IP privada o un host sin punto no son accesibles para Meta
 * aunque lo sean para el worker, y el error que devolvería Meta —«no pude
 * descargar la imagen»— llega después de haber gastado la llamada.
 */
function isPubliclyFetchableUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host === "localhost") {
    return false;
  }
  // Literales IPv4 privados y de loopback. Un nombre que resuelva a una IP
  // privada no se detecta acá: eso es responsabilidad de la red, no del tipo.
  return !/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(
    host,
  );
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

/**
 * Valida el pie.
 *
 * Una historia no lleva pie: la API acepta el parámetro y lo descarta, así que
 * enviarlo prometería un texto que nadie va a ver. Se rechaza en vez de
 * ignorarlo en silencio.
 */
export function validateInstagramCaption(
  target: InstagramPublishTarget,
  caption: string | undefined,
): InstagramMediaDecision {
  if (caption === undefined || caption.length === 0) {
    return Object.freeze({ status: "accepted" as const });
  }
  if (target === "instagram_story") {
    return rejected(
      "caption-unsupported",
      "Una historia de Instagram no publica pie de texto.",
      "Quitá el pie o publicá la pieza en el feed.",
    );
  }
  if (caption.length > instagramMediaPolicy.captionMaximumLength) {
    return rejected(
      "caption-too-long",
      `El pie supera ${String(instagramMediaPolicy.captionMaximumLength)} caracteres.`,
      "Acortá el texto antes de publicar.",
    );
  }
  const hashtags = countMatches(caption, /(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu);
  if (hashtags > instagramMediaPolicy.captionMaximumHashtags) {
    return rejected(
      "hashtags-exceeded",
      `El pie usa ${String(hashtags)} etiquetas y Meta admite ${String(instagramMediaPolicy.captionMaximumHashtags)}.`,
      "Dejá solo las etiquetas que aportan.",
    );
  }
  const mentions = countMatches(
    caption,
    /(?<![\p{L}\p{N}_])@[\p{L}\p{N}._]+/gu,
  );
  if (mentions > instagramMediaPolicy.captionMaximumMentions) {
    return rejected(
      "mentions-exceeded",
      `El pie usa ${String(mentions)} menciones y Meta admite ${String(instagramMediaPolicy.captionMaximumMentions)}.`,
      "Quitá las menciones que no correspondan.",
    );
  }
  return Object.freeze({ status: "accepted" as const });
}

/**
 * Valida lo que el servidor entrega.
 *
 * Se comprueba contra la respuesta real y no contra el activo almacenado: la
 * variante de entrega reconvierte la pieza, así que el tipo y el peso guardados
 * describen otra cosa que la que Meta va a descargar.
 */
export function validateInstagramDelivery(
  delivery: InstagramMediaDelivery,
): InstagramMediaDecision {
  if (delivery.mimeType !== instagramMediaPolicy.mimeType) {
    return rejected(
      "type-not-allowed",
      `Instagram solo publica ${instagramMediaPolicy.mimeType} y la pieza es ${delivery.mimeType}.`,
      "Entregá la pieza con la variante JPEG del almacenamiento.",
    );
  }
  return delivery.byteSize > instagramMediaPolicy.maximumByteSize
    ? rejected(
        "file-too-large",
        `La pieza pesa más de ${String(instagramMediaPolicy.maximumByteSize)} bytes.`,
        "Reducí la calidad de la variante de entrega.",
      )
    : Object.freeze({ status: "accepted" as const });
}

/**
 * Valida la dirección y las medidas de la pieza para ese destino.
 *
 * Es lo que se sabe antes de tocar la red, y por eso se comprueba primero: una
 * pieza del formato equivocado no justifica ni siquiera una consulta de
 * encabezados. Un rechazo siempre dice qué corregir.
 */
export function validateInstagramGeometry(
  target: InstagramPublishTarget,
  candidate: InstagramMediaGeometry,
): InstagramMediaDecision {
  if (!isPubliclyFetchableUrl(candidate.url)) {
    return rejected(
      "url-not-public",
      "La URL de la pieza no es una dirección HTTPS que Meta pueda descargar.",
      "Publicá la pieza desde el almacenamiento público de la plataforma.",
    );
  }
  if (candidate.width <= 0 || candidate.height <= 0) {
    return rejected(
      "resolution-insufficient",
      "La pieza no declara medidas utilizables.",
      "Volvé a renderizar la pieza antes de publicarla.",
    );
  }
  if (candidate.width < instagramMediaPolicy.minimumWidth) {
    return rejected(
      "resolution-insufficient",
      `La pieza mide ${String(candidate.width)} px de ancho y el mínimo es ${String(instagramMediaPolicy.minimumWidth)} px.`,
      "Entregá la pieza en su tamaño original.",
    );
  }

  const ratio = candidate.width / candidate.height;
  if (target === "instagram_story") {
    const distance = Math.abs(ratio - instagramMediaPolicy.storyAspectRatio);
    return distance > instagramMediaPolicy.storyAspectRatioTolerance
      ? rejected(
          "aspect-ratio-unsupported",
          "Una historia se publica en 9:16 y la pieza tiene otra proporción.",
          "Usá el formato historia del catálogo o publicá la pieza en el feed.",
        )
      : Object.freeze({ status: "accepted" as const });
  }
  return ratio < instagramMediaPolicy.feedAspectRatioMinimum ||
    ratio > instagramMediaPolicy.feedAspectRatioMaximum
    ? rejected(
        "aspect-ratio-unsupported",
        "El feed admite entre 4:5 y 1.91:1 y la pieza queda fuera de ese rango.",
        "Usá el formato feed o cuadrado del catálogo.",
      )
    : Object.freeze({ status: "accepted" as const });
}

/**
 * Las dos comprobaciones juntas, para quien ya conoce la entrega. La geometría
 * va primero: es la que explica mejor por qué una pieza no corresponde a ese
 * destino.
 */
export function validateInstagramMedia(
  target: InstagramPublishTarget,
  candidate: InstagramMediaCandidate,
): InstagramMediaDecision {
  const geometry = validateInstagramGeometry(target, candidate);
  return geometry.status === "rejected"
    ? geometry
    : validateInstagramDelivery(candidate);
}

/**
 * Estados de un contenedor, normalizados desde `status_code`.
 *
 * `published` no es un estado que produzca la plataforma: lo informa Meta
 * cuando el contenedor ya fue publicado. Es la única señal que distingue un
 * timeout antes de publicar de uno después, y por eso se conserva como estado
 * propio en vez de colapsarlo con `finished`.
 */
export const instagramContainerStates = Object.freeze([
  "error",
  "expired",
  "finished",
  "in_progress",
  "published",
] as const);

export type InstagramContainerState = (typeof instagramContainerStates)[number];

export interface InstagramContainerReport {
  readonly state: InstagramContainerState;
}

export interface InstagramContainerRequest {
  /** Ausente en una historia: la API no publica pie en ese destino. */
  readonly caption?: string;
  readonly imageUrl: string;
  /** Identificador de la cuenta profesional en Meta. */
  readonly instagramAssetId: string;
  readonly target: InstagramPublishTarget;
}

export interface InstagramCreatedContainer {
  readonly containerId: string;
}

export interface InstagramPublishRequest {
  readonly containerId: string;
  readonly instagramAssetId: string;
}

/**
 * Resultado de publicar un contenedor.
 *
 * Solo el identificador: el enlace público es otra lectura de Graph, y una
 * lectura que falla no puede poner en duda una publicación que Meta ya
 * confirmó. Recuperarlo corresponde a quien muestre el historial.
 */
export interface InstagramPublishedMedia {
  readonly mediaId: string;
}

/**
 * Cuota de publicación informada por Meta.
 *
 * Se consulta y no se asume: el total documentado cambió al menos una vez y un
 * número fijado en el código haría que la plataforma se frene antes de tiempo o
 * gaste contenedores que Meta ya no acepta.
 */
export interface InstagramPublishingQuota {
  readonly quotaDurationSeconds: number;
  readonly quotaTotal: number;
  readonly quotaUsage: number;
}

/**
 * Puerto de publicación en Instagram.
 *
 * La credencial es el token de la Page: la cuenta profesional no guarda token
 * propio y publica con el de la Page a la que está vinculada.
 */
export interface InstagramPublishingPort {
  createContainer(
    request: InstagramContainerRequest,
    accessToken: string,
  ): Promise<InstagramCreatedContainer>;
  publishContainer(
    request: InstagramPublishRequest,
    accessToken: string,
  ): Promise<InstagramPublishedMedia>;
  readContainer(
    containerId: string,
    accessToken: string,
  ): Promise<InstagramContainerReport>;
  readPublishingQuota(
    instagramAssetId: string,
    accessToken: string,
  ): Promise<InstagramPublishingQuota>;
}

export const instagramPublishingFailureCodes = Object.freeze([
  /** El contenedor venció sin publicarse; hay que crear uno nuevo. */
  "container-expired",
  /** Meta rechazó la pieza por formato, medida o peso. */
  "media-invalid",
  /** Meta no pudo descargar la URL de la pieza. */
  "media-unreachable",
  /** La conexión perdió un permiso o el activo no le pertenece. */
  "permission-denied",
  /** El contenedor terminó en error del lado de Meta. */
  "processing-failed",
  /** El contenedor no llegó a estado publicable dentro del plazo. */
  "processing-timeout",
  "provider-error",
  /** La cuenta agotó la cuota de publicaciones de la ventana vigente. */
  "publishing-limit-reached",
  "rate-limit",
  /** La llamada al proveedor no respondió dentro del plazo. */
  "request-timeout",
  "token-expired",
  /** La pieza o el pie no cumplen las reglas; no se llama al proveedor. */
  "validation-failed",
] as const);

export type InstagramPublishingFailureCode =
  (typeof instagramPublishingFailureCodes)[number];

/**
 * Fallo de publicación.
 *
 * El mensaje es fijo y `detail` es texto propio: una respuesta de Meta puede
 * traer reflejada la URL firmada de la pieza, y un error termina en un log.
 */
export class InstagramPublishingError extends Error {
  readonly code: InstagramPublishingFailureCode;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(
    code: InstagramPublishingFailureCode,
    detail: string,
    retryable: boolean,
  ) {
    super("La publicación en Instagram no pudo completarse.");
    this.code = code;
    this.detail = detail;
    this.name = "InstagramPublishingError";
    this.retryable = retryable;
  }
}

/**
 * Estados de un intento contra un destino de Instagram.
 *
 * `published_unconfirmed` existe porque Meta puede confirmar que el contenedor
 * fue publicado sin decir con qué identificador. Colapsarlo en `failed`
 * invitaría a reintentar y duplicaría la publicación; colapsarlo en `published`
 * inventaría un identificador que nadie puede consultar. Se conserva separado y
 * su reconciliación es de `P5-T06`.
 */
export const instagramAttemptStates = Object.freeze([
  "container_created",
  "failed",
  "pending",
  "published",
  "published_unconfirmed",
] as const);

export type InstagramAttemptState = (typeof instagramAttemptStates)[number];

export interface InstagramAttemptFailure {
  readonly code: InstagramPublishingFailureCode;
  readonly detail: string;
  readonly retryable: boolean;
}

/**
 * Ámbito de un intento.
 *
 * La clave es el destino de la publicación y no el intento: es lo que permite
 * que repetir el comando encuentre lo que dejó la corrida anterior.
 */
export interface InstagramAttemptScope {
  readonly organizationId: string;
  readonly publicationTargetId: string;
}

export interface InstagramAttemptRecord extends InstagramAttemptScope {
  readonly attemptId: string;
  /** Contenedor vigente. Ausente cuando todavía no se creó o ya no sirve. */
  readonly containerId?: string;
  readonly failure?: InstagramAttemptFailure;
  readonly mediaId?: string;
  /**
   * Escritura esperada. Crece de a uno y el diario rechaza una escritura que no
   * siga a la última almacenada: dos workers sobre el mismo destino no pueden
   * pisarse ni publicar dos veces.
   */
  readonly sequence: number;
  readonly state: InstagramAttemptState;
  readonly updatedAt: string;
}

export type InstagramAttemptWriteResult = "conflict" | "saved";

/**
 * Diario de intentos.
 *
 * Guarda el identificador de contenedor antes de intentar publicar y el de la
 * publicación cuando Meta la confirma. `P5-T05` lo implementa sobre su modelo de
 * orden, destino e intento; el publicador no cambia por eso.
 */
export interface InstagramAttemptJournal {
  find(scope: InstagramAttemptScope): Promise<InstagramAttemptRecord | null>;
  save(record: InstagramAttemptRecord): Promise<InstagramAttemptWriteResult>;
}

export type PublicMediaProbeResult =
  | Readonly<{ byteSize: number; mimeType: string; status: "reachable" }>
  | Readonly<{ status: "unreachable" }>;

/**
 * Sonda de la URL pública.
 *
 * Meta descarga la pieza desde su propia red, así que una URL rota se descubre
 * recién cuando el contenedor termina en error: tarde, y habiendo consumido una
 * unidad de cuota. Una consulta de encabezados antes de llamar cuesta mucho
 * menos y además confirma el tipo y el peso reales de lo que se entrega, que es
 * lo único que la plataforma no puede deducir del activo almacenado.
 */
export interface PublicMediaProbePort {
  probe(url: string): Promise<PublicMediaProbeResult>;
}
