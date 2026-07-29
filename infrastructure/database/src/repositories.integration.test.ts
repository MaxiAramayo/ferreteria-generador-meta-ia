import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  normalizeBrandConfigurationUpdate,
  normalizeLocationConfigurationUpdate,
  transitionPublication,
  type ReliableMutationContext,
} from "@aramayo/domain";

import { createDatabaseClient } from "./client.ts";
import {
  PrismaApprovalSnapshotRepository,
  PrismaIdentityRepository,
  PrismaMediaAssetRepository,
  PrismaPublicationRepository,
  PrismaPublicationStateRepository,
} from "./repositories.ts";
import { PrismaOrganizationConfigurationRepository } from "./organization-configuration-repository.ts";
import { PrismaPublicationDraftRepository } from "./publication-draft-repository.ts";
import { PrismaPublicationProductionRepository } from "./publication-production-repository.ts";
import {
  PrismaOutboxRepository,
  PrismaReliableOperationRepository,
} from "./reliable-operation-repository.ts";

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }
  return databaseUrl;
}

const databaseUrl = requiredDatabaseUrl();
const database = createDatabaseClient(databaseUrl);

function randomHash(): string {
  return randomUUID().replaceAll("-", "").repeat(2);
}

function reliableMutation(
  organizationId: string,
  actorMembershipId: string,
  operation: string,
): ReliableMutationContext {
  const occurredAt = new Date().toISOString();
  return Object.freeze({
    auditEventId: randomUUID(),
    claim: Object.freeze({
      actorMembershipId,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      keyHash: randomHash(),
      operation,
      organizationId,
      requestHash: randomHash(),
    }),
    completedExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    occurredAt,
    outboxEventId: randomUUID(),
  });
}

after(async () => {
  await database.$disconnect();
});

