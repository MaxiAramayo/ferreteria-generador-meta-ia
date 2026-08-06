/**
 * Ingesta de entradas visuales.
 *
 * Junta las dos mitades: `SharpVisualInputPreparer` decide y normaliza, y
 * `MediaLifecycleService` persiste. El resultado son dos activos distintos —el
 * original saneado y el derivado que viaja al proveedor— porque conservarlos
 * separados es lo que permite construir otro derivado mañana sin volver a
 * pedirle la foto a nadie.
 *
 * Los identificadores se derivan del contenido, no del reloj ni del azar: la
 * misma foto ingresada dos veces cae sobre los mismos activos y la segunda no
 * vuelve a subir nada. El del original sale del hash de los bytes recibidos; el
 * del derivado, del hash del original ya saneado, que es de lo que realmente
 * deriva.
 */

import {
  generationPolicyDefaults,
  type GenerationPolicyRepository,
  type MediaAssetRecord,
  type PreparedVisualArtifact,
  type VisualInputMimeType,
  type VisualInputPreparer,
  type VisualInputRejection,
  type VisualReferenceRole,
} from "@aramayo/domain";

import { deterministicMediaId } from "./deterministic-media-id.ts";
import type { MediaLifecycleService } from "./media-lifecycle.service.ts";

export interface IngestVisualInputCommand {
  readonly bytes: Uint8Array;
  readonly organizationId: string;
  readonly ownerMembershipId: string;
  /** Organización dueña del archivo, resuelta por el servidor. */
  readonly ownerOrganizationId: string;
  readonly role: VisualReferenceRole;
}

export type VisualInputIngestionResult =
  | Readonly<{
      original: MediaAssetRecord;
      reference: MediaAssetRecord;
      status: "ingested";
    }>
  | Readonly<{ rejection: VisualInputRejection; status: "rejected" }>;

function extensionFor(mimeType: VisualInputMimeType): string {
  return mimeType === "image/png" ? "png" : "jpg";
}

function retentionAfter(at: Date, days: number): string {
  at = new Date(at);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString();
}

export class VisualInputIngestionService {
  readonly #media: Pick<MediaLifecycleService, "upload">;
  readonly #clock: () => Date;
  readonly #policies: GenerationPolicyRepository | null;
  readonly #preparer: VisualInputPreparer;

  constructor(
    preparer: VisualInputPreparer,
    media: Pick<MediaLifecycleService, "upload">,
    dependencies: Readonly<{
      clock?: () => Date;
      policies?: GenerationPolicyRepository;
    }> = {},
  ) {
    this.#clock = dependencies.clock ?? ((): Date => new Date());
    this.#media = media;
    this.#policies = dependencies.policies ?? null;
    this.#preparer = preparer;
  }

  async ingest(
    command: IngestVisualInputCommand,
  ): Promise<VisualInputIngestionResult> {
    const preparation = await this.#preparer.prepare({
      bytes: command.bytes,
      organizationId: command.organizationId,
      ownerOrganizationId: command.ownerOrganizationId,
      role: command.role,
    });
    if (preparation.status === "rejected") {
      return Object.freeze({
        rejection: preparation.rejection,
        status: "rejected" as const,
      });
    }

    const { original, reference, sourceSha256 } = preparation.prepared;
    const retention = await this.#retention(command);
    const originalAsset = await this.#store(
      command,
      original,
      deterministicMediaId(
        "visual-input:v2:original",
        `${command.organizationId}:${sourceSha256}`,
      ),
      "original",
      retentionAfter(this.#clock(), retention.originalDays),
    );

    // Cuando la foto no supera el tope, el derivado son los mismos bytes que el
    // original. Subirlo de nuevo pagaría dos veces por un archivo idéntico, así
    // que se reutiliza el activo ya persistido.
    if (reference.sha256 === original.sha256) {
      return Object.freeze({
        original: originalAsset,
        reference: originalAsset,
        status: "ingested" as const,
      });
    }

    return Object.freeze({
      original: originalAsset,
      reference: await this.#store(
        command,
        reference,
        deterministicMediaId(
          "visual-input:v2:reference",
          `${command.organizationId}:${original.sha256}`,
        ),
        "referencia",
        retentionAfter(this.#clock(), retention.referenceDays),
      ),
      status: "ingested" as const,
    });
  }

  async #retention(command: IngestVisualInputCommand): Promise<
    Readonly<{
      originalDays: number;
      referenceDays: number;
    }>
  > {
    if (this.#policies === null) {
      return {
        originalDays: generationPolicyDefaults.originalRetentionDays,
        referenceDays: generationPolicyDefaults.referenceRetentionDays,
      };
    }
    const snapshot = await this.#policies.find({
      actorMembershipId: command.ownerMembershipId,
      at: this.#clock().toISOString(),
      organizationId: command.organizationId,
    });
    return {
      originalDays:
        snapshot?.policy.originalRetentionDays ??
        generationPolicyDefaults.originalRetentionDays,
      referenceDays:
        snapshot?.policy.referenceRetentionDays ??
        generationPolicyDefaults.referenceRetentionDays,
    };
  }

  /**
   * El nombre almacenado se deriva del contenido en lugar de conservar el del
   * archivo original. El ciclo de medios exige que la extensión coincida con el
   * contenido real y usa el nombre para reconocer una reserva repetida; un
   * nombre elegido por quien sube la foto rompería las dos cosas.
   */
  async #store(
    command: IngestVisualInputCommand,
    artifact: PreparedVisualArtifact,
    mediaAssetId: string,
    kind: string,
    retentionUntil: string,
  ): Promise<MediaAssetRecord> {
    return this.#media.upload({
      bytes: artifact.bytes,
      declaredMimeType: artifact.mimeType,
      mediaAssetId,
      organizationId: command.organizationId,
      origin: "uploaded",
      originalFileName: `${command.role}-${kind}-${artifact.sha256.slice(0, 16)}.${extensionFor(artifact.mimeType)}`,
      ownerMembershipId: command.ownerMembershipId,
      retentionUntil,
    });
  }
}
