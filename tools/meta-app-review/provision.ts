import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { createDatabaseClient as CreateDatabaseClient } from "@aramayo/database";
import type { AuditEventInput } from "@aramayo/domain";

import {
  hashAppReviewContent,
  requireMetaAppReviewApproval,
} from "./approval.ts";
import {
  readMetaAppReviewDelivery,
  type MetaAppReviewDelivery,
} from "./delivery.ts";
import { metaAppReviewPublicationDesignInput } from "./content.ts";
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

function hasExactApprovedTargets(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const policy = (value as Record<string, unknown>)["publishingTargetPolicy"];
  if (policy === null || typeof policy !== "object" || Array.isArray(policy)) {
    return false;
  }
  const record = policy as Record<string, unknown>;
  return (
    record["mode"] === "exact" &&
    Array.isArray(record["targets"]) &&
    record["targets"].every((target) => typeof target === "string") &&
    sameStrings(record["targets"], metaAppReviewPackage.targets)
  );
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

async function verifyPublicPng(
  label: string,
  publicAssetUrl: string,
  expectedSha256: string,
): Promise<number> {
  const response = await fetch(publicAssetUrl, {
    headers: { accept: "image/png" },
    redirect: "error",
  });
  if (!response.ok || response.headers.get("content-type") !== "image/png") {
    throw new Error(
      `${label} no está disponible como PNG (${String(response.status)}).`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const checksum = sha256(bytes);
  if (checksum !== expectedSha256) {
    throw new Error(`${label} cambió: sha256=${checksum}.`);
  }
  return bytes.byteLength;
}

async function verifyPublicAssets(
  approvedSha256: string,
): Promise<Readonly<{ illustrative: number; rendered: number }>> {
  const [illustrative, rendered] = await Promise.all([
    verifyPublicPng(
      "La base ilustrativa pública",
      metaAppReviewPackage.illustrativeBase.publicAssetUrl,
      metaAppReviewPackage.illustrativeBase.sha256,
    ),
    verifyPublicPng(
      "El bitmap público",
      metaAppReviewPackage.publicAssetUrl,
      approvedSha256,
    ),
  ]);
  return Object.freeze({ illustrative, rendered });
}

function reviewContent(): Readonly<{
  caption: string;
  products: readonly Readonly<{ label: string; reference: string }>[];
}> {
  return Object.freeze({
    caption: metaAppReviewPackage.copy,
    products: Object.freeze([
      Object.freeze({
        label: "LA-SER Inverter 160 A",
        reference: metaAppReviewPackage.commercialSnapshot.externalProductId,
      }),
    ]),
  });
}

export async function provisionMetaAppReview(
  database: DatabaseClient,
  byteLengths: Readonly<{ illustrative: number; rendered: number }>,
  apply: boolean,
  delivery: MetaAppReviewDelivery,
): Promise<ProvisionResult> {
  const designDocument = metaAppReviewPublicationDesignInput();
  const approval = requireMetaAppReviewApproval(
    metaAppReviewPackage,
    designDocument,
  );
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

  if (delivery.organizationId !== membership.organizationId) {
    throw new Error(
      "El comprobante de Cloudinary pertenece a otra organización.",
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
  const approver = await database.organizationMembership.findFirst({
    include: { user: true },
    where: {
      id: connection.connectedByMembershipId,
      organizationId: membership.organizationId,
      status: "active",
    },
  });
  if (
    approver === null ||
    approver.user.status !== "active" ||
    !approver.roles.includes("approver")
  ) {
    throw new Error(
      "La identidad responsable de la aprobación no está habilitada.",
    );
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

  const approvedSha256 = approval.bitmapSha256;
  const content = reviewContent();
  const contentHash = hashAppReviewContent({ content, designDocument });
  const existing = await database.publication.findUnique({
    include: {
      approvalSnapshots: true,
      publishingOrders: true,
      revisions: {
        include: { renderedMedia: true },
        orderBy: { revisionNumber: "desc" },
      },
    },
    where: { id: metaAppReviewIds.publicationId },
  });
  const technicalReplacement =
    existing !== null &&
    existing.organizationId === membership.organizationId &&
    existing.title === "Muestra técnica de App Review" &&
    existing.status === "approved" &&
    existing.version === 3 &&
    existing.publishingOrders.length === 0 &&
    existing.revisions.length === 1 &&
    existing.approvalSnapshots.length === 1 &&
    existing.revisions[0]?.id === "5a080000-0000-4000-8000-000000000003" &&
    existing.revisions[0].contentHash ===
      "dcf3547af2e38076efdd8ac383beced782a50f929c956efa62bb7daecc197da5" &&
    existing.approvalSnapshots[0]?.contentHash ===
      existing.revisions[0].contentHash &&
    existing.revisions[0].renderedMedia?.checksumSha256 ===
      "91a4fd42bd7ecfd60f10f1862e8081124993683de34883a46a7bea547cbc74f0";
  if (existing !== null && !technicalReplacement) {
    const revision = existing.revisions[0];
    const snapshot = existing.approvalSnapshots.find(
      (entry) => entry.id === metaAppReviewIds.approvalSnapshotId,
    );
    if (
      existing.organizationId !== membership.organizationId ||
      existing.title !== metaAppReviewPackage.publicationTitle ||
      existing.status !== "approved" ||
      existing.publishingOrders.length !== 0 ||
      revision?.id !== metaAppReviewIds.revisionId ||
      revision.contentHash !== contentHash ||
      revision.renderedMedia?.checksumSha256 !== approvedSha256 ||
      revision.renderedMedia.storageKey !== delivery.storageKey ||
      revision.renderedMedia.storageVersion !== delivery.storageVersion ||
      snapshot?.contentHash !== contentHash ||
      !hasExactApprovedTargets(snapshot.snapshot)
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
  if (organizationPublicationCount !== (technicalReplacement ? 1 : 0)) {
    throw new Error(
      "Staging contiene publicaciones ajenas a la muestra aprobada.",
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

  const revisionNumber = technicalReplacement ? 2 : 1;
  const draftVersion = technicalReplacement ? 4 : 1;
  const now = new Date();
  await database.$transaction(async (transaction) => {
    if (technicalReplacement) {
      // Mismo lock que la admisión de órdenes: impide reemplazar mientras publica.
      await transaction.$queryRaw`SELECT id FROM publications WHERE id = ${metaAppReviewIds.publicationId}::uuid AND organization_id = ${membership.organizationId}::uuid FOR UPDATE`;
      const orderCount = await transaction.publicationOrder.count({
        where: {
          publicationId: metaAppReviewIds.publicationId,
          organizationId: membership.organizationId,
        },
      });
      if (orderCount !== 0)
        throw new Error(
          "La muestra recibió una orden; no se puede reemplazar.",
        );
      const replacement = await transaction.publication.updateMany({
        where: {
          id: metaAppReviewIds.publicationId,
          organizationId: membership.organizationId,
          version: 3,
          status: "approved",
        },
        data: {
          title: metaAppReviewPackage.publicationTitle,
          version: draftVersion + 2,
        },
      });
      if (replacement.count !== 1)
        throw new Error("La muestra cambió antes del reemplazo.");
    }
    await transaction.mediaAsset.create({
      data: {
        byteSize: BigInt(byteLengths.illustrative),
        checksumSha256: metaAppReviewPackage.illustrativeBase.sha256,
        height: metaAppReviewPackage.illustrativeBase.height,
        id: metaAppReviewIds.illustrativeMediaAssetId,
        mimeType: "image/png",
        organizationId: membership.organizationId,
        origin: "generated",
        originalFileName: metaAppReviewPackage.illustrativeBase.fileName,
        ownerMembershipId: connection.connectedByMembershipId,
        secureUrl: metaAppReviewPackage.illustrativeBase.publicAssetUrl,
        status: "available",
        storageKey: `meta-app-review/${metaAppReviewPackage.version}/illustrative-base`,
        storageProvider: "brand_library",
        storageVersion: 1,
        width: metaAppReviewPackage.illustrativeBase.width,
      },
    });
    await transaction.mediaAsset.create({
      data: {
        byteSize: BigInt(byteLengths.rendered),
        checksumSha256: approvedSha256,
        height: metaAppReviewPackage.height,
        id: metaAppReviewIds.mediaAssetId,
        mimeType: "image/png",
        organizationId: membership.organizationId,
        origin: "approved_library",
        originalFileName: metaAppReviewPackage.fileName,
        ownerMembershipId: connection.connectedByMembershipId,
        secureUrl: delivery.secureUrl,
        status: "available",
        storageKey: delivery.storageKey,
        storageProvider: "cloudinary",
        storageVersion: delivery.storageVersion,
        width: metaAppReviewPackage.width,
      },
    });
    if (!technicalReplacement)
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
        revisionNumber,
        schemaVersion: 1,
        status: "approved",
      },
    });
    await transaction.publicationRevisionMedia.create({
      data: {
        alt: metaAppReviewPackage.altText,
        id: metaAppReviewIds.revisionMediaId,
        mediaAssetId: metaAppReviewIds.illustrativeMediaAssetId,
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
          checksumSha256: metaAppReviewPackage.illustrativeBase.sha256,
          mediaAssetId: metaAppReviewIds.illustrativeMediaAssetId,
          secureUrl: metaAppReviewPackage.illustrativeBase.publicAssetUrl,
          slot: "primary",
          storageVersion: 1,
        },
      ],
      renderedMedia: {
        byteSize: String(byteLengths.rendered),
        checksumSha256: approvedSha256,
        height: metaAppReviewPackage.height,
        mediaAssetId: metaAppReviewIds.mediaAssetId,
        mimeType: "image/png",
        secureUrl: delivery.secureUrl,
        storageVersion: delivery.storageVersion,
        width: metaAppReviewPackage.width,
      },
      publishingTargetPolicy: {
        mode: "exact",
        targets: metaAppReviewPackage.targets,
      },
      revisionId: metaAppReviewIds.revisionId,
      revisionNumber,
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
    if (technicalReplacement)
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: connection.connectedByMembershipId,
          commandType: "edit_approved",
          fromStatus: "approved",
          fromVersion: 3,
          id: metaAppReviewIds.transitionEditId,
          newRevisionId: metaAppReviewIds.revisionId,
          occurredAt: now,
          organizationId: membership.organizationId,
          publicationId: metaAppReviewIds.publicationId,
          toStatus: "draft",
          toVersion: draftVersion,
        },
      });
    await transaction.publicationStateTransition.createMany({
      data: [
        {
          actorMembershipId: connection.connectedByMembershipId,
          commandType: "advance",
          fromStatus: "draft",
          fromVersion: draftVersion,
          id: metaAppReviewIds.transitionReadyId,
          occurredAt: now,
          organizationId: membership.organizationId,
          publicationId: metaAppReviewIds.publicationId,
          toStatus: "ready_for_review",
          toVersion: draftVersion + 1,
        },
        {
          actorMembershipId: connection.connectedByMembershipId,
          approvalSnapshotId: metaAppReviewIds.approvalSnapshotId,
          commandType: "approve",
          fromStatus: "ready_for_review",
          fromVersion: draftVersion + 1,
          id: metaAppReviewIds.transitionApprovedId,
          occurredAt: now,
          organizationId: membership.organizationId,
          publicationId: metaAppReviewIds.publicationId,
          toStatus: "approved",
          toVersion: draftVersion + 2,
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
          approvedBitmapSha256: approvedSha256,
          approvedCopy: metaAppReviewPackage.copy,
          approvedPackageSha256: approval.packageSha256,
          maxOrders: metaAppReviewPackage.maxOrders,
          purpose: "meta_app_review",
          replacedTechnicalRevision: technicalReplacement,
          businessApprovalAt: approval.approvedAt,
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
    .filter((arg) => arg !== "--apply" && !arg.startsWith("--delivery="));
  if (unexpectedArguments.length > 0) {
    throw new Error(
      `Argumentos no admitidos: ${unexpectedArguments.join(", ")}.`,
    );
  }
  const apply = process.argv.includes("--apply");
  const approval = requireMetaAppReviewApproval(
    metaAppReviewPackage,
    metaAppReviewPublicationDesignInput(),
  );
  const deliveryPath = process.argv
    .find((arg) => arg.startsWith("--delivery="))
    ?.slice("--delivery=".length);
  if (!deliveryPath)
    throw new Error(
      "--delivery es obligatorio para provisionar el original de Cloudinary.",
    );
  const delivery = await readMetaAppReviewDelivery(deliveryPath);
  const [createDatabaseClient, byteLengths] = await Promise.all([
    loadDatabaseFactory(),
    verifyPublicAssets(approval.bitmapSha256),
  ]);
  await verifyPublicPng(
    "El original de Cloudinary",
    delivery.secureUrl,
    approval.bitmapSha256,
  );
  const database = createDatabaseClient(databaseUrl);
  try {
    const result = await provisionMetaAppReview(
      database,
      byteLengths,
      apply,
      delivery,
    );
    process.stdout.write(
      `${result.status} publication=${result.publicationId} contentHash=${result.contentHash}\n`,
    );
  } finally {
    await database.$disconnect();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
)
  try {
    await main();
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : "Error desconocido.";
    process.stderr.write(`No se pudo provisionar App Review: ${message}\n`);
    process.exitCode = 1;
  }
