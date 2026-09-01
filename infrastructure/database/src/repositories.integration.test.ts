import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import {
  normalizeBrandConfigurationUpdate,
  normalizeLocationConfigurationUpdate,
  pendingPublicationTargets,
  publicationOrderStatus,
  transitionPublication,
  type GenerationRunRecord,
  type GenerationVariantRecord,
  type MetaPublishingAttemptRecord,
  type MetaPublishingFailureCode,
  type OrganizationRole,
  type ReserveKnowledgeDocumentVersionInput,
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
import { PrismaKnowledgeDocumentRepository } from "./knowledge-document-repository.ts";
import { PrismaCommercialToolAuditRepository } from "./commercial-tool-audit-repository.ts";
import {
  PrismaContentBriefRequestRepository,
  PrismaContentBriefRunRepository,
} from "./content-brief-run-repository.ts";
import {
  PrismaGenerationRunEditorialRepository,
  PrismaGenerationRunRepository,
  PrismaGenerationRunRequestRepository,
} from "./generation-run-repository.ts";
import { PrismaGenerationPolicyRepository } from "./generation-governance-repository.ts";
import { PrismaMetaConnectionRepository } from "./meta-connection-repository.ts";
import { PrismaPublicationDraftRepository } from "./publication-draft-repository.ts";
import {
  PrismaPublicationOrderRepository,
  publicationTargetKey,
} from "./publication-order-repository.ts";
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

test("audita herramientas comerciales con actor y organización aislados", async () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  await database.organization.createMany({
    data: [
      {
        displayName: "Organización herramienta comercial",
        id: organizationId,
        legalName: "Organización herramienta comercial",
        slug: `commercial-tool-${organizationId}`,
      },
      {
        displayName: "Organización comercial ajena",
        id: otherOrganizationId,
        legalName: "Organización comercial ajena",
        slug: `commercial-tool-other-${otherOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: "Operador comercial",
      email: `${userId}@example.invalid`,
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

  const repository = new PrismaCommercialToolAuditRepository(database);
  const eventId = randomUUID();
  const runId = randomUUID();
  await repository.record({
    actorMembershipId: membershipId,
    callId: "call_catalog_1",
    durationMilliseconds: 12,
    eventId,
    occurredAt: "2026-07-29T16:00:00.000Z",
    organizationId,
    outcome: "success",
    resultKind: "search-result",
    runId,
    safeParameters: {
      argumentNames: ["limit", "query"],
      limit: 5,
      queryCharacters: 9,
    },
    toolName: "search_products",
  });

  const event = await database.auditEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  assert.equal(event.organizationId, organizationId);
  assert.equal(event.actorMembershipId, membershipId);
  assert.equal(event.operation, "commercial.tool.search-products");
  assert.equal(event.entityId, runId);
  assert.equal(JSON.stringify(event.metadata).includes("amoladora"), false);

  await assert.rejects(
    repository.record({
      actorMembershipId: membershipId,
      callId: "call_cross_scope",
      durationMilliseconds: 1,
      eventId: randomUUID(),
      occurredAt: "2026-07-29T16:00:01.000Z",
      organizationId: otherOrganizationId,
      outcome: "failure",
      resultKind: "invalid-scope",
      runId: randomUUID(),
      safeParameters: {},
      toolName: "get_product",
    }),
  );
});

test("el historial de briefs reserva, cierra, cancela y aísla organizaciones", async () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  await database.organization.createMany({
    data: [
      {
        displayName: "Organización brief",
        id: organizationId,
        legalName: "Organización brief",
        slug: `brief-run-${organizationId}`,
      },
      {
        displayName: "Organización brief ajena",
        id: otherOrganizationId,
        legalName: "Organización brief ajena",
        slug: `brief-run-other-${otherOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: "Editor de briefs",
      email: `${userId}@example.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: { id: membershipId, organizationId, roles: ["editor"], userId },
  });
  await database.brand.create({
    data: {
      id: brandId,
      name: "Aramayo",
      organizationId,
      profile: { claim: "Ferretería y lubricentro" },
    },
  });
  await database.location.create({
    data: {
      addressLine: "República de Siria 365",
      brandId,
      city: "Frías",
      id: locationId,
      name: "Casa Central",
      openingHours: { display: "Lun a sáb · 08:30 a 13:00" },
      organizationId,
      province: "Santiago del Estero",
    },
  });

  const repository = new PrismaContentBriefRunRepository(database);
  const reservation = (
    id: string,
  ): Parameters<PrismaContentBriefRunRepository["reserve"]>[0] => ({
    actorMembershipId: membershipId,
    id,
    locationId,
    organizationId,
    request: "Necesito una pieza para promocionar taladros percutores.",
    requestHash: "a".repeat(64),
    requestedAt: "2026-07-30T12:00:00.000Z",
  });
  const completion = (
    id: string,
    generated: boolean,
  ): Parameters<PrismaContentBriefRunRepository["complete"]>[0] => ({
    attempts: 1,
    brief: generated
      ? {
          brand: "ferreteria" as const,
          callToAction: {
            kind: "whatsapp" as const,
            label: "Consultanos por WhatsApp",
          },
          caption:
            "Pasá por el local y consultanos cuál te sirve para el trabajo que tenés entre manos.",
          creativeProposal: "Tono directo.",
          missingInformation: [],
          objective: "product" as const,
          products: [],
          requiresHumanApproval: false,
          subtitle: null,
          title: "Taladro percutor para tu obra",
          verifiedFacts: [],
          visualDirection: "clean_product" as const,
        }
      : null,
    estimatedCostUsd: 0.004_215,
    evidence: [
      {
        citationId: "C1",
        kind: "commercial" as const,
        observedAt: "2026-07-30T11:59:30.000Z",
        reference: "odoo:product:42",
      },
    ],
    id,
    knowledgeStatus: "grounded",
    latencyMilliseconds: 820,
    model: "gpt-5.6-terra",
    organizationId,
    promptHash: "b".repeat(64),
    promptVersion: "content-brief/2026-07-30.2",
    rejection: generated
      ? null
      : { code: "evidence-stale", message: "La evidencia está vencida." },
    requestId: "req_brief",
    responseId: "resp_brief",
    schemaVersion: "content-brief/2026-07-30.1",
    status: generated ? ("generated" as const) : ("rejected" as const),
    toolInvocations: [
      {
        callId: "call-product",
        outcome: "success" as const,
        toolName: "get_product",
      },
    ],
    toolNames: ["search_products", "get_product"],
    usage: {
      cacheWriteInputTokens: 0,
      cachedInputTokens: 0,
      estimatedCostUsd: 0.004_215,
      inputTokens: 900,
      outputTokens: 220,
      reasoningTokens: 40,
      totalTokens: 1_160,
    },
  });

  // Una reserva queda pendiente y sin resultado.
  const generatedId = randomUUID();
  await repository.reserve(reservation(generatedId));
  const pending = await repository.findById({
    id: generatedId,
    organizationId,
  });
  assert.ok(pending !== null);
  assert.equal(pending.status, "pending");
  assert.equal(pending.brief, null);
  assert.equal(pending.completedAt, null);
  // Reservar no elige prompt ni esquema: se anotan al cerrar, cuando describen
  // lo que realmente ejecutó.
  assert.equal(pending.promptVersion, null);
  assert.equal(pending.promptHash, null);
  assert.equal(pending.schemaVersion, null);

  assert.deepEqual(
    await repository.complete(
      completion(generatedId, true),
      "2026-07-30T12:00:30.000Z",
    ),
    { status: "completed" },
  );
  const generated = await repository.findById({
    id: generatedId,
    organizationId,
  });
  assert.ok(generated !== null);
  assert.equal(generated.status, "generated");
  assert.equal(generated.brief?.title, "Taladro percutor para tu obra");
  assert.equal(generated.model, "gpt-5.6-terra");
  assert.equal(generated.promptVersion, "content-brief/2026-07-30.2");
  assert.equal(generated.schemaVersion, "content-brief/2026-07-30.1");
  assert.equal(generated.usage.totalTokens, 1_160);
  assert.equal(generated.evidence[0]?.citationId, "C1");

  // Cerrar dos veces la misma ejecución no la reescribe.
  assert.deepEqual(
    await repository.complete(
      completion(generatedId, false),
      "2026-07-30T12:01:00.000Z",
    ),
    { reason: "not-pending", status: "discarded" },
  );

  // Un rechazo conserva su motivo y no expone brief.
  const rejectedId = randomUUID();
  await repository.reserve(reservation(rejectedId));
  await repository.complete(
    completion(rejectedId, false),
    "2026-07-30T12:02:00.000Z",
  );
  const rejected = await repository.findById({
    id: rejectedId,
    organizationId,
  });
  assert.ok(rejected !== null);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.brief, null);
  assert.equal(rejected.rejection?.code, "evidence-stale");

  // Cancelar impide que un resultado tardío quede vigente.
  const cancelledId = randomUUID();
  await repository.reserve(reservation(cancelledId));
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-07-30T12:03:00.000Z",
      id: cancelledId,
      organizationId,
    }),
    { status: "cancelled" },
  );
  assert.deepEqual(
    await repository.complete(
      completion(cancelledId, true),
      "2026-07-30T12:03:30.000Z",
    ),
    { reason: "cancelled", status: "discarded" },
  );
  const cancelled = await repository.findById({
    id: cancelledId,
    organizationId,
  });
  assert.ok(cancelled !== null);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.brief, null);
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-07-30T12:04:00.000Z",
      id: generatedId,
      organizationId,
    }),
    { resolvedStatus: "generated", status: "already-resolved" },
  );

  // El aislamiento cubre lectura, cierre y cancelación.
  assert.equal(
    await repository.findById({
      id: generatedId,
      organizationId: otherOrganizationId,
    }),
    null,
  );
  assert.deepEqual(
    await repository.complete(
      { ...completion(generatedId, true), organizationId: otherOrganizationId },
      "2026-07-30T12:05:00.000Z",
    ),
    { status: "not-found" },
  );
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-07-30T12:05:00.000Z",
      id: generatedId,
      organizationId: otherOrganizationId,
    }),
    { status: "not-found" },
  );

  const history = await repository.list({
    limit: 10,
    organizationId,
    page: 1,
  });
  assert.equal(history.total, 3);
  assert.equal(history.items.length, 3);
  assert.equal(
    await repository
      .list({
        actorMembershipId: randomUUID(),
        limit: 10,
        organizationId,
        page: 1,
      })
      .then((page) => page.total),
    0,
  );

  // La base rechaza un run generado sin brief aunque el código lo intente.
  await assert.rejects(
    database.contentBriefRun.create({
      data: {
        actorMembershipId: membershipId,
        attempts: 1,
        cachedInputTokens: 0,
        completedAt: new Date("2026-07-30T12:00:00.000Z"),
        evidence: [],
        id: randomUUID(),
        inputTokens: 0,
        knowledgeStatus: "grounded",
        latencyMilliseconds: 1,
        model: "gpt-5.6-terra",
        organizationId,
        outputTokens: 0,
        promptHash: "b".repeat(64),
        promptVersion: "content-brief/2026-07-30.2",
        reasoningTokens: 0,
        request: "Pedido sin brief.",
        requestHash: "a".repeat(64),
        requestedAt: new Date("2026-07-30T12:00:00.000Z"),
        schemaVersion: "content-brief/2026-07-30.1",
        status: "generated",
        toolInvocations: [],
        toolNames: [],
        totalTokens: 0,
      },
    }),
  );

  const requests = new PrismaContentBriefRequestRepository(database);
  const requestOperation = reliableMutation(
    organizationId,
    membershipId,
    "content.brief:request",
  );
  const requestInput = {
    actorMembershipId: membershipId,
    id: randomUUID(),
    locationId,
    locationName: "Sucursal Centro",
    organizationId,
    reliableOperation: requestOperation,
    request: "Necesito una pieza para promocionar amoladoras.",
    requestHash: "c".repeat(64),
    requestedAt: "2026-07-30T13:00:00.000Z",
  };

  const accepted = await requests.request(requestInput);
  assert.deepEqual(accepted, {
    runId: requestInput.id,
    status: "accepted",
  });
  const queued = await database.outboxMessage.findUniqueOrThrow({
    select: { aggregateId: true, topic: true },
    where: { id: requestOperation.outboxEventId },
  });
  assert.equal(queued.topic, "content.brief.generation-requested");
  assert.equal(queued.aggregateId, requestInput.id);

  // Reintentar con la misma clave devuelve la ejecución original, no el
  // identificador que este intento acaba de sortear: consultar ese otro daría
  // 404 sobre una fila que nunca existió.
  const replayedRequest = await requests.request({
    ...requestInput,
    id: randomUUID(),
  });
  assert.deepEqual(replayedRequest, {
    runId: requestInput.id,
    status: "accepted",
  });
  assert.equal(
    await database.contentBriefRun.count({
      where: { organizationId, request: requestInput.request },
    }),
    1,
  );

  const requestConflict = await requests.request({
    ...requestInput,
    id: randomUUID(),
    reliableOperation: {
      ...requestOperation,
      claim: { ...requestOperation.claim, requestHash: randomHash() },
    },
  });
  assert.deepEqual(requestConflict, { status: "idempotency-conflict" });
});

test("versiona, activa, reemplaza y retira conocimiento por organización", async () => {
  const organizationId = randomUUID();
  const foreignOrganizationId = randomUUID();
  await database.organization.createMany({
    data: [
      {
        displayName: "Organización documental",
        id: organizationId,
        legalName: "Organización documental",
        slug: `knowledge-${organizationId}`,
      },
      {
        displayName: "Organización ajena documental",
        id: foreignOrganizationId,
        legalName: "Organización ajena documental",
        slug: `knowledge-${foreignOrganizationId}`,
      },
    ],
  });
  const repository = new PrismaKnowledgeDocumentRepository(database);
  const knowledgeLocationId = randomUUID();
  const baseInput: Omit<ReserveKnowledgeDocumentVersionInput, "contentHash"> = {
    approvalReference: "approval-2026-07-29",
    approvedAt: "2026-07-29T12:00:00.000Z",
    brand: "Aramayo",
    byteSize: 128,
    documentType: "faq",
    effectiveFrom: "2026-07-29T12:00:00.000Z",
    effectiveUntil: null,
    filename: "faq.md",
    locationIds: [knowledgeLocationId],
    mimeType: "text/markdown",
    organizationId,
    providerVectorStoreId: "vs_integration",
    sensitivity: "internal",
    sourceKey: "marca.faq",
    sourceOwner: "Responsable de negocio",
    title: "Preguntas frecuentes",
  };
  const first = await repository.reserveVersion({
    ...baseInput,
    contentHash: "a".repeat(64),
  });
  assert.equal(first.status, "reserved");
  const duplicate = await repository.reserveVersion({
    ...baseInput,
    contentHash: "a".repeat(64),
  });
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.record.id, first.record.id);

  await repository.markUploaded(organizationId, first.record.id, "file-first");
  await repository.markIndexing(organizationId, first.record.id, "completed");
  const firstActivation = await repository.activateVersion(
    organizationId,
    first.record.id,
    "2026-07-29T13:00:00.000Z",
  );
  assert.equal(firstActivation.active.status, "active");
  assert.equal(firstActivation.superseded, null);

  const second = await repository.reserveVersion({
    ...baseInput,
    contentHash: "b".repeat(64),
  });
  assert.equal(second.record.version, 2);
  const beforeReplacement = await database.knowledgeDocument.findUniqueOrThrow({
    where: { id: first.record.documentId },
  });
  assert.equal(beforeReplacement.activeVersionId, first.record.id);
  await repository.markUploaded(
    organizationId,
    second.record.id,
    "file-second",
  );
  await repository.markIndexing(organizationId, second.record.id, "completed");
  const replacement = await repository.activateVersion(
    organizationId,
    second.record.id,
    "2026-07-29T14:00:00.000Z",
  );
  assert.equal(replacement.active.status, "active");
  assert.equal(replacement.superseded?.id, first.record.id);
  assert.equal(replacement.superseded.status, "superseded");
  const activeForLocation = await repository.findActiveSources({
    at: "2026-07-29T14:30:00.000Z",
    limit: 10,
    locationId: knowledgeLocationId,
    organizationId,
  });
  assert.deepEqual(
    activeForLocation.map((record) => record.id),
    [second.record.id],
  );
  assert.deepEqual(
    await repository.findActiveSources({
      at: "2026-07-29T14:30:00.000Z",
      limit: 10,
      locationId: randomUUID(),
      organizationId,
    }),
    [],
  );
  assert.deepEqual(
    await repository.findActiveSources({
      at: "2026-07-29T14:30:00.000Z",
      limit: 10,
      locationId: null,
      organizationId,
    }),
    [],
  );
  assert.equal(
    await repository.findVersion(foreignOrganizationId, second.record.id),
    null,
  );

  const retiring = await repository.beginRetirement(
    organizationId,
    second.record.documentId,
  );
  assert.equal(retiring?.status, "retiring");
  const excluded = await database.knowledgeDocument.findUniqueOrThrow({
    where: { id: second.record.documentId },
  });
  assert.equal(excluded.activeVersionId, null);
  const retired = await repository.completeRetirement(
    organizationId,
    second.record.id,
    "2026-07-29T15:00:00.000Z",
  );
  assert.equal(retired.status, "retired");
  assert.equal(retired.remoteStatus, "detached");
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
  await database.publicationRevision.update({
    data: {
      renderedAt: new Date("2026-07-28T12:30:00.000Z"),
      renderedMediaAssetId: replacementMediaAssetId,
    },
    where: { id: revisionId },
  });
  assert.deepEqual(
    await repository.beginDeletion({
      mediaAssetId: replacementMediaAssetId,
      organizationId,
      requestedAt: new Date().toISOString(),
    }),
    { status: "in-use" },
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
    database.publicationRevision.update({
      data: { renderedMediaAssetId: deletableMediaAssetId },
      where: { id: revisionId },
    }),
  );
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

test("la vertical del brief recorre pedido, resultado y aceptación trazable", async () => {
  const organizationId = randomUUID();
  const foreignOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  await database.organization.createMany({
    data: [
      {
        displayName: "Organización vertical",
        id: organizationId,
        legalName: "Organización vertical",
        slug: `brief-e2e-${organizationId}`,
      },
      {
        displayName: "Organización vertical ajena",
        id: foreignOrganizationId,
        legalName: "Organización vertical ajena",
        slug: `brief-e2e-other-${foreignOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: "Editora vertical",
      email: `${userId}@vertical.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: { id: membershipId, organizationId, roles: ["editor"], userId },
  });
  await database.brand.create({
    data: {
      id: brandId,
      name: "Aramayo",
      organizationId,
      profile: { claim: "Ferretería y lubricentro" },
    },
  });
  await database.location.create({
    data: {
      addressLine: "República de Siria 365",
      brandId,
      city: "Frías",
      id: locationId,
      name: "Casa Central",
      openingHours: { display: "Lun a sáb · 08:30 a 13:00" },
      organizationId,
      province: "Santiago del Estero",
    },
  });

  const requests = new PrismaContentBriefRequestRepository(database);
  const runs = new PrismaContentBriefRunRepository(database);
  const drafts = new PrismaPublicationDraftRepository(database);
  const requestText = "Necesito una pieza para promocionar amoladoras.";

  const requestRun = async (): Promise<string> => {
    const id = randomUUID();
    const accepted = await requests.request({
      actorMembershipId: membershipId,
      id,
      locationId,
      locationName: "Casa Central",
      organizationId,
      reliableOperation: reliableMutation(
        organizationId,
        membershipId,
        "content.brief:request",
      ),
      request: requestText,
      requestHash: "e".repeat(64),
      requestedAt: new Date().toISOString(),
    });
    assert.deepEqual(accepted, { runId: id, status: "accepted" });
    return id;
  };

  const evidence = [
    {
      citationId: "C1",
      kind: "commercial" as const,
      observedAt: "2026-07-31T11:59:30.000Z",
      reference: "odoo:product:42",
    },
  ];
  const completion = (
    id: string,
    brief: Parameters<PrismaContentBriefRunRepository["complete"]>[0]["brief"],
    rejection: Parameters<
      PrismaContentBriefRunRepository["complete"]
    >[0]["rejection"],
  ): Parameters<PrismaContentBriefRunRepository["complete"]>[0] => ({
    attempts: 1,
    brief,
    estimatedCostUsd: 0.004_215,
    evidence,
    id,
    knowledgeStatus: "grounded",
    latencyMilliseconds: 820,
    model: "gpt-5.6-terra",
    organizationId,
    promptHash: "b".repeat(64),
    promptVersion: "content-brief/2026-07-30.2",
    rejection,
    requestId: "req_e2e",
    responseId: "resp_e2e",
    schemaVersion: "content-brief/2026-07-30.1",
    status: brief === null ? "rejected" : "generated",
    toolInvocations: [
      {
        callId: "call-1",
        outcome: "success" as const,
        toolName: "get_product",
      },
    ],
    toolNames: ["get_product"],
    usage: {
      cacheWriteInputTokens: 0,
      cachedInputTokens: 0,
      estimatedCostUsd: 0.004_215,
      inputTokens: 800,
      outputTokens: 360,
      reasoningTokens: 0,
      totalTokens: 1_160,
    },
  });

  const groundedBrief = {
    brand: "ferreteria" as const,
    callToAction: {
      kind: "whatsapp" as const,
      label: "Consultanos por WhatsApp",
    },
    caption: "Pasá por el local y consultanos cuál te sirve.",
    creativeProposal: "Tono directo.",
    missingInformation: [],
    objective: "product" as const,
    products: [
      {
        evidenceId: "C1",
        externalProductId: "odoo:product:42",
        label: "Amoladora angular",
      },
    ],
    requiresHumanApproval: false,
    subtitle: null,
    title: "Amoladora angular para tu taller",
    verifiedFacts: [
      {
        claimKind: "stock" as const,
        evidenceId: "C1",
        statement: "Hay unidades disponibles.",
      },
    ],
    visualDirection: "clean_product" as const,
  };

  // Camino 1: evidencia suficiente. El pedido queda reservado, encolado y
  // cerrado con un brief que cita la observación que lo respalda.
  const groundedId = await requestRun();
  const queued = await database.outboxMessage.findFirst({
    select: { aggregateId: true, topic: true },
    where: { aggregateId: groundedId },
  });
  assert.equal(queued?.topic, "content.brief.generation-requested");
  assert.deepEqual(
    await runs.complete(
      completion(groundedId, groundedBrief, null),
      new Date().toISOString(),
    ),
    { status: "completed" },
  );
  const grounded = await runs.findById({ id: groundedId, organizationId });
  assert.ok(grounded !== null);
  assert.equal(grounded.status, "generated");
  assert.equal(grounded.evidence[0]?.citationId, "C1");

  // Camino 2: faltante declarado. El brief existe, pero exige revisión humana
  // en lugar de completar el hueco por su cuenta.
  const missingId = await requestRun();
  await runs.complete(
    completion(
      missingId,
      {
        ...groundedBrief,
        missingInformation: [
          {
            detail: "El precio consultado tenía más de 24 horas.",
            kind: "stale_observation" as const,
            subject: "price" as const,
          },
        ],
        requiresHumanApproval: true,
      },
      null,
    ),
    new Date().toISOString(),
  );
  const missing = await runs.findById({ id: missingId, organizationId });
  assert.ok(missing !== null);
  assert.ok(missing.brief !== null);
  assert.equal(missing.status, "generated");
  assert.equal(missing.brief.missingInformation.length, 1);
  assert.equal(missing.brief.requiresHumanApproval, true);

  // Camino 3: error transitorio del proveedor. No hay brief que aceptar y el
  // motivo queda registrado para que el reintento sea una decisión informada.
  const rejectedId = await requestRun();
  await runs.complete(
    completion(rejectedId, null, {
      code: "provider-unavailable",
      message: "El proveedor no respondió a tiempo.",
    }),
    new Date().toISOString(),
  );
  const rejected = await runs.findById({ id: rejectedId, organizationId });
  assert.ok(rejected !== null);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.brief, null);
  assert.equal(rejected.rejection?.code, "provider-unavailable");

  // Camino 4: cancelación durante la ejecución. El resultado que llega después
  // se descarta en lugar de quedar vigente.
  const cancelledId = await requestRun();
  assert.deepEqual(
    await runs.cancel({
      cancelledAt: new Date().toISOString(),
      id: cancelledId,
      organizationId,
    }),
    { status: "cancelled" },
  );
  assert.deepEqual(
    await runs.complete(
      completion(cancelledId, groundedBrief, null),
      new Date().toISOString(),
    ),
    { reason: "cancelled", status: "discarded" },
  );
  const cancelled = await runs.findById({ id: cancelledId, organizationId });
  assert.ok(cancelled !== null);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.brief, null);

  // Aceptar el brief sustentado crea una revisión que conserva de qué
  // ejecución salió: la trazabilidad no depende de recomponerla en la UI.
  const publicationId = randomUUID();
  const created = await drafts.create({
    content: {
      caption: groundedBrief.caption,
      products: [{ label: "Amoladora angular", reference: "odoo:product:42" }],
    },
    contentBriefRunId: groundedId,
    contentHash: "f".repeat(64),
    createdByMembershipId: membershipId,
    designDocument: {
      content: { title: groundedBrief.title },
      format: "historia",
      layout: "historia-tip",
      media: [],
      schemaVersion: 1,
      slug: "historia-tip-editorial",
      theme: "taller",
    },
    locationId,
    media: [],
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      membershipId,
      "content.publication:create",
    ),
    revisionId: randomUUID(),
    schemaVersion: 1,
    title: groundedBrief.title,
  });
  assert.ok(created.status === "created");
  assert.equal(created.detail.latestRevision.contentBriefRunId, groundedId);
  // Aceptar deja la publicación en borrador: no publica ni programa nada.
  assert.equal(created.detail.publication.status, "draft");

  const detail = await drafts.findById({ organizationId }, publicationId);
  assert.ok(detail !== null);
  assert.equal(detail.latestRevision.contentBriefRunId, groundedId);

  // El listado también conserva el vínculo: llegar desde la pieza hasta su
  // evidencia no depende de abrir el detalle.
  const listed = await drafts.list({ limit: 10, organizationId, page: 1 });
  assert.equal(listed.items[0]?.latestContentBriefRunId, groundedId);

  // Una revisión no puede atribuirse a una ejecución inexistente ni ajena: la
  // clave foránea es compuesta por organización, así que la base lo rechaza.
  await assert.rejects(
    database.publicationRevision.update({
      data: { contentBriefRunId: randomUUID() },
      where: { id: detail.latestRevision.id },
    }),
  );
});

/**
 * Fixture mínimo para un lote: organización, membresía y la ejecución de brief
 * de la que sale el pedido. El lote siempre cita un brief, así que no hay
 * escenario válido sin él.
 */
/**
 * Lee una variante por su índice y afirma que existe. Evita encadenar
 * opcionales sobre un acceso indexado, que el compilador y el linter juzgan
 * distinto.
 */
function variantAt(
  run: GenerationRunRecord,
  index: number,
): GenerationVariantRecord {
  const variant = run.variants[index];
  assert.ok(variant !== undefined);
  return variant;
}

async function generationFixture(): Promise<{
  briefRunId: string;
  membershipId: string;
  organizationId: string;
}> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const briefRunId = randomUUID();
  await database.organization.create({
    data: {
      displayName: "Organización de generación",
      id: organizationId,
      legalName: "Organización de generación",
      slug: `generation-${organizationId}`,
    },
  });
  await database.user.create({
    data: {
      displayName: "Editora de generación",
      email: `${userId}@example.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: { id: membershipId, organizationId, roles: ["editor"], userId },
  });
  await database.generationPolicy.update({
    data: { enabled: true },
    where: { organizationId },
  });
  await database.contentBriefRun.create({
    data: {
      actorMembershipId: membershipId,
      attempts: 0,
      cachedInputTokens: 0,
      evidence: [],
      id: briefRunId,
      inputTokens: 0,
      knowledgeStatus: "pending",
      latencyMilliseconds: 0,
      model: "unselected",
      organizationId,
      outputTokens: 0,
      reasoningTokens: 0,
      request: "Pieza para promocionar amoladoras.",
      requestHash: randomHash(),
      requestedAt: new Date("2026-08-03T12:00:00.000Z"),
      status: "pending",
      toolInvocations: [],
      toolNames: [],
      totalTokens: 0,
    },
  });
  return { briefRunId, membershipId, organizationId };
}

test("una organización nueva nace con política deshabilitada y CAS administrable", async () => {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  await database.organization.create({
    data: {
      displayName: "Organización nueva",
      id: organizationId,
      legalName: "Organización nueva",
      slug: `new-generation-${organizationId}`,
    },
  });
  await database.user.create({
    data: {
      displayName: "Administradora nueva",
      email: `${userId}@new-generation.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: { id: membershipId, organizationId, roles: ["admin"], userId },
  });
  const policies = new PrismaGenerationPolicyRepository(database);
  const created = await policies.find({
    actorMembershipId: membershipId,
    at: "2026-08-06T12:00:00.000Z",
    organizationId,
  });
  assert.ok(created !== null);
  assert.equal(created.policy.enabled, false);

  const update = {
    enabled: true,
    expectedVersion: created.policy.version,
    generatedOrphanRetentionHours: 24,
    monthlyBudgetMicrousd: 20_000_000,
    organizationDailyAttemptLimit: 20,
    originalRetentionDays: 90,
    referenceRetentionDays: 30,
    userDailyAttemptLimit: 8,
    warningThresholdPercent: 80,
  } as const;
  assert.equal(
    (
      await policies.update({
        actorMembershipId: membershipId,
        at: "2026-08-06T12:01:00.000Z",
        organizationId,
        update,
      })
    ).status,
    "updated",
  );
  assert.equal(
    (
      await policies.update({
        actorMembershipId: membershipId,
        at: "2026-08-06T12:02:00.000Z",
        organizationId,
        update,
      })
    ).status,
    "conflict",
  );

  await database.generationBudgetAlert.create({
    data: {
      committedMicrousd: 16_000_000,
      id: randomUUID(),
      monthUtc: "2026-08",
      organizationId,
      thresholdPercent: 80,
    },
  });
  await assert.rejects(
    database.generationBudgetAlert.create({
      data: {
        committedMicrousd: 18_000_000,
        id: randomUUID(),
        monthUtc: "2026-08",
        organizationId,
        thresholdPercent: 90,
      },
    }),
  );
});

test("el lote de generación conserva su ciclo de vida y sus variantes", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const repository = new PrismaGenerationRunRepository(database);
  const runId = randomUUID();
  const variantIds = [randomUUID(), randomUUID(), randomUUID()];

  await repository.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: runId,
    organizationId,
    requestedAt: "2026-08-03T12:00:00.000Z",
    subjectKind: "generic",
    variantIds,
  });

  const reserved = await repository.findById({ id: runId, organizationId });
  assert.ok(reserved !== null);
  assert.equal(reserved.status, "pending");
  assert.equal(reserved.plan, null);
  assert.equal(reserved.variants.length, 3);
  // El índice ordena la presentación sin depender del reloj.
  assert.deepEqual(
    reserved.variants.map((variant) => variant.index),
    [0, 1, 2],
  );
  assert.ok(reserved.variants.every((variant) => variant.status === "pending"));

  // Tomar el lote es la transición que actúa de candado: la segunda entrega del
  // mismo evento la pierde y no vuelve a lanzarlo.
  assert.deepEqual(
    await repository.start({
      id: runId,
      organizationId,
      startedAt: "2026-08-03T12:00:01.000Z",
    }),
    { status: "written" },
  );
  assert.deepEqual(
    await repository.start({
      id: runId,
      organizationId,
      startedAt: "2026-08-03T12:00:02.000Z",
    }),
    { reason: "not-open", status: "discarded" },
  );

  const mediaAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      id: mediaAssetId,
      organizationId,
      origin: "generated",
      byteSize: 512_000n,
      checksumSha256: randomHash(),
      height: 1536,
      mimeType: "image/png",
      originalFileName: "variante.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/variante-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/variante-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1024,
    },
  });

  // La pieza compuesta es un activo distinto de la base: la base prueba qué
  // generó el modelo y la pieza es lo que se publica.
  const composedAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      id: composedAssetId,
      organizationId,
      origin: "generated",
      byteSize: 740_000n,
      checksumSha256: randomHash(),
      height: 1350,
      mimeType: "image/png",
      originalFileName: "pieza.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/pieza-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/pieza-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1080,
    },
  });

  const composition = {
    compositionHash: "c".repeat(64),
    height: 1350,
    layout: "composicion-tercio-inferior",
    mediaAssetId: composedAssetId,
    overlayHash: "d".repeat(64),
    sha256: "e".repeat(64),
    theme: "taller",
    version: "visual-composition/2026-08-05.1",
    width: 1080,
  };

  assert.deepEqual(
    await repository.completeVariant(
      {
        attempts: 1,
        composition,
        height: 1536,
        latencyMilliseconds: 4_200,
        mediaAssetId,
        model: "gpt-image-1",
        organizationId,
        requestId: null,
        runId,
        sha256: "a".repeat(64),
        status: "succeeded",
        variantId: variantIds[0] ?? "",
        width: 1024,
      },
      "2026-08-03T12:00:20.000Z",
    ),
    { status: "written" },
  );

  // Fallo parcial: la segunda variante no sale y explica cómo corregirlo.
  assert.deepEqual(
    await repository.completeVariant(
      {
        attempts: 3,
        failure: {
          code: "rate-limit",
          correction: "Reintentá el lote en unos minutos.",
          detail: "El proveedor limitó la tasa.",
        },
        latencyMilliseconds: 900,
        organizationId,
        requestId: null,
        runId,
        status: "failed",
        variantId: variantIds[1] ?? "",
      },
      "2026-08-03T12:00:25.000Z",
    ),
    { status: "written" },
  );

  // Una variante ya resuelta no se reescribe: una reentrega no puede pisar un
  // resultado que ya se cobró.
  assert.deepEqual(
    await repository.completeVariant(
      {
        attempts: 1,
        composition,
        height: 1536,
        latencyMilliseconds: 100,
        mediaAssetId,
        model: "gpt-image-1",
        organizationId,
        requestId: null,
        runId,
        sha256: "b".repeat(64),
        status: "succeeded",
        variantId: variantIds[1] ?? "",
        width: 1024,
      },
      "2026-08-03T12:00:30.000Z",
    ),
    { reason: "not-open", status: "discarded" },
  );

  assert.deepEqual(
    await repository.complete(
      {
        estimatedCostUsd: null,
        id: runId,
        organizationId,
        plan: {
          format: "feed",
          profileId: "ferreteria-producto-limpio",
          profileVersion: "visual-profile/2026-08-03.2",
          promptHash: "c".repeat(64),
          promptVersion: "visual-prompt/2026-08-03.2",
        },
        resolution: null,
        status: "completed",
        totalTokens: 4_120,
      },
      "2026-08-03T12:00:40.000Z",
    ),
    { status: "written" },
  );

  const completed = await repository.findById({ id: runId, organizationId });
  assert.ok(completed !== null);
  assert.equal(completed.status, "completed");
  assert.equal(completed.plan?.promptVersion, "visual-prompt/2026-08-03.2");
  assert.equal(completed.totalTokens, 4_120);
  assert.equal(variantAt(completed, 0).status, "succeeded");
  assert.equal(variantAt(completed, 0).mediaAssetId, mediaAssetId);
  assert.equal(variantAt(completed, 1).status, "failed");
  assert.equal(variantAt(completed, 1).failure?.code, "rate-limit");
  // La tercera nunca se intentó: descartada, no fallida. No gastó nada y
  // presentarla como fallo sugeriría un problema del proveedor que no ocurrió.
  assert.equal(variantAt(completed, 2).status, "discarded");
  assert.equal(variantAt(completed, 2).failure, null);

  const mediaRepository = new PrismaMediaAssetRepository(database);
  assert.deepEqual(
    await mediaRepository.beginDeletion({
      mediaAssetId,
      organizationId,
      requestedAt: "2026-08-04T12:00:00.000Z",
    }),
    { status: "in-use" },
  );
  assert.deepEqual(
    await mediaRepository.beginDeletion({
      mediaAssetId: composedAssetId,
      organizationId,
      requestedAt: "2026-08-04T12:00:00.000Z",
    }),
    { status: "in-use" },
  );
  const deletingAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      byteSize: 512_000n,
      checksumSha256: randomHash(),
      height: 1536,
      id: deletingAssetId,
      mimeType: "image/png",
      organizationId,
      origin: "generated",
      originalFileName: "deleting.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/deleting-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/deleting-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1024,
    },
  });
  assert.equal(
    (
      await mediaRepository.beginDeletion({
        mediaAssetId: deletingAssetId,
        organizationId,
        requestedAt: "2026-08-04T12:00:00.000Z",
      })
    ).status,
    "ready",
  );
  await assert.rejects(
    database.generationRunVariant.update({
      data: { mediaAssetId: deletingAssetId },
      where: { id: variantIds[0] ?? "" },
    }),
  );
  await assert.rejects(
    database.generationRunVariant.update({
      data: { composedMediaAssetId: deletingAssetId },
      where: { id: variantIds[0] ?? "" },
    }),
  );

  // Cerrar dos veces no reescribe un lote ya terminado.
  assert.deepEqual(
    await repository.complete(
      {
        estimatedCostUsd: null,
        id: runId,
        organizationId,
        plan: null,
        resolution: null,
        status: "failed",
        totalTokens: 0,
      },
      "2026-08-03T12:00:50.000Z",
    ),
    { reason: "not-open", status: "discarded" },
  );
});

test("cancelar un lote impide promover el resultado tardío", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const repository = new PrismaGenerationRunRepository(database);
  const runId = randomUUID();
  const variantIds = [randomUUID(), randomUUID()];

  await repository.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "historia",
    id: runId,
    organizationId,
    requestedAt: "2026-08-03T13:00:00.000Z",
    subjectKind: "generic",
    variantIds,
  });
  await repository.start({
    id: runId,
    organizationId,
    startedAt: "2026-08-03T13:00:01.000Z",
  });

  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-08-03T13:00:10.000Z",
      id: runId,
      organizationId,
    }),
    { status: "cancelled" },
  );

  const cancelled = await repository.findById({ id: runId, organizationId });
  assert.ok(cancelled !== null);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.completedAt, null);
  // Cancelar no deja variantes en curso eternas.
  assert.ok(
    cancelled.variants.every((variant) => variant.status === "discarded"),
  );

  // El proveedor no se puede detener, pero su respuesta tardía no se promueve.
  const mediaAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      id: mediaAssetId,
      organizationId,
      origin: "generated",
      byteSize: 512_000n,
      checksumSha256: randomHash(),
      height: 1536,
      mimeType: "image/png",
      originalFileName: "tardia.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/tardia-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/tardia-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1024,
    },
  });
  assert.deepEqual(
    await repository.completeVariant(
      {
        attempts: 1,
        // La composición no llega a escribirse: el lote ya está cancelado y la
        // escritura entera se descarta.
        composition: {
          compositionHash: "f".repeat(64),
          height: 1350,
          layout: "composicion-tercio-inferior",
          mediaAssetId,
          overlayHash: "0".repeat(64),
          sha256: "1".repeat(64),
          theme: "taller",
          version: "visual-composition/2026-08-05.1",
          width: 1080,
        },
        height: 1536,
        latencyMilliseconds: 5_000,
        mediaAssetId,
        model: "gpt-image-1",
        organizationId,
        requestId: null,
        runId,
        sha256: "d".repeat(64),
        status: "succeeded",
        variantId: variantIds[0] ?? "",
        width: 1024,
      },
      "2026-08-03T13:00:30.000Z",
    ),
    { reason: "cancelled", status: "discarded" },
  );
  assert.deepEqual(
    await repository.complete(
      {
        estimatedCostUsd: 0.42,
        id: runId,
        organizationId,
        plan: null,
        resolution: null,
        status: "completed",
        totalTokens: 100,
      },
      "2026-08-03T13:00:31.000Z",
    ),
    { reason: "cancelled", status: "discarded" },
  );

  const afterLateResult = await repository.findById({
    id: runId,
    organizationId,
  });
  assert.ok(afterLateResult !== null);
  assert.equal(afterLateResult.status, "cancelled");
  assert.equal(variantAt(afterLateResult, 0).mediaAssetId, null);

  // Cancelar de nuevo informa el estado real en lugar de fallar.
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-08-03T13:00:40.000Z",
      id: runId,
      organizationId,
    }),
    { resolvedStatus: "cancelled", status: "already-resolved" },
  );
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-08-03T13:00:40.000Z",
      id: randomUUID(),
      organizationId,
    }),
    { status: "not-found" },
  );
});

test("el pedido de generación reserva, encola y no factura dos lotes", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const requests = new PrismaGenerationRunRequestRepository(database);
  const repository = new PrismaGenerationRunRepository(database);
  const operation = reliableMutation(
    organizationId,
    membershipId,
    "content.generation:request",
  );
  const input = {
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed" as const,
    id: randomUUID(),
    organizationId,
    reliableOperation: operation,
    requestedAt: "2026-08-03T14:00:00.000Z",
    subjectKind: "branded" as const,
    variantIds: [randomUUID(), randomUUID()],
  };

  assert.deepEqual(await requests.request(input), {
    admission: {
      mode: "provider",
      pricingVersion: "openai-gpt-image-2-standard-2026-08-05",
      referenceCostMicrousd: 82_000,
      reservedCostMicrousd: 402_000,
    },
    runId: input.id,
    status: "accepted",
  });
  const queued = await database.outboxMessage.findUniqueOrThrow({
    select: { aggregateId: true, aggregateType: true, topic: true },
    where: { id: operation.outboxEventId },
  });
  assert.equal(queued.topic, "content.generation.requested");
  assert.equal(queued.aggregateType, "generation-run");
  assert.equal(queued.aggregateId, input.id);

  // La misma clave devuelve el lote original y no crea otro: es lo que impide
  // que un reintento del cliente termine facturando dos veces.
  assert.deepEqual(
    await requests.request({
      ...input,
      id: randomUUID(),
      variantIds: [randomUUID(), randomUUID()],
    }),
    {
      admission: {
        mode: "provider",
        pricingVersion: "openai-gpt-image-2-standard-2026-08-05",
        referenceCostMicrousd: 82_000,
        reservedCostMicrousd: 402_000,
      },
      runId: input.id,
      status: "accepted",
    },
  );
  assert.equal(
    await database.generationRun.count({ where: { organizationId } }),
    1,
  );
  assert.equal(
    await database.generationRunVariant.count({ where: { organizationId } }),
    2,
  );

  // Misma clave con otro pedido es un conflicto, no un lote nuevo.
  assert.deepEqual(
    await requests.request({
      ...input,
      id: randomUUID(),
      reliableOperation: {
        ...operation,
        claim: { ...operation.claim, requestHash: randomHash() },
      },
      variantIds: [randomUUID()],
    }),
    { status: "idempotency-conflict" },
  );

  const history = await repository.list({ limit: 10, organizationId, page: 1 });
  assert.equal(history.total, 1);
  const firstRun = history.items[0];
  assert.ok(firstRun !== undefined);
  assert.equal(firstRun.contentBriefRunId, briefRunId);
  assert.equal(
    await repository
      .list({
        contentBriefRunId: randomUUID(),
        limit: 10,
        organizationId,
        page: 1,
      })
      .then((page) => page.total),
    0,
  );

  // Un lote de otra organización no es visible ni escribible.
  const other = await generationFixture();
  assert.equal(
    await repository.findById({
      id: input.id,
      organizationId: other.organizationId,
    }),
    null,
  );
  assert.deepEqual(
    await repository.cancel({
      cancelledAt: "2026-08-03T14:05:00.000Z",
      id: input.id,
      organizationId: other.organizationId,
    }),
    { status: "not-found" },
  );
});

test("la base rechaza estados de lote que no describen nada real", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();

  const invalidLifecycleRunId = randomUUID();
  // Un lote pendiente no puede tener instante de cierre.
  await assert.rejects(
    database.generationRun.create({
      data: {
        actorMembershipId: membershipId,
        completedAt: new Date("2026-08-03T15:00:00.000Z"),
        contentBriefRunId: briefRunId,
        format: "feed",
        id: invalidLifecycleRunId,
        lineageRootId: invalidLifecycleRunId,
        organizationId,
        requestedAt: new Date("2026-08-03T15:00:00.000Z"),
        status: "pending",
      },
    }),
  );

  const invalidPlanRunId = randomUUID();
  // El plan es indivisible: perfil sin hash no permite comparar dos lotes.
  await assert.rejects(
    database.generationRun.create({
      data: {
        actorMembershipId: membershipId,
        completedAt: new Date("2026-08-03T15:00:00.000Z"),
        contentBriefRunId: briefRunId,
        format: "feed",
        id: invalidPlanRunId,
        lineageRootId: invalidPlanRunId,
        organizationId,
        profileId: "ferreteria-producto-limpio",
        requestedAt: new Date("2026-08-03T15:00:00.000Z"),
        status: "completed",
      },
    }),
  );

  const runId = randomUUID();
  await database.generationRun.create({
    data: {
      actorMembershipId: membershipId,
      contentBriefRunId: briefRunId,
      format: "feed",
      id: runId,
      lineageRootId: runId,
      organizationId,
      requestedAt: new Date("2026-08-03T15:00:00.000Z"),
      status: "pending",
    },
  });

  // Una variante exitosa sin activo ni hash no describe ninguna imagen.
  await assert.rejects(
    database.generationRunVariant.create({
      data: {
        completedAt: new Date("2026-08-03T15:00:10.000Z"),
        id: randomUUID(),
        organizationId,
        position: 0,
        runId,
        status: "succeeded",
      },
    }),
  );

  // Una variante fallida sin motivo no explica nada.
  await assert.rejects(
    database.generationRunVariant.create({
      data: {
        completedAt: new Date("2026-08-03T15:00:10.000Z"),
        id: randomUUID(),
        organizationId,
        position: 1,
        runId,
        status: "failed",
      },
    }),
  );

  // Un lote no puede citar una ejecución de brief ajena: la clave foránea es
  // compuesta por organización.
  const other = await generationFixture();
  const crossTenantRunId = randomUUID();
  await assert.rejects(
    database.generationRun.create({
      data: {
        actorMembershipId: membershipId,
        contentBriefRunId: other.briefRunId,
        format: "feed",
        id: crossTenantRunId,
        lineageRootId: crossTenantRunId,
        organizationId,
        requestedAt: new Date("2026-08-03T15:00:00.000Z"),
        status: "pending",
      },
    }),
  );
});

test("Meta aísla state y conexiones, cifra secretos y revoca con auditoría", async () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const sessionId = randomUUID();
  const now = new Date();
  const stateHash = randomHash();

  await database.organization.createMany({
    data: [
      {
        displayName: "Meta A",
        id: organizationId,
        legalName: "Meta A",
        slug: `meta-a-${organizationId}`,
      },
      {
        displayName: "Meta B",
        id: otherOrganizationId,
        legalName: "Meta B",
        slug: `meta-b-${otherOrganizationId}`,
      },
    ],
  });
  await database.user.create({
    data: {
      displayName: "Administrador Meta",
      email: `${userId}@example.invalid`,
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
  await database.authenticationSession.create({
    data: {
      createdAt: now,
      csrfTokenHash: randomHash(),
      expiresAt: new Date(now.getTime() + 3_600_000),
      id: sessionId,
      lastSeenAt: now,
      membershipId,
      organizationId,
      tokenHash: randomHash(),
      updatedAt: now,
      userId,
    },
  });

  const actor = Object.freeze({
    displayName: "Administrador Meta",
    email: `${userId}@example.invalid`,
    membershipId,
    organizationId,
    roles: Object.freeze(["admin"] satisfies readonly OrganizationRole[]),
    sessionId,
    userId,
  });
  const repository = new PrismaMetaConnectionRepository(database);
  await repository.createOAuthTransaction({
    actor,
    expiresAt: new Date(now.getTime() + 600_000).toISOString(),
    redirectUri: "https://api.example.invalid/oauth/meta/callback",
    stateHash,
  });
  const consumedAt = new Date(now.getTime() + 1_000).toISOString();
  assert.deepEqual(
    await repository.consumeOAuthTransaction({
      actor: { ...actor, sessionId: randomUUID() },
      consumedAt,
      redirectUri: "https://api.example.invalid/oauth/meta/callback",
      stateHash,
    }),
    { status: "invalid" },
  );
  assert.deepEqual(
    await repository.consumeOAuthTransaction({
      actor,
      consumedAt,
      redirectUri: "https://api.example.invalid/oauth/meta/callback",
      stateHash,
    }),
    { status: "consumed" },
  );
  assert.deepEqual(
    await repository.consumeOAuthTransaction({
      actor,
      consumedAt,
      redirectUri: "https://api.example.invalid/oauth/meta/callback",
      stateHash,
    }),
    { status: "invalid" },
  );

  const encrypted = Object.freeze({
    authenticationTag: "authentication-tag",
    ciphertext: "encrypted-user-token-not-plain-text",
    initializationVector: "initialization-vector",
    keyVersion: "v1",
  });
  const connected = await repository.save({
    accessSecret: encrypted,
    accountName: "Administrador Meta",
    actor,
    assets: Object.freeze([
      Object.freeze({
        accessSecret: {
          ...encrypted,
          ciphertext: "encrypted-page-token-not-plain-text",
        },
        kind: "page",
        name: "Aramayo",
        providerAssetId: "page-1",
      }),
      Object.freeze({
        kind: "instagram_business",
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        username: "ferreteria_aramayo",
      }),
    ]),
    audit: {
      actorMembershipId: membershipId,
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata: { assetCount: 2, provider: "meta" },
      occurredAt: now.toISOString(),
      operation: "meta.connection.connected",
      organizationId,
      outcome: "success",
    },
    expiresAt: new Date(now.getTime() + 5_184_000_000).toISOString(),
    grantedPermissions: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ],
    health: "healthy",
    occurredAt: now.toISOString(),
    providerAccountId: "meta-account-1",
  });
  assert.equal(connected.organizationId, organizationId);
  assert.equal((await repository.list(otherOrganizationId)).length, 0);
  const secret = await repository.findSecret(organizationId, connected.id);
  assert.equal(secret?.accessSecret.ciphertext, encrypted.ciphertext);
  const rawConnection = await database.metaConnection.findUniqueOrThrow({
    where: { id: connected.id },
  });
  assert.equal(rawConnection.accessCiphertext, encrypted.ciphertext);
  assert.equal(JSON.stringify(connected).includes(encrypted.ciphertext), false);

  const revoked = await repository.revoke({
    actor,
    audit: {
      actorMembershipId: membershipId,
      entityId: connected.id,
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata: { provider: "meta", remoteConfirmed: false },
      occurredAt: new Date(now.getTime() + 1_000).toISOString(),
      operation: "meta.connection.revoked",
      organizationId,
      outcome: "success",
    },
    metaConnectionId: connected.id,
    revokedAt: new Date(now.getTime() + 1_000).toISOString(),
  });
  assert.equal(revoked.status, "updated");
  assert.equal(revoked.connection.health, "revoked");
  assert.equal(await repository.findSecret(organizationId, connected.id), null);
  const rawRevoked = await database.metaConnection.findUniqueOrThrow({
    where: { id: connected.id },
  });
  assert.equal(rawRevoked.accessCiphertext, null);
  assert.equal(
    await database.auditEvent.count({
      where: { entityType: "meta_connection", organizationId },
    }),
    2,
  );

  const reconnected = await repository.save({
    accessSecret: encrypted,
    accountName: "Administrador Meta",
    actor,
    assets: Object.freeze([
      Object.freeze({
        accessSecret: {
          ...encrypted,
          ciphertext: "encrypted-page-token-not-plain-text",
        },
        kind: "page",
        name: "Aramayo",
        providerAssetId: "page-1",
      }),
      Object.freeze({
        kind: "instagram_business",
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        username: "ferreteria_aramayo",
      }),
    ]),
    audit: {
      actorMembershipId: membershipId,
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata: { assetCount: 2, provider: "meta" },
      occurredAt: new Date(now.getTime() + 2_000).toISOString(),
      operation: "meta.connection.connected",
      organizationId,
      outcome: "success",
    },
    grantedPermissions: ["instagram_basic", "instagram_content_publish"],
    health: "healthy",
    occurredAt: new Date(now.getTime() + 2_000).toISOString(),
    providerAccountId: "meta-account-1",
  });
  assert.equal(reconnected.id, connected.id);
  assert.equal(
    (await repository.findByProviderAccountId("meta-account-1")).length,
    1,
  );

  const deleted = await repository.removeFromProvider({
    audit: {
      entityId: connected.id,
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata: {
        initiatedBy: "meta",
        provider: "meta",
        reason: "data-deletion",
      },
      occurredAt: new Date(now.getTime() + 3_000).toISOString(),
      operation: "meta.connection.data_deleted",
      organizationId,
      outcome: "success",
    },
    metaConnectionId: connected.id,
    organizationId,
    providerAccountId: "meta-account-1",
    reason: "data-deletion",
    removedAt: new Date(now.getTime() + 3_000).toISOString(),
  });
  assert.equal(deleted.status, "updated");
  assert.equal(deleted.connection.accountName, "Cuenta Meta eliminada");
  assert.equal(deleted.connection.grantedPermissions.length, 0);
  assert.equal(
    (await repository.findByProviderAccountId("meta-account-1")).length,
    0,
  );
  const erasedConnection = await database.metaConnection.findUniqueOrThrow({
    include: { assets: true },
    where: { id: connected.id },
  });
  assert.equal(erasedConnection.providerAccountId, `deleted:${connected.id}`);
  assert.equal(erasedConnection.accessCiphertext, null);
  assert.equal(
    erasedConnection.assets.every(
      (asset) =>
        asset.providerAssetId === `deleted:${asset.id}` &&
        asset.name === "Activo Meta eliminado" &&
        asset.username === null &&
        asset.accessCiphertext === null,
    ),
    true,
  );
  assert.equal(
    await database.auditEvent.count({
      where: { entityType: "meta_connection", organizationId },
    }),
    4,
  );
});

test("dos pedidos concurrentes con la misma clave lanzan un solo lote", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const requests = new PrismaGenerationRunRequestRepository(database);
  const operation = reliableMutation(
    organizationId,
    membershipId,
    "content.generation:request",
  );
  const input = {
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed" as const,
    organizationId,
    reliableOperation: operation,
    requestedAt: "2026-08-03T16:00:00.000Z",
    subjectKind: "branded" as const,
  };

  // Los dos intentos salen a la vez con la misma clave idempotente y con
  // identificadores distintos, que es lo que hace un cliente que reintenta
  // antes de recibir la primera respuesta.
  const [first, second] = await Promise.all([
    requests.request({
      ...input,
      id: randomUUID(),
      variantIds: [randomUUID(), randomUUID()],
    }),
    requests.request({
      ...input,
      id: randomUUID(),
      variantIds: [randomUUID(), randomUUID()],
    }),
  ]);

  // Uno gana la reserva; el otro replica su respuesta o encuentra la operación
  // en curso. Ninguno de los dos crea un segundo lote.
  const outcomes = [first.status, second.status].toSorted();
  assert.ok(
    outcomes.every(
      (status) => status === "accepted" || status === "in-progress",
    ),
    `estados inesperados: ${outcomes.join(", ")}`,
  );
  assert.equal(
    await database.generationRun.count({ where: { organizationId } }),
    1,
  );
  // Un solo lote significa además un solo evento encolado: el worker no puede
  // recibir dos pedidos para el mismo gasto.
  assert.equal(
    await database.outboxMessage.count({
      where: { aggregateType: "generation-run", organizationId },
    }),
    1,
  );
  assert.equal(
    await database.generationRunVariant.count({ where: { organizationId } }),
    2,
  );
});

test("dos pedidos concurrentes no sobreasignan la cuota diaria del usuario", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  await database.generationPolicy.update({
    data: { userDailyAttemptLimit: 2 },
    where: { organizationId },
  });
  const requests = new PrismaGenerationRunRequestRepository(database);
  const request = (
    suffix: string,
  ): ReturnType<PrismaGenerationRunRequestRepository["request"]> =>
    requests.request({
      actorMembershipId: membershipId,
      contentBriefRunId: briefRunId,
      format: "feed",
      id: randomUUID(),
      organizationId,
      reliableOperation: reliableMutation(
        organizationId,
        membershipId,
        `content.generation:quota-${suffix}`,
      ),
      requestedAt: "2026-08-06T23:59:59.000Z",
      subjectKind: "generic",
      variantIds: [randomUUID(), randomUUID()],
    });

  const admissions = (await Promise.all([request("a"), request("b")]))
    .map((result) => {
      assert.equal(result.status, "accepted");
      return result.admission;
    })
    .toSorted((left, right) => left.mode.localeCompare(right.mode));
  assert.equal(admissions[0]?.mode, "deterministic");
  assert.deepEqual(admissions[0], {
    mode: "deterministic",
    reason: "user-daily-limit",
  });
  assert.equal(admissions[1]?.mode, "provider");
  assert.equal(
    await database.generationAttempt.count({ where: { organizationId } }),
    2,
  );
});

test("la cuota diaria se reinicia exactamente en la medianoche UTC", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  await database.generationPolicy.update({
    data: { userDailyAttemptLimit: 1 },
    where: { organizationId },
  });
  const requests = new PrismaGenerationRunRequestRepository(database);
  const requestAt = (
    requestedAt: string,
  ): ReturnType<PrismaGenerationRunRequestRepository["request"]> =>
    requests.request({
      actorMembershipId: membershipId,
      contentBriefRunId: briefRunId,
      format: "feed",
      id: randomUUID(),
      organizationId,
      reliableOperation: reliableMutation(
        organizationId,
        membershipId,
        "content.generation:utc-boundary",
      ),
      requestedAt,
      subjectKind: "generic",
      variantIds: [randomUUID()],
    });

  const beforeMidnight = await requestAt("2026-08-06T23:59:59.999Z");
  const afterMidnight = await requestAt("2026-08-07T00:00:00.000Z");
  assert.equal(beforeMidnight.status, "accepted");
  assert.equal(afterMidnight.status, "accepted");
  assert.equal(beforeMidnight.admission.mode, "provider");
  assert.equal(afterMidnight.admission.mode, "provider");
});

test("una variante determinista sale sin base y con pieza compuesta", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const repository = new PrismaGenerationRunRepository(database);
  const runId = randomUUID();
  const variantIds = [randomUUID(), randomUUID()];

  await repository.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: runId,
    organizationId,
    requestedAt: "2026-08-05T12:00:00.000Z",
    subjectKind: "branded",
    variantIds,
  });

  const composedAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      id: composedAssetId,
      organizationId,
      origin: "generated",
      byteSize: 640_000n,
      checksumSha256: randomHash(),
      height: 1350,
      mimeType: "image/png",
      originalFileName: "pieza-determinista.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/deterministica-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/deterministica-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1080,
    },
  });

  assert.deepEqual(
    await repository.completeDeterministicVariant(
      {
        composition: {
          compositionHash: "a".repeat(64),
          height: 1350,
          layout: "composicion-tercio-inferior",
          mediaAssetId: composedAssetId,
          overlayHash: "b".repeat(64),
          sha256: "c".repeat(64),
          theme: "taller",
          version: "visual-composition/2026-08-05.1",
          width: 1080,
        },
        organizationId,
        runId,
        variantId: variantIds[0] ?? "",
      },
      "2026-08-05T12:00:10.000Z",
    ),
    { status: "written" },
  );

  // Las demás no se intentaron: una pieza determinista es siempre la misma, así
  // que pedir copias idénticas no tendría sentido.
  await repository.discardPendingVariants({
    discardedAt: "2026-08-05T12:00:11.000Z",
    organizationId,
    runId,
  });

  const record = await repository.findById({ id: runId, organizationId });
  assert.ok(record !== null);
  const [first, second] = record.variants;
  assert.ok(first !== undefined && second !== undefined);

  assert.equal(first.status, "succeeded");
  assert.equal(first.source, "deterministic");
  // No hubo proveedor: no hay base, ni hash de base, ni modelo.
  assert.equal(first.mediaAssetId, null);
  assert.equal(first.sha256, null);
  assert.equal(first.model, null);
  assert.ok(first.composition !== null);
  assert.equal(first.composition.mediaAssetId, composedAssetId);
  assert.equal(first.composition.layout, "composicion-tercio-inferior");
  assert.equal(second.status, "discarded");
});

test("E2E generar-editar-comparar-seleccionar conserva genealogía y auditoría", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const runs = new PrismaGenerationRunRepository(database);
  const editorial = new PrismaGenerationRunEditorialRepository(database);
  const parentRunId = randomUUID();
  const parentVariantId = randomUUID();
  await runs.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: parentRunId,
    organizationId,
    requestedAt: "2026-08-06T12:00:00.000Z",
    subjectKind: "generic",
    variantIds: [parentVariantId],
  });

  const baseAssetId = randomUUID();
  const composedAssetId = randomUUID();
  await database.mediaAsset.createMany({
    data: [
      {
        byteSize: 600_000n,
        checksumSha256: "1".repeat(64),
        height: 1536,
        id: baseAssetId,
        mimeType: "image/png",
        organizationId,
        origin: "generated",
        originalFileName: "base-edicion.png",
        ownerMembershipId: membershipId,
        secureUrl: `https://media.invalid/${baseAssetId}.png`,
        status: "available",
        storageKey: `generated/${baseAssetId}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1024,
      },
      {
        byteSize: 640_000n,
        checksumSha256: "2".repeat(64),
        height: 1350,
        id: composedAssetId,
        mimeType: "image/png",
        organizationId,
        origin: "generated",
        originalFileName: "pieza-edicion.png",
        ownerMembershipId: membershipId,
        secureUrl: `https://media.invalid/${composedAssetId}.png`,
        status: "available",
        storageKey: `generated/${composedAssetId}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
    ],
  });
  await runs.completeVariant(
    {
      attempts: 1,
      composition: {
        compositionHash: "3".repeat(64),
        height: 1350,
        layout: "composicion-tercio-inferior",
        mediaAssetId: composedAssetId,
        overlayHash: "4".repeat(64),
        sha256: "2".repeat(64),
        theme: "taller",
        version: "visual-composition/2026-08-05.1",
        width: 1080,
      },
      height: 1536,
      latencyMilliseconds: 2_000,
      mediaAssetId: baseAssetId,
      model: "gpt-image-2",
      organizationId,
      requestId: "request-parent",
      runId: parentRunId,
      sha256: "1".repeat(64),
      status: "succeeded",
      variantId: parentVariantId,
      width: 1024,
    },
    "2026-08-06T12:00:05.000Z",
  );
  await runs.complete(
    {
      estimatedCostUsd: 0.04,
      id: parentRunId,
      organizationId,
      plan: {
        format: "feed",
        profileId: "ferreteria-producto-limpio",
        profileVersion: "visual-profile/2026-08-03.2",
        promptHash: "5".repeat(64),
        promptVersion: "visual-prompt/2026-08-03.2",
      },
      resolution: null,
      status: "completed",
      totalTokens: 100,
    },
    "2026-08-06T12:00:06.000Z",
  );

  const childRunId = randomUUID();
  const childVariantId = randomUUID();
  const editOperation = reliableMutation(
    organizationId,
    membershipId,
    "content.generation:edit",
  );
  const edited = await editorial.requestEdit({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    edit: {
      instruction: "Usá una luz más cálida y un fondo de taller limpio.",
      kind: "visual",
      parentRunId,
      parentVariantId,
    },
    format: "feed",
    id: childRunId,
    organizationId,
    reliableOperation: editOperation,
    requestedAt: "2026-08-06T12:10:00.000Z",
    subjectKind: "generic",
    variantIds: [childVariantId],
  });
  assert.equal(edited.status, "accepted");
  const child = await runs.findById({ id: childRunId, organizationId });
  assert.ok(child);
  assert.equal(child.lineageRootId, parentRunId);
  assert.deepEqual(child.edit, {
    instruction: "Usá una luz más cálida y un fondo de taller limpio.",
    kind: "visual",
    parentRunId,
    parentVariantId,
  });
  await runs.completeVariant(
    {
      attempts: 1,
      composition: {
        compositionHash: "6".repeat(64),
        height: 1350,
        layout: "composicion-tercio-inferior",
        mediaAssetId: composedAssetId,
        overlayHash: "4".repeat(64),
        sha256: "2".repeat(64),
        theme: "taller",
        version: "visual-composition/2026-08-05.1",
        width: 1080,
      },
      height: 1536,
      latencyMilliseconds: 1_500,
      mediaAssetId: baseAssetId,
      model: "gpt-image-2",
      organizationId,
      requestId: "request-child",
      runId: childRunId,
      sha256: "1".repeat(64),
      status: "succeeded",
      variantId: childVariantId,
      width: 1024,
    },
    "2026-08-06T12:10:05.000Z",
  );
  await runs.complete(
    {
      estimatedCostUsd: 0.05,
      id: childRunId,
      organizationId,
      plan: {
        format: "feed",
        profileId: "ferreteria-producto-limpio",
        profileVersion: "visual-profile/2026-08-03.2",
        promptHash: "7".repeat(64),
        promptVersion: "visual-edit/2026-08-06.1",
      },
      resolution: null,
      status: "completed",
      totalTokens: 120,
    },
    "2026-08-06T12:10:06.000Z",
  );
  const comparison = await runs.list({
    limit: 10,
    lineageRootId: parentRunId,
    organizationId,
    page: 1,
  });
  assert.equal(comparison.total, 2);
  assert.deepEqual(
    comparison.items.map((record) => record.plan?.promptVersion).toSorted(),
    ["visual-edit/2026-08-06.1", "visual-prompt/2026-08-03.2"],
  );
  assert.notEqual(
    comparison.items[0]?.variants[0]?.composition?.compositionHash,
    comparison.items[1]?.variants[0]?.composition?.compositionHash,
  );

  const selectionOperation = reliableMutation(
    organizationId,
    membershipId,
    "content.generation:select-variant",
  );
  assert.deepEqual(
    await editorial.selectVariant({
      actorMembershipId: membershipId,
      expectedSelectionVersion: 0,
      organizationId,
      reliableOperation: selectionOperation,
      runId: parentRunId,
      selectedAt: "2026-08-06T12:11:00.000Z",
      variantId: parentVariantId,
    }),
    {
      selectedVariantId: parentVariantId,
      selectionVersion: 1,
      status: "selected",
    },
  );
  const selectedParent = await runs.findById({
    id: parentRunId,
    organizationId,
  });
  assert.ok(selectedParent);
  assert.equal(selectedParent.selectedVariantId, parentVariantId);
  assert.equal(selectedParent.variants.length, 1);
  assert.equal(
    await database.auditEvent.count({
      where: {
        operation: {
          in: ["content.generation:edit", "content.generation:select-variant"],
        },
        organizationId,
      },
    }),
    2,
  );
});

test("la base rechaza una variante que salió sin pieza o con pieza a medias", async () => {
  const { briefRunId, membershipId, organizationId } =
    await generationFixture();
  const runId = randomUUID();

  await database.generationRun.create({
    data: {
      actorMembershipId: membershipId,
      contentBriefRunId: briefRunId,
      format: "feed",
      id: runId,
      lineageRootId: runId,
      organizationId,
      requestedAt: new Date("2026-08-05T12:00:00.000Z"),
      startedAt: new Date("2026-08-05T12:00:01.000Z"),
      status: "running",
    },
  });

  const mediaAssetId = randomUUID();
  await database.mediaAsset.create({
    data: {
      id: mediaAssetId,
      organizationId,
      origin: "generated",
      byteSize: 512_000n,
      checksumSha256: randomHash(),
      height: 1536,
      mimeType: "image/png",
      originalFileName: "base.png",
      ownerMembershipId: membershipId,
      secureUrl: `https://media.invalid/base-${randomUUID()}.png`,
      status: "available",
      storageKey: `generated/base-${randomUUID()}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      width: 1024,
    },
  });

  // Una pieza sobre una variante que no salió no describe nada: una fallida no
  // tiene qué componer y una descartada nunca se intentó.
  await assert.rejects(
    database.generationRunVariant.create({
      data: {
        attempts: 1,
        completedAt: new Date("2026-08-05T12:00:10.000Z"),
        composedHeight: 1350,
        composedMediaAssetId: mediaAssetId,
        composedSha256: "c".repeat(64),
        composedWidth: 1080,
        compositionHash: "d".repeat(64),
        compositionLayout: "composicion-tercio-inferior",
        compositionOverlayHash: "e".repeat(64),
        compositionTheme: "taller",
        compositionVersion: "visual-composition/2026-08-05.1",
        failureCode: "rate-limit",
        failureCorrection: "Reintentá el lote en unos minutos.",
        failureDetail: "El proveedor limitó la tasa.",
        id: randomUUID(),
        organizationId,
        position: 0,
        runId,
        status: "failed",
      },
    }),
  );

  // Y una composición a medias no permitiría comparar dos piezas ni saber con
  // qué reglas se armó, que es para lo que se guarda.
  await assert.rejects(
    database.generationRunVariant.create({
      data: {
        attempts: 1,
        completedAt: new Date("2026-08-05T12:00:10.000Z"),
        composedMediaAssetId: mediaAssetId,
        compositionHash: "b".repeat(64),
        height: 1536,
        id: randomUUID(),
        mediaAssetId,
        model: "gpt-image-1",
        organizationId,
        position: 1,
        runId,
        sha256: "a".repeat(64),
        status: "succeeded",
        width: 1024,
      },
    }),
  );

  // Una variante determinista no puede arrastrar base ni modelo: la pieza es
  // enteramente del motor.
  await assert.rejects(
    database.generationRunVariant.create({
      data: {
        attempts: 0,
        completedAt: new Date("2026-08-05T12:00:10.000Z"),
        composedHeight: 1350,
        composedMediaAssetId: mediaAssetId,
        composedSha256: "c".repeat(64),
        composedWidth: 1080,
        compositionHash: "d".repeat(64),
        compositionLayout: "composicion-tercio-inferior",
        compositionOverlayHash: "e".repeat(64),
        compositionTheme: "taller",
        compositionVersion: "visual-composition/2026-08-05.1",
        height: 1536,
        id: randomUUID(),
        mediaAssetId,
        model: "gpt-image-1",
        organizationId,
        position: 2,
        runId,
        sha256: "a".repeat(64),
        source: "deterministic",
        status: "succeeded",
        width: 1024,
      },
    }),
  );
});

/**
 * Publicación aprobada con su snapshot inmutable.
 *
 * Una orden sólo puede nacer de un snapshot aprobado, así que el fixture deja
 * la publicación en `approved` y el snapshot creado: sin eso lo único que se
 * podría probar es el rechazo.
 */
async function publicationOrderFixture(
  publishingTargets?: readonly (
    "facebook_page" | "instagram_feed" | "instagram_story"
  )[],
): Promise<{
  contentHash: string;
  membershipId: string;
  organizationId: string;
  publicationId: string;
  snapshotId: string;
}> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  const publicationId = randomUUID();
  const revisionId = randomUUID();
  const snapshotId = randomUUID();
  const contentHash = randomHash();

  await database.organization.create({
    data: {
      displayName: "Organización de publicación",
      id: organizationId,
      legalName: "Organización de publicación",
      slug: `publishing-${organizationId}`,
    },
  });
  await database.user.create({
    data: {
      displayName: "Publicadora",
      email: `${userId}@example.invalid`,
      id: userId,
    },
  });
  await database.organizationMembership.create({
    data: { id: membershipId, organizationId, roles: ["publisher"], userId },
  });
  await database.brand.create({
    data: {
      id: brandId,
      name: "Aramayo",
      organizationId,
      profile: { claim: "Ferretería y Lubricentro" },
    },
  });
  await database.location.create({
    data: {
      addressLine: "Avenida Belgrano 100",
      brandId,
      city: "Frías",
      id: locationId,
      name: "Casa central",
      openingHours: { display: "08:00 a 20:00" },
      organizationId,
      province: "Santiago del Estero",
    },
  });
  await database.publication.create({
    data: {
      createdByMembershipId: membershipId,
      id: publicationId,
      locationId,
      organizationId,
      status: "approved",
      title: "Promoción de amoladoras",
    },
  });
  await database.publicationRevision.create({
    data: {
      content: { title: "Promoción de amoladoras" },
      contentHash,
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
      approvedAt: new Date("2026-08-19T12:00:00.000Z"),
      approvedByMembershipId: membershipId,
      contentHash,
      id: snapshotId,
      organizationId,
      publicationId,
      revisionId,
      snapshot: {
        contentHash,
        ...(publishingTargets === undefined
          ? {}
          : {
              publishingTargetPolicy: {
                mode: "exact",
                targets: publishingTargets,
              },
            }),
        revisionId,
      },
    },
  });

  return {
    contentHash,
    membershipId,
    organizationId,
    publicationId,
    snapshotId,
  };
}

/**
 * Los intentos se construyen enteros y no por partes: con
 * `exactOptionalPropertyTypes` un campo opcional presente y en `undefined` no
 * es lo mismo que ausente, y el diario distingue los dos casos al escribir.
 */
function stagedAttempt(
  organizationId: string,
  publicationTargetId: string,
  sequence: number,
  stagedMediaId: string,
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: randomUUID(),
    organizationId,
    publicationTargetId,
    sequence,
    stagedMediaId,
    state: "media_staged",
    updatedAt: new Date().toISOString(),
  });
}

function publishedAttempt(
  organizationId: string,
  publicationTargetId: string,
  sequence: number,
  remotePostId: string,
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: randomUUID(),
    organizationId,
    publicationTargetId,
    remotePermalink: `https://www.instagram.com/p/${remotePostId}/`,
    remotePostId,
    sequence,
    state: "published",
    updatedAt: new Date().toISOString(),
  });
}

function failedAttempt(
  organizationId: string,
  publicationTargetId: string,
  sequence: number,
  code: MetaPublishingFailureCode,
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: randomUUID(),
    failure: Object.freeze({
      code,
      detail: "El proveedor rechazó el intento.",
      retryable: false,
    }),
    organizationId,
    publicationTargetId,
    sequence,
    state: "failed",
    updatedAt: new Date().toISOString(),
  });
}

function unknownAttempt(
  organizationId: string,
  publicationTargetId: string,
  sequence: number,
): MetaPublishingAttemptRecord {
  return Object.freeze({
    attemptId: randomUUID(),
    organizationId,
    publicationTargetId,
    sequence,
    state: "outcome_unknown",
    updatedAt: new Date().toISOString(),
  });
}

async function requestOrder(
  orders: PrismaPublicationOrderRepository,
  organizationId: string,
  membershipId: string,
  publicationId: string,
  targets: readonly ("facebook_page" | "instagram_feed" | "instagram_story")[],
): Promise<string> {
  const requested = await orders.request({
    actorMembershipId: membershipId,
    expectedVersion: 1,
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      membershipId,
      "publishing:execute",
    ),
    targets,
  });
  if (requested.status !== "accepted") {
    assert.fail(`la orden no fue aceptada: ${requested.status}`);
  }
  return requested.orderId;
}

test("una política exacta rechaza ampliar destinos sin crear efectos", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture(["instagram_feed", "facebook_page"]);
  const orders = new PrismaPublicationOrderRepository(database);
  const rejected = await orders.request({
    actorMembershipId: membershipId,
    expectedVersion: 1,
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      membershipId,
      "publishing:execute",
    ),
    targets: ["instagram_feed", "instagram_story", "facebook_page"],
  });

  assert.deepEqual(rejected, { status: "target-policy-conflict" });
  assert.equal(
    await database.publicationOrder.count({ where: { organizationId } }),
    0,
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { aggregateType: "publication_order", organizationId },
    }),
    0,
  );
  const intact = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(intact.status, "approved");
  assert.equal(intact.version, 1);

  const accepted = await orders.request({
    actorMembershipId: membershipId,
    expectedVersion: 1,
    organizationId,
    publicationId,
    reliableOperation: reliableMutation(
      organizationId,
      membershipId,
      "publishing:execute",
    ),
    targets: ["facebook_page", "instagram_feed"],
  });
  assert.equal(accepted.status, "accepted");
});

