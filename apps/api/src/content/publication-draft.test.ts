import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { DESIGN_SCHEMA_VERSION } from "@aramayo/design-engine";
import type {
  AuthenticatedActor,
  AuthenticatedSessionRecord,
  BeginMediaDeletionResult,
  MediaAssetRecord,
  MediaAssetRepository,
  MediaStateMutationResult,
  MediaUploadReservation,
  OrganizationScope,
  PaginatedRecords,
  PersistPublicationDraftInput,
  PersistPublicationDraftUpdateInput,
  PublicationDraftCreateResult,
  PublicationDraftDetailRecord,
  PublicationDraftListFilter,
  PublicationDraftListItemRecord,
  PublicationDraftRepository,
  PublicationDraftUpdateResult,
  PublicationRevisionListFilter,
  PublicationRevisionMediaRecord,
  PublicationRevisionRecord,
  ReliableMutationContext,
} from "@aramayo/domain";
import {
  ConflictException,
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NextFunction, Response } from "express";
import supertest from "supertest";

import {
  MEDIA_ASSET_REPOSITORY,
  PUBLICATION_DRAFT_REPOSITORY,
} from "../database/database.tokens.ts";
import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import type { AuthenticatedRequest } from "../identity/identity.decorators.ts";
import { PublicationDraftController } from "./publication-draft.controller.ts";
import {
  PublicationDraftService,
  type PublicationDraftSubmission,
} from "./publication-draft.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const membershipId = "10000000-0000-4000-8000-000000000002";
const mediaAssetId = "10000000-0000-4000-8000-000000000003";
const controlledUrl =
  "https://res.cloudinary.com/aramayo/image/upload/v1/producto.png";
const idempotencyKey = "publication-test-key-0001";

const actor: AuthenticatedActor = Object.freeze({
  displayName: "Editora Aramayo",
  email: "editora@aramayo.invalid",
  membershipId,
  organizationId,
  roles: Object.freeze(["editor"] as const),
  sessionId: "10000000-0000-4000-8000-000000000004",
  userId: "10000000-0000-4000-8000-000000000005",
});

const session: AuthenticatedSessionRecord = Object.freeze({
  actor,
  csrfTokenHash: "hash",
  expiresAt: "2026-07-29T12:00:00.000Z",
});

const availableMedia: MediaAssetRecord = Object.freeze({
  byteSize: "1024",
  checksumSha256: "a".repeat(64),
  createdAt: "2026-07-28T12:00:00.000Z",
  height: 1350,
  id: mediaAssetId,
  mimeType: "image/png",
  organizationId,
  origin: "uploaded",
  originalFileName: "producto.png",
  ownerMembershipId: membershipId,
  secureUrl: controlledUrl,
  status: "available",
  storageKey: `${organizationId}/${mediaAssetId}`,
  storageProvider: "cloudinary",
  storageVersion: 1,
  updatedAt: "2026-07-28T12:00:00.000Z",
  width: 1080,
});

function submission(
  title = "Taladros para el taller",
): PublicationDraftSubmission {
  return {
    content: {
      caption: "  Consultá modelos disponibles. ",
      products: [{ label: " Taladro 13 mm ", reference: "SKU:TA-13" }],
    },
    design: {
      content: {
        callToAction: "Consultá stock",
        subtitle: "Opciones para distintos trabajos.",
        title,
      },
      format: "feed",
      layout: "producto-destacado",
      media: [
        {
          alt: "Taladro sobre banco de trabajo",
          mediaAssetId,
        },
      ],
      schemaVersion: DESIGN_SCHEMA_VERSION,
      slug: "producto-destacado-taladro",
      theme: "taller",
    },
    title,
  };
}

function revisionMedia(
  input: PersistPublicationDraftInput,
): readonly PublicationRevisionMediaRecord[] {
  return Object.freeze(
    input.media.map((media) =>
      Object.freeze({
        alt: media.alt,
        checksumSha256: availableMedia.checksumSha256 ?? "",
        height: availableMedia.height ?? 0,
        mediaAssetId: media.mediaAssetId,
        mimeType: availableMedia.mimeType ?? "",
        secureUrl: availableMedia.secureUrl ?? "",
        slot: media.slot,
        storageVersion: availableMedia.storageVersion ?? 0,
        width: availableMedia.width ?? 0,
      }),
    ),
  );
}

