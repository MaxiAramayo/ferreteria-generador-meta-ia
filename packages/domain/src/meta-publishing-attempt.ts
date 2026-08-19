/**
 * Lo que Instagram y la Page de Facebook comparten al publicar.
 *
 * Los dos destinos publican distinto —uno arma un contenedor y espera a que
 * procese, el otro sube una foto sin publicar y después crea la historia de
 * la Page— pero enfrentan el mismo problema y llevan la misma cicatriz: entre
 * el momento en que la plataforma pide la publicación y el momento en que se
 * entera del resultado hay una ventana, y una respuesta perdida en esa ventana
 * no dice si la publicación existe. La única defensa es anclar algo durable
 * antes de pedirla.
 *
 * Por eso el diario de intentos es uno solo y no uno por destino. `P5-T05` va a
 * calcular un estado agregado sobre intentos de destinos distintos: si cada uno
 * tuviera su vocabulario, ese cálculo tendría que traducir antes de comparar, y
 * una traducción es justamente donde se pierde la diferencia entre «falló» y
 * «no sé si salió».
 *
 * La taxonomía de fallos también es común, aunque no todo código aplique a
 * todos los destinos: quien muestre el resultado tiene que poder explicarlo sin
 * saber a qué red fue.
 */

/**
 * Códigos de fallo de publicación.
 *
 * Cada uno existe porque implica una acción distinta. Los que sólo aplican a un
 * destino están marcados; el tipo no los separa a propósito, para que la capa
 * que informa el resultado no tenga que ramificar por red.
 */
export const metaPublishingFailureCodes = Object.freeze([
  /** La conexión perdió un permiso, o el activo no le pertenece. */
  "permission-denied",
  /** El proveedor no pudo descargar la pieza desde su dirección pública. */
  "media-unreachable",
  /** El proveedor rechazó la pieza por formato, medida o peso. */
  "media-invalid",
  /**
   * El medio preparado antes de publicar —contenedor de Instagram, foto sin
   * publicar de la Page— venció. Un reintento tiene que preparar otro.
   */
  "staged-media-expired",
  /** Sólo Instagram: el contenedor terminó en error del lado de Meta. */
  "processing-failed",
  /** Sólo Instagram: el contenedor no llegó a publicable dentro del plazo. */
  "processing-timeout",
  /** Sólo Instagram: la cuenta agotó su cuota de la ventana vigente. */
  "publishing-limit-reached",
  "rate-limit",
  /** La llamada al proveedor no respondió dentro del plazo. */
  "request-timeout",
  "token-expired",
  "provider-error",
  /** La pieza o el copy no cumplen las reglas; no se llama al proveedor. */
  "validation-failed",
] as const);

export type MetaPublishingFailureCode =
  (typeof metaPublishingFailureCodes)[number];

/**
 * Fallo de publicación.
 *
 * El mensaje es fijo y `detail` es texto propio: una respuesta del proveedor
 * puede traer reflejada la URL de la pieza, y un error termina en un log.
 */
export class MetaPublishingError extends Error {
  readonly code: MetaPublishingFailureCode;
  readonly detail: string;
  readonly retryable: boolean;

  constructor(
    code: MetaPublishingFailureCode,
    detail: string,
    retryable: boolean,
  ) {
    super("La publicación no pudo completarse.");
    this.code = code;
    this.detail = detail;
    this.name = "MetaPublishingError";
    this.retryable = retryable;
  }
}

/**
 * Estados de un intento contra un destino.
 *
 * Los tres del medio existen porque «publicado» y «falló» no alcanzan para
 * describir lo que puede quedar después de una respuesta perdida:
 *
 * - `media_staged`: hay un medio preparado del lado del proveedor. Es el
 *   anclaje que permite reconciliar en vez de volver a pedir la publicación.
 * - `published_unconfirmed`: el proveedor confirma que se publicó pero la
 *   plataforma no tiene el identificador. Reintentar produciría la segunda
 *   publicación, así que no se reintenta.
 * - `outcome_unknown`: el pedido de publicación quedó ambiguo y el proveedor no
 *   puede decir si existe. Ni se reintenta ni se declara publicado: se detiene
 *   y espera decisión humana, porque las dos salidas automáticas son peores que
 *   preguntar.
 */