test("render y aprobación confirman una sola salida y un snapshot inmutable", async () => {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const approverUserId = randomUUID();
  const editorMembershipId = randomUUID();
  const approverMembershipId = randomUUID();
  const publicationId = randomUUID();
  const revisionId = randomUUID();
  const renderedMediaAssetId = randomUUID();
  await database.organization.create({
    data: {
      displayName: "Organización de vertical",
      id: organizationId,
      legalName: "Organización de vertical",
      slug: `vertical-${organizationId}`,
    },
  });
  await database.user.createMany({
    data: [
      {
        displayName: "Editora de vertical",
        email: `${userId}@vertical.invalid`,
        id: userId,
      },
      {
        displayName: "Aprobadora de vertical",
        email: `${approverUserId}@vertical.invalid`,
        id: approverUserId,
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: editorMembershipId,
        organizationId,
        roles: ["editor"],
        userId,
      },
      {
        id: approverMembershipId,
        organizationId,
        roles: ["approver"],
        userId: approverUserId,
      },
    ],
  });
  await database.publication.create({
    data: {
      createdByMembershipId: editorMembershipId,
      id: publicationId,
      organizationId,
      title: "Consejo determinista",
    },
  });
  await database.publicationRevision.create({
    data: {
      content: { caption: "Consultanos", products: [] },
      contentHash: "a".repeat(64),
      createdByMembershipId: editorMembershipId,
      designDocument: {
        content: {
          callToAction: "Consultanos por WhatsApp",
          title: "Consejo determinista",
        },
        format: "historia",
        layout: "historia-tip",
        media: [],
        schemaVersion: 1,
        slug: "consejo-determinista",
        theme: "taller",
      },
      id: revisionId,
      organizationId,
      publicationId,
      revisionNumber: 1,
      schemaVersion: 1,
    },
  });
  const repository = new PrismaPublicationProductionRepository(database);
  const renderRequest = await repository.requestRender({
    actorMembershipId: editorMembershipId,
    expectedVersion: 1,
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      editorMembershipId,
      "content.publication:request-render",
    ),
  });
  assert.equal(renderRequest.status, "accepted");
  const job = await repository.findRenderJob(
    organizationId,
    publicationId,
    revisionId,
  );
  assert.notEqual(job, null);
  if (job === null) {
    assert.fail("La intención debía ser recuperable por el worker.");
  }
  await database.mediaAsset.create({
    data: {
      byteSize: 128n,
      checksumSha256: "b".repeat(64),
      height: 1920,
      id: renderedMediaAssetId,
      mimeType: "image/png",
      organizationId,
      origin: "generated",
      originalFileName: `${revisionId}.png`,
      ownerMembershipId: editorMembershipId,
      secureUrl: "https://media.example.invalid/render.png",
      status: "available",
      storageKey: `render/${renderedMediaAssetId}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1080,
    },
  });
  const output = {
    byteSize: "128",
    checksumSha256: "b".repeat(64),
    height: 1920,
    mediaAssetId: renderedMediaAssetId,
    mimeType: "image/png" as const,
    renderedAt: new Date().toISOString(),
    secureUrl: "https://media.example.invalid/render.png",
    storageVersion: 1,
    width: 1080,
  };
  assert.deepEqual(await repository.completeRender(job, output), {
    status: "completed",
    version: 3,
  });
  assert.deepEqual(await repository.completeRender(job, output), {
    status: "already-completed",
    version: 3,
  });
  assert.equal(
    (await repository.findRenderJob(organizationId, publicationId, revisionId))
      ?.alreadyCompleted,
    true,
  );
  const approval = await repository.approve({
    actorMembershipId: approverMembershipId,
    expectedVersion: 3,
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      approverMembershipId,
      "content.publication:approve",
    ),
  });
  assert.equal(approval.status, "approved");
  const snapshot = await database.approvalSnapshot.findUniqueOrThrow({
    where: { id: approval.snapshotId },
  });
  assert.equal(snapshot.revisionId, revisionId);
  if (
    typeof snapshot.snapshot !== "object" ||
    snapshot.snapshot === null ||
    Array.isArray(snapshot.snapshot)
  ) {
    assert.fail("El snapshot debía conservar un documento restaurable.");
  }
  const renderedSnapshot = snapshot.snapshot["renderedMedia"];
  if (
    typeof renderedSnapshot !== "object" ||
    renderedSnapshot === null ||
    Array.isArray(renderedSnapshot)
  ) {
    assert.fail("El snapshot debía conservar el PNG aprobado.");
  }
  assert.equal(
    renderedSnapshot["checksumSha256"],
    output.checksumSha256,
    "restaurar el snapshot debe identificar exactamente el PNG aprobado",
  );
  await assert.rejects(
    database.approvalSnapshot.update({
      data: { snapshot: { tampered: true } },
      where: { id: snapshot.id },
    }),
  );
  assert.equal(
    await database.mediaAsset.count({
      where: { id: renderedMediaAssetId, organizationId },
    }),
    1,
  );
  assert.equal(
    await database.publicationRevision.count({
      where: { organizationId, publicationId },
    }),
    1,
    "renderizar y reintentar no deben crear revisiones",
  );
  const auditOperations = await database.auditEvent.findMany({
    orderBy: { occurredAt: "asc" },
    select: { operation: true },
    where: { entityId: publicationId, organizationId },
  });
  assert.deepEqual(auditOperations.map((event) => event.operation).sort(), [
    "content.publication:approve",
    "content.publication:render-complete",
    "content.publication:request-render",
  ]);
});

test("medios reservan, confirman y eliminan sin cruzar ownership ni referencias", async () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const mediaAssetId = randomUUID();
  const replacementMediaAssetId = randomUUID();
  const deletableMediaAssetId = randomUUID();
  const failedMediaAssetId = randomUUID();
  const publicationId = randomUUID();
  const revisionId = randomUUID();
  const approvalSnapshotId = randomUUID();

  await database.organization.createMany({
    data: [
      {
        displayName: "Organización de medios",
        id: organizationId,
        legalName: "Organización de medios",
        slug: `media-${organizationId}`,
      },
      {
        displayName: "Otra organización de medios",
        id: otherOrganizationId,
        legalName: "Otra organización de medios",
        slug: `media-${otherOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: "Propietaria de medios",
      email: `${userId}@media.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: {
      id: membershipId,
      organizationId,
      roles: ["editor"],
      userId,
    },
  });

  const repository = new PrismaMediaAssetRepository(database);
  assert.deepEqual(
    await repository.reserveUpload({
      id: randomUUID(),
      organizationId: otherOrganizationId,
      origin: "uploaded",
      originalFileName: "cruce.png",
      ownerMembershipId: membershipId,
      storageProvider: "cloudinary",
    }),
    { status: "not-found" },
  );

  const reservation = await repository.reserveUpload({
    id: mediaAssetId,
    organizationId,
    origin: "uploaded",
    originalFileName: "producto.png",
    ownerMembershipId: membershipId,
    storageProvider: "cloudinary",
  });
  assert.equal(reservation.status, "reserved");
  assert.equal(
    (
      await repository.reserveUpload({
        id: mediaAssetId,
        organizationId,
        origin: "uploaded",
        originalFileName: "producto.png",
        ownerMembershipId: membershipId,
        storageProvider: "cloudinary",
      })
    ).status,
    "existing",
  );

  const available = await repository.completeUpload({
    byteSize: "2048",
    checksumSha256: "c".repeat(64),
    height: 1080,
    mediaAssetId,
    mimeType: "image/png",
    organizationId,
    secureUrl:
      "https://res.cloudinary.com/demo/image/upload/v1/media/producto.png",
    storageKey: "media/producto",
    storageVersion: 1,
    width: 1080,
  });
  assert.equal(available.status, "updated");
  assert.equal(available.asset.status, "available");
  assert.equal(available.asset.ownerMembershipId, membershipId);

  await database.publication.create({
    data: {
      createdByMembershipId: membershipId,
      id: publicationId,
      organizationId,
      title: "Publicación con medio",
    },
  });
  await database.publicationRevision.create({
    data: {
      content: { title: "Publicación con medio" },
      contentHash: "c".repeat(64),
      createdByMembershipId: membershipId,
      designDocument: { layout: "producto-destacado" },
      id: revisionId,
      organizationId,
      publicationId,
      revisionNumber: 1,
      schemaVersion: 1,
    },
  });
  await database.publicationRevisionMedia.create({
    data: {
      alt: "Producto principal",
      mediaAssetId,
      organizationId,
      revisionId,
      slot: "primary",
    },
  });
  const approvedSnapshot = {
    media: [{ mediaAssetId, storageVersion: 1 }],
    title: "Publicación con medio",
  };
  await database.approvalSnapshot.create({
    data: {
      approvedAt: new Date(Date.now() - 1_000),
      approvedByMembershipId: membershipId,
      contentHash: "c".repeat(64),
      id: approvalSnapshotId,
      organizationId,
      publicationId,
      revisionId,
      snapshot: approvedSnapshot,
    },
  });
  assert.deepEqual(
    await repository.beginDeletion({
      mediaAssetId,
      organizationId,
      requestedAt: new Date().toISOString(),
    }),
    { status: "in-use" },
  );

  await repository.reserveUpload({
    id: replacementMediaAssetId,
    organizationId,
    origin: "uploaded",
    originalFileName: "producto-reemplazo.png",
    ownerMembershipId: membershipId,
    storageProvider: "cloudinary",
  });
  assert.equal(
    (
      await repository.completeUpload({
        byteSize: "4096",
        checksumSha256: "e".repeat(64),
        height: 1080,
        mediaAssetId: replacementMediaAssetId,
        mimeType: "image/png",
        organizationId,
        secureUrl:
          "https://res.cloudinary.com/demo/image/upload/v2/media/producto-reemplazo.png",
        storageKey: "media/producto-reemplazo",
        storageVersion: 2,
        width: 1080,
      })
    ).status,
    "updated",
  );
  assert.equal(
    (
      await database.publicationRevisionMedia.findUniqueOrThrow({
        where: {
          organizationId_revisionId_slot: {
            organizationId,
            revisionId,
            slot: "primary",
          },
        },
      })
    ).mediaAssetId,
    mediaAssetId,
  );
  assert.deepEqual(
    (
      await database.approvalSnapshot.findUniqueOrThrow({
        where: { id: approvalSnapshotId },
      })
    ).snapshot,
    approvedSnapshot,
  );

  await repository.reserveUpload({
    id: deletableMediaAssetId,
    organizationId,
    origin: "uploaded",
    originalFileName: "descartable.jpg",
    ownerMembershipId: membershipId,
    storageProvider: "cloudinary",
  });
  await repository.completeUpload({
    byteSize: "1024",
    checksumSha256: "d".repeat(64),
    height: 800,
    mediaAssetId: deletableMediaAssetId,
    mimeType: "image/jpeg",
    organizationId,
    secureUrl:
      "https://res.cloudinary.com/demo/image/upload/v2/media/descartable.jpg",
    storageKey: "media/descartable",
    storageVersion: 2,
    width: 1200,
  });
  await database.mediaAsset.update({
    data: { retentionUntil: new Date("2030-01-01T00:00:00.000Z") },
    where: { id: deletableMediaAssetId },
  });
  assert.deepEqual(
    await repository.beginDeletion({
      mediaAssetId: deletableMediaAssetId,
      organizationId,
      requestedAt: "2029-01-01T00:00:00.000Z",
    }),
    {
      retentionUntil: "2030-01-01T00:00:00.000Z",
      status: "retained",
    },
  );
  await database.mediaAsset.update({
    data: { retentionUntil: null },
    where: { id: deletableMediaAssetId },
  });
  const pendingDeletion = await repository.beginDeletion({
    mediaAssetId: deletableMediaAssetId,
    organizationId,
    requestedAt: new Date().toISOString(),
  });
  assert.equal(pendingDeletion.status, "ready");
  await assert.rejects(
    database.publicationRevisionMedia.create({
      data: {
        alt: "Medio descartable",
        mediaAssetId: deletableMediaAssetId,
        organizationId,
        revisionId,
        slot: "secondary",
      },
    }),
  );
  assert.equal(
    (
      await repository.completeDeletion({
        deletedAt: new Date().toISOString(),
        mediaAssetId: deletableMediaAssetId,
        organizationId,
      })
    ).status,
    "updated",
  );
  assert.equal(
    (await repository.findById({ organizationId }, deletableMediaAssetId))
      ?.status,
    "deleted",
  );

  await repository.reserveUpload({
    id: failedMediaAssetId,
    organizationId,
    origin: "uploaded",
    originalFileName: "fallido.png",
    ownerMembershipId: membershipId,
    storageProvider: "cloudinary",
  });
  const failed = await repository.failUpload({
    failureCode: "provider-unavailable",
    failureMessage: "El proveedor no respondió.",
    mediaAssetId: failedMediaAssetId,
    organizationId,
  });
  assert.equal(failed.status, "updated");
  assert.equal(failed.asset.status, "failed");
  assert.equal(failed.asset.failureCode, "provider-unavailable");
});

test("borradores versionan con ownership, concurrencia, rollback e historial inmutable", async () => {
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const mediaA = randomUUID();
  const mediaASecondary = randomUUID();
  const mediaB = randomUUID();
  const publicationId = randomUUID();
  const firstRevisionId = randomUUID();
  const checksumA = "1".repeat(64);
  const checksumASecondary = "2".repeat(64);
  const checksumB = "3".repeat(64);

  await database.organization.createMany({
    data: [
      {
        displayName: "Organización de borradores A",
        id: organizationA,
        legalName: "Organización de borradores A",
        slug: `draft-a-${organizationA}`,
      },
      {
        displayName: "Organización de borradores B",
        id: organizationB,
        legalName: "Organización de borradores B",
        slug: `draft-b-${organizationB}`,
      },
    ],
  });
  await database.user.createMany({
    data: [
      {
        displayName: "Editora de borradores A",
        email: `${userA}@draft.invalid`,
        id: userA,
      },
      {
        displayName: "Editora de borradores B",
        email: `${userB}@draft.invalid`,
        id: userB,
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: membershipA,
        organizationId: organizationA,
        roles: ["editor", "approver"],
        userId: userA,
      },
      {
        id: membershipB,
        organizationId: organizationB,
        roles: ["editor"],
        userId: userB,
      },
    ],
  });
  await database.mediaAsset.createMany({
    data: [
      {
        byteSize: 1024n,
        checksumSha256: checksumA,
        height: 1350,
        id: mediaA,
        mimeType: "image/png",
        organizationId: organizationA,
        origin: "uploaded",
        originalFileName: "producto-a.png",
        ownerMembershipId: membershipA,
        secureUrl:
          "https://res.cloudinary.com/demo/image/upload/v1/draft/producto-a.png",
        status: "available",
        storageKey: `draft/${mediaA}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
      {
        byteSize: 2048n,
        checksumSha256: checksumASecondary,
        height: 1350,
        id: mediaASecondary,
        mimeType: "image/png",
        organizationId: organizationA,
        origin: "uploaded",
        originalFileName: "producto-a-secundario.png",
        ownerMembershipId: membershipA,
        secureUrl:
          "https://res.cloudinary.com/demo/image/upload/v1/draft/producto-a-secundario.png",
        status: "available",
        storageKey: `draft/${mediaASecondary}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
      {
        byteSize: 1024n,
        checksumSha256: checksumB,
        height: 1350,
        id: mediaB,
        mimeType: "image/png",
        organizationId: organizationB,
        origin: "uploaded",
        originalFileName: "producto-b.png",
        ownerMembershipId: membershipB,
        secureUrl:
          "https://res.cloudinary.com/demo/image/upload/v1/draft/producto-b.png",
        status: "available",
        storageKey: `draft/${mediaB}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
    ],
  });

  const repository = new PrismaPublicationDraftRepository(database);
  const baseInput = {
    content: {
      caption: "Consultá modelos disponibles.",
      products: [{ label: "Taladro 13 mm", reference: "SKU:TA-13" }],
    },
    contentHash: "4".repeat(64),
    createdByMembershipId: membershipA,
    designDocument: {
      content: {
        callToAction: "Consultá stock",
        title: "Taladros para el taller",
      },
      format: "feed",
      layout: "producto-destacado",
      media: [
        {
          alt: "Taladro sobre banco de trabajo",
          reference: {
            source: "remote",
            url: "https://res.cloudinary.com/demo/image/upload/v1/draft/producto-a.png",
          },
        },
      ],
      schemaVersion: 1,
      slug: "producto-destacado-taladro",
      theme: "taller",
    },
    media: [
      {
        alt: "Taladro sobre banco de trabajo",
        mediaAssetId: mediaA,
        slot: "media-00",
      },
    ],
    organizationId: organizationA,
    publicationId,
    reliableOperation: reliableMutation(
      organizationA,
      membershipA,
      "content.publication:create",
    ),
    revisionId: firstRevisionId,
    schemaVersion: 1,
    title: "Taladros para el taller",
  } as const;

  const invalidOwnership = await repository.create({
    ...baseInput,
    media: [
      {
        alt: "Medio de otra organización",
        mediaAssetId: mediaB,
        slot: "media-00",
      },
    ],
  });
  assert.equal(invalidOwnership.status, "invalid-reference");
  assert.equal(
    await database.publication.count({ where: { id: publicationId } }),
    0,
  );
  assert.equal(
    await database.publicationRevision.count({
      where: { id: firstRevisionId },
    }),
    0,
  );

  const concurrentCreates = await Promise.all([
    repository.create(baseInput),
    repository.create(baseInput),
  ]);
  assert.deepEqual(
    concurrentCreates.map((result) => result.status),
    ["created", "created"],
  );
  assert.equal(
    concurrentCreates.filter(
      (result) => result.status === "created" && result.replayed === true,
    ).length,
    1,
  );
  const created = concurrentCreates[0];
  if (created.status !== "created") {
    assert.fail("La creación concurrente no devolvió el borrador.");
  }
  assert.equal(created.detail.publication.version, 1);
  assert.equal(created.detail.latestRevision.media[0]?.mediaAssetId, mediaA);
  assert.equal(
    await database.idempotencyRecord.count({
      where: {
        actorMembershipId: membershipA,
        keyHash: baseInput.reliableOperation.claim.keyHash,
        operation: baseInput.reliableOperation.claim.operation,
        organizationId: organizationA,
        status: "completed",
      },
    }),
    1,
  );
  assert.equal(
    await database.auditEvent.count({
      where: { id: baseInput.reliableOperation.auditEventId },
    }),
    1,
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { id: baseInput.reliableOperation.outboxEventId },
    }),
    1,
  );

  const replayed = await repository.create({
    ...baseInput,
    publicationId: randomUUID(),
    revisionId: randomUUID(),
  });
  assert.equal(replayed.status, "created");
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.detail, created.detail);
  assert.equal(
    await database.publication.count({
      where: { organizationId: organizationA },
    }),
    1,
  );

  const idempotencyConflict = await repository.create({
    ...baseInput,
    reliableOperation: {
      ...baseInput.reliableOperation,
      claim: {
        ...baseInput.reliableOperation.claim,
        requestHash: randomHash(),
      },
    },
  });
  assert.equal(idempotencyConflict.status, "idempotency-conflict");

  const approvalSnapshotId = randomUUID();
  await database.approvalSnapshot.create({
    data: {
      approvedAt: new Date("2026-07-28T12:00:00.000Z"),
      approvedByMembershipId: membershipA,
      contentHash: baseInput.contentHash,
      id: approvalSnapshotId,
      organizationId: organizationA,
      publicationId,
      revisionId: firstRevisionId,
      snapshot: {
        contentHash: baseInput.contentHash,
        revisionId: firstRevisionId,
      },
    },
  });

  const concurrentUpdates = await Promise.all([
    repository.update({
      ...baseInput,
      contentHash: "5".repeat(64),
      expectedVersion: 1,
      reliableOperation: reliableMutation(
        organizationA,
        membershipA,
        "content.publication:update",
      ),
      revisionId: randomUUID(),
      title: "Taladros actualizados A",
    }),
    repository.update({
      ...baseInput,
      contentHash: "6".repeat(64),
      expectedVersion: 1,
      reliableOperation: reliableMutation(
        organizationA,
        membershipA,
        "content.publication:update",
      ),
      revisionId: randomUUID(),
      title: "Taladros actualizados B",
    }),
  ]);
  assert.deepEqual(concurrentUpdates.map((result) => result.status).sort(), [
    "conflict",
    "updated",
  ]);

  const detailAfterConcurrency = await repository.findById(
    { organizationId: organizationA },
    publicationId,
  );
  if (detailAfterConcurrency === null) {
    assert.fail("La publicación creada dejó de estar disponible.");
  }
  assert.equal(detailAfterConcurrency.publication.version, 2);
  assert.equal(detailAfterConcurrency.latestRevision.revisionNumber, 2);
  assert.equal(
    await database.publicationRevision.count({
      where: { organizationId: organizationA, publicationId },
    }),
    2,
  );

  const revisionsBeforeRollback = await database.publicationRevision.count({
    where: { organizationId: organizationA, publicationId },
  });
  const mediaReferencesBeforeRollback =
    await database.publicationRevisionMedia.count({
      where: { organizationId: organizationA },
    });
  const idempotencyBeforeRollback = await database.idempotencyRecord.count({
    where: { organizationId: organizationA },
  });
  const auditBeforeRollback = await database.auditEvent.count({
    where: { organizationId: organizationA },
  });
  const outboxBeforeRollback = await database.outboxMessage.count({
    where: { organizationId: organizationA },
  });
  await assert.rejects(
    repository.update({
      ...baseInput,
      contentHash: "7".repeat(64),
      expectedVersion: 2,
      media: [
        {
          alt: "Taladro principal",
          mediaAssetId: mediaA,
          slot: "media-00",
        },
        {
          alt: "Taladro secundario",
          mediaAssetId: mediaASecondary,
          slot: "media-00",
        },
      ],
      reliableOperation: reliableMutation(
        organizationA,
        membershipA,
        "content.publication:update",
      ),
      revisionId: randomUUID(),
      title: "Edición que debe revertirse",
    }),
  );
  const publicationAfterRollback = await database.publication.findUniqueOrThrow(
    {
      where: { id: publicationId },
    },
  );
  assert.equal(publicationAfterRollback.version, 2);
  assert.equal(
    await database.publicationRevision.count({
      where: { organizationId: organizationA, publicationId },
    }),
    revisionsBeforeRollback,
  );
  assert.equal(
    await database.publicationRevisionMedia.count({
      where: { organizationId: organizationA },
    }),
    mediaReferencesBeforeRollback,
  );
  assert.equal(
    await database.idempotencyRecord.count({
      where: { organizationId: organizationA },
    }),
    idempotencyBeforeRollback,
  );
  assert.equal(
    await database.auditEvent.count({
      where: { organizationId: organizationA },
    }),
    auditBeforeRollback,
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { organizationId: organizationA },
    }),
    outboxBeforeRollback,
  );

  const revisionHistory = await repository.listRevisions({
    limit: 10,
    organizationId: organizationA,
    page: 1,
    publicationId,
  });
  assert.equal(revisionHistory.total, 2);
  const approvedRevision = revisionHistory.items.find(
    ({ revisionNumber }) => revisionNumber === 1,
  );
  assert.equal(approvedRevision?.approvalSnapshotId, approvalSnapshotId);

  const filteredPage = await repository.list({
    limit: 1,
    organizationId: organizationA,
    page: 1,
    status: "draft",
  });
  assert.equal(filteredPage.total, 1);
  assert.equal(filteredPage.items.length, 1);
  assert.equal(filteredPage.items[0]?.latestRevisionNumber, 2);
  assert.equal(
    await repository.findById({ organizationId: organizationB }, publicationId),
    null,
  );

  await assert.rejects(
    database.publicationRevision.update({
      data: { content: { caption: "Mutación inválida", products: [] } },
      where: { id: firstRevisionId },
    }),
  );
  const firstRevisionMedia =
    await database.publicationRevisionMedia.findFirstOrThrow({
      where: {
        organizationId: organizationA,
        revisionId: firstRevisionId,
      },
    });
  await assert.rejects(
    database.publicationRevisionMedia.delete({
      where: { id: firstRevisionMedia.id },
    }),
  );
});