function revision(
  input: PersistPublicationDraftInput,
  revisionNumber: number,
): PublicationRevisionRecord {
  return Object.freeze({
    content: input.content,
    contentHash: input.contentHash,
    createdAt: new Date(
      Date.UTC(2026, 6, 28, 12, revisionNumber),
    ).toISOString(),
    createdByMembershipId: input.createdByMembershipId,
    designDocument: input.designDocument,
    id: input.revisionId,
    media: revisionMedia(input),
    organizationId: input.organizationId,
    publicationId: input.publicationId,
    revisionNumber,
    schemaVersion: input.schemaVersion,
    status: "draft",
  });
}

class InMemoryPublicationDraftRepository implements PublicationDraftRepository {
  readonly details = new Map<string, PublicationDraftDetailRecord>();
  readonly histories = new Map<string, PublicationRevisionRecord[]>();
  lastCreateInput: PersistPublicationDraftInput | undefined;

  create(
    input: PersistPublicationDraftInput,
  ): Promise<PublicationDraftCreateResult> {
    this.lastCreateInput = input;
    if (this.details.has(input.publicationId)) {
      return Promise.resolve({ status: "not-found" });
    }
    const firstRevision = revision(input, 1);
    const timestamp = "2026-07-28T12:01:00.000Z";
    const detail: PublicationDraftDetailRecord = Object.freeze({
      latestRevision: firstRevision,
      publication: Object.freeze({
        createdAt: timestamp,
        id: input.publicationId,
        ...(input.locationId === undefined
          ? {}
          : { locationId: input.locationId }),
        organizationId: input.organizationId,
        status: "draft",
        title: input.title,
        updatedAt: timestamp,
        version: 1,
      }),
    });
    this.details.set(input.publicationId, detail);
    this.histories.set(input.publicationId, [firstRevision]);
    return Promise.resolve({ detail, status: "created" });
  }

  findById(
    scope: OrganizationScope,
    publicationId: string,
  ): Promise<PublicationDraftDetailRecord | null> {
    const detail = this.details.get(publicationId);
    return Promise.resolve(
      detail?.publication.organizationId === scope.organizationId
        ? detail
        : null,
    );
  }

  list(
    filter: PublicationDraftListFilter,
  ): Promise<PaginatedRecords<PublicationDraftListItemRecord>> {
    const matching = [...this.details.values()]
      .filter(
        ({ publication }) =>
          publication.organizationId === filter.organizationId &&
          (filter.status === undefined ||
            publication.status === filter.status) &&
          (filter.locationId === undefined ||
            publication.locationId === filter.locationId),
      )
      .map(({ latestRevision, publication }) =>
        Object.freeze({
          ...publication,
          latestContentHash: latestRevision.contentHash,
          latestRevisionId: latestRevision.id,
          latestRevisionNumber: latestRevision.revisionNumber,
        }),
      );
    const offset = (filter.page - 1) * filter.limit;
    return Promise.resolve(
      Object.freeze({
        items: Object.freeze(matching.slice(offset, offset + filter.limit)),
        limit: filter.limit,
        page: filter.page,
        total: matching.length,
      }),
    );
  }

  listRevisions(
    filter: PublicationRevisionListFilter,
  ): Promise<PaginatedRecords<PublicationRevisionRecord>> {
    const revisions = this.histories.get(filter.publicationId) ?? [];
    const ordered = [...revisions].reverse();
    const offset = (filter.page - 1) * filter.limit;
    return Promise.resolve(
      Object.freeze({
        items: Object.freeze(ordered.slice(offset, offset + filter.limit)),
        limit: filter.limit,
        page: filter.page,
        total: revisions.length,
      }),
    );
  }

  update(
    input: PersistPublicationDraftUpdateInput,
  ): Promise<PublicationDraftUpdateResult> {
    const current = this.details.get(input.publicationId);
    if (
      current === undefined ||
      current.publication.organizationId !== input.organizationId
    ) {
      return Promise.resolve({ status: "not-found" });
    }
    if (current.publication.version !== input.expectedVersion) {
      return Promise.resolve({ status: "conflict" });
    }
    if (current.publication.status !== "draft") {
      return Promise.resolve({ status: "invalid-state" });
    }
    const nextRevision = revision(
      input,
      current.latestRevision.revisionNumber + 1,
    );
    const detail: PublicationDraftDetailRecord = Object.freeze({
      latestRevision: nextRevision,
      publication: Object.freeze({
        ...current.publication,
        ...(input.locationId === undefined
          ? {}
          : { locationId: input.locationId }),
        title: input.title,
        updatedAt: nextRevision.createdAt,
        version: current.publication.version + 1,
      }),
    });
    this.details.set(input.publicationId, detail);
    this.histories.set(input.publicationId, [
      ...(this.histories.get(input.publicationId) ?? []),
      nextRevision,
    ]);
    return Promise.resolve({ detail, status: "updated" });
  }
}

