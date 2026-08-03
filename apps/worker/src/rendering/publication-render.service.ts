import {
  parseDesignDocument,
  type DesignRenderer,
} from "@aramayo/design-engine";
import {
  publicationRenderTopic,
  type OutboxMessageRecord,
  type OutboxTransport,
  type PublicationProductionRepository,
  type SafeJsonObject,
} from "@aramayo/domain";

import { deterministicMediaId } from "../media/deterministic-media-id.ts";
import type { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import { MediaLifecycleError } from "../media/media.errors.ts";

function payloadText(payload: SafeJsonObject, field: string): string {
  const entry = payload[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`El evento de render no contiene ${field}.`);
  }
  return entry;
}

export function deterministicRenderMediaId(revisionId: string): string {
  return deterministicMediaId("publication-render", revisionId);
}

export class PublicationRenderOutboxTransport implements OutboxTransport {
  readonly #media: Pick<MediaLifecycleService, "upload">;
  readonly #renderer: DesignRenderer;
  readonly #repository: PublicationProductionRepository;

  constructor(
    repository: PublicationProductionRepository,
    renderer: DesignRenderer,
    media: Pick<MediaLifecycleService, "upload">,
  ) {
    this.#repository = repository;
    this.#renderer = renderer;
    this.#media = media;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    if (message.topic !== publicationRenderTopic) {
      throw new Error("El evento outbox todavía no tiene un consumidor.");
    }
    const publicationId = payloadText(message.payload, "publicationId");
    const revisionId = payloadText(message.payload, "revisionId");
    const job = await this.#repository.findRenderJob(
      message.organizationId,
      publicationId,
      revisionId,
    );
    if (job === null) {
      throw new Error(
        "La intención de render no coincide con el estado actual.",
      );
    }
    if (job.alreadyCompleted) {
      return;
    }
    const parsed = parseDesignDocument(job.designDocument);
    if (!parsed.ok) {
      await this.#repository.failRender({
        actorMembershipId: job.actorMembershipId,
        code: "render.document-invalid",
        failedAt: new Date().toISOString(),
        organizationId: job.organizationId,
        publicationId: job.publicationId,
        publicationVersion: job.publicationVersion,
        retryable: false,
        safeMessage: "El documento de diseño no se puede renderizar.",
      });
      return;
    }
    const rendered = await this.#renderer.render({
      document: parsed.document,
      requestId: message.eventId,
    });
    if (!rendered.ok) {
      await this.#repository.failRender({
        actorMembershipId: job.actorMembershipId,
        code: `render.${rendered.failure.stage}`,
        failedAt: new Date().toISOString(),
        organizationId: job.organizationId,
        publicationId: job.publicationId,
        publicationVersion: job.publicationVersion,
        retryable: rendered.failure.stage === "render",
        safeMessage:
          rendered.failure.stage === "asset"
            ? "Una imagen de la pieza no se pudo decodificar."
            : "El navegador no pudo completar el render.",
      });
      return;
    }
    const mediaAssetId = deterministicRenderMediaId(job.revisionId);
    try {
      const asset = await this.#media.upload({
        bytes: rendered.image.png,
        declaredMimeType: "image/png",
        mediaAssetId,
        organizationId: job.organizationId,
        origin: "generated",
        originalFileName: `${job.revisionId}.png`,
        ownerMembershipId: job.actorMembershipId,
      });
      if (
        asset.byteSize === undefined ||
        asset.checksumSha256 === undefined ||
        asset.height === undefined ||
        asset.mimeType !== "image/png" ||
        asset.secureUrl === undefined ||
        asset.storageVersion === undefined ||
        asset.width === undefined
      ) {
        throw new Error(
          "El activo renderizado no conserva metadatos completos.",
        );
      }
      if (
        asset.checksumSha256 !== rendered.image.sha256 ||
        asset.byteSize !== String(rendered.image.byteLength) ||
        asset.height !== rendered.image.height ||
        asset.width !== rendered.image.width
      ) {
        throw new Error(
          "El almacenamiento no confirmó exactamente el PNG renderizado.",
        );
      }
      const completion = await this.#repository.completeRender(job, {
        byteSize: asset.byteSize,
        checksumSha256: asset.checksumSha256,
        height: asset.height,
        mediaAssetId: asset.id,
        mimeType: "image/png",
        renderedAt: new Date().toISOString(),
        secureUrl: asset.secureUrl,
        storageVersion: asset.storageVersion,
        width: asset.width,
      });
      if (
        completion.status !== "completed" &&
        completion.status !== "already-completed"
      ) {
        throw new Error("El PNG existe pero su revisión no pudo confirmarse.");
      }
    } catch (cause: unknown) {
      const failure =
        cause instanceof MediaLifecycleError
          ? {
              code: `render.${cause.code}`,
              retryable: cause.retryable,
              safeMessage: cause.message,
            }
          : {
              code: "render.storage-failed",
              retryable: true,
              safeMessage: "El PNG no pudo confirmarse en almacenamiento.",
            };
      await this.#repository.failRender({
        actorMembershipId: job.actorMembershipId,
        failedAt: new Date().toISOString(),
        organizationId: job.organizationId,
        publicationId: job.publicationId,
        publicationVersion: job.publicationVersion,
        ...failure,
      });
    }
  }
}