test("idempotencia, auditoría y outbox conservan atomicidad y recuperan leases", async () => {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  await database.organization.create({
    data: {
      displayName: "Organización de operaciones confiables",
      id: organizationId,
      legalName: "Organización de operaciones confiables",
      slug: `reliable-${organizationId}`,
    },
  });
  await database.user.create({
    data: {
      displayName: "Operadora confiable",
      email: `${userId}@reliable.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: {
      id: membershipId,
      organizationId,
      roles: ["editor"],
      userId,
    },
  });

  const reliableRepository = new PrismaReliableOperationRepository(database);
  const outboxRepository = new PrismaOutboxRepository(database);
  const keyHash = "8".repeat(64);
  const requestHash = "9".repeat(64);
  const operation = "content.publication-draft:create";
  const claimInput = {
    actorMembershipId: membershipId,
    expiresAt: "2030-07-28T12:00:00.000Z",
    keyHash,
    operation,
    organizationId,
    requestHash,
  } as const;

  const concurrentClaims = await Promise.all([
    reliableRepository.claim(claimInput),
    reliableRepository.claim(claimInput),
  ]);
  assert.deepEqual(concurrentClaims.map(({ status }) => status).sort(), [
    "claimed",
    "in-progress",
  ]);
  const claimed = concurrentClaims.find(
    (result) => result.status === "claimed",
  );
  if (claimed?.status !== "claimed") {
    assert.fail("Una solicitud concurrente debía reclamar la operación.");
  }

  const conflict = await reliableRepository.claim({
    ...claimInput,
    requestHash: "a".repeat(64),
  });
  assert.equal(conflict.status, "request-conflict");

  const auditEventId = randomUUID();
  const outboxEventId = randomUUID();
  const committed = await reliableRepository.commit({
    audit: {
      actorMembershipId: membershipId,
      entityId: "publication-1",
      entityType: "publication",
      eventId: auditEventId,
      metadata: { publicationId: "publication-1", revisionNumber: 1 },
      occurredAt: "2026-07-28T12:00:00.000Z",
      operation,
      organizationId,
      outcome: "success",
    },
    idempotency: {
      actorMembershipId: membershipId,
      expiresAt: "2030-07-29T12:00:00.000Z",
      keyHash,
      operation,
      organizationId,
      recordId: claimed.recordId,
      responseBody: { publicationId: "publication-1", version: 1 },
      responseStatus: 201,
    },
    outbox: [
      {
        aggregateId: "publication-1",
        aggregateType: "publication",
        availableAt: "2026-07-28T12:00:00.000Z",
        eventId: outboxEventId,
        organizationId,
        payload: { publicationId: "publication-1", revisionNumber: 1 },
        topic: "content.publication.created:v1",
      },
    ],
  });
  assert.equal(committed, true);
  assert.equal(
    await database.auditEvent.count({ where: { id: auditEventId } }),
    1,
  );
  assert.equal(
    await database.outboxMessage.count({ where: { id: outboxEventId } }),
    1,
  );

  const replayed = await reliableRepository.claim(claimInput);
  assert.deepEqual(replayed, {
    responseBody: { publicationId: "publication-1", version: 1 },
    responseStatus: 201,
    status: "replayed",
  });

  const rollbackClaim = await reliableRepository.claim({
    ...claimInput,
    keyHash: "b".repeat(64),
  });
  if (rollbackClaim.status !== "claimed") {
    assert.fail("La segunda clave debía quedar disponible.");
  }
  const rollbackAuditId = randomUUID();
  const duplicatedEventId = randomUUID();
  await assert.rejects(
    reliableRepository.commit({
      audit: {
        actorMembershipId: membershipId,
        entityType: "publication",
        eventId: rollbackAuditId,
        metadata: { publicationId: "publication-rollback" },
        occurredAt: "2026-07-28T12:05:00.000Z",
        operation,
        organizationId,
        outcome: "success",
      },
      idempotency: {
        actorMembershipId: membershipId,
        expiresAt: "2030-07-29T12:00:00.000Z",
        keyHash: "b".repeat(64),
        operation,
        organizationId,
        recordId: rollbackClaim.recordId,
        responseBody: { publicationId: "publication-rollback" },
        responseStatus: 201,
      },
      outbox: [
        {
          aggregateId: "publication-rollback",
          aggregateType: "publication",
          availableAt: "2026-07-28T12:05:00.000Z",
          eventId: duplicatedEventId,
          organizationId,
          payload: { sequence: 1 },
          topic: "content.publication.created:v1",
        },
        {
          aggregateId: "publication-rollback",
          aggregateType: "publication",
          availableAt: "2026-07-28T12:05:00.000Z",
          eventId: duplicatedEventId,
          organizationId,
          payload: { sequence: 2 },
          topic: "content.publication.created:v1",
        },
      ],
    }),
  );
  const rollbackRecord = await database.idempotencyRecord.findUniqueOrThrow({
    where: { id: rollbackClaim.recordId },
  });
  assert.equal(rollbackRecord.status, "processing");
  assert.equal(
    await database.auditEvent.count({ where: { id: rollbackAuditId } }),
    0,
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { id: duplicatedEventId },
    }),
    0,
  );

  const firstLease = await outboxRepository.claimBatch({
    at: "2026-07-28T12:10:00.000Z",
    leaseExpiresAt: "2026-07-28T12:11:00.000Z",
    limit: 10,
    workerId: "worker-a",
  });
  assert.equal(firstLease.length, 1);
  assert.equal(firstLease[0]?.eventId, outboxEventId);
  assert.equal(firstLease[0].attempts, 1);
  assert.deepEqual(
    await outboxRepository.claimBatch({
      at: "2026-07-28T12:10:30.000Z",
      leaseExpiresAt: "2026-07-28T12:11:30.000Z",
      limit: 10,
      workerId: "worker-b",
    }),
    [],
  );

  const recoveredLease = await outboxRepository.claimBatch({
    at: "2026-07-28T12:12:00.000Z",
    leaseExpiresAt: "2026-07-28T12:13:00.000Z",
    limit: 10,
    workerId: "worker-b",
  });
  assert.equal(recoveredLease[0]?.eventId, outboxEventId);
  assert.equal(recoveredLease[0].attempts, 2);
  assert.equal(
    await outboxRepository.markDelivered(
      outboxEventId,
      "worker-a",
      "2026-07-28T12:12:30.000Z",
    ),
    false,
  );
  assert.equal(
    await outboxRepository.markDelivered(
      outboxEventId,
      "worker-b",
      "2026-07-28T12:12:30.000Z",
    ),
    true,
  );

  await assert.rejects(
    database.auditEvent.delete({ where: { id: auditEventId } }),
  );
  assert.deepEqual(
    await outboxRepository.purge("2026-07-29T00:00:00.000Z", 100),
    { deleted: 1 },
  );
  const completedIdempotencyRecords = await database.idempotencyRecord.count({
    where: {
      expiresAt: { lt: new Date("2031-01-01T00:00:00.000Z") },
      status: "completed",
    },
  });
  assert.deepEqual(
    await reliableRepository.purgeExpired("2031-01-01T00:00:00.000Z", 100),
    { deleted: completedIdempotencyRecords },
  );
  assert.equal(
    await database.idempotencyRecord.count({
      where: { id: rollbackClaim.recordId },
    }),
    1,
    "la limpieza no elimina operaciones incompletas",
  );
});

test("configuración usa ownership, versiones, auditoría y no muta snapshots", async () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  const publicationId = randomUUID();
  const revisionId = randomUUID();
  const snapshotId = randomUUID();
  const snapshot = {
    brand: { claim: "Snapshot histórico" },
    content: { title: "Pieza aprobada" },
  };
  const actor = {
    displayName: "Administradora",
    email: `${userId}@example.invalid`,
    membershipId,
    organizationId,
    roles: ["admin"] as const,
    sessionId: randomUUID(),
    userId,
  };

  await database.organization.createMany({
    data: [
      {
        displayName: "Aramayo",
        id: organizationId,
        legalName: "Aramayo",
        slug: `configuration-${organizationId}`,
      },
      {
        displayName: "Otra organización",
        id: otherOrganizationId,
        legalName: "Otra organización",
        slug: `configuration-${otherOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: actor.displayName,
      email: actor.email,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: {
      id: membershipId,
      organizationId,
      roles: ["admin"],
      userId,
    },
  });
  await database.brand.create({
    data: {
      id: brandId,
      name: "Aramayo",
      organizationId,
      profile: {
        catalogSource: "approved",
        claim: "Claim anterior",
        handle: "@Aramayo",
        shortName: "Aramayo",
        themeId: "taller",
      },
    },
  });
  await database.location.create({
    data: {
      addressLine: "Rivadavia 673",
      brandId,
      city: "Frías",
      id: locationId,
      name: "Sucursal",
      openingHours: { display: "Lun · 08:30 a 13:00" },
      organizationId,
      phone: "+543854403534",
      province: "Santiago del Estero",
      whatsapp: "+543854403534",
    },
  });
  await database.publication.create({
    data: {
      createdByMembershipId: membershipId,
      id: publicationId,
      locationId,
      organizationId,
      status: "approved",
      title: "Pieza histórica",
    },
  });
  await database.publicationRevision.create({
    data: {
      content: { title: "Pieza histórica" },
      contentHash: "a".repeat(64),
      createdByMembershipId: membershipId,
      designDocument: { layout: "producto-destacado" },
      id: revisionId,
      organizationId,
      publicationId,
      revisionNumber: 1,
      schemaVersion: 1,
      status: "approved",
    },
  });
  await database.approvalSnapshot.create({
    data: {
      approvedAt: new Date(),
      approvedByMembershipId: membershipId,
      contentHash: "a".repeat(64),
      id: snapshotId,
      organizationId,
      publicationId,
      revisionId,
      snapshot,
    },
  });

  const repository = new PrismaOrganizationConfigurationRepository(database);
  const initial = await repository.findByOrganizationId(organizationId);
  assert.notEqual(initial, null);
  if (initial === null) {
    throw new Error("Expected organization configuration.");
  }
  const initialLocation = initial.locations[0];
  assert.notEqual(initialLocation, undefined);
  if (initialLocation === undefined) {
    throw new Error("Expected initial location configuration.");
  }

  assert.deepEqual(
    await repository.updateLocation({
      actorMembershipId: membershipId,
      changedAt: new Date().toISOString(),
      locationId,
      organizationId: otherOrganizationId,
      update: normalizeLocationConfigurationUpdate({
        actor,
        ...initialLocation,
        locationId,
      }),
    }),
    { status: "not-found" },
  );

  const brandResult = await repository.updateBrand({
    actorMembershipId: membershipId,
    changedAt: new Date().toISOString(),
    organizationId,
    update: normalizeBrandConfigurationUpdate({
      actor,
      brandVersion: initial.brand.version,
      claim: "Nuevo claim operativo",
      displayName: "Ferretería Aramayo",
      handle: "@LubricentroAramayo",
      legalName: "Ferretería y Lubricentro Aramayo",
      name: "Aramayo",
      organizationVersion: initial.version,
      shortName: "Aramayo",
      themeId: "promo",
    }),
  });
  assert.equal(brandResult.status, "updated");
  assert.deepEqual(
    (
      await database.brand.findUniqueOrThrow({
        where: { id: brandId },
      })
    ).profile,
    {
      catalogSource: "approved",
      claim: "Nuevo claim operativo",
      handle: "@LubricentroAramayo",
      shortName: "Aramayo",
      themeId: "promo",
    },
  );
  assert.deepEqual(
    (
      await database.approvalSnapshot.findUniqueOrThrow({
        where: { id: snapshotId },
      })
    ).snapshot,
    snapshot,
  );
  assert.equal(
    await database.organizationConfigurationEvent.count({
      where: { organizationId },
    }),
    2,
  );

  const staleResult = await repository.updateBrand({
    actorMembershipId: membershipId,
    changedAt: new Date().toISOString(),
    organizationId,
    update: normalizeBrandConfigurationUpdate({
      actor,
      brandVersion: initial.brand.version,
      claim: "Cambio vencido",
      displayName: "Cambio vencido",
      handle: "@Aramayo",
      legalName: "Cambio vencido",
      name: "Cambio vencido",
      organizationVersion: initial.version,
      shortName: "Cambio vencido",
      themeId: "taller",
    }),
  });
  assert.deepEqual(staleResult, { status: "conflict" });
  assert.equal(
    await database.organizationConfigurationEvent.count({
      where: { organizationId },
    }),
    2,
  );

  const afterBrand = brandResult.configuration;
  const currentLocation = afterBrand.locations[0];
  assert.notEqual(currentLocation, undefined);
  if (currentLocation === undefined) {
    throw new Error("Expected location configuration.");
  }
  const locationResult = await repository.updateLocation({
    actorMembershipId: membershipId,
    changedAt: new Date().toISOString(),
    locationId,
    organizationId,
    update: normalizeLocationConfigurationUpdate({
      actor,
      ...currentLocation,
      addressLine: "  Rivadavia   675 ",
      locationId,
      openingHours: "Lun a sáb·09:00 a 13:00",
      phone: "3854 403534",
    }),
  });
  assert.equal(locationResult.status, "updated");
  assert.equal(
    await database.organizationConfigurationEvent.count({
      where: { organizationId },
    }),
    3,
  );
  const locationEvent =
    await database.organizationConfigurationEvent.findFirstOrThrow({
      orderBy: { occurredAt: "desc" },
      where: { organizationId, targetType: "location" },
    });
  await assert.rejects(
    database.organizationConfigurationEvent.update({
      data: { after: { tampered: true } },
      where: { id: locationEvent.id },
    }),
  );
});

test("identidad persiste sesiones revocables, roles vivos y auditoría aislada", async () => {
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const tokenHash = randomHash();
  const csrfTokenHash = randomHash();
  const subjectHash = randomHash();
  const clientFingerprintHash = randomHash();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1_000);

  await database.organization.createMany({
    data: [
      {
        displayName: "Organización identidad A",
        id: organizationA,
        legalName: "Organización identidad A",
        slug: `identity-a-${organizationA}`,
      },
      {
        displayName: "Organización identidad B",
        id: organizationB,
        legalName: "Organización identidad B",
        slug: `identity-b-${organizationB}`,
      },
    ],
  });
  await database.user.createMany({
    data: [
      {
        displayName: "Identidad A",
        email: `${userA}@example.invalid`,
        id: userA,
        passwordChangedAt: now,
        passwordHash: `$argon2id$${"a".repeat(64)}`,
        passwordHashVersion: 1,
      },
      {
        displayName: "Identidad B",
        email: `${userB}@example.invalid`,
        id: userB,
        passwordChangedAt: now,
        passwordHash: `$argon2id$${"b".repeat(64)}`,
        passwordHashVersion: 1,
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: membershipA,
        organizationId: organizationA,
        roles: ["editor"],
        userId: userA,
      },
      {
        id: membershipB,
        organizationId: organizationB,
        roles: ["admin"],
        userId: userB,
      },
    ],
  });

  const repository = new PrismaIdentityRepository(database);
  const loginIdentity = await repository.findLoginIdentity(
    `${userA}@example.invalid`,
  );
  assert.notEqual(loginIdentity, null);
  if (loginIdentity === null) {
    throw new Error("Expected login identity.");
  }
  const loginMembership = loginIdentity.memberships[0];
  assert.notEqual(loginMembership, undefined);
  if (loginMembership === undefined) {
    throw new Error("Expected login membership.");
  }
  assert.equal(loginMembership.organizationId, organizationA);
  assert.deepEqual(loginMembership.roles, ["editor"]);

  const session = await repository.createSession({
    clientFingerprintHash,
    csrfTokenHash,
    event: {
      clientFingerprintHash,
      eventType: "login_succeeded",
      metadata: { passwordHashVersion: 1 },
      occurredAt: now.toISOString(),
      organizationId: organizationA,
      subjectHash,
      succeeded: true,
      userId: userA,
    },
    expiresAt: expiresAt.toISOString(),
    membershipId: membershipA,
    organizationId: organizationA,
    tokenHash,
    userId: userA,
  });
  assert.equal(session.actor.organizationId, organizationA);
  assert.deepEqual(session.actor.roles, ["editor"]);

  assert.equal(
    await repository.findSessionByTokenHash(
      tokenHash,
      new Date(expiresAt.getTime() + 1_000).toISOString(),
    ),
    null,
    "una sesión vencida deja de autenticar",
  );

  const activeSession = await repository.findSessionByTokenHash(
    tokenHash,
    now.toISOString(),
  );
  assert.notEqual(activeSession, null);

  const operationAt = new Date();
  const crossOrganizationChange = await repository.changeMembershipRoles({
    actorMembershipId: membershipB,
    changedAt: operationAt.toISOString(),
    organizationId: organizationB,
    roles: ["approver"],
    targetMembershipId: membershipA,
  });
  assert.deepEqual(crossOrganizationChange, { status: "not-found" });

  const roleChange = await repository.changeMembershipRoles({
    actorMembershipId: membershipA,
    changedAt: operationAt.toISOString(),
    organizationId: organizationA,
    roles: ["approver"],
    targetMembershipId: membershipA,
  });
  assert.deepEqual(roleChange, { status: "updated" });
  const sessionWithCurrentRoles = await repository.findSessionByTokenHash(
    tokenHash,
    now.toISOString(),
  );
  assert.deepEqual(sessionWithCurrentRoles?.actor.roles, ["approver"]);

  await database.user.update({
    data: {
      passwordChangedAt: new Date(now.getTime() + 1_000),
    },
    where: { id: userA },
  });
  assert.equal(
    await repository.findSessionByTokenHash(tokenHash, now.toISOString()),
    null,
    "cambiar la contraseña invalida sesiones anteriores",
  );
  await database.user.update({
    data: { passwordChangedAt: now },
    where: { id: userA },
  });

  await repository.recordAuthenticationEvent({
    clientFingerprintHash,
    eventType: "login_failed",
    metadata: { reason: "credentials_rejected" },
    occurredAt: operationAt.toISOString(),
    subjectHash,
    succeeded: false,
  });
  assert.equal(
    await repository.countRecentLoginFailures({
      clientFingerprintHash,
      since: new Date(now.getTime() - 1_000).toISOString(),
      subjectHash,
    }),
    1,
  );
  await database.authenticationEvent.create({
    data: {
      clientFingerprintHash,
      eventType: "login_failed",
      metadata: { reason: "clock_skew_within_tolerance" },
      occurredAt: new Date(Date.now() + 60 * 1_000),
      subjectHash,
      succeeded: false,
    },
  });
  await assert.rejects(
    database.authenticationEvent.create({
      data: {
        clientFingerprintHash,
        eventType: "login_failed",
        metadata: { reason: "clock_skew_exceeds_tolerance" },
        occurredAt: new Date(Date.now() + 10 * 60 * 1_000),
        subjectHash,
        succeeded: false,
      },
    }),
  );

  await database.user.update({
    data: { status: "disabled" },
    where: { id: userA },
  });
  assert.equal(
    await repository.findSessionByTokenHash(tokenHash, now.toISOString()),
    null,
  );
  await database.user.update({
    data: { status: "active" },
    where: { id: userA },
  });

  const membershipRevocation = await repository.revokeMembership({
    actorMembershipId: membershipA,
    organizationId: organizationA,
    reason: "access_removed",
    revokedAt: new Date().toISOString(),
    targetMembershipId: membershipA,
  });
  assert.deepEqual(membershipRevocation, { status: "updated" });
  assert.equal(
    await repository.findSessionByTokenHash(tokenHash, now.toISOString()),
    null,
  );

  const auditEvent = await database.authenticationEvent.findFirstOrThrow({
    orderBy: { createdAt: "desc" },
    where: {
      eventType: "membership_revoked",
      organizationId: organizationA,
      targetMembershipId: membershipA,
    },
  });
  await assert.rejects(
    database.authenticationEvent.update({
      data: { metadata: { tampered: true } },
      where: { id: auditEvent.id },
    }),
  );
});

test("repositorios y constraints aíslan organizaciones y preservan snapshots", async () => {
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const membershipA = randomUUID();
  const membershipB = randomUUID();
  const brandA = randomUUID();
  const brandB = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const publicationA = randomUUID();
  const publicationB = randomUUID();
  const revisionA = randomUUID();
  const revisionB = randomUUID();
  const mediaA = randomUUID();
  const mediaB = randomUUID();
  const approvalA = randomUUID();
  const checksumA = "a".repeat(64);
  const checksumB = "b".repeat(64);
  const snapshot = {
    brand: {
      name: "Aramayo",
      phone: "3854 403534",
    },
    content: {
      callToAction: "Consultanos por WhatsApp",
      title: "Taladro percutor",
    },
    design: {
      format: "feed-square",
      layout: "producto-destacado",
      schemaVersion: 1,
    },
    media: [
      {
        checksumSha256: checksumA,
        height: 1080,
        id: mediaA,
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
        width: 1080,
      },
    ],
  };

  await database.organization.createMany({
    data: [
      {
        displayName: "Organización A",
        id: organizationA,
        legalName: "Organización A",
        slug: `organization-a-${organizationA}`,
      },
      {
        displayName: "Organización B",
        id: organizationB,
        legalName: "Organización B",
        slug: `organization-b-${organizationB}`,
      },
    ],
  });
  await database.user.createMany({
    data: [
      {
        displayName: "Usuario A",
        email: `${userA}@example.invalid`,
        id: userA,
      },
      {
        displayName: "Usuario B",
        email: `${userB}@example.invalid`,
        id: userB,
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: membershipA,
        organizationId: organizationA,
        roles: ["editor", "approver"],
        userId: userA,
      },
      {
        id: membershipB,
        organizationId: organizationB,
        roles: ["editor"],
        userId: userB,
      },
    ],
  });
  await database.brand.createMany({
    data: [
      {
        id: brandA,
        name: "Marca A",
        organizationId: organizationA,
        profile: { claim: "Perfil A" },
      },
      {
        id: brandB,
        name: "Marca B",
        organizationId: organizationB,
        profile: { claim: "Perfil B" },
      },
    ],
  });
  await database.location.createMany({
    data: [
      {
        addressLine: "Calle A 100",
        brandId: brandA,
        city: "Frías",
        id: locationA,
        name: "Local A",
        openingHours: { display: "08:00 a 20:00" },
        organizationId: organizationA,
        province: "Santiago del Estero",
      },
      {
        addressLine: "Calle B 200",
        brandId: brandB,
        city: "Frías",
        id: locationB,
        name: "Local B",
        openingHours: { display: "08:00 a 20:00" },
        organizationId: organizationB,
        province: "Santiago del Estero",
      },
    ],
  });
  await database.publication.createMany({
    data: [
      {
        createdByMembershipId: membershipA,
        id: publicationA,
        locationId: locationA,
        organizationId: organizationA,
        status: "ready_for_review",
        title: "Publicación A",
      },
      {
        createdByMembershipId: membershipB,
        id: publicationB,
        locationId: locationB,
        organizationId: organizationB,
        scheduledFor: new Date("2030-01-10T12:00:00.000Z"),
        status: "scheduled",
        title: "Publicación B",
      },
    ],
  });
  await database.publicationRevision.createMany({
    data: [
      {
        content: { title: "Publicación A" },
        contentHash: checksumA,
        createdByMembershipId: membershipA,
        designDocument: { layout: "producto-destacado" },
        id: revisionA,
        organizationId: organizationA,
        publicationId: publicationA,
        revisionNumber: 1,
        schemaVersion: 1,
        status: "approved",
      },
      {
        content: { title: "Publicación B" },
        contentHash: checksumB,
        createdByMembershipId: membershipB,
        designDocument: { layout: "producto-destacado" },
        id: revisionB,
        organizationId: organizationB,
        publicationId: publicationB,
        revisionNumber: 1,
        schemaVersion: 1,
      },
    ],
  });
  await database.mediaAsset.createMany({
    data: [
      {
        byteSize: 1024n,
        checksumSha256: checksumA,
        height: 1080,
        id: mediaA,
        mimeType: "image/png",
        organizationId: organizationA,
        origin: "uploaded",
        originalFileName: "a.png",
        ownerMembershipId: membershipA,
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/a.png",
        status: "available",
        storageKey: "organization-a/a",
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
      {
        byteSize: 2048n,
        checksumSha256: checksumB,
        height: 1080,
        id: mediaB,
        mimeType: "image/png",
        organizationId: organizationB,
        origin: "uploaded",
        originalFileName: "b.png",
        ownerMembershipId: membershipB,
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/b.png",
        status: "available",
        storageKey: "organization-b/b",
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
    ],
  });
  await database.publicationRevisionMedia.create({
    data: {
      alt: "Activo principal",
      mediaAssetId: mediaA,
      organizationId: organizationA,
      revisionId: revisionA,
      slot: "primary",
    },
  });
  await database.approvalSnapshot.create({
    data: {
      approvedAt: new Date(Date.now() - 1_000),
      approvedByMembershipId: membershipA,
      contentHash: checksumA,
      id: approvalA,
      organizationId: organizationA,
      publicationId: publicationA,
      revisionId: revisionA,
      snapshot,
    },
  });

  const publicationRepository = new PrismaPublicationRepository(database);
  const mediaRepository = new PrismaMediaAssetRepository(database);
  const approvalRepository = new PrismaApprovalSnapshotRepository(database);

  assert.equal(
    await publicationRepository.findById(
      { organizationId: organizationA },
      publicationB,
    ),
    null,
  );
  assert.equal(
    await mediaRepository.findById({ organizationId: organizationA }, mediaB),
    null,
  );
  assert.equal(
    await approvalRepository.findLatestByPublicationId(
      { organizationId: organizationB },
      publicationA,
    ),
    null,
  );

  const publications = await publicationRepository.list({
    limit: 20,
    organizationId: organizationA,
    status: "ready_for_review",
  });
  assert.deepEqual(
    publications.map((publication) => publication.id),
    [publicationA],
  );
  await assert.rejects(
    publicationRepository.list({
      limit: 0,
      organizationId: organizationA,
    }),
    RangeError,
  );

  const storedSnapshot = await approvalRepository.findLatestByPublicationId(
    { organizationId: organizationA },
    publicationA,
  );
  assert.notEqual(storedSnapshot, null);
  assert.deepEqual(storedSnapshot?.snapshot, snapshot);

  await assert.rejects(
    database.publicationRevision.create({
      data: {
        content: { title: "Cruce inválido" },
        contentHash: "d".repeat(64),
        createdByMembershipId: membershipA,
        designDocument: { layout: "producto-destacado" },
        organizationId: organizationA,
        publicationId: publicationB,
        revisionNumber: 2,
        schemaVersion: 1,
      },
    }),
  );
  await assert.rejects(
    database.approvalSnapshot.update({
      data: {
        snapshot: { invalidMutation: true },
      },
      where: { id: approvalA },
    }),
  );
  await assert.rejects(
    database.mediaAsset.delete({
      where: { id: mediaA },
    }),
  );

  const stateRepository = new PrismaPublicationStateRepository(database);
  const currentState = await stateRepository.findById(
    organizationA,
    publicationA,
  );
  assert.notEqual(currentState, null);
  if (currentState === null) {
    throw new Error("Expected publication state.");
  }
  const transition = transitionPublication(currentState, {
    actorMembershipId: membershipA,
    expectedVersion: currentState.version,
    occurredAt: new Date(Date.now() - 500).toISOString(),
    targetStatus: "draft",
    type: "advance",
  });
  if (!transition.ok) {
    assert.fail(transition.error.message);
  }

  const concurrentCommits = await Promise.all([
    stateRepository.commit(transition.state, transition.event),
    stateRepository.commit(transition.state, transition.event),
  ]);
  assert.deepEqual(concurrentCommits.map((result) => result.status).sort(), [
    "committed",
    "version-conflict",
  ]);
  const persistedPublication = await database.publication.findUniqueOrThrow({
    where: { id: publicationA },
  });
  assert.equal(persistedPublication.status, "draft");
  assert.equal(persistedPublication.version, 2);
  const persistedHistory = await database.publicationStateTransition.findMany({
    where: {
      organizationId: organizationA,
      publicationId: publicationA,
    },
  });
  assert.equal(persistedHistory.length, 1);
  const historyEntry = persistedHistory[0];
  assert.notEqual(historyEntry, undefined);
  if (historyEntry !== undefined) {
    await assert.rejects(
      database.publicationStateTransition.update({
        data: { reasonCode: "tampered" },
        where: { id: historyEntry.id },
      }),
    );
  }

  const queryPool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
  const connection = await queryPool.connect();
  try {
    await connection.query("SET enable_seqscan = off");
    const statusPlan = await connection.query<{ "QUERY PLAN": string }>(
      `
        EXPLAIN (FORMAT TEXT)
        SELECT "id"
        FROM "publications"
        WHERE "organization_id" = $1
          AND "status" = $2::publication_status
        ORDER BY "created_at" DESC, "id" ASC
        LIMIT 20
      `,
      [organizationA, "ready_for_review"],
    );
    const schedulePlan = await connection.query<{ "QUERY PLAN": string }>(
      `
        EXPLAIN (FORMAT TEXT)
        SELECT "id"
        FROM "publications"
        WHERE "organization_id" = $1
          AND "scheduled_for" >= $2
        ORDER BY "scheduled_for" ASC, "id" ASC
        LIMIT 20
      `,
      [organizationB, new Date("2030-01-01T00:00:00.000Z")],
    );

    assert.match(
      statusPlan.rows.map((row) => row["QUERY PLAN"]).join("\n"),
      /publications_org_status_created_idx/u,
    );
    assert.match(
      schedulePlan.rows.map((row) => row["QUERY PLAN"]).join("\n"),
      /publications_org_scheduled_idx/u,
    );
  } finally {
    connection.release();
    await queryPool.end();
  }
});
