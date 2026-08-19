/**
 * Publicación en la Page de Facebook: reglas y puerto.
 *
 * Facebook admite publicar una foto en una sola llamada, y aun así esta
 * vertical usa dos. La razón no es simetría con Instagram sino idempotencia:
 * con una sola llamada, una respuesta perdida deja a la plataforma sin nada que
 * consultar —no hay identificador, no hay a qué preguntarle— y las dos salidas
 * posibles son igual de malas, publicar de nuevo o abandonar algo que quizá ya
 * salió. Subir la foto sin publicar primero deja un identificador que se guarda
 * antes de pedir la publicación, y ese identificador sí puede responder después
 * la única pregunta que importa: `page_story_id`, que existe cuando la foto ya
 * pertenece a una historia publicada de la Page.
 *
 * Esa respuesta es concluyente en un sentido y no en el otro. Si el campo está,
 * la publicación existe. Si no está, la documentación advierte que «puede no
 * estar en todas las fotos», así que su ausencia no prueba que no se publicó.
 * Por eso una publicación ambigua no se reintenta sola: queda en
 * `outcome_unknown` y espera decisión humana. Publicar en la Page de un negocio
 * real es irreversible, y elegir automáticamente entre duplicar y no publicar
 * es una decisión que no le corresponde al worker.
 *
 * Los límites son propios de Facebook y difieren de Instagram: acepta más
 * formatos y pesa menos. Vienen de la documentación oficial consultada el
 * 2026-08-19 y están citados en `docs/integrations/META.md`.
 */

import {
  isPubliclyFetchableMediaUrl,
  type MetaPublishingFailureCode,
} from "./meta-publishing-attempt.ts";
import type { PublicationTarget } from "./publication.ts";

export type FacebookPublishTarget = Extract<PublicationTarget, "facebook_page">;

export const facebookMediaPolicy = Object.freeze({
  /** Vida de una foto subida sin publicar, en segundos. */
  stagedPhotoLifetimeSeconds: 24 * 60 * 60,
  /**
   * Longitud máxima del copy. Meta no la documenta para publicaciones de Page;
   * es el mismo tope que Instagram, adoptado por la plataforma para que una
   * misma pieza no se acepte en un destino y se rechace en el otro.
   */
  copyMaximumLength: 2_200,
  /**
   * Tamaño máximo del archivo. Es la mitad de lo que admite Instagram: una
   * pieza válida allá puede no serlo acá.
   */
  maximumByteSize: 4 * 1024 * 1024,
  /**
   * Ancho mínimo. Regla de la plataforma, igual que en Instagram: Facebook
   * redimensiona por su cuenta y una pieza escalada hacia arriba pierde la
   * legibilidad del precio y del llamado a la acción.
   */
  minimumWidth: 320,
  /**
   * Formatos que Facebook admite. La plataforma entrega JPEG igual que a
   * Instagram —la variante de entrega es una sola—, pero la regla se declara
   * como la declara Meta para no inventar una restricción ajena.
   */
  mimeTypes: Object.freeze([
    "image/bmp",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/tiff",
  ] as const),
  /**
   * Peso máximo recomendado para PNG. Meta advierte que por encima la imagen se
   * pixela; se trata como aviso y no como rechazo, porque la pieza igual sale.
   */
  pngAdvisoryByteSize: 1024 * 1024,
});

export const facebookMediaRejectionCodes = Object.freeze([
  "copy-empty",
  "copy-too-long",
  "file-too-large",
  "resolution-insufficient",
  "type-not-allowed",
  "url-not-public",
] as const);

export type FacebookMediaRejectionCode =
  (typeof facebookMediaRejectionCodes)[number];

export interface FacebookMediaRejection {
  readonly code: FacebookMediaRejectionCode;
  /** Qué hacer para que la próxima pieza sirva. */
  readonly correction: string;
  readonly reason: string;
}

/** Geometría y dirección de la pieza, tal como las entrega la URL. */
export interface FacebookMediaGeometry {
  readonly height: number;
  readonly url: string;
  readonly width: number;
}

/** Lo que el servidor declara al entregar la pieza. */
export interface FacebookMediaDelivery {
  readonly byteSize: number;
  readonly mimeType: string;
}

export type FacebookMediaDecision =
  | Readonly<{ status: "accepted" }>
  | Readonly<{ rejection: FacebookMediaRejection; status: "rejected" }>;

function rejected(
  code: FacebookMediaRejectionCode,
  reason: string,
  correction: string,
): FacebookMediaDecision {
  return Object.freeze({
    rejection: Object.freeze({ code, correction, reason }),
    status: "rejected" as const,
  });
}