class InMemoryMediaAssetRepository implements MediaAssetRepository {
  availableAssets: readonly MediaAssetRecord[] = Object.freeze([
    availableMedia,
  ]);

  auditRetention(): Promise<void> {
    return Promise.resolve();
  }

  beginDeletion(): Promise<BeginMediaDeletionResult> {
    throw new Error("Not used by publication draft tests.");
  }

  completeDeletion(): Promise<MediaStateMutationResult> {
    throw new Error("Not used by publication draft tests.");
  }

  completeUpload(): Promise<MediaStateMutationResult> {
    throw new Error("Not used by publication draft tests.");
  }

  failUpload(): Promise<MediaStateMutationResult> {
    throw new Error("Not used by publication draft tests.");
  }

  findAvailableByIds(
    scope: OrganizationScope,
    mediaAssetIds: readonly string[],
  ): Promise<readonly MediaAssetRecord[]> {
    return Promise.resolve(
      Object.freeze(
        this.availableAssets.filter(
          (asset) =>
            asset.organizationId === scope.organizationId &&
            mediaAssetIds.includes(asset.id),
        ),
      ),
    );
  }

  findById(
    scope: OrganizationScope,
    requestedMediaAssetId: string,
  ): Promise<MediaAssetRecord | null> {
    return Promise.resolve(
      this.availableAssets.find(
        (asset) =>
          asset.organizationId === scope.organizationId &&
          asset.id === requestedMediaAssetId,
      ) ?? null,
    );
  }

  findExpiredUnreferenced(): Promise<readonly []> {
    return Promise.resolve([]);
  }

  reserveUpload(): Promise<MediaUploadReservation> {
    throw new Error("Not used by publication draft tests.");
  }
}

const reliableOperationService = {
  prepare(
    preparedActor: AuthenticatedActor,
    operation: string,
  ): ReliableMutationContext {
    const occurredAt = new Date().toISOString();
    return {
      auditEventId: randomUUID(),
      claim: {
        actorMembershipId: preparedActor.membershipId,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        keyHash: "a".repeat(64),
        operation,
        organizationId: preparedActor.organizationId,
        requestHash: "b".repeat(64),
      },
      completedExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      occurredAt,
      outboxEventId: randomUUID(),
    };
  },
} satisfies Pick<ReliableOperationService, "prepare">;

async function serviceFor(
  repository: PublicationDraftRepository,
  media: MediaAssetRepository,
): Promise<PublicationDraftService> {
  const testingModule = await Test.createTestingModule({
    providers: [
      PublicationDraftService,
      { provide: PUBLICATION_DRAFT_REPOSITORY, useValue: repository },
      { provide: MEDIA_ASSET_REPOSITORY, useValue: media },
      {
        provide: ReliableOperationService,
        useValue: reliableOperationService,
      },
    ],
  }).compile();
  return testingModule.get(PublicationDraftService);
}

test("el servicio normaliza el borrador y sólo persiste URLs controladas", async () => {
  const repository = new InMemoryPublicationDraftRepository();
  const service = await serviceFor(
    repository,
    new InMemoryMediaAssetRepository(),
  );

  const created = await service.create(actor, submission(), idempotencyKey);
  const persisted = repository.lastCreateInput;

  if (persisted === undefined) {
    assert.fail("El servicio no entregó el borrador al repositorio.");
  }
  assert.equal(persisted.content.caption, "Consultá modelos disponibles.");
  const persistedProduct = persisted.content.products[0];
  if (persistedProduct === undefined) {
    assert.fail("El servicio perdió la referencia comercial.");
  }
  assert.equal(persistedProduct.label, "Taladro 13 mm");
  const persistedMedia = created.latestRevision.designDocument.media[0];
  if (persistedMedia === undefined) {
    assert.fail("El servicio perdió el medio del documento de diseño.");
  }
  const reference = persistedMedia.reference;
  assert.equal(reference.source, "remote");
  assert.equal(reference.url, controlledUrl);
  assert.match(created.latestRevision.contentHash, /^[a-f0-9]{64}$/u);
});

test("el servicio rechaza medios fuera del scope antes de persistir", async () => {
  const repository = new InMemoryPublicationDraftRepository();
  const media = new InMemoryMediaAssetRepository();
  media.availableAssets = Object.freeze([]);
  const service = await serviceFor(repository, media);

  await assert.rejects(
    service.create(actor, submission(), idempotencyKey),
    NotFoundException,
  );
  assert.equal(repository.lastCreateInput, undefined);
});

