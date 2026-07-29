import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  PublicationProductionRepository,
  PublicationRenderJob,
} from "@aramayo/domain";
import type { DesignRenderer } from "@aramayo/design-engine";

import type { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import {
  deterministicRenderMediaId,
  PublicationRenderOutboxTransport,
} from "./publication-render.service.ts";

const revisionId = "9e1904d4-9df0-43ec-84e2-72bac7e6eb95";
const job: PublicationRenderJob = {
  alreadyCompleted: false,
  actorMembershipId: "6e226dd6-8e30-40f2-802c-10cce98fd54f",
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
  organizationId: "f90ddc8a-63e9-4ac7-bbc0-3627caa43816",
  publicationId: "ffb525c2-fe2c-4a13-84bf-597568cf446b",
  publicationVersion: 2,
  revisionId,
};

function repositoryDouble(
  completeRender: PublicationProductionRepository["completeRender"],
  failRender: PublicationProductionRepository["failRender"],
): PublicationProductionRepository {
  return {
    approve: () => Promise.resolve({ status: "not-found" }),
    completeRender,
    failRender,
    findRenderJob: () => Promise.resolve(job),
    requestRender: () => Promise.resolve({ status: "not-found" }),
  };
}

test("la identidad del PNG es determinista y conserva formato UUID", () => {
  const first = deterministicRenderMediaId(revisionId);
  assert.equal(first, deterministicRenderMediaId(revisionId));
  assert.match(
    first,
    /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
  );
});

test("un render exitoso carga y confirma exactamente el PNG producido", async () => {
  let completedChecksum: string | undefined;
  const transport = new PublicationRenderOutboxTransport(
    repositoryDouble(
      (_job, output) => {
        completedChecksum = output.checksumSha256;
        return Promise.resolve({ status: "completed", version: 3 });
      },
      () => Promise.resolve({ status: "conflict" }),
    ),
    {
      render: (): ReturnType<DesignRenderer["render"]> =>
        Promise.resolve({
          durationMs: 5,
          image: {
            byteLength: 4,
            height: 1920,
            png: new Uint8Array([137, 80, 78, 71]),
            sha256: "a".repeat(64),
            width: 1080,
          },
          ok: true,
          requestId: "event-1",
        }),
    },
    {
      upload: (
        command,
      ): ReturnType<Pick<MediaLifecycleService, "upload">["upload"]> =>
        Promise.resolve({
          byteSize: String(command.bytes.byteLength),
          checksumSha256: "a".repeat(64),
          createdAt: new Date().toISOString(),
          height: 1920,
          id: command.mediaAssetId,
          mimeType: "image/png",
          organizationId: command.organizationId,
          origin: command.origin,
          originalFileName: command.originalFileName,
          ownerMembershipId: command.ownerMembershipId,
          secureUrl: "https://media.example.invalid/render.png",
          status: "available",
          storageKey: "render/output",
          storageProvider: "cloudinary",
          storageVersion: 1,
          updatedAt: new Date().toISOString(),
          width: 1080,
        }),
    },
  );
  await transport.deliver({
    aggregateId: job.publicationId,
    aggregateType: "publication",
    attempts: 1,
    availableAt: new Date().toISOString(),
    eventId: "event-1",
    organizationId: job.organizationId,
    payload: {
      publicationId: job.publicationId,
      revisionId: job.revisionId,
    },
    status: "processing",
    topic: "content.publication.render-requested",
  });
  assert.equal(completedChecksum, "a".repeat(64));
});

test("una imagen que no decodifica registra fallo y nunca carga un fallback", async () => {
  let failureCode: string | undefined;
  let uploads = 0;
  const transport = new PublicationRenderOutboxTransport(
    repositoryDouble(
      () => Promise.resolve({ status: "conflict" }),
      (failure) => {
        failureCode = failure.code;
        return Promise.resolve({ status: "completed", version: 3 });
      },
    ),
    {
      render: (): ReturnType<DesignRenderer["render"]> =>
        Promise.resolve({
          durationMs: 2,
          failure: {
            assetReference: "media",
            reason: "decode-failed",
            stage: "asset",
          },
          ok: false,
          requestId: "event-corrupt",
        }),
    },
    {
      upload: (): ReturnType<
        Pick<MediaLifecycleService, "upload">["upload"]
      > => {
        uploads += 1;
        return Promise.reject(new Error("unreachable"));
      },
    },
  );
  await transport.deliver({
    aggregateId: job.publicationId,
    aggregateType: "publication",
    attempts: 1,
    availableAt: new Date().toISOString(),
    eventId: "event-corrupt",
    organizationId: job.organizationId,
    payload: {
      publicationId: job.publicationId,
      revisionId: job.revisionId,
    },
    status: "processing",
    topic: "content.publication.render-requested",
  });
  assert.equal(failureCode, "render.asset");
  assert.equal(uploads, 0);
});

test("un evento repetido reconoce el PNG confirmado sin volver a renderizar", async () => {
  let renders = 0;
  let uploads = 0;
  const transport = new PublicationRenderOutboxTransport(
    {
      ...repositoryDouble(
        () => Promise.resolve({ status: "conflict" }),
        () => Promise.resolve({ status: "conflict" }),
      ),
      findRenderJob: (): Promise<PublicationRenderJob> =>
        Promise.resolve({ ...job, alreadyCompleted: true }),
    },
    {
      render: (): ReturnType<DesignRenderer["render"]> => {
        renders += 1;
        return Promise.reject(new Error("unreachable"));
      },
    },
    {
      upload: (): ReturnType<
        Pick<MediaLifecycleService, "upload">["upload"]
      > => {
        uploads += 1;
        return Promise.reject(new Error("unreachable"));
      },
    },
  );
  await transport.deliver({
    aggregateId: job.publicationId,
    aggregateType: "publication",
    attempts: 2,
    availableAt: new Date().toISOString(),
    eventId: "event-replayed",
    organizationId: job.organizationId,
    payload: {
      publicationId: job.publicationId,
      revisionId: job.revisionId,
    },
    status: "processing",
    topic: "content.publication.render-requested",
  });
  assert.equal(renders, 0);
  assert.equal(uploads, 0);
});
