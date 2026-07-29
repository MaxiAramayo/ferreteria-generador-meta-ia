import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";

import {
  createDatabaseClient,
  PrismaMediaAssetRepository,
  PrismaOutboxRepository,
  PrismaPublicationProductionRepository,
} from "@aramayo/database";
import type {
  MediaAssetRecord,
  ReliableMutationContext,
} from "@aramayo/domain";
import type { DesignRenderer } from "@aramayo/design-engine";

import { OutboxDispatcherService } from "../outbox/outbox-dispatcher.service.ts";
import type { UploadMediaCommand } from "../media/media-lifecycle.service.ts";
import { PublicationRenderOutboxTransport } from "./publication-render.service.ts";

const databaseUrl = process.env["DATABASE_URL"];
const database =
  databaseUrl === undefined ? undefined : createDatabaseClient(databaseUrl);

after(async () => {
  await database?.$disconnect();
});

function hash(): string {
  return randomUUID().replaceAll("-", "").repeat(2);
}

function reliableMutation(
  organizationId: string,
  actorMembershipId: string,
  operation: string,
): ReliableMutationContext {
  const occurredAt = new Date().toISOString();
  return {
    auditEventId: randomUUID(),
    claim: {
      actorMembershipId,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      keyHash: hash(),
      operation,
      organizationId,
      requestHash: hash(),
    },
    completedExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    occurredAt,
    outboxEventId: randomUUID(),
  };
}