test("el servicio representa una edición con versión vencida como conflicto", async () => {
  const repository = new InMemoryPublicationDraftRepository();
  const service = await serviceFor(
    repository,
    new InMemoryMediaAssetRepository(),
  );
  const created = await service.create(actor, submission(), idempotencyKey);

  await assert.rejects(
    service.update(
      actor,
      created.id,
      {
        ...submission("Título actualizado"),
        expectedVersion: 99,
      },
      "publication-update-key-0001",
    ),
    ConflictException,
  );
});

let application: INestApplication;
let baseUrl: string;
let httpRepository: InMemoryPublicationDraftRepository;

function isUnknownRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!isUnknownRecord(value)) {
    throw new Error("Expected an HTTP JSON object.");
  }
  return value;
}

function jsonArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected an HTTP JSON array.");
  }
  return value;
}

before(async () => {
  httpRepository = new InMemoryPublicationDraftRepository();
  const testingModule = await Test.createTestingModule({
    controllers: [PublicationDraftController],
    providers: [
      PublicationDraftService,
      {
        provide: PUBLICATION_DRAFT_REPOSITORY,
        useValue: httpRepository,
      },
      {
        provide: MEDIA_ASSET_REPOSITORY,
        useValue: new InMemoryMediaAssetRepository(),
      },
      {
        provide: ReliableOperationService,
        useValue: reliableOperationService,
      },
    ],
  }).compile();

  application = testingModule.createNestApplication();
  application.use(
    (
      request: AuthenticatedRequest,
      _response: Response,
      next: NextFunction,
    ) => {
      request.authenticationSession = session;
      next();
    },
  );
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await application.listen(0, "127.0.0.1");
  baseUrl = await application.getUrl();
});

after(async () => {
  await application.close();
});

test("el flujo HTTP crea, edita, versiona, filtra y consulta el borrador", async () => {
  const missingIdempotencyKey = await supertest(baseUrl)
    .post("/publications")
    .send(submission());
  assert.equal(missingIdempotencyKey.status, 400);

  const invalid = await supertest(baseUrl)
    .post("/publications")
    .set("Idempotency-Key", "http-invalid-key-0001")
    .send({ ...submission(), unexpected: true });
  assert.equal(invalid.status, 400);

  const created = await supertest(baseUrl)
    .post("/publications")
    .set("Idempotency-Key", "http-create-key-0001")
    .send(submission());
  assert.equal(created.status, 201);
  const createdPayload: unknown = created.body;
  const createdBody = jsonObject(createdPayload);
  const createdId = createdBody["id"];
  assert.equal(typeof createdId, "string");
  if (typeof createdId !== "string") {
    assert.fail("La creación HTTP no devolvió un UUID.");
  }

  const updated = await supertest(baseUrl)
    .patch(`/publications/${createdId}`)
    .set("Idempotency-Key", "http-update-key-0001")
    .send({
      ...submission("Taladros actualizados"),
      expectedVersion: 1,
    });
  assert.equal(updated.status, 200);
  const updatedPayload: unknown = updated.body;
  const updatedBody = jsonObject(updatedPayload);
  assert.equal(updatedBody["version"], 2);
  assert.equal(jsonObject(updatedBody["latestRevision"])["revisionNumber"], 2);

  const staleUpdate = await supertest(baseUrl)
    .patch(`/publications/${createdId}`)
    .set("Idempotency-Key", "http-stale-key-0001")
    .send({
      ...submission("Edición vencida"),
      expectedVersion: 1,
    });
  assert.equal(staleUpdate.status, 409);

  const detail = await supertest(baseUrl).get(`/publications/${createdId}`);
  assert.equal(detail.status, 200);
  const detailPayload: unknown = detail.body;
  assert.equal(jsonObject(detailPayload)["title"], "Taladros actualizados");

  const revisions = await supertest(baseUrl).get(
    `/publications/${createdId}/revisions?page=1&limit=1`,
  );
  assert.equal(revisions.status, 200);
  const revisionsPayload: unknown = revisions.body;
  const revisionsBody = jsonObject(revisionsPayload);
  const revisionItems = jsonArray(revisionsBody["items"]);
  assert.equal(revisionsBody["total"], 2);
  assert.equal(revisionItems.length, 1);
  assert.equal(jsonObject(revisionItems[0])["revisionNumber"], 2);

  const list = await supertest(baseUrl).get(
    "/publications?page=1&limit=10&status=draft",
  );
  assert.equal(list.status, 200);
  const listPayload: unknown = list.body;
  const listBody = jsonObject(listPayload);
  assert.equal(listBody["total"], 1);
  assert.equal(
    jsonObject(jsonArray(listBody["items"])[0])["latestRevisionNumber"],
    2,
  );
});
