import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { transitionPublication } from "@aramayo/domain";

import { createDatabaseClient } from "./client.ts";
import {
  PrismaApprovalSnapshotRepository,
  PrismaMediaAssetRepository,
  PrismaPublicationRepository,
  PrismaPublicationStateRepository,
} from "./repositories.ts";

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required for database integration tests.");
  }
  return databaseUrl;
}

const databaseUrl = requiredDatabaseUrl();
const database = createDatabaseClient(databaseUrl);

after(async () => {
  await database.$disconnect();
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
