import { createHash, randomUUID } from "node:crypto";

import type {
  PaginatedResponse,
  PublicationDraftContentResponse,
  PublicationDraftResponse,
  PublicationListResponse,
  PublicationRevisionListResponse,
  PublicationRevisionResponse,
} from "@aramayo/contracts";
import {
  DESIGN_SCHEMA_VERSION,
  describeIssues,
  parseDesignDocument,
  type DesignDocument,
  type MediaFit,
  type MediaFocus,
} from "@aramayo/design-engine";
import {
  authorizeActor,
  normalizePublicationDraftContent,
  PublicationDraftValidationError,
  type AuthenticatedActor,
  type MediaAssetRecord,
  type MediaAssetRepository,
  type PublicationDraftContent,
  type PublicationDraftDetailRecord,
  type PublicationDraftListFilter,
  type PublicationDraftListItemRecord,
  type PublicationDraftRepository,
  type PublicationRevisionRecord,
  type PublicationStatus,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import {
  MEDIA_ASSET_REPOSITORY,
  PUBLICATION_DRAFT_REPOSITORY,
} from "../database/database.tokens.ts";
import { ReliableOperationService } from "../audit/reliable-operation.service.ts";

export interface DraftProductSubmission {
  readonly label: string;
  readonly reference: string;
}

export interface DraftMediaSubmission {
  readonly alt: string;
  readonly fit?: MediaFit;
  readonly focus?: MediaFocus;
  readonly mediaAssetId: string;
  readonly zoom?: number;
}

export interface DraftDesignContentSubmission {
  readonly badge?: string;
  readonly branch?: string;
  readonly callToAction?: string;
  readonly category?: string;
  readonly icon?: string;
  readonly items?: readonly string[];
  readonly phone?: string;
  readonly previousPrice?: string;
  readonly price?: string;
  readonly subtitle?: string;
  readonly title: string;
  readonly validity?: string;
}

export interface DraftDesignSubmission {
  readonly content: DraftDesignContentSubmission;
  readonly format: string;
  readonly layout: string;
  readonly media: readonly DraftMediaSubmission[];
  readonly schemaVersion: number;
  readonly slug: string;
  readonly theme: string;
}

export interface PublicationDraftSubmission {
  readonly content: {
    readonly caption: string;
    readonly products: readonly DraftProductSubmission[];
  };
  readonly design: DraftDesignSubmission;
  readonly locationId?: string;
  readonly title: string;
}

export interface UpdatePublicationDraftSubmission extends PublicationDraftSubmission {
  readonly expectedVersion: number;
}

export interface PublicationListInput {
  readonly limit: number;
  readonly locationId?: string;
  readonly page: number;
  readonly status?: PublicationStatus;
}

function controlledMediaUrl(asset: MediaAssetRecord): string {
  if (
    asset.status !== "available" ||
    asset.storageProvider !== "cloudinary" ||
    asset.secureUrl === undefined ||
    asset.checksumSha256 === undefined ||
    asset.height === undefined ||
    asset.mimeType === undefined ||
    asset.storageVersion === undefined ||
    asset.width === undefined
  ) {
    throw new NotFoundException(
      "No se encontró uno de los medios solicitados.",
    );
  }
  return asset.secureUrl;
}

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function contentObject(value: unknown): PublicationDraftContent {
  if (!isUnknownRecord(value)) {
    throw new InternalServerErrorException(
      "La revisión conserva contenido inválido.",
    );
  }
  const caption = value["caption"];
  const products = value["products"];
  if (typeof caption !== "string" || !isUnknownArray(products)) {
    throw new InternalServerErrorException(
      "La revisión conserva contenido inválido.",
    );
  }
  const parsedProducts = products.map((product) => {
    if (!isUnknownRecord(product)) {
      throw new InternalServerErrorException(
        "La revisión conserva productos inválidos.",
      );
    }
    const label = product["label"];
    const reference = product["reference"];
    if (typeof label !== "string" || typeof reference !== "string") {
      throw new InternalServerErrorException(
        "La revisión conserva productos inválidos.",
      );
    }
    return { label, reference };
  });
  try {
    return normalizePublicationDraftContent({
      caption,
      products: parsedProducts,
    });
  } catch {
    throw new InternalServerErrorException(
      "La revisión conserva contenido inválido.",
    );
  }
}

function designDocument(value: unknown): DesignDocument {
  const parsed = parseDesignDocument(value);
  if (!parsed.ok) {
    throw new InternalServerErrorException(
      "La revisión conserva un documento de diseño inválido.",
    );
  }
  return parsed.document;
}

function revisionResponse(
  revision: PublicationRevisionRecord,
): PublicationRevisionResponse {
  return Object.freeze({
    ...(revision.approvalSnapshotId === undefined
      ? {}
      : { approvalSnapshotId: revision.approvalSnapshotId }),
    ...(revision.approvedAt === undefined
      ? {}
      : { approvedAt: revision.approvedAt }),
    content: contentObject(
      revision.content,
    ) satisfies PublicationDraftContentResponse,
    contentHash: revision.contentHash,
    createdAt: revision.createdAt,
    createdByMembershipId: revision.createdByMembershipId,
    designDocument: designDocument(revision.designDocument),
    id: revision.id,
    media: revision.media,
    revisionNumber: revision.revisionNumber,
    status: revision.status,
  });
}

function detailResponse(
  detail: PublicationDraftDetailRecord,
): PublicationDraftResponse {
  return Object.freeze({
    createdAt: detail.publication.createdAt,
    id: detail.publication.id,
    latestRevision: revisionResponse(detail.latestRevision),
    ...(detail.publication.locationId === undefined
      ? {}
      : { locationId: detail.publication.locationId }),
    status: detail.publication.status,
    title: detail.publication.title,
    updatedAt: detail.publication.updatedAt,
    version: detail.publication.version,
  });
}

function listItemResponse(
  item: PublicationDraftListItemRecord,
): PublicationListResponse["items"][number] {
  return Object.freeze({
    createdAt: item.createdAt,
    id: item.id,
    latestContentHash: item.latestContentHash,
    latestRevisionId: item.latestRevisionId,
    latestRevisionNumber: item.latestRevisionNumber,
    ...(item.locationId === undefined ? {} : { locationId: item.locationId }),
    status: item.status,
    title: item.title,
    updatedAt: item.updatedAt,
    version: item.version,
  });
}

function paginatedResponse<Input, Output>(
  page: PaginatedResponse<Input>,
  mapEntry: (entry: Input) => Output,
): PaginatedResponse<Output> {
  return Object.freeze({
    items: Object.freeze(page.items.map(mapEntry)),
    limit: page.limit,
    page: page.page,
    total: page.total,
  });
}

@Injectable()
export class PublicationDraftService {
  readonly #media: MediaAssetRepository;
  readonly #reliableOperations: ReliableOperationService;
  readonly #repository: PublicationDraftRepository;

  constructor(
    @Inject(PUBLICATION_DRAFT_REPOSITORY)
    repository: PublicationDraftRepository,
    @Inject(MEDIA_ASSET_REPOSITORY)
    media: MediaAssetRepository,
    reliableOperations: ReliableOperationService,
  ) {
    this.#repository = repository;
    this.#media = media;
    this.#reliableOperations = reliableOperations;
  }

  async create(
    actor: AuthenticatedActor,
    submission: PublicationDraftSubmission,
    idempotencyKey?: string,
  ): Promise<PublicationDraftResponse> {
    this.#require(actor, "content:edit");
    const prepared = await this.#prepare(actor, submission);
    const result = await this.#repository.create({
      ...prepared,
      publicationId: randomUUID(),
      reliableOperation: this.#prepareReliableOperation(
        actor,
        "content.publication:create",
        idempotencyKey,
        submission,
      ),
      revisionId: randomUUID(),
    });
    switch (result.status) {
      case "created":
        return detailResponse(result.detail);
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma operación todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-reference":
      case "not-found":
        throw new NotFoundException(
          "No se encontró una referencia válida para el borrador.",
        );
    }
  }

  async findById(
    actor: AuthenticatedActor,
    publicationId: string,
  ): Promise<PublicationDraftResponse> {
    this.#require(actor, "content:read");
    const detail = await this.#repository.findById(
      { organizationId: actor.organizationId },
      publicationId,
    );
    if (detail === null) {
      throw new NotFoundException("No se encontró la publicación.");
    }
    return detailResponse(detail);
  }

  async list(
    actor: AuthenticatedActor,
    input: PublicationListInput,
  ): Promise<PublicationListResponse> {
    this.#require(actor, "content:read");
    const filter: PublicationDraftListFilter = {
      limit: input.limit,
      organizationId: actor.organizationId,
      page: input.page,
      ...(input.locationId === undefined
        ? {}
        : { locationId: input.locationId }),
      ...(input.status === undefined ? {} : { status: input.status }),
    };
    return paginatedResponse(
      await this.#repository.list(filter),
      listItemResponse,
    );
  }

  async listRevisions(
    actor: AuthenticatedActor,
    publicationId: string,
    page: number,
    limit: number,
  ): Promise<PublicationRevisionListResponse> {
    this.#require(actor, "content:read");
    const detail = await this.#repository.findById(
      { organizationId: actor.organizationId },
      publicationId,
    );
    if (detail === null) {
      throw new NotFoundException("No se encontró la publicación.");
    }
    return paginatedResponse(
      await this.#repository.listRevisions({
        limit,
        organizationId: actor.organizationId,
        page,
        publicationId,
      }),
      revisionResponse,
    );
  }

  async update(
    actor: AuthenticatedActor,
    publicationId: string,
    submission: UpdatePublicationDraftSubmission,
    idempotencyKey?: string,
  ): Promise<PublicationDraftResponse> {
    this.#require(actor, "content:edit");
    const prepared = await this.#prepare(actor, submission);
    const result = await this.#repository.update({
      ...prepared,
      expectedVersion: submission.expectedVersion,
      publicationId,
      reliableOperation: this.#prepareReliableOperation(
        actor,
        "content.publication:update",
        idempotencyKey,
        { publicationId, submission },
      ),
      revisionId: randomUUID(),
    });
    switch (result.status) {
      case "updated":
        return detailResponse(result.detail);
      case "conflict":
        throw new ConflictException(
          "El borrador cambió en otra sesión. Recargá antes de guardar.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma operación todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-state":
        throw new ConflictException(
          "La publicación ya no admite edición como borrador.",
        );
      case "invalid-reference":
      case "not-found":
        throw new NotFoundException(
          "No se encontró una referencia válida para el borrador.",
        );
    }
  }

  #prepareReliableOperation(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string | undefined,
    requestPayload: unknown,
  ): Parameters<PublicationDraftRepository["create"]>[0]["reliableOperation"] {
    if (idempotencyKey === undefined) {
      throw new BadRequestException(
        "El encabezado Idempotency-Key es obligatorio.",
      );
    }
    try {
      return this.#reliableOperations.prepare(
        actor,
        operation,
        idempotencyKey,
        requestPayload,
        new Date(),
      );
    } catch (cause: unknown) {
      if (cause instanceof RangeError || cause instanceof TypeError) {
        throw new BadRequestException(
          "El encabezado Idempotency-Key o la solicitud no son válidos.",
        );
      }
      throw cause;
    }
  }

  async #prepare(
    actor: AuthenticatedActor,
    submission: PublicationDraftSubmission,
  ): Promise<
    Omit<
      Parameters<PublicationDraftRepository["create"]>[0],
      "publicationId" | "reliableOperation" | "revisionId"
    >
  > {
    let content: PublicationDraftContent;
    try {
      content = normalizePublicationDraftContent({
        caption: submission.content.caption,
        products: submission.content.products,
      });
    } catch (cause: unknown) {
      if (cause instanceof PublicationDraftValidationError) {
        throw new BadRequestException({
          field: cause.field,
          message: cause.message,
        });
      }
      throw cause;
    }

    const mediaAssetIds = submission.design.media.map(
      (media) => media.mediaAssetId,
    );
    if (new Set(mediaAssetIds).size !== mediaAssetIds.length) {
      throw new BadRequestException({
        field: "design.media",
        message: "Un medio no puede ocupar más de una ranura.",
      });
    }
    const mediaAssets = await this.#media.findAvailableByIds(
      { organizationId: actor.organizationId },
      mediaAssetIds,
    );
    const mediaById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
    if (mediaAssets.length !== mediaAssetIds.length) {
      throw new NotFoundException(
        "No se encontró uno de los medios solicitados.",
      );
    }

    const rawDesignDocument = {
      content: submission.design.content,
      format: submission.design.format,
      layout: submission.design.layout,
      media: submission.design.media.map((media) => {
        const asset = mediaById.get(media.mediaAssetId);
        if (asset === undefined) {
          throw new NotFoundException(
            "No se encontró uno de los medios solicitados.",
          );
        }
        return {
          alt: media.alt,
          ...(media.fit === undefined ? {} : { fit: media.fit }),
          ...(media.focus === undefined ? {} : { focus: media.focus }),
          reference: {
            source: "remote",
            url: controlledMediaUrl(asset),
          },
          ...(media.zoom === undefined ? {} : { zoom: media.zoom }),
        };
      }),
      schemaVersion: submission.design.schemaVersion,
      slug: submission.design.slug,
      theme: submission.design.theme,
    };
    const parsedDesign = parseDesignDocument(rawDesignDocument);
    if (!parsedDesign.ok) {
      throw new BadRequestException({
        issues: parsedDesign.issues,
        message: describeIssues(parsedDesign.issues),
      });
    }
    const title = submission.title.trim();
    if (title.length < 1 || title.length > 180) {
      throw new BadRequestException({
        field: "title",
        message: "El título no cumple la longitud permitida.",
      });
    }
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          content,
          designDocument: parsedDesign.document,
          media: submission.design.media.map((media) => {
            const asset = mediaById.get(media.mediaAssetId);
            if (asset === undefined) {
              throw new NotFoundException(
                "No se encontró uno de los medios solicitados.",
              );
            }
            return {
              checksumSha256: asset.checksumSha256,
              id: asset.id,
              storageVersion: asset.storageVersion,
            };
          }),
        }),
      )
      .digest("hex");

    return Object.freeze({
      content,
      contentHash,
      createdByMembershipId: actor.membershipId,
      designDocument: parsedDesign.document,
      ...(submission.locationId === undefined
        ? {}
        : { locationId: submission.locationId }),
      media: Object.freeze(
        submission.design.media.map((media, index) =>
          Object.freeze({
            alt: media.alt.trim(),
            mediaAssetId: media.mediaAssetId,
            slot: `media-${String(index).padStart(2, "0")}`,
          }),
        ),
      ),
      organizationId: actor.organizationId,
      schemaVersion: DESIGN_SCHEMA_VERSION,
      title,
    });
  }

  #require(
    actor: AuthenticatedActor,
    permission: "content:edit" | "content:read",
  ): void {
    const decision = authorizeActor(actor, permission, actor.organizationId);
    if (!decision.allowed) {
      throw new ForbiddenException(
        "No tenés permisos para realizar esta acción.",
      );
    }
  }
}
