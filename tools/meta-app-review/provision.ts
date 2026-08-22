import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { createDatabaseClient as CreateDatabaseClient } from "@aramayo/database";
import type { AuditEventInput } from "@aramayo/domain";
import type { Prisma } from "../../infrastructure/database/src/generated/prisma/client.ts";

import { metaAppReviewIds, metaAppReviewPackage } from "./manifest.ts";

type DatabaseClient = ReturnType<typeof CreateDatabaseClient>;

const expectedWebOrigin = "https://staging.content.ferreteriaaramayo.com.ar";
const implicitPermissions = new Set(["public_profile"]);
const successfulAuditOutcome = "success" satisfies AuditEventInput["outcome"];

interface ProvisionResult {
  readonly contentHash: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly status: "already-provisioned" | "created" | "verified";
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((entry, index) => entry === [...right].sort()[index])
  );
}

function jsonStringArray(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error(
      "La conexión Meta conserva permisos con un formato inválido.",
    );
  }
  return Object.freeze(value);
}

async function loadDatabaseFactory(): Promise<typeof CreateDatabaseClient> {
  const requireFromApplication = createRequire(
    join(process.cwd(), "package.json"),
  );
  const modulePath = requireFromApplication.resolve("@aramayo/database");
  const databaseModule: unknown = await import(
    pathToFileURL(modulePath).toString()
  );
  if (
    databaseModule === null ||
    typeof databaseModule !== "object" ||
    !("createDatabaseClient" in databaseModule) ||
    typeof databaseModule.createDatabaseClient !== "function"
  ) {
    throw new Error("No se pudo cargar el cliente de base de datos.");
  }
  return databaseModule.createDatabaseClient as typeof CreateDatabaseClient;
}

