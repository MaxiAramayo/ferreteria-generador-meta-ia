import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalPrePublishProfileSchemaVersion,
  type MediaAssetRecord,
  type MetaConnectionRecord,
  type PublicationOrderJob,
  type PublicationOrderTargetRecord,
} from "@aramayo/domain";

import {
  PrePublishValidator,
  type PrePublishCommercialPort,
  type PrePublishCommercialSession,
  type PrePublishConnectionPort,
  type PrePublishMediaAssetPort,
  type PrePublishMediaStoragePort,
} from "./pre-publish.validator.ts";
import type { PublicationCredentialPort } from "./publication-order.transport.ts";

const organizationId = "organization-1";
const orderId = "order-1";
const mediaAssetId = "media-1";
const checksum = "a".repeat(64);

function connection(): MetaConnectionRecord {
  return Object.freeze({
    accountName: "Aramayo",
    assets: Object.freeze([
      Object.freeze({
        id: "page-asset",
        kind: "page" as const,
        name: "Page",
        providerAssetId: "page-1",
        status: "active" as const,
      }),
      Object.freeze({
        id: "instagram-asset",
        kind: "instagram_business" as const,
        name: "Instagram",
        providerAssetId: "instagram-1",
        status: "active" as const,
      }),
    ]),
    createdAt: "2026-09-07T12:00:00.000Z",
    grantedPermissions: Object.freeze([
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ]),
    health: "healthy" as const,
    id: "connection-1",
    lastCheckedAt: "2026-09-07T12:00:00.000Z",
    organizationId,
    providerAccountId: "account-1",
    updatedAt: "2026-09-07T12:00:00.000Z",
    version: 1,
  });
}

function mediaAsset(): MediaAssetRecord {
  return Object.freeze({
    checksumSha256: checksum,
    createdAt: "2026-09-07T12:00:00.000Z",
    height: 1350,
    id: mediaAssetId,
    mimeType: "image/png",
    organizationId,
    origin: "generated" as const,
    originalFileName: "pieza.png",
    ownerMembershipId: "membership-1",
    status: "available" as const,
    storageKey: "aramayo/posts/piece",
    storageProvider: "cloudinary" as const,
    storageVersion: 1,
    updatedAt: "2026-09-07T12:00:00.000Z",
    width: 1080,
  });
}

function job(
  profile: Readonly<Record<string, unknown>> = Object.freeze({
    factualClaims: [],
    requiredClaims: [],
    schemaVersion: approvalPrePublishProfileSchemaVersion,
  }),
): PublicationOrderJob {
  return Object.freeze({
    approvalSnapshotId: "snapshot-1",
    contentHash: checksum,
    locationId: "location-1",
    orderId,
    organizationId,
    publicationId: "publication-1",
    publicationStatus: "publishing",
    requestedByMembershipId: "membership-1",
    snapshot: {
      content: { caption: "Una pieza aprobada." },
      prePublishProfile: profile,
      renderedMedia: {
        checksumSha256: checksum,
        height: 1350,
        mediaAssetId,
        mimeType: "image/png",
        width: 1080,
      },
      revisionId: "revision-1",
    },
    targets: Object.freeze([target("facebook_page")]),
  });
}

function target(
  targetName: PublicationOrderTargetRecord["target"],
): PublicationOrderTargetRecord {
  return Object.freeze({
    publicationTargetId: `target:${targetName}`,
    state: "pending" as const,
    target: targetName,
    updatedAt: "2026-09-07T12:00:00.000Z",
  });
}

class Connections implements PrePublishConnectionPort {
  current: readonly MetaConnectionRecord[] = Object.freeze([connection()]);

  list(): Promise<readonly MetaConnectionRecord[]> {
    return Promise.resolve(this.current);
  }
}

class Media implements PrePublishMediaAssetPort {
  current: MediaAssetRecord | null = mediaAsset();

  findById(): Promise<MediaAssetRecord | null> {
    return Promise.resolve(this.current);
  }
}

class Commercial
  implements PrePublishCommercialPort, PrePublishCommercialSession
{
  priceResult: Readonly<{ amountMinor: number; kind: "priced" }> | null =
    Object.freeze({ amountMinor: 123_456_00, kind: "priced" as const });
  stockResult: Readonly<{ kind: "known"; quantity: number }> | null =
    Object.freeze({ kind: "known" as const, quantity: 3 });

  createSession(): PrePublishCommercialSession {
    return this;
  }

  price(): Promise<Readonly<{ amountMinor: number; kind: "priced" }> | null> {
    return Promise.resolve(this.priceResult);
  }

  stock(): Promise<Readonly<{ kind: "known"; quantity: number }> | null> {
    return Promise.resolve(this.stockResult);
  }
}