export const metaPublishingAttemptStates = Object.freeze([
  "failed",
  "media_staged",
  "outcome_unknown",
  "pending",
  "published",
  "published_unconfirmed",
] as const);

export type MetaPublishingAttemptState =
  (typeof metaPublishingAttemptStates)[number];

export interface MetaPublishingAttemptFailure {
  readonly code: MetaPublishingFailureCode;
  readonly detail: string;
  readonly retryable: boolean;
}

/**
 * Ámbito de un intento.
 *
 * La clave es el destino de la publicación y no el intento: es lo que permite
 * que repetir el comando encuentre lo que dejó la corrida anterior. También es
 * lo que mantiene los destinos independientes —un fallo en uno no puede tocar
 * el resultado del otro, porque no comparten fila.
 */
export interface MetaPublishingAttemptScope {
  readonly organizationId: string;
  readonly publicationTargetId: string;
}

export interface MetaPublishingAttemptRecord extends MetaPublishingAttemptScope {
  readonly attemptId: string;
  readonly failure?: MetaPublishingAttemptFailure;
  /**
   * Enlace público de la publicación, cuando el proveedor lo entregó. Es
   * información de presentación: su ausencia no dice nada sobre el resultado.
   */
  readonly remotePermalink?: string;
  /** Identificador de la publicación en el proveedor, cuando se confirmó. */
  readonly remotePostId?: string;
  /**
   * Escritura esperada. Crece de a uno y el diario rechaza una escritura que no
   * siga a la última almacenada: dos trabajadores sobre el mismo destino no
   * pueden pisarse ni publicar dos veces.
   */
  readonly sequence: number;
  /**
   * Medio preparado del lado del proveedor: el contenedor de Instagram o la
   * foto sin publicar de la Page. Ausente cuando todavía no se preparó o ya no
   * sirve.
   */
  readonly stagedMediaId?: string;
  readonly state: MetaPublishingAttemptState;
  readonly updatedAt: string;
}

export type MetaPublishingAttemptWriteResult = "conflict" | "saved";

/**
 * Lo que cambia de un intento; el ámbito y la marca de tiempo los pone quien
 * escribe. Se deriva del registro en vez de repetir sus campos: una lista
 * paralela deja caer en silencio lo que se agregue de un lado y no del otro.
 */
export type MetaPublishingAttemptChange = Omit<
  MetaPublishingAttemptRecord,
  "attemptId" | "organizationId" | "publicationTargetId" | "updatedAt"
>;

/**
 * Diario de intentos.
 *
 * Guarda el medio preparado antes de pedir la publicación y el identificador
 * remoto cuando el proveedor la confirma. `P5-T05` lo implementa sobre su
 * modelo de orden, destino e intento; los publicadores no cambian por eso.
 */
export interface MetaPublishingAttemptJournal {
  find(
    scope: MetaPublishingAttemptScope,
  ): Promise<MetaPublishingAttemptRecord | null>;
  save(
    record: MetaPublishingAttemptRecord,
  ): Promise<MetaPublishingAttemptWriteResult>;
}

export type PublicMediaProbeResult =
  | Readonly<{ byteSize: number; mimeType: string; status: "reachable" }>
  | Readonly<{ status: "unreachable" }>;

/**
 * Sonda de la URL pública.
 *
 * Meta descarga la pieza desde su propia red, así que una URL rota se descubre
 * recién cuando el proveedor falla: tarde, y habiendo consumido cuota. Una
 * consulta de encabezados antes de llamar cuesta mucho menos y además confirma
 * el tipo y el peso reales de lo que se entrega, que es lo único que la
 * plataforma no puede deducir del activo almacenado.
 */
export interface PublicMediaProbePort {
  probe(url: string): Promise<PublicMediaProbeResult>;
}

/**
 * Una URL sirve si Meta puede descargarla desde afuera.
 *
 * `localhost`, una IP privada o un host sin punto no son accesibles para Meta
 * aunque lo sean para el worker, y el error que devolvería Meta —«no pude
 * descargar la imagen»— llega después de haber gastado la llamada.
 */
export function isPubliclyFetchableMediaUrl(candidate: string): boolean {
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