test("la orden E2E publica todos sus destinos y cierra como published", async () => {
  const {
    contentHash,
    membershipId,
    organizationId,
    publicationId,
    snapshotId,
  } = await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );

  // Pedir la orden mueve la publicación a `publishing` y consume una versión.
  const requested = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(requested.status, "publishing");
  assert.equal(requested.version, 2);

  // Lo que el worker recibe sale del snapshot aprobado, no del borrador.
  const job = await orders.findJob(organizationId, orderId);
  assert.ok(job);
  assert.equal(job.approvalSnapshotId, snapshotId);
  assert.equal(job.contentHash, contentHash);
  assert.equal(job.targets.length, 2);

  const opened = await orders.findById(organizationId, orderId);
  assert.ok(opened);
  assert.equal(publicationOrderStatus(opened.targets), "publishing");
  assert.equal(pendingPublicationTargets(opened).length, 2);

  // Cada destino avanza por su cuenta: primero el medio preparado, después la
  // publicación confirmada.
  for (const target of ["facebook_page", "instagram_feed"] as const) {
    const key = publicationTargetKey(orderId, target);
    assert.equal(
      await orders.save(
        stagedAttempt(organizationId, key, 1, `staged-${target}`),
      ),
      "saved",
    );
    assert.equal(
      await orders.save(
        publishedAttempt(organizationId, key, 2, `remote-${target}`),
      ),
      "saved",
    );
  }

  const done = await orders.findById(organizationId, orderId);
  assert.ok(done);
  assert.equal(publicationOrderStatus(done.targets), "published");
  assert.equal(pendingPublicationTargets(done).length, 0);
  // El repositorio ordena por `target`, y PostgreSQL ordena un ENUM por el
  // orden en que se declararon sus valores, no alfabéticamente: `instagram_feed`
  // va primero porque encabeza el tipo.
  assert.deepEqual(
    done.targets.map((entry) => entry.target),
    ["instagram_feed", "facebook_page"],
  );
  assert.deepEqual(
    done.targets.map((entry) => entry.remotePostId),
    ["remote-instagram_feed", "remote-facebook_page"],
  );

  const settled = await orders.settle(
    organizationId,
    orderId,
    "2026-08-19T13:00:00.000Z",
  );
  assert.equal(settled.status, "completed");

  // La orden cerrada y la publicación tienen que decir lo mismo.
  const closed = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(closed.status, "published");
  assert.equal(closed.version, 3);
  const closedOrder = await database.publicationOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  assert.notEqual(closedOrder.settledAt, null);
  // El cierre deja transición registrada: pedido y cierre son dos asientos.
  assert.equal(
    await database.publicationStateTransition.count({
      where: { organizationId, publicationId, toStatus: "published" },
    }),
    1,
  );
});