test(
  "outbox renderiza, persiste el mismo PNG y permite aprobar su snapshot",
  { skip: database === undefined },
  async () => {
    if (database === undefined) {
      return;
    }
    const organizationId = randomUUID();
    const editorUserId = randomUUID();
    const approverUserId = randomUUID();
    const editorMembershipId = randomUUID();
    const approverMembershipId = randomUUID();
    const publicationId = randomUUID();
    const revisionId = randomUUID();
    await database.organization.create({
      data: {
        displayName: "E2E render",
        id: organizationId,
        legalName: "E2E render",
        slug: `render-e2e-${organizationId}`,
      },
    });
    await database.user.createMany({
      data: [
        {
          displayName: "Editora E2E",
          email: `${editorUserId}@render-e2e.invalid`,
          id: editorUserId,
        },
        {
          displayName: "Aprobadora E2E",
          email: `${approverUserId}@render-e2e.invalid`,
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
          userId: editorUserId,
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
        title: "Consejo E2E",
      },
    });
    await database.publicationRevision.create({
      data: {
        content: { caption: "Consultanos", products: [] },
        contentHash: "c".repeat(64),
        createdByMembershipId: editorMembershipId,
        designDocument: {
          content: {
            callToAction: "Consultanos por WhatsApp",
            title: "Consejo E2E",
          },
          format: "historia",
          layout: "historia-tip",
          media: [],
          schemaVersion: 1,
          slug: "consejo-e2e",
          theme: "taller",
        },
        id: revisionId,
        organizationId,
        publicationId,
        revisionNumber: 1,
        schemaVersion: 1,
      },
    });

    const production = new PrismaPublicationProductionRepository(database);
    const renderMutation = reliableMutation(
      organizationId,
      editorMembershipId,
      "content.publication:request-render",
    );
    const requested = await production.requestRender({
      actorMembershipId: editorMembershipId,
      expectedVersion: 1,
      organizationId,
      publicationId,
      reliableOperation: renderMutation,
    });
    assert.equal(requested.status, "accepted");

    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const pngHash = createHash("sha256").update(png).digest("hex");
    const storedBytes = new Map<string, Uint8Array>();
    const mediaRepository = new PrismaMediaAssetRepository(database);
    const renderer: DesignRenderer = {
      render: (request) =>
        Promise.resolve({
          durationMs: 1,
          image: {
            byteLength: png.byteLength,
            height: 1920,
            png,
            sha256: pngHash,
            width: 1080,
          },
          ok: true,
          requestId: request.requestId,
        }),
    };
    const media = {
      async upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
        assert.equal(command.origin, "generated");
        const reservation = await mediaRepository.reserveUpload({
          id: command.mediaAssetId,
          organizationId: command.organizationId,
          origin: command.origin,
          originalFileName: command.originalFileName,
          ownerMembershipId: command.ownerMembershipId,
          storageProvider: "cloudinary",
        });
        assert.notEqual(reservation.status, "not-found");
        storedBytes.set(command.mediaAssetId, command.bytes);
        const completed = await mediaRepository.completeUpload({
          byteSize: String(command.bytes.byteLength),
          checksumSha256: pngHash,
          height: 1920,
          mediaAssetId: command.mediaAssetId,
          mimeType: "image/png",
          organizationId: command.organizationId,
          secureUrl: `https://media.example.invalid/${command.mediaAssetId}.png`,
          storageKey: `render/${command.mediaAssetId}`,
          storageVersion: 1,
          width: 1080,
        });
        if (completed.status !== "updated") {
          assert.fail("El almacenamiento doble debía confirmar el PNG.");
        }
        return completed.asset;
      },
    };
    const dispatcher = new OutboxDispatcherService(
      new PrismaOutboxRepository(database),
      new PublicationRenderOutboxTransport(production, renderer, media),
      `worker-${randomUUID()}`,
    );
    const dispatched = await dispatcher.dispatchBatch(new Date(), 100);
    assert.ok(dispatched.delivered >= 1);
    assert.equal(
      (
        await database.outboxMessage.findUniqueOrThrow({
          select: { status: true },
          where: { id: renderMutation.outboxEventId },
        })
      ).status,
      "delivered",
    );

    const approval = await production.approve({
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
    const snapshot = await database.approvalSnapshot.findFirstOrThrow({
      where: { organizationId, publicationId },
    });
    if (
      typeof snapshot.snapshot !== "object" ||
      snapshot.snapshot === null ||
      Array.isArray(snapshot.snapshot)
    ) {
      assert.fail("El snapshot debía poder restaurarse.");
    }
    const rendered = snapshot.snapshot["renderedMedia"];
    if (
      typeof rendered !== "object" ||
      rendered === null ||
      Array.isArray(rendered)
    ) {
      assert.fail("El snapshot no conservó el PNG.");
    }
    const mediaAssetId = rendered["mediaAssetId"];
    assert.equal(typeof mediaAssetId, "string");
    if (typeof mediaAssetId !== "string") {
      assert.fail("El snapshot no conservó la identidad del PNG.");
    }
    assert.equal(
      createHash("sha256")
        .update(storedBytes.get(mediaAssetId) ?? new Uint8Array())
        .digest("hex"),
      rendered["checksumSha256"],
    );

    const corruptPublicationId = randomUUID();
    const corruptRevisionId = randomUUID();
    await database.publication.create({
      data: {
        createdByMembershipId: editorMembershipId,
        id: corruptPublicationId,
        organizationId,
        title: "Imagen corrupta E2E",
      },
    });
    await database.publicationRevision.create({
      data: {
        content: { caption: "No debe producir fallback", products: [] },
        contentHash: "d".repeat(64),
        createdByMembershipId: editorMembershipId,
        designDocument: {
          content: {
            callToAction: "Consultanos por WhatsApp",
            title: "Imagen corrupta",
          },
          format: "historia",
          layout: "historia-tip",
          media: [],
          schemaVersion: 1,
          slug: "imagen-corrupta-e2e",
          theme: "taller",
        },
        id: corruptRevisionId,
        organizationId,
        publicationId: corruptPublicationId,
        revisionNumber: 1,
        schemaVersion: 1,
      },
    });
    const corruptMutation = reliableMutation(
      organizationId,
      editorMembershipId,
      "content.publication:request-render",
    );
    assert.equal(
      (
        await production.requestRender({
          actorMembershipId: editorMembershipId,
          expectedVersion: 1,
          organizationId,
          publicationId: corruptPublicationId,
          reliableOperation: corruptMutation,
        })
      ).status,
      "accepted",
    );
    let corruptUploads = 0;
    const corruptDispatcher = new OutboxDispatcherService(
      new PrismaOutboxRepository(database),
      new PublicationRenderOutboxTransport(
        production,
        {
          render: (request): ReturnType<DesignRenderer["render"]> =>
            Promise.resolve({
              durationMs: 1,
              failure: {
                assetReference: "media",
                reason: "decode-failed",
                stage: "asset",
              },
              ok: false,
              requestId: request.requestId,
            }),
        },
        {
          upload: (): Promise<MediaAssetRecord> => {
            corruptUploads += 1;
            return Promise.reject(new Error("unreachable"));
          },
        },
      ),
      `worker-${randomUUID()}`,
    );
    await corruptDispatcher.dispatchBatch(new Date(), 100);
    assert.equal(
      (
        await database.outboxMessage.findUniqueOrThrow({
          select: { status: true },
          where: { id: corruptMutation.outboxEventId },
        })
      ).status,
      "delivered",
    );
    const corrupted = await database.publication.findUniqueOrThrow({
      select: {
        failureCode: true,
        failureMessage: true,
        status: true,
      },
      where: { id: corruptPublicationId },
    });
    assert.deepEqual(corrupted, {
      failureCode: "render.asset",
      failureMessage: "Una imagen de la pieza no se pudo decodificar.",
      status: "generation_failed",
    });
    assert.equal(corruptUploads, 0);
  },
);
