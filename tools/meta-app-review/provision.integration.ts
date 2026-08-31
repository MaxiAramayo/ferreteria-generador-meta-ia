/** Run only against a freshly migrated, disposable local database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@aramayo/database";

import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";
import { provisionMetaAppReview } from "./provision.ts";

const databaseUrl = process.env["DATABASE_URL"];
if (
  process.env["NODE_ENV"] !== "test" ||
  !databaseUrl ||
  new URL(databaseUrl).hostname !== "127.0.0.1"
) {
  throw new Error("Requires a disposable loopback test database.");
}
const database = createDatabaseClient(databaseUrl);
try {
  assert.equal(
    await database.organization.count(),
    0,
    "The database must be empty.",
  );
  const organizationId = randomUUID();
  const adminId = randomUUID();
  const membershipId = randomUUID();
  const reviewerId = randomUUID();
  const oldRevisionId = "5a080000-0000-4000-8000-000000000003";
  const oldSnapshotId = randomUUID();
  const oldMediaId = randomUUID();
  const oldHash =
    "dcf3547af2e38076efdd8ac383beced782a50f929c956efa62bb7daecc197da5";
  await database.organization.create({
    data: {
      id: organizationId,
      slug: "review-integration",
      displayName: "Test",
      legalName: "Test",
    },
  });
  await database.user.createMany({
    data: [
      { id: adminId, email: "admin@example.invalid", displayName: "Admin" },
      {
        id: reviewerId,
        email: metaAppReviewPackage.reviewer.email,
        displayName: "Reviewer",
        status: "disabled",
      },
    ],
  });
  await database.organizationMembership.createMany({
    data: [
      {
        id: membershipId,
        organizationId,
        userId: adminId,
        roles: ["approver", "admin", "publisher"],
        status: "active",
      },
      {
        organizationId,
        userId: reviewerId,
        roles: [...metaAppReviewPackage.reviewer.roles],
        status: "active",
      },
    ],
  });
  await database.metaConnection.create({
    data: {
      organizationId,
      connectedByMembershipId: membershipId,
      providerAccountId: "fixture-account",
      accountName: "Test",
      health: "healthy",
      accessCiphertext: "fixture-ciphertext",
      accessIv: "fixture-iv",
      accessTag: "fixture-tag",
      accessKeyVersion: "v1",
      lastCheckedAt: new Date(),
      grantedPermissions: [...metaAppReviewPackage.requiredMetaPermissions],
      assets: {
        create: [
          {
            kind: "page",
            providerAssetId: "fixture-page",
            name: "Test",
          },
          {
            kind: "instagram_business",
            providerAssetId: "fixture-instagram",
            name: "Test",
          },
        ],
      },
    },
  });
  const delivery = {
    organizationId,
    secureUrl: "https://example.invalid/original.png",
    storageKey: "fixture",
    storageVersion: 10,
  };
  const lengths = { illustrative: 100, rendered: 100 };
  assert.equal(
    (await provisionMetaAppReview(database, lengths, false, delivery)).status,
    "verified",
  );
  assert.equal(
    await database.publication.count(),
    0,
    "Dry run must not write.",
  );
  await database.mediaAsset.create({
    data: {
      id: oldMediaId,
      organizationId,
      ownerMembershipId: membershipId,
      origin: "approved_library",
      originalFileName: "technical.png",
      mimeType: "image/png",
      byteSize: 100,
      width: 1080,
      height: 1350,
      secureUrl: "https://example.invalid/technical.png",
      storageKey: "technical",
      storageVersion: 1,
      storageProvider: "brand_library",
      status: "available",
      checksumSha256:
        "91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0",
    },
  });
  await database.publication.create({
    data: {
      id: metaAppReviewIds.publicationId,
      organizationId,
      createdByMembershipId: membershipId,
      title: "Muestra técnica de App Review",
      status: "approved",
      version: 3,
    },
  });
  await database.publicationRevision.create({
    data: {
      id: oldRevisionId,
      organizationId,
      publicationId: metaAppReviewIds.publicationId,
      createdByMembershipId: membershipId,
      revisionNumber: 1,
      status: "approved",
      schemaVersion: 1,
      content: { caption: "Previous technical sample" },
      designDocument: {},
      contentHash: oldHash,
      renderedMediaAssetId: oldMediaId,
      renderedAt: new Date(),
    },
  });
  await database.approvalSnapshot.create({
    data: {
      id: oldSnapshotId,
      organizationId,
      publicationId: metaAppReviewIds.publicationId,
      revisionId: oldRevisionId,
      approvedByMembershipId: membershipId,
      approvedAt: new Date(),
      contentHash: oldHash,
      snapshot: { preserved: true },
    },
  });
  const previousRevision = await database.publicationRevision.findUniqueOrThrow(
    { where: { id: oldRevisionId } },
  );
  const previousSnapshot = await database.approvalSnapshot.findUniqueOrThrow({
    where: { id: oldSnapshotId },
  });
  // A conflict after entering the transaction must roll back the publication update.
  await database.mediaAsset.create({
    data: {
      id: metaAppReviewIds.illustrativeMediaAssetId,
      organizationId,
      ownerMembershipId: membershipId,
      origin: "approved_library",
      originalFileName: "collision.png",
      mimeType: "image/png",
      byteSize: 100,
      width: 1080,
      height: 1350,
      secureUrl: "https://example.invalid/collision.png",
      storageKey: "collision",
      storageVersion: 1,
      checksumSha256: "a".repeat(64),
      storageProvider: "brand_library",
      status: "available",
    },
  });
  await assert.rejects(
    provisionMetaAppReview(database, lengths, true, delivery),
  );
  assert.equal(
    (
      await database.publication.findUniqueOrThrow({
        where: { id: metaAppReviewIds.publicationId },
      })
    ).version,
    3,
  );
  await database.mediaAsset.delete({
    where: { id: metaAppReviewIds.illustrativeMediaAssetId },
  });
  assert.equal(
    (await provisionMetaAppReview(database, lengths, true, delivery)).status,
    "created",
  );
  assert.equal(
    (await provisionMetaAppReview(database, lengths, true, delivery)).status,
    "already-provisioned",
  );
  assert.deepEqual(
    await database.publicationRevision.findUniqueOrThrow({
      where: { id: oldRevisionId },
    }),
    previousRevision,
  );
  assert.deepEqual(
    await database.approvalSnapshot.findUniqueOrThrow({
      where: { id: oldSnapshotId },
    }),
    previousSnapshot,
  );
  assert.equal(await database.publicationRevision.count(), 2);
  assert.equal(await database.approvalSnapshot.count(), 2);
  assert.equal(await database.auditEvent.count(), 1);
  assert.equal(
    await database.outboxMessage.count(),
    0,
    "Provisioning must not publish.",
  );
  const transitions = await database.publicationStateTransition.findMany({
    orderBy: { toVersion: "asc" },
  });
  assert.deepEqual(
    transitions.map((transition) => [
      transition.fromStatus,
      transition.toStatus,
      transition.toVersion,
    ]),
    [
      ["approved", "draft", 4],
      ["draft", "ready_for_review", 5],
      ["ready_for_review", "approved", 6],
    ],
  );
  const revision = await database.publicationRevision.findUniqueOrThrow({
    where: { id: metaAppReviewIds.revisionId },
    include: { renderedMedia: true },
  });
  assert.equal(
    revision.renderedMedia?.checksumSha256,
    metaAppReviewPackage.sha256,
  );
  assert.equal(revision.renderedMedia.storageProvider, "cloudinary");
  await database.publicationOrder.create({
    data: {
      organizationId,
      publicationId: metaAppReviewIds.publicationId,
      approvalSnapshotId: metaAppReviewIds.approvalSnapshotId,
      requestedByMembershipId: membershipId,
    },
  });
  await assert.rejects(
    provisionMetaAppReview(database, lengths, true, delivery),
    /no coincide/u,
  );
  process.stdout.write(
    "PASS: dry run, rollback, immutable replacement, idempotence, exact storage and existing-order refusal.\n",
  );
} finally {
  await database.$disconnect();
}
