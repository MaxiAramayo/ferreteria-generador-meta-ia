import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  normalizeBrandConfigurationUpdate,
  normalizeLocationConfigurationUpdate,
  transitionPublication,
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

after(async () => {
  await database.$disconnect();
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