test("la orden E2E con todos los destinos fallidos cierra como publish_failed", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );

  for (const target of ["facebook_page", "instagram_feed"] as const) {
    const key = publicationTargetKey(orderId, target);
    assert.equal(
      await orders.save(failedAttempt(organizationId, key, 1, "media-invalid")),
      "saved",
    );
  }

  const failed = await orders.findById(organizationId, orderId);
  assert.ok(failed);
  assert.equal(publicationOrderStatus(failed.targets), "publish_failed");
  // Ningún destino admite otro intento por sí solo: todos están resueltos.
  assert.deepEqual(
    failed.targets.map((entry) => entry.failureCode),
    ["media-invalid", "media-invalid"],
  );
  assert.deepEqual(
    failed.targets.map((entry) => entry.remotePostId),
    [undefined, undefined],
  );

  assert.equal(
    (await orders.settle(organizationId, orderId, "2026-08-19T13:00:00.000Z"))
      .status,
    "completed",
  );
  const closed = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(closed.status, "publish_failed");
});

test("la orden E2E con un destino caído cierra como partially_published", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );

  const instagram = publicationTargetKey(orderId, "instagram_feed");
  const facebook = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(
      publishedAttempt(organizationId, instagram, 1, "remote-instagram"),
    ),
    "saved",
  );
  assert.equal(
    await orders.save(
      failedAttempt(organizationId, facebook, 1, "permission-denied"),
    ),
    "saved",
  );

  const partial = await orders.findById(organizationId, orderId);
  assert.ok(partial);
  assert.equal(publicationOrderStatus(partial.targets), "partially_published");

  // El fallo parcial tiene que decir cuál salió y cuál no; un agregado solo no
  // alcanza para decidir qué hacer después.
  const byTarget = new Map(
    partial.targets.map((entry) => [entry.target, entry]),
  );
  assert.equal(byTarget.get("instagram_feed")?.state, "published");
  assert.equal(
    byTarget.get("instagram_feed")?.remotePostId,
    "remote-instagram",
  );
  assert.equal(byTarget.get("facebook_page")?.state, "failed");
  assert.equal(byTarget.get("facebook_page")?.failureCode, "permission-denied");
  assert.equal(byTarget.get("facebook_page")?.remotePostId, undefined);

  assert.equal(
    (await orders.settle(organizationId, orderId, "2026-08-19T13:00:00.000Z"))
      .status,
    "completed",
  );
  const closed = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(closed.status, "partially_published");
});