function validator(
  input: Readonly<{
    commercial?: PrePublishCommercialPort | null;
    connections?: Connections;
    credentials?: PublicationCredentialPort;
    media?: Media;
  }> = {},
): PrePublishValidator {
  const storage: PrePublishMediaStoragePort = {
    deliveryUrl: (): string => "https://res.cloudinary.com/aramayo/piece.jpg",
  };
  const credentials: PublicationCredentialPort = input.credentials ?? {
    pageAccessToken: (): Promise<string> => Promise.resolve("page-token"),
  };
  return new PrePublishValidator(
    input.connections ?? new Connections(),
    credentials,
    input.media ?? new Media(),
    storage,
    {
      probe: (): Promise<
        Readonly<{
          byteSize: number;
          mimeType: string;
          status: "reachable";
        }>
      > =>
        Promise.resolve({
          byteSize: 500_000,
          mimeType: "image/jpeg",
          status: "reachable" as const,
        }),
    },
    input.commercial ?? null,
    null,
    { now: (): Date => new Date("2026-09-07T13:00:00.000Z") },
  );
}

test("habilita una pieza vigente sin crear un intento remoto", async () => {
  const result = await validator().validate(job(), [target("facebook_page")]);

  assert.equal(result.status, "ready");
  assert.equal(result.context.caption, "Una pieza aprobada.");
  assert.equal(result.context.connection.id, "connection-1");
});

test("bloquea una credencial revocada antes de llamar a Meta", async () => {
  const result = await validator({
    credentials: {
      pageAccessToken: (): Promise<null> => Promise.resolve(null),
    },
  }).validate(job(), [target("facebook_page")]);

  assert.deepEqual(result, {
    code: "prepublish-credential-unavailable",
    safeMessage:
      "No se puede usar la credencial de Meta. Reconectá la cuenta antes de publicar.",
    status: "blocked",
  });
});

test("bloquea un medio ausente sin llegar a la conexión", async () => {
  const media = new Media();
  media.current = null;

  const result = await validator({ media }).validate(job(), [
    target("facebook_page"),
  ]);

  assert.equal(result.status, "blocked");
  assert.equal(result.code, "prepublish-media-unavailable");
});

test("bloquea evidencia comercial insuficiente en lugar de asumirla vigente", async () => {
  const result = await validator().validate(
    job({
      factualClaims: [],
      requiredClaims: ["price"],
      schemaVersion: approvalPrePublishProfileSchemaVersion,
    }),
    [target("facebook_page")],
  );

  assert.equal(result.status, "blocked");
  assert.equal(result.code, "prepublish-evidence-missing");
});

test("bloquea cambios de precio y stock desde la aprobación", async () => {
  const commercial = new Commercial();
  commercial.priceResult = Object.freeze({
    amountMinor: 123_457_00,
    kind: "priced" as const,
  });
  const priceResult = await validator({ commercial }).validate(
    job({
      factualClaims: [
        {
          claimKind: "price",
          evidenceId: "price-1",
          externalProductId: "product-1",
          statement: "$ 123.456,00",
        },
      ],
      requiredClaims: ["price"],
      schemaVersion: approvalPrePublishProfileSchemaVersion,
    }),
    [target("facebook_page")],
  );
  assert.equal(priceResult.status, "blocked");
  assert.equal(priceResult.code, "prepublish-price-changed");

  commercial.priceResult = Object.freeze({
    amountMinor: 123_456_00,
    kind: "priced" as const,
  });
  commercial.stockResult = Object.freeze({
    kind: "known" as const,
    quantity: 2,
  });
  const stockResult = await validator({ commercial }).validate(
    job({
      factualClaims: [
        {
          claimKind: "stock",
          evidenceId: "stock-1",
          externalProductId: "product-1",
          statement: "Hay 3 unidades disponibles.",
        },
      ],
      requiredClaims: ["stock"],
      schemaVersion: approvalPrePublishProfileSchemaVersion,
    }),
    [target("facebook_page")],
  );
  assert.equal(stockResult.status, "blocked");
  assert.equal(stockResult.code, "prepublish-stock-changed");
});
