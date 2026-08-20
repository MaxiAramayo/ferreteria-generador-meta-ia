/**
 * Traducción de lo que Meta contesta a evidencia de publicación.
 *
 * Los dos destinos contestan cosas distintas y ninguno contesta exactamente la
 * pregunta, así que la traducción es donde se decide si el sistema va a
 * duplicar. Las dos reglas que la gobiernan son asimétricas a propósito:
 *
 * - **la Page nunca prueba una ausencia.** `page_story_id` presente demuestra
 *   que la publicación existe; ausente no demuestra lo contrario, porque Meta
 *   documenta que el campo puede faltar. Por eso una foto preparada sin
 *   identificador se traduce a `indeterminate` y no a `absent`: un destino de
 *   Facebook en duda sólo puede confirmarse, nunca republicarse solo.
 * - **el contenedor de Instagram sí prueba las dos cosas**, pero cuando prueba
 *   que salió no devuelve la media. Ese caso es `published-unidentified`, y es
 *   la razón por la que existe: tratarlo como ausencia republicaría algo que ya
 *   está publicado.
 */

import {
  type InstagramPublishingPort,
  type FacebookPublishingPort,
  type RemotePublicationEvidence,
} from "@aramayo/domain";

import type { RemotePublicationLookupPort } from "./publication-reconciliation.service.ts";

export class MetaPublicationLookupAdapter implements RemotePublicationLookupPort {
  readonly #facebook: FacebookPublishingPort;
  readonly #instagram: InstagramPublishingPort;

  constructor(
    instagram: InstagramPublishingPort,
    facebook: FacebookPublishingPort,
  ) {
    this.#facebook = facebook;
    this.#instagram = instagram;
  }

  async lookup(
    input: Parameters<RemotePublicationLookupPort["lookup"]>[0],
  ): Promise<RemotePublicationEvidence> {
    const { attempt } = input;
    // Un identificador ya guardado zanja la pregunta sin gastar una llamada.
    if (attempt.remotePostId !== undefined) {
      return Object.freeze({
        ...(attempt.remotePermalink === undefined
          ? {}
          : { remotePermalink: attempt.remotePermalink }),
        remotePostId: attempt.remotePostId,
        status: "published" as const,
      });
    }
    // Sin anclaje remoto no hay nada que consultar. Es una anomalía —los tres
    // estados que se reconcilian dejan uno— y se informa como desconocimiento
    // en vez de como ausencia: inventar una negativa acá republicaría.
    if (attempt.stagedMediaId === undefined) {
      return Object.freeze({ status: "indeterminate" as const });
    }

    return input.target.target === "facebook_page"
      ? this.#lookupPagePost(attempt.stagedMediaId, input.accessToken)
      : this.#lookupContainer(attempt.stagedMediaId, input.accessToken);
  }

  async #lookupPagePost(
    stagedPhotoId: string,
    accessToken: string,
  ): Promise<RemotePublicationEvidence> {
    const report = await this.#facebook.readStagedPhoto(
      stagedPhotoId,
      accessToken,
    );
    if (report.postId === undefined) {
      return Object.freeze({ status: "indeterminate" as const });
    }
    const permalink = await this.#facebook.readPermalink(
      report.postId,
      accessToken,
    );
    return Object.freeze({
      ...(permalink === null ? {} : { remotePermalink: permalink }),
      remotePostId: report.postId,
      status: "published" as const,
    });
  }

  async #lookupContainer(
    containerId: string,
    accessToken: string,
  ): Promise<RemotePublicationEvidence> {
    const report = await this.#instagram.readContainer(
      containerId,
      accessToken,
    );
    switch (report.state) {
      case "published":
        // Salió, y Meta no devuelve la media por esta vía.
        return Object.freeze({ status: "published-unidentified" as const });
      case "error":
      case "expired":
        // El contenedor murió sin publicar: la publicación no existe.
        return Object.freeze({ status: "absent" as const });
      case "finished":
        // Listo para publicar y todavía sin publicar. Tampoco existe.
        return Object.freeze({ status: "absent" as const });
      case "in_progress":
        return Object.freeze({ status: "indeterminate" as const });
    }
  }
}