test("un destino en duda deja la orden abierta y fuera de reintento", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );

  assert.equal(
    await orders.save(
      publishedAttempt(
        organizationId,
        publicationTargetKey(orderId, "instagram_feed"),
        1,
        "remote-instagram",
      ),
    ),
    "saved",
  );
  assert.equal(
    await orders.save(
      unknownAttempt(
        organizationId,
        publicationTargetKey(orderId, "facebook_page"),
        1,
      ),
    ),
    "saved",
  );

  // `outcome_unknown` no es éxito ni fallo: la orden sigue `publishing` porque
  // es la única lectura honesta, y el destino en duda no se reintenta porque
  // pudo haber salido.
  const open = await orders.findById(organizationId, orderId);
  assert.ok(open);
  assert.equal(publicationOrderStatus(open.targets), "publishing");
  assert.equal(pendingPublicationTargets(open).length, 0);
  const stillPublishing = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(stillPublishing.status, "publishing");
});

test("dos pedidos duplicados de publicación crean una sola orden", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  // La misma clave idempotente en los dos intentos: es lo que hace un cliente
  // que reintenta antes de recibir la primera respuesta.
  const operation = reliableMutation(
    organizationId,
    membershipId,
    "publishing:execute",
  );
  const input = {
    actorMembershipId: membershipId,
    expectedVersion: 1,
    organizationId,
    publicationId,
    reliableOperation: operation,
    targets: ["instagram_feed", "facebook_page"] as const,
  };

  const [first, second] = await Promise.all([
    orders.request(input),
    orders.request(input),
  ]);

  const outcomes = [first.status, second.status].toSorted();
  assert.ok(
    outcomes.every(
      (status) => status === "accepted" || status === "in-progress",
    ),
    `estados inesperados: ${outcomes.join(", ")}`,
  );
  // Una sola orden, un solo evento y una sola tanda de destinos: publicar dos
  // veces empieza por crear dos órdenes.
  assert.equal(
    await database.publicationOrder.count({ where: { organizationId } }),
    1,
  );
  assert.equal(
    await database.publicationOrderTarget.count({ where: { organizationId } }),
    2,
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { aggregateType: "publication_order", organizationId },
    }),
    1,
  );
  // Y la publicación avanzó una sola versión.
  const publication = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(publication.version, 2);
});