/**
 * Valida el copy.
 *
 * A diferencia de una historia de Instagram, una publicación de Page sin texto
 * es una pieza muda: la foto sale sola y la publicación pierde el mensaje, el
 * dato verificado y el llamado a la acción. Se exige texto.
 */
export function validateFacebookCopy(copy: string): FacebookMediaDecision {
  if (copy.trim().length === 0) {
    return rejected(
      "copy-empty",
      "Una publicación de la Page necesita texto.",
      "Escribí el mensaje que acompaña a la pieza.",
    );
  }
  return copy.length > facebookMediaPolicy.copyMaximumLength
    ? rejected(
        "copy-too-long",
        `El texto supera ${String(facebookMediaPolicy.copyMaximumLength)} caracteres.`,
        "Acortá el mensaje antes de publicar.",
      )
    : Object.freeze({ status: "accepted" as const });
}

/** Valida lo que el servidor entrega, contra la respuesta real y no el activo. */
export function validateFacebookDelivery(
  delivery: FacebookMediaDelivery,
): FacebookMediaDecision {
  if (
    !(facebookMediaPolicy.mimeTypes as readonly string[]).includes(
      delivery.mimeType,
    )
  ) {
    return rejected(
      "type-not-allowed",
      `Facebook no publica ${delivery.mimeType}.`,
      "Entregá la pieza con la variante JPEG del almacenamiento.",
    );
  }
  return delivery.byteSize > facebookMediaPolicy.maximumByteSize
    ? rejected(
        "file-too-large",
        `La pieza pesa más de ${String(facebookMediaPolicy.maximumByteSize)} bytes y Facebook admite la mitad que Instagram.`,
        "Reducí la calidad de la variante de entrega.",
      )
    : Object.freeze({ status: "accepted" as const });
}

/**
 * Valida la dirección y las medidas.
 *
 * No hay regla de proporción: la Page acepta cualquiera y la recorta en la
 * previsualización sin deformarla, así que exigir uno de los formatos del
 * catálogo rechazaría piezas que salen bien.
 */
export function validateFacebookGeometry(
  candidate: FacebookMediaGeometry,
): FacebookMediaDecision {
  if (!isPubliclyFetchableMediaUrl(candidate.url)) {
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
  return candidate.width < facebookMediaPolicy.minimumWidth
    ? rejected(
        "resolution-insufficient",
        `La pieza mide ${String(candidate.width)} px de ancho y el mínimo es ${String(facebookMediaPolicy.minimumWidth)} px.`,
        "Entregá la pieza en su tamaño original.",
      )
    : Object.freeze({ status: "accepted" as const });
}

export interface FacebookStagePhotoRequest {
  readonly imageUrl: string;
  readonly pageAssetId: string;
}

/** Foto subida sin publicar. Vive 24 horas y es el anclaje del intento. */
export interface FacebookStagedPhoto {
  readonly photoId: string;
}

export interface FacebookPagePostRequest {
  readonly copy: string;
  readonly pageAssetId: string;
  readonly stagedPhotoId: string;
}

export interface FacebookPagePost {
  readonly permalink?: string;
  readonly postId: string;
}

/**
 * Lo que la foto preparada sabe sobre su publicación.
 *
 * `postId` presente prueba que la publicación existe. Ausente **no** prueba lo
 * contrario: Meta documenta que el campo puede faltar. Quien consuma esto tiene
 * que tratar la ausencia como desconocimiento y no como negativa.
 */
export interface FacebookStagedPhotoReport {
  readonly postId?: string;
}

/**
 * Puerto de publicación en la Page.
 *
 * La credencial es el token de Page, distinto del token de usuario con el que
 * se hizo el OAuth.
 */
export interface FacebookPublishingPort {
  createPagePost(
    request: FacebookPagePostRequest,
    accessToken: string,
  ): Promise<FacebookPagePost>;
  readPermalink(postId: string, accessToken: string): Promise<string | null>;
  readStagedPhoto(
    photoId: string,
    accessToken: string,
  ): Promise<FacebookStagedPhotoReport>;
  stagePhoto(
    request: FacebookStagePhotoRequest,
    accessToken: string,
  ): Promise<FacebookStagedPhoto>;
}

/** Códigos que puede producir la publicación en la Page. */
export const facebookPublishingFailureCodes = Object.freeze([
  "media-invalid",
  "media-unreachable",
  "permission-denied",
  "provider-error",
  "rate-limit",
  "request-timeout",
  "staged-media-expired",
  "token-expired",
  "validation-failed",
] as const satisfies readonly MetaPublishingFailureCode[]);