async function verifyPublicAsset(): Promise<number> {
  const response = await fetch(metaAppReviewPackage.publicAssetUrl, {
    headers: { accept: "image/png" },
    redirect: "error",
  });
  if (!response.ok || response.headers.get("content-type") !== "image/png") {
    throw new Error(
      `El bitmap público no está disponible como PNG (${String(response.status)}).`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = sha256(bytes);
  if (checksum !== metaAppReviewPackage.sha256) {
    throw new Error(`El bitmap público cambió: sha256=${checksum}.`);
  }
  return bytes.byteLength;
}

function reviewContent(): Readonly<{
  caption: string;
  products: readonly never[];
}> {
  return Object.freeze({
    caption: metaAppReviewPackage.copy,
    products: Object.freeze([]),
  });
}

function reviewDesignDocument(): Prisma.InputJsonObject {
  return Object.freeze({
    content: Object.freeze({
      badge: "App Review",
      callToAction: "Confirmá una sola vez",
      category: "Revisión técnica",
      subtitle: "Sin oferta comercial",
      title: metaAppReviewPackage.publicationTitle,
    }),
    format: "feed",
    layout: "producto-destacado",
    media: Object.freeze([
      Object.freeze({
        alt: metaAppReviewPackage.altText,
        reference: Object.freeze({
          source: "remote",
          url: metaAppReviewPackage.publicAssetUrl,
        }),
      }),
    ]),
    schemaVersion: 1,
    slug: "muestra-tecnica-meta-app-review",
    theme: "taller",
  });
}

async function provision(
  database: DatabaseClient,
  byteLength: number,
  apply: boolean,
): Promise<ProvisionResult> {
  const reviewer = await database.user.findUnique({
    include: { memberships: true },
    where: { email: metaAppReviewPackage.reviewer.email },
  });
  if (reviewer === null || reviewer.memberships.length !== 1) {
    throw new Error("La identidad temporal no existe o no está aislada.");
  }
  const membership = reviewer.memberships[0];
  if (membership === undefined || membership.status !== "active") {
    throw new Error("La membresía temporal no está activa.");
  }
  if (!sameStrings(membership.roles, metaAppReviewPackage.reviewer.roles)) {
    throw new Error(
      `Los roles temporales no son mínimos: ${membership.roles.join(",")}.`,
    );
  }

  const connection = await database.metaConnection.findFirst({
    include: { assets: true },
    where: {
      health: "healthy",
      organizationId: membership.organizationId,
      revokedAt: null,
    },
  });
  if (connection === null) {
    throw new Error("No existe una conexión Meta sana para la organización.");
  }
  const grantedPermissions = jsonStringArray(connection.grantedPermissions);
  const unexpectedPermissions = grantedPermissions.filter(
    (permission) =>
      !metaAppReviewPackage.requiredMetaPermissions.includes(
        permission as (typeof metaAppReviewPackage.requiredMetaPermissions)[number],
      ) && !implicitPermissions.has(permission),
  );
  const missingPermissions =
    metaAppReviewPackage.requiredMetaPermissions.filter(
      (permission) => !grantedPermissions.includes(permission),
    );
  if (missingPermissions.length > 0 || unexpectedPermissions.length > 0) {
    throw new Error(
      `Permisos Meta incompatibles; faltan=${missingPermissions.join(",") || "ninguno"}; sobran=${unexpectedPermissions.join(",") || "ninguno"}.`,
    );
  }
  const activeAssetKinds = connection.assets
    .filter((asset) => asset.status === "active")
    .map((asset) => asset.kind);
  if (
    !activeAssetKinds.includes("page") ||
    !activeAssetKinds.includes("instagram_business")
  ) {
    throw new Error("La conexión no conserva Page e Instagram activos.");
  }

  const content = reviewContent();
  const designDocument = reviewDesignDocument();
  const contentHash = sha256(stableJson({ content, designDocument }));
  const existing = await database.publication.findUnique({
    include: {
      approvalSnapshots: true,
      publishingOrders: true,
      revisions: { include: { renderedMedia: true } },
    },
    where: { id: metaAppReviewIds.publicationId },
  });
  if (existing !== null) {
    const revision = existing.revisions[0];
    const snapshot = existing.approvalSnapshots[0];
    if (
      existing.organizationId !== membership.organizationId ||
      existing.title !== metaAppReviewPackage.publicationTitle ||
      existing.status !== "approved" ||
      existing.publishingOrders.length !== 0 ||
      existing.revisions.length !== 1 ||
      revision?.contentHash !== contentHash ||
      revision.renderedMedia?.checksumSha256 !== metaAppReviewPackage.sha256 ||
      existing.approvalSnapshots.length !== 1 ||
      snapshot?.contentHash !== contentHash
    ) {
      throw new Error(
        "La muestra existente no coincide con el manifiesto aprobado.",
      );
    }
    return Object.freeze({
      contentHash,
      organizationId: membership.organizationId,
      publicationId: existing.id,
      status: "already-provisioned",
    });
  }

  const organizationPublicationCount = await database.publication.count({
    where: { organizationId: membership.organizationId },
  });
  if (organizationPublicationCount !== 0) {
    throw new Error(
      "Staging contiene publicaciones ajenas a la muestra técnica.",
    );
  }
  if (!apply) {
    return Object.freeze({
      contentHash,
      organizationId: membership.organizationId,
      publicationId: metaAppReviewIds.publicationId,
      status: "verified",
    });
  }

  const now = new Date();
  await database.$transaction(async (transaction) => {
    await transaction.mediaAsset.create({
      data: {
        byteSize: BigInt(byteLength),
        checksumSha256: metaAppReviewPackage.sha256,
        height: metaAppReviewPackage.height,
        id: metaAppReviewIds.mediaAssetId,
        mimeType: "image/png",
        organizationId: membership.organizationId,
        origin: "approved_library",
        originalFileName: metaAppReviewPackage.fileName,
        ownerMembershipId: connection.connectedByMembershipId,
        secureUrl: metaAppReviewPackage.publicAssetUrl,
        status: "available",
        storageKey: `meta-app-review/${metaAppReviewPackage.version}`,
        storageProvider: "brand_library",
        storageVersion: 1,
        width: metaAppReviewPackage.width,
      },
    });
    await transaction.publication.create({
      data: {
        createdByMembershipId: connection.connectedByMembershipId,
        id: metaAppReviewIds.publicationId,
        organizationId: membership.organizationId,
        status: "approved",
        title: metaAppReviewPackage.publicationTitle,
        version: 3,
      },
    });
    await transaction.publicationRevision.create({
      data: {
        content,
        contentHash,
        createdByMembershipId: connection.connectedByMembershipId,
        designDocument,
        id: metaAppReviewIds.revisionId,
        organizationId: membership.organizationId,
        publicationId: metaAppReviewIds.publicationId,
        renderedAt: now,
        renderedMediaAssetId: metaAppReviewIds.mediaAssetId,
        revisionNumber: 1,
        schemaVersion: 1,
        status: "approved",
      },
    });
    await transaction.publicationRevisionMedia.create({
      data: {
        alt: metaAppReviewPackage.altText,
        id: metaAppReviewIds.revisionMediaId,
        mediaAssetId: metaAppReviewIds.mediaAssetId,
        organizationId: membership.organizationId,
        revisionId: metaAppReviewIds.revisionId,
        slot: "primary",
      },
    });
    const snapshot = {
      content,
      contentHash,
      designDocument,
      designSchemaVersion: 1,
      inputMedia: [
        {
          alt: metaAppReviewPackage.altText,
          checksumSha256: metaAppReviewPackage.sha256,
          mediaAssetId: metaAppReviewIds.mediaAssetId,
          secureUrl: metaAppReviewPackage.publicAssetUrl,
          slot: "primary",
          storageVersion: 1,
        },
      ],
      renderedMedia: {
        byteSize: String(byteLength),
        checksumSha256: metaAppReviewPackage.sha256,
        height: metaAppReviewPackage.height,
        mediaAssetId: metaAppReviewIds.mediaAssetId,
        mimeType: "image/png",
        secureUrl: metaAppReviewPackage.publicAssetUrl,
        storageVersion: 1,
        width: metaAppReviewPackage.width,
      },
      revisionId: metaAppReviewIds.revisionId,
      revisionNumber: 1,
      snapshotSchemaVersion: 1,
    };
    await transaction.approvalSnapshot.create({
      data: {
        approvedAt: now,
        approvedByMembershipId: connection.connectedByMembershipId,
        contentHash,
        id: metaAppReviewIds.approvalSnapshotId,
        organizationId: membership.organizationId,
        publicationId: metaAppReviewIds.publicationId,
        revisionId: metaAppReviewIds.revisionId,
        snapshot,
      },
    });
    await transaction.publicationStateTransition.createMany({
      data: [
        {
          actorMembershipId: connection.connectedByMembershipId,
          commandType: "advance",
          fromStatus: "draft",
          fromVersion: 1,
          id: metaAppReviewIds.transitionReadyId,
          occurredAt: now,
          organizationId: membership.organizationId,
          publicationId: metaAppReviewIds.publicationId,
          toStatus: "ready_for_review",
          toVersion: 2,
        },
        {
          actorMembershipId: connection.connectedByMembershipId,
          approvalSnapshotId: metaAppReviewIds.approvalSnapshotId,
          commandType: "approve",
          fromStatus: "ready_for_review",
          fromVersion: 2,
          id: metaAppReviewIds.transitionApprovedId,
          occurredAt: now,
          organizationId: membership.organizationId,
          publicationId: metaAppReviewIds.publicationId,
          toStatus: "approved",
          toVersion: 3,
        },
      ],
    });
    await transaction.auditEvent.create({
      data: {
        actorMembershipId: connection.connectedByMembershipId,
        entityId: metaAppReviewIds.publicationId,
        entityType: "publication",
        id: metaAppReviewIds.auditEventId,
        metadata: {
          approvedBitmapSha256: metaAppReviewPackage.sha256,
          approvedCopy: metaAppReviewPackage.copy,
          maxOrders: 1,
          purpose: "meta_app_review",
          targets: metaAppReviewPackage.targets,
          version: metaAppReviewPackage.version,
        },
        occurredAt: now,
        operation: "meta.app-review:provision",
        organizationId: membership.organizationId,
        outcome: successfulAuditOutcome,
      },
    });
  });

  return Object.freeze({
    contentHash,
    organizationId: membership.organizationId,
    publicationId: metaAppReviewIds.publicationId,
    status: "created",
  });
}

async function main(): Promise<void> {
  if (process.env["WEB_ORIGIN"] !== expectedWebOrigin) {
    throw new Error("El provisionador sólo puede operar en staging.");
  }
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL es obligatorio.");
  }
  const unexpectedArguments = process.argv
    .slice(2)
    .filter((arg) => arg !== "--apply");
  if (unexpectedArguments.length > 0) {
    throw new Error(
      `Argumentos no admitidos: ${unexpectedArguments.join(", ")}.`,
    );
  }
  const apply = process.argv.includes("--apply");
  const [createDatabaseClient, byteLength] = await Promise.all([
    loadDatabaseFactory(),
    verifyPublicAsset(),
  ]);
  const database = createDatabaseClient(databaseUrl);
  try {
    const result = await provision(database, byteLength, apply);
    process.stdout.write(
      `${result.status} publication=${result.publicationId} contentHash=${result.contentHash}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`No se pudo provisionar App Review: ${message}\n`);
  process.exitCode = 1;
}