test("dos trabajadores sobre el mismo destino publican una sola vez", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");

  // Los dos leyeron la misma fila y escriben la misma secuencia. La condición
  // vive en el `WHERE` del `UPDATE`, así que la resuelve el motor.
  const [first, second] = await Promise.all([
    orders.save(publishedAttempt(organizationId, key, 1, "remote-primero")),
    orders.save(publishedAttempt(organizationId, key, 1, "remote-segundo")),
  ]);
  assert.deepEqual([first, second].toSorted(), ["conflict", "saved"]);

  // Gana exactamente uno y el otro se detiene sin publicar.
  const stored = await orders.find({
    organizationId,
    publicationTargetId: key,
  });
  assert.ok(stored);
  assert.equal(stored.sequence, 1);
  assert.equal(stored.state, "published");
  assert.ok(
    stored.remotePostId === "remote-primero" ||
      stored.remotePostId === "remote-segundo",
    `identificador remoto inesperado: ${String(stored.remotePostId)}`,
  );

  // El perdedor tampoco puede reintentar con la secuencia que ya se usó.
  assert.equal(
    await orders.save(publishedAttempt(organizationId, key, 1, "remote-tarde")),
    "conflict",
  );
  assert.equal(
    await database.publicationOrderTarget.count({
      where: { orderId, organizationId },
    }),
    1,
  );
});

