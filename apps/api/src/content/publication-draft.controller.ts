import type {
  AuthenticatedSessionRecord,
  PublicationStatus,
} from "@aramayo/domain";
import type {
  PublicationDraftResponse,
  PublicationListResponse,
  PublicationRevisionListResponse,
} from "@aramayo/contracts";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import {
  CreatePublicationDraftDto,
  PublicationListQueryDto,
  PublicationRevisionListQueryDto,
  UpdatePublicationDraftDto,
} from "./dto/publication-draft.dto.ts";
import {
  PublicationDraftService,
  type PublicationDraftSubmission,
  type UpdatePublicationDraftSubmission,
} from "./publication-draft.service.ts";

function createSubmission(
  input: CreatePublicationDraftDto,
): PublicationDraftSubmission {
  return {
    content: {
      caption: input.content.caption,
      products: input.content.products.map((product) => ({
        label: product.label,
        reference: product.reference,
      })),
    },
    design: {
      content: input.design.content,
      format: input.design.format,
      layout: input.design.layout,
      media: input.design.media.map((media) => ({
        alt: media.alt,
        ...(media.fit === undefined ? {} : { fit: media.fit }),
        ...(media.focus === undefined
          ? {}
          : { focus: { x: media.focus.x, y: media.focus.y } }),
        mediaAssetId: media.mediaAssetId,
        ...(media.zoom === undefined ? {} : { zoom: media.zoom }),
      })),
      schemaVersion: input.design.schemaVersion,
      slug: input.design.slug,
      theme: input.design.theme,
    },
    ...(input.locationId === undefined ? {} : { locationId: input.locationId }),
    title: input.title,
  };
}

function updateSubmission(
  input: UpdatePublicationDraftDto,
): UpdatePublicationDraftSubmission {
  return {
    ...createSubmission(input),
    expectedVersion: input.expectedVersion,
  };
}

@Controller("publications")
export class PublicationDraftController {
  readonly #service: PublicationDraftService;

  constructor(service: PublicationDraftService) {
    this.#service = service;
  }

  @Post()
  @RequirePermission("content:edit")
  create(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() input: CreatePublicationDraftDto,
  ): Promise<PublicationDraftResponse> {
    return this.#service.create(session.actor, createSubmission(input));
  }

  @Get()
  @RequirePermission("content:read")
  list(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Query() query: PublicationListQueryDto,
  ): Promise<PublicationListResponse> {
    return this.#service.list(session.actor, {
      limit: query.limit,
      page: query.page,
      ...(query.locationId === undefined
        ? {}
        : { locationId: query.locationId }),
      ...(query.status === undefined
        ? {}
        : { status: query.status satisfies PublicationStatus }),
    });
  }

  @Get(":publicationId")
  @RequirePermission("content:read")
  findById(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe({ version: "4" }))
    publicationId: string,
  ): Promise<PublicationDraftResponse> {
    return this.#service.findById(session.actor, publicationId);
  }

  @Get(":publicationId/revisions")
  @RequirePermission("content:read")
  listRevisions(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe({ version: "4" }))
    publicationId: string,
    @Query() query: PublicationRevisionListQueryDto,
  ): Promise<PublicationRevisionListResponse> {
    return this.#service.listRevisions(
      session.actor,
      publicationId,
      query.page,
      query.limit,
    );
  }

  @Patch(":publicationId")
  @RequirePermission("content:edit")
  update(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("publicationId", new ParseUUIDPipe({ version: "4" }))
    publicationId: string,
    @Body() input: UpdatePublicationDraftDto,
  ): Promise<PublicationDraftResponse> {
    return this.#service.update(
      session.actor,
      publicationId,
      updateSubmission(input),
    );
  }
}