test("cancelar antes de terminar corta los intentos y conserva lo publicado", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  assert.equal(
    await orders.save(
      publishedAttempt(
        organizationId,
        publicationTargetKey(orderId, "instagram_feed"),
        1,
        "remote-instagram",
      ),
    ),
    "saved",
  );

  const cancelled = await orders.cancel({
    actorMembershipId: membershipId,
    cancelledAt: "2026-08-19T13:30:00.000Z",
    orderId,
    organizationId,
    reasonCode: "operator-cancelled",
  });
  assert.equal(cancelled.status, "cancelled");

  // Cancelar no borra lo irreversible: Instagram siguió publicado y Facebook
  // dejó de admitir intentos.
  const after = await orders.findById(organizationId, orderId);
  assert.ok(after);
  assert.equal(pendingPublicationTargets(after).length, 0);
  const byTarget = new Map(after.targets.map((entry) => [entry.target, entry]));
  assert.equal(byTarget.get("instagram_feed")?.state, "published");
  assert.equal(byTarget.get("facebook_page")?.state, "pending");

  // Cancelar dos veces no cambia nada ni pierde el motivo.
  const again = await orders.cancel({
    actorMembershipId: membershipId,
    cancelledAt: "2026-08-19T13:40:00.000Z",
    orderId,
    organizationId,
    reasonCode: "operator-cancelled",
  });
  assert.equal(again.status, "already-settled");
  const row = await database.publicationOrder.findUniqueOrThrow({
    where: { id: orderId },
  });
  assert.equal(row.cancelledReasonCode, "operator-cancelled");
  assert.equal(row.cancelledAt?.toISOString(), "2026-08-19T13:30:00.000Z");
});

test("la base rechaza destinos y órdenes que no describen nada real", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );

  // Un destino publicado sin identificador remoto sería un éxito que nadie
  // puede consultar; para eso existe `published_unconfirmed`.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { state: "published" },
      where: { orderId, organizationId },
    }),
  );
  // Un fallo sin código no se puede clasificar ni reintentar con criterio.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { state: "failed" },
      where: { orderId, organizationId },
    }),
  );
  // Dos filas para el mismo destino de la misma orden serían dos intentos
  // compitiendo por el mismo lugar.
  await assert.rejects(
    database.publicationOrderTarget.create({
      data: { orderId, organizationId, target: "instagram_feed" },
    }),
  );
  // Una cancelación sin motivo no se puede auditar después.
  await assert.rejects(
    database.publicationOrder.updateMany({
      data: { cancelledAt: new Date("2026-08-19T13:30:00.000Z") },
      where: { id: orderId, organizationId },
    }),
  );

  // Ninguno de los rechazos dejó rastro: el destino sigue como estaba.
  const intact = await orders.findById(organizationId, orderId);
  assert.ok(intact);
  assert.equal(intact.targets.length, 1);
  assert.equal(intact.targets[0]?.state, "pending");
  assert.equal(intact.cancelledAt, undefined);
});

test("el calendario programa el reintento y respeta la secuencia leída", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(failedAttempt(organizationId, key, 1, "provider-error")),
    "saved",
  );

  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T12:10:00.000Z",
      organizationId,
      publicationTargetId: key,
      sequence: 1,
    }),
    "saved",
  );

  // Una escritura con la secuencia vieja llega tarde: la fila ya avanzó.
  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T13:00:00.000Z",
      organizationId,
      publicationTargetId: key,
      sequence: 1,
    }),
    "conflict",
  );

  const stored = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(stored.attempts, 1);
  assert.equal(stored.sequence, 2);
  assert.equal(stored.nextAttemptAt?.toISOString(), "2026-08-20T12:10:00.000Z");
  // El fallo que causó el reintento sigue registrado.
  assert.equal(stored.failureCode, "provider-error");
});

test("el barrido devuelve sólo los reintentos que ya vencieron", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  const vencido = publicationTargetKey(orderId, "instagram_feed");
  const futuro = publicationTargetKey(orderId, "facebook_page");
  for (const key of [vencido, futuro]) {
    assert.equal(
      await orders.save(failedAttempt(organizationId, key, 1, "rate-limit")),
      "saved",
    );
  }
  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T12:00:00.000Z",
      organizationId,
      publicationTargetId: vencido,
      sequence: 1,
    }),
    "saved",
  );
  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T18:00:00.000Z",
      organizationId,
      publicationTargetId: futuro,
      sequence: 1,
    }),
    "saved",
  );

  const due = await orders.dueRetries("2026-08-20T12:05:00.000Z", 50);
  const fromThisOrder = due.filter((entry) => entry.orderId === orderId);
  assert.deepEqual(
    fromThisOrder.map((entry) => entry.publicationTargetId),
    [vencido],
  );
  const [programado] = fromThisOrder;
  assert.ok(programado);
  assert.equal(programado.attempts, 1);
  assert.equal(programado.failureCode, "rate-limit");
  assert.equal(programado.sequence, 2);
});

test("reconciliar anota la evidencia remota sin borrar el fallo", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["facebook_page"],
  );
  const key = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(unknownAttempt(organizationId, key, 1)),
    "saved",
  );

  // El destino en duda aparece en el barrido de desenlaces abiertos.
  const open = await orders.openOutcomes(50);
  assert.ok(
    open.some((entry) => entry.publicationTargetId === key),
    "el destino en duda no apareció en el barrido",
  );

  assert.equal(
    await orders.confirmRemotePublication({
      organizationId,
      publicationTargetId: key,
      reconciledAt: "2026-08-20T12:30:00.000Z",
      remotePermalink: "https://www.facebook.com/1/posts/2",
      remotePostId: "252222471780140_1587397416410955",
      sequence: 1,
    }),
    "saved",
  );

  const stored = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(stored.state, "published");
  assert.equal(stored.remotePostId, "252222471780140_1587397416410955");
  assert.equal(stored.reconciledAt?.toISOString(), "2026-08-20T12:30:00.000Z");
  // Un destino resuelto no espera nada más.
  assert.equal(stored.nextAttemptAt, null);
  assert.equal(stored.manualReason, null);

  // Y la orden cierra como publicada gracias a la evidencia reconciliada.
  assert.equal(
    (await orders.settle(organizationId, orderId, "2026-08-20T12:31:00.000Z"))
      .status,
    "completed",
  );
  const publication = await database.publication.findUniqueOrThrow({
    where: { id: publicationId },
  });
  assert.equal(publication.status, "published");
});

test("un destino comprobado ausente vuelve a la cola y descarta el medio", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(stagedAttempt(organizationId, key, 1, "contenedor-1")),
    "saved",
  );

  assert.equal(
    await orders.reopenForRepublish({
      organizationId,
      publicationTargetId: key,
      reconciledAt: "2026-08-20T12:40:00.000Z",
      sequence: 1,
    }),
    "saved",
  );

  const stored = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(stored.state, "pending");
  // El contenedor que iba a producir la publicación ya no sirve como evidencia.
  assert.equal(stored.stagedMediaId, null);

  // Y el destino vuelve a estar pendiente para la orden.
  const order = await orders.findById(organizationId, orderId);
  assert.ok(order);
  assert.equal(pendingPublicationTargets(order).length, 1);
});

test("reintentar un destino no toca los que ya se publicaron", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  const publicado = publicationTargetKey(orderId, "instagram_feed");
  const caido = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(
      publishedAttempt(organizationId, publicado, 1, "remote-instagram"),
    ),
    "saved",
  );
  assert.equal(
    await orders.save(failedAttempt(organizationId, caido, 1, "rate-limit")),
    "saved",
  );

  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T12:20:00.000Z",
      organizationId,
      publicationTargetId: caido,
      sequence: 1,
    }),
    "saved",
  );

  // El destino exitoso queda intacto: mismo estado, mismo identificador, misma
  // secuencia y sin nada programado.
  const intacto = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId, target: "instagram_feed" },
  });
  assert.equal(intacto.state, "published");
  assert.equal(intacto.remotePostId, "remote-instagram");
  assert.equal(intacto.sequence, 1);
  assert.equal(intacto.attempts, 0);
  assert.equal(intacto.nextAttemptAt, null);
  // Y el barrido nunca lo levanta.
  const due = await orders.dueRetries("2026-08-20T12:25:00.000Z", 50);
  assert.equal(
    due.some((entry) => entry.publicationTargetId === publicado),
    false,
  );
});

test("la base rechaza un destino que espera dos futuros a la vez", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );

  // Esperar el reintento y esperar a una persona describen dos futuros
  // distintos: el worker leería uno y el panel el otro.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: {
        manualReason: "attempts-exhausted",
        nextAttemptAt: new Date("2026-08-20T12:20:00.000Z"),
      },
      where: { orderId, organizationId },
    }),
  );
  // Un motivo manual con forma inválida no se puede clasificar después.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { manualReason: "Agotado!" },
      where: { orderId, organizationId },
    }),
  );
  // Los intentos no pueden ser negativos.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { attempts: -1 },
      where: { orderId, organizationId },
    }),
  );
});

test("la base rechaza un destino publicado que sigue esperando algo", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(
      publishedAttempt(organizationId, key, 1, "remote-instagram"),
    ),
    "saved",
  );

  // Es la regla que impide que un barrido vuelva a tocar lo que ya salió.
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { nextAttemptAt: new Date("2026-08-20T12:20:00.000Z") },
      where: { orderId, organizationId },
    }),
  );
  await assert.rejects(
    database.publicationOrderTarget.updateMany({
      data: { manualReason: "attempts-exhausted" },
      where: { orderId, organizationId },
    }),
  );
});

test("el reintento vencido vuelve a la cola y reencola el evento en una transacción", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(failedAttempt(organizationId, key, 1, "rate-limit")),
    "saved",
  );
  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T12:10:00.000Z",
      organizationId,
      publicationTargetId: key,
      sequence: 1,
    }),
    "saved",
  );

  const eventId = randomUUID();
  assert.equal(
    await orders.dispatchDueRetry({
      availableAt: "2026-08-20T12:11:00.000Z",
      eventId,
      organizationId,
      publicationTargetId: key,
      sequence: 2,
    }),
    "dispatched",
  );

  // El destino vuelve a admitir intento y deja de tener fecha.
  const target = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(target.state, "pending");
  assert.equal(target.nextAttemptAt, null);
  assert.equal(target.attempts, 1);
  // Y el evento quedó encolado en la misma transacción: un destino sin evento
  // se queda esperando para siempre.
  const message = await database.outboxMessage.findUniqueOrThrow({
    where: { id: eventId },
  });
  assert.equal(message.topic, "content.publication.publish-requested");
  assert.equal(message.aggregateId, orderId);

  // Un segundo despacho con la secuencia vieja no reencola nada.
  assert.equal(
    await orders.dispatchDueRetry({
      availableAt: "2026-08-20T12:12:00.000Z",
      eventId: randomUUID(),
      organizationId,
      publicationTargetId: key,
      sequence: 2,
    }),
    "conflict",
  );
  assert.equal(
    await database.outboxMessage.count({
      where: { aggregateId: orderId, organizationId },
    }),
    // El de la solicitud original más el del reintento. Ninguno más.
    2,
  );
});

test("una orden cancelada no recibe el reintento aunque tenga fecha", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(failedAttempt(organizationId, key, 1, "rate-limit")),
    "saved",
  );
  assert.equal(
    await orders.scheduleRetry({
      nextAttemptAt: "2026-08-20T12:10:00.000Z",
      organizationId,
      publicationTargetId: key,
      sequence: 1,
    }),
    "saved",
  );
  assert.equal(
    (
      await orders.cancel({
        actorMembershipId: membershipId,
        cancelledAt: "2026-08-20T12:09:00.000Z",
        orderId,
        organizationId,
        reasonCode: "operator-cancelled",
      })
    ).status,
    "cancelled",
  );

  assert.equal(
    await orders.dispatchDueRetry({
      availableAt: "2026-08-20T12:11:00.000Z",
      eventId: randomUUID(),
      organizationId,
      publicationTargetId: key,
      sequence: 2,
    }),
    "closed",
  );
  // El destino sigue fallido: cancelar no reabre nada.
  const target = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(target.state, "failed");
  assert.equal(
    await database.outboxMessage.count({
      where: { aggregateId: orderId, organizationId },
    }),
    1,
  );
});

test("la reconciliación arregla un destino fallido que en Meta sí salió", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  const divergente = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(
      publishedAttempt(
        organizationId,
        publicationTargetKey(orderId, "instagram_feed"),
        1,
        "remote-instagram",
      ),
    ),
    "saved",
  );
  // El estado inconsistente conocido: acá figura fallido con un código ambiguo
  // y en Meta la publicación existe.
  assert.equal(
    await orders.save(
      failedAttempt(organizationId, divergente, 1, "request-timeout"),
    ),
    "saved",
  );

  // Un fallo ambiguo deja la orden abierta y aparece en el barrido.
  const beforeOrder = await orders.findById(organizationId, orderId);
  assert.ok(beforeOrder);
  assert.equal(publicationOrderStatus(beforeOrder.targets), "publishing");
  const open = await orders.openOutcomes(100);
  assert.ok(
    open.some((entry) => entry.publicationTargetId === divergente),
    "el fallo ambiguo no entró al barrido de desenlaces abiertos",
  );
  // Y no se planifica como reintento: republicarlo duplicaría.
  const unplanned = await orders.unplannedFailures(100);
  assert.equal(
    unplanned.some((entry) => entry.publicationTargetId === divergente),
    false,
  );

  assert.equal(
    await orders.confirmRemotePublication({
      organizationId,
      publicationTargetId: divergente,
      reconciledAt: "2026-08-20T12:30:00.000Z",
      remotePostId: "252222471780140_1587397416410955",
      sequence: 1,
    }),
    "saved",
  );

  const after = await orders.findById(organizationId, orderId);
  assert.ok(after);
  // La orden pasa de abierta a publicada sin haber publicado nada de nuevo.
  assert.equal(publicationOrderStatus(after.targets), "published");
  const byTarget = new Map(after.targets.map((entry) => [entry.target, entry]));
  assert.equal(byTarget.get("facebook_page")?.state, "published");
  // El fallo sigue anotado: falló de verdad y después se comprobó que salió.
  assert.equal(byTarget.get("facebook_page")?.failureCode, "request-timeout");
});

test("la alerta lista destinos detenidos y sus acciones seguras", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  const agotado = publicationTargetKey(orderId, "instagram_feed");
  const enDuda = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(failedAttempt(organizationId, agotado, 1, "rate-limit")),
    "saved",
  );
  assert.equal(
    await orders.save(unknownAttempt(organizationId, enDuda, 1)),
    "saved",
  );
  assert.equal(
    await orders.requireManualAction({
      organizationId,
      publicationTargetId: agotado,
      reason: "attempts-exhausted",
      sequence: 1,
    }),
    "saved",
  );
  assert.equal(
    await orders.requireManualAction({
      organizationId,
      publicationTargetId: enDuda,
      reason: "outcome-unresolved",
      sequence: 1,
    }),
    "saved",
  );

  const pending = await orders.pendingManualActions(organizationId, 50);
  const byId = new Map(
    pending.map((entry) => [entry.publicationTargetId, entry]),
  );
  assert.equal(pending.length, 2);
  assert.deepEqual(
    [...(byId.get(agotado)?.actions ?? [])],
    ["retry", "abandon"],
  );
  // El que puede haber salido no ofrece reintentar: sería duplicar.
  assert.deepEqual(
    [...(byId.get(enDuda)?.actions ?? [])],
    ["reconcile", "abandon"],
  );
  assert.equal(byId.get(agotado)?.publicationId, publicationId);
});

test("la base rechaza reintentar a mano un destino que puede haber salido", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["facebook_page"],
  );
  const key = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(unknownAttempt(organizationId, key, 1)),
    "saved",
  );
  assert.equal(
    await orders.requireManualAction({
      organizationId,
      publicationTargetId: key,
      reason: "outcome-unresolved",
      sequence: 1,
    }),
    "saved",
  );

  // El permiso se comprueba contra el motivo guardado, no contra lo que llegó:
  // un panel con una lista vieja no alcanza para forzar la duplicación.
  assert.deepEqual(
    await orders.applyManualAction({
      action: "retry",
      actorMembershipId: membershipId,
      occurredAt: "2026-08-20T13:00:00.000Z",
      organizationId,
      publicationTargetId: key,
    }),
    { status: "not-allowed" },
  );
  const intact = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  assert.equal(intact.state, "outcome_unknown");
  assert.equal(intact.nextAttemptAt, null);
});

test("reintentar a mano devuelve el destino al mismo despacho con presupuesto nuevo", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const key = publicationTargetKey(orderId, "instagram_feed");
  assert.equal(
    await orders.save(failedAttempt(organizationId, key, 1, "rate-limit")),
    "saved",
  );
  await database.publicationOrderTarget.updateMany({
    data: { attempts: 5 },
    where: { orderId, organizationId },
  });
  assert.equal(
    await orders.requireManualAction({
      organizationId,
      publicationTargetId: key,
      reason: "attempts-exhausted",
      sequence: 1,
    }),
    "saved",
  );

  assert.deepEqual(
    await orders.applyManualAction({
      action: "retry",
      actorMembershipId: membershipId,
      occurredAt: "2026-08-20T13:00:00.000Z",
      organizationId,
      publicationTargetId: key,
    }),
    { status: "applied" },
  );

  const stored = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId },
  });
  // Deja de esperar a una persona y pasa a esperar al despacho, que es el
  // mismo camino que usan los reintentos automáticos.
  assert.equal(stored.manualReason, null);
  assert.equal(stored.nextAttemptAt?.toISOString(), "2026-08-20T13:00:00.000Z");
  // Presupuesto nuevo: sin esto el primer fallo siguiente lo agotaría de nuevo.
  assert.equal(stored.attempts, 0);
  // El fallo que lo detuvo sigue registrado.
  assert.equal(stored.failureCode, "rate-limit");
  // Y ya no figura en la alerta.
  assert.equal(
    (await orders.pendingManualActions(organizationId, 50)).length,
    0,
  );
});

test("abandonar cierra la orden sin afirmar cómo terminó el destino", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed", "facebook_page"],
  );
  const publicado = publicationTargetKey(orderId, "instagram_feed");
  const enDuda = publicationTargetKey(orderId, "facebook_page");
  assert.equal(
    await orders.save(
      publishedAttempt(organizationId, publicado, 1, "remote-instagram"),
    ),
    "saved",
  );
  assert.equal(
    await orders.save(unknownAttempt(organizationId, enDuda, 1)),
    "saved",
  );
  assert.equal(
    await orders.requireManualAction({
      organizationId,
      publicationTargetId: enDuda,
      reason: "outcome-unresolved",
      sequence: 1,
    }),
    "saved",
  );

  assert.deepEqual(
    await orders.applyManualAction({
      action: "abandon",
      actorMembershipId: membershipId,
      occurredAt: "2026-08-20T13:00:00.000Z",
      organizationId,
      publicationTargetId: enDuda,
    }),
    { status: "applied" },
  );

  const stored = await database.publicationOrderTarget.findFirstOrThrow({
    where: { orderId, organizationId, target: "facebook_page" },
  });
  // El intento sigue en duda y así queda: abandonar es dejar de intentar, no
  // averiguar. No se inventa un fallo que nadie comprobó.
  assert.equal(stored.state, "outcome_unknown");
  assert.equal(stored.failureCode, null);
  assert.equal(stored.manualReason, "abandoned-by-operator");

  // Pero la orden ya puede cerrar, y cierra como parcial.
  const order = await orders.findById(organizationId, orderId);
  assert.ok(order);
  assert.equal(publicationOrderStatus(order.targets), "partially_published");
  // Y deja de aparecer en la alerta y en el barrido de desenlaces abiertos.
  assert.equal(
    (await orders.pendingManualActions(organizationId, 50)).length,
    0,
  );
  assert.equal(
    (await orders.openOutcomes(200)).some(
      (entry) => entry.publicationTargetId === enDuda,
    ),
    false,
  );
});

// --- Programación, recurrencia y ocurrencias (`P6-T01`) ---

async function scheduleFixture(
  overrides: Record<string, unknown> = {},
): Promise<{
  organizationId: string;
  publicationId: string;
  scheduleId: string;
  snapshotId: string;
}> {
  const { membershipId, organizationId, publicationId, snapshotId } =
    await publicationOrderFixture();
  const scheduleId = randomUUID();
  await database.publicationSchedule.create({
    data: {
      approvalSnapshotId: snapshotId,
      createdByMembershipId: membershipId,
      effectiveFrom: new Date("2026-09-01T12:00:00.000Z"),
      id: scheduleId,
      kind: "daily",
      localTime: "09:00",
      organizationId,
      publicationId,
      recurrenceInterval: 1,
      targets: ["instagram_feed"],
      timeZone: "America/Argentina/Cordoba",
      ...overrides,
    },
  });
  return { organizationId, publicationId, scheduleId, snapshotId };
}

test("una programación sin destinos no se guarda", async () => {
  const { membershipId, organizationId, publicationId, snapshotId } =
    await publicationOrderFixture();
  // `cardinality` y no `array_length`: sobre un arreglo vacío el segundo
  // devuelve NULL y el CHECK dejaría pasar justo lo que existe para impedir.
  await assert.rejects(
    database.publicationSchedule.create({
      data: {
        approvalSnapshotId: snapshotId,
        createdByMembershipId: membershipId,
        effectiveFrom: new Date("2026-09-01T12:00:00.000Z"),
        kind: "once",
        localTime: "09:00",
        organizationId,
        publicationId,
        targets: [],
        timeZone: "America/Argentina/Cordoba",
      },
    }),
  );
});

test("cada frecuencia guarda exactamente sus campos", async () => {
  const { membershipId, organizationId, publicationId, snapshotId } =
    await publicationOrderFixture();
  const base = {
    approvalSnapshotId: snapshotId,
    createdByMembershipId: membershipId,
    effectiveFrom: new Date("2026-09-01T12:00:00.000Z"),
    localTime: "09:00",
    organizationId,
    publicationId,
    targets: ["instagram_feed" as const],
    timeZone: "America/Argentina/Cordoba",
  };
  // Una regla semanal sin días describe una repetición que nunca ocurre.
  await assert.rejects(
    database.publicationSchedule.create({
      data: { ...base, kind: "weekly", recurrenceInterval: 1, weekdays: [] },
    }),
  );
  // Un día del mes en una regla semanal es un campo que nadie lee: la fila
  // diría dos cosas distintas sobre cuándo publica.
  await assert.rejects(
    database.publicationSchedule.create({
      data: {
        ...base,
        kind: "weekly",
        monthDay: 15,
        recurrenceInterval: 1,
        weekdays: [2],
      },
    }),
  );
  // Sin política de desborde, el 31 en un mes corto no tiene respuesta.
  await assert.rejects(
    database.publicationSchedule.create({
      data: { ...base, kind: "monthly", monthDay: 31, recurrenceInterval: 1 },
    }),
  );
  await assert.rejects(
    database.publicationSchedule.create({
      data: { ...base, kind: "once", recurrenceInterval: 1 },
    }),
  );
  await assert.rejects(
    database.publicationSchedule.create({
      data: {
        ...base,
        kind: "weekly",
        recurrenceInterval: 1,
        weekdays: [8],
      },
    }),
  );
});

test("un estado terminal sin su marca temporal no se guarda", async () => {
  const { membershipId, organizationId, publicationId, snapshotId } =
    await publicationOrderFixture();
  const base = {
    approvalSnapshotId: snapshotId,
    createdByMembershipId: membershipId,
    effectiveFrom: new Date("2026-09-01T12:00:00.000Z"),
    kind: "once" as const,
    localTime: "09:00",
    organizationId,
    publicationId,
    targets: ["instagram_feed" as const],
    timeZone: "America/Argentina/Cordoba",
  };
  await assert.rejects(
    database.publicationSchedule.create({
      data: { ...base, status: "cancelled" },
    }),
  );
  await assert.rejects(
    database.publicationSchedule.create({
      data: { ...base, cancelledAt: new Date(), status: "cancelled" },
    }),
    "Una cancelación sin motivo no se puede auditar.",
  );
  // Sólo una programación única puede completarse: una recurrente vence o se
  // cancela, pero no «termina».
  await assert.rejects(
    database.publicationSchedule.create({
      data: {
        ...base,
        completedAt: new Date(),
        kind: "daily",
        recurrenceInterval: 1,
        status: "completed",
      },
    }),
  );
});

test("la clave civil identifica la ocurrencia dentro de su programación", async () => {
  const { organizationId, scheduleId } = await scheduleFixture();
  await database.publicationScheduleOccurrence.create({
    data: {
      occurrenceKey: "2026-09-15T09:00",
      organizationId,
      scheduledAt: new Date("2026-09-15T12:00:00.000Z"),
      scheduleId,
    },
  });
  // Volver a materializar la misma regla tiene que encontrar esta fila, no
  // crear otra: es lo que hace idempotente la materialización.
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        occurrenceKey: "2026-09-15T09:00",
        organizationId,
        scheduledAt: new Date("2026-09-15T13:00:00.000Z"),
        scheduleId,
      },
    }),
  );
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        occurrenceKey: "2026-9-15T09:00",
        organizationId,
        scheduledAt: new Date("2026-09-15T12:00:00.000Z"),
        scheduleId,
      },
    }),
  );
});

test("una ocurrencia despachada y su orden son la misma cosa", async () => {
  const { membershipId, organizationId, publicationId } =
    await publicationOrderFixture();
  const orders = new PrismaPublicationOrderRepository(database);
  const orderId = await requestOrder(
    orders,
    organizationId,
    membershipId,
    publicationId,
    ["instagram_feed"],
  );
  const snapshot = await database.approvalSnapshot.findFirstOrThrow({
    where: { organizationId, publicationId },
  });
  const scheduleId = randomUUID();
  await database.publicationSchedule.create({
    data: {
      approvalSnapshotId: snapshot.id,
      createdByMembershipId: membershipId,
      effectiveFrom: new Date("2026-09-01T12:00:00.000Z"),
      id: scheduleId,
      kind: "daily",
      localTime: "09:00",
      organizationId,
      publicationId,
      recurrenceInterval: 1,
      targets: ["instagram_feed"],
      timeZone: "America/Argentina/Cordoba",
    },
  });

  // Despachada sin orden describiría una ocurrencia que no produjo nada.
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        dispatchedAt: new Date(),
        occurrenceKey: "2026-09-16T09:00",
        organizationId,
        scheduledAt: new Date("2026-09-16T12:00:00.000Z"),
        scheduleId,
        status: "dispatched",
      },
    }),
  );
  await database.publicationScheduleOccurrence.create({
    data: {
      dispatchedAt: new Date(),
      occurrenceKey: "2026-09-16T09:00",
      organizationId,
      publicationOrderId: orderId,
      scheduledAt: new Date("2026-09-16T12:00:00.000Z"),
      scheduleId,
      status: "dispatched",
    },
  });
  // Dos ocurrencias sobre la misma orden dirían que una publicación salió dos
  // veces desde el calendario.
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        dispatchedAt: new Date(),
        occurrenceKey: "2026-09-17T09:00",
        organizationId,
        publicationOrderId: orderId,
        scheduledAt: new Date("2026-09-17T12:00:00.000Z"),
        scheduleId,
        status: "dispatched",
      },
    }),
  );
});

test("saltear y cancelar una ocurrencia conservan su motivo", async () => {
  const { organizationId, scheduleId } = await scheduleFixture();
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        occurrenceKey: "2026-09-18T09:00",
        organizationId,
        scheduledAt: new Date("2026-09-18T12:00:00.000Z"),
        scheduleId,
        status: "skipped",
      },
    }),
  );
  await database.publicationScheduleOccurrence.create({
    data: {
      occurrenceKey: "2026-09-18T09:00",
      organizationId,
      scheduledAt: new Date("2026-09-18T12:00:00.000Z"),
      scheduleId,
      skippedReasonCode: "hora-inexistente",
      status: "skipped",
    },
  });
  await assert.rejects(
    database.publicationScheduleOccurrence.create({
      data: {
        occurrenceKey: "2026-09-19T09:00",
        organizationId,
        scheduledAt: new Date("2026-09-19T12:00:00.000Z"),
        scheduleId,
        status: "cancelled",
      },
    }),
  );
});
