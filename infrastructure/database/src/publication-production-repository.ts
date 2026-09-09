import { randomUUID } from "node:crypto";

import {
  publicationRenderTopic,
  createApprovalPrePublishProfile,
  readRecurringStorySourceSnapshot,
  type ApprovePublicationInput,
  type ApprovePublicationResult,
  type ContentBrief,
  type ContentBriefEvidenceEntry,
  type PublicationProductionRepository,
  type PublicationRenderCompletionResult,
  type PublicationRenderFailureInput,
  type PublicationRenderJob,
  type PublicationRenderOutput,
  type PublicationRenderRequestInput,
  type PublicationRenderRequestResult,
  type SafeJsonObject,
} from "@aramayo/domain";

import type { DatabaseClient } from "./client.ts";
import type { Prisma } from "./generated/prisma/client.ts";
import {
  claimReliableOperation,
  reliableCommit,
  commitReliableOperation,
  discardReliableOperationClaim,
} from "./reliable-operation-repository.ts";

function replayedRender(body: SafeJsonObject): PublicationRenderRequestResult {
  const publicationId = body["publicationId"];
  const revisionId = body["revisionId"];
  const version = body["version"];
  if (
    typeof publicationId !== "string" ||
    typeof revisionId !== "string" ||
    typeof version !== "number"
  ) {
    throw new Error("La respuesta idempotente de render no es válida.");
  }
  return Object.freeze({
    publicationId,
    replayed: true,
    revisionId,
    status: "accepted",
    version,
  });
}

function replayedApproval(body: SafeJsonObject): ApprovePublicationResult {
  const publicationId = body["publicationId"];
  const snapshotId = body["snapshotId"];
  const approvalStatus = body["approvalStatus"];
  const version = body["version"];
  if (
    typeof publicationId !== "string" ||
    typeof snapshotId !== "string" ||
    typeof version !== "number" ||
    (approvalStatus !== undefined &&
      approvalStatus !== "approved" &&
      approvalStatus !== "scheduled")
  ) {
    throw new Error("La respuesta idempotente de aprobación no es válida.");
  }
  return Object.freeze({
    publicationId,
    replayed: true,
    snapshotId,
    status: approvalStatus === "scheduled" ? "scheduled" : "approved",
    version,
  });
}

function inputJson(
  value: Prisma.JsonValue | undefined,
): Prisma.InputJsonValue | null {
  if (value === undefined) {
    throw new TypeError("El snapshot contiene un valor no serializable.");
  }
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(inputJson);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, inputJson(entry)]),
    );
  }
  return value;
}

function snapshotContentText(value: Prisma.JsonValue): readonly string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Object.freeze([]);
  }
  const fields = ["caption", "title", "subtitle"] as const;
  return Object.freeze(
    fields.flatMap((field) =>
      typeof value[field] === "string" ? [value[field]] : [],
    ),
  );
}

/**
 * Las ejecuciones de brief se escriben sólo después de pasar el validador de
 * dominio. Al aprobar no se vuelven a validar contra frescura —eso es justo lo
 * que hará P6-T05—, pero sí se limita el cast a esa frontera persistida.
 */
function persistedBriefProfile(
  input: Readonly<{
    brief: Prisma.JsonValue | null;
    content: Prisma.JsonValue;
    evidence: Prisma.JsonValue;
    recurringStorySource?: Prisma.JsonValue;
  }>,
): Prisma.InputJsonObject {
  const recurringStorySource =
    input.recurringStorySource === undefined
      ? undefined
      : readRecurringStorySourceSnapshot(input.recurringStorySource);
  if (recurringStorySource === null) {
    throw new Error(
      "La materialización recurrente conserva una fuente inválida.",
    );
  }
  const brief =
    input.brief === null ? undefined : (input.brief as unknown as ContentBrief);
  const evidence =
    input.evidence as unknown as readonly ContentBriefEvidenceEntry[];
  const profile = createApprovalPrePublishProfile({
    ...(brief === undefined ? {} : { brief }),
    contentText: snapshotContentText(input.content),
    evidence,
    ...(recurringStorySource === undefined ? {} : { recurringStorySource }),
  });
  return {
    factualClaims: profile.factualClaims.map((claim) => ({
      claimKind: claim.claimKind,
      evidenceId: claim.evidenceId,
      ...(claim.externalProductId === undefined
        ? {}
        : { externalProductId: claim.externalProductId }),
      statement: claim.statement,
    })),
    ...(profile.recurringStorySource === undefined
      ? {}
      : {
          recurringStorySource: {
            address: profile.recurringStorySource.address,
            capturedAt: profile.recurringStorySource.capturedAt,
            hours: profile.recurringStorySource.hours,
            localDate: profile.recurringStorySource.localDate,
            locationId: profile.recurringStorySource.locationId,
            locationName: profile.recurringStorySource.locationName,
            locationVersion: profile.recurringStorySource.locationVersion,
            sourceKind: profile.recurringStorySource.sourceKind,
            sourceLabel: profile.recurringStorySource.sourceLabel,
            sourceVersion: profile.recurringStorySource.sourceVersion,
          },
        }),
    requiredClaims: [...profile.requiredClaims],
    schemaVersion: profile.schemaVersion,
  };
}

export class PrismaPublicationProductionRepository implements PublicationProductionRepository {
  readonly #database: DatabaseClient;

  constructor(database: DatabaseClient) {
    this.#database = database;
  }

  async requestRender(
    input: PublicationRenderRequestInput,
  ): Promise<PublicationRenderRequestResult> {
    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedRender(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }

      const publication = await transaction.publication.findFirst({
        select: {
          revisions: {
            orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
            select: { id: true },
            take: 1,
          },
          status: true,
          version: true,
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
        },
      });
      const revision = publication?.revisions[0];
      if (publication === null || revision === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      if (publication.version !== input.expectedVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      if (
        publication.status !== "draft" &&
        publication.status !== "generation_failed"
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-state" });
      }
      const version = publication.version + 1;
      const updated = await transaction.publication.updateMany({
        data: {
          failureCode: null,
          failureMessage: null,
          failureOccurredAt: null,
          failureRetryable: null,
          status: "generating_assets",
          version,
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
          status: publication.status,
          version: publication.version,
        },
      });
      if (updated.count !== 1) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          commandType: "advance",
          fromStatus: publication.status,
          fromVersion: publication.version,
          occurredAt: new Date(input.reliableOperation.occurredAt),
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          toStatus: "generating_assets",
          toVersion: version,
        },
      });
      const responseBody = {
        publicationId: input.publicationId,
        revisionId: revision.id,
        version,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(input, claim.recordId, responseBody, {
        entityId: input.publicationId,
        entityType: "publication",
        metadata: { revisionId: revision.id, version },
        outbox: [
          {
            aggregateId: input.publicationId,
            aggregateType: "publication",
            availableAt: input.reliableOperation.occurredAt,
            eventId: input.reliableOperation.outboxEventId,
            organizationId: input.organizationId,
            payload: {
              publicationId: input.publicationId,
              revisionId: revision.id,
            },
            topic: publicationRenderTopic,
          },
        ],
      });
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la solicitud idempotente.");
      }
      return Object.freeze({ ...responseBody, status: "accepted" });
    });
  }

  async findRenderJob(
    organizationId: string,
    publicationId: string,
    revisionId: string,
  ): Promise<PublicationRenderJob | null> {
    const publication = await this.#database.publication.findFirst({
      select: {
        stateTransitions: {
          orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
          select: { actorMembershipId: true },
          take: 1,
          where: { toStatus: "generating_assets" },
        },
        status: true,
        version: true,
      },
      where: {
        id: publicationId,
        organizationId,
        revisions: { some: { id: revisionId } },
      },
    });
    const actorMembershipId =
      publication?.stateTransitions[0]?.actorMembershipId;
    if (publication === null || actorMembershipId === undefined) {
      return null;
    }
    const revision = await this.#database.publicationRevision.findFirst({
      select: { designDocument: true, renderedMediaAssetId: true },
      where: { id: revisionId, organizationId, publicationId },
    });
    if (
      revision === null ||
      (publication.status !== "generating_assets" &&
        !(
          revision.renderedMediaAssetId !== null &&
          (publication.status === "ready_for_review" ||
            publication.status === "approved")
        ))
    ) {
      return null;
    }
    return Object.freeze({
      actorMembershipId,
      alreadyCompleted: revision.renderedMediaAssetId !== null,
      designDocument: revision.designDocument,
      organizationId,
      publicationId,
      publicationVersion: publication.version,
      revisionId,
    });
  }

  async completeRender(
    job: PublicationRenderJob,
    output: PublicationRenderOutput,
  ): Promise<PublicationRenderCompletionResult> {
    return this.#database.$transaction(async (transaction) => {
      const revision = await transaction.publicationRevision.findFirst({
        select: { renderedMediaAssetId: true },
        where: {
          id: job.revisionId,
          organizationId: job.organizationId,
          publicationId: job.publicationId,
        },
      });
      if (revision === null) {
        return Object.freeze({ status: "not-found" });
      }
      if (revision.renderedMediaAssetId === output.mediaAssetId) {
        const current = await transaction.publication.findFirst({
          select: { version: true },
          where: { id: job.publicationId, organizationId: job.organizationId },
        });
        return current === null
          ? Object.freeze({ status: "not-found" })
          : Object.freeze({
              status: "already-completed",
              version: current.version,
            });
      }
      const media = await transaction.mediaAsset.findFirst({
        select: { checksumSha256: true, id: true },
        where: {
          checksumSha256: output.checksumSha256,
          id: output.mediaAssetId,
          organizationId: job.organizationId,
          status: "available",
        },
      });
      if (media === null) {
        return Object.freeze({ status: "not-found" });
      }
      const version = job.publicationVersion + 1;
      const publication = await transaction.publication.updateMany({
        data: { status: "ready_for_review", version },
        where: {
          id: job.publicationId,
          organizationId: job.organizationId,
          status: "generating_assets",
          version: job.publicationVersion,
        },
      });
      if (publication.count !== 1) {
        return Object.freeze({ status: "conflict" });
      }
      const rendered = await transaction.publicationRevision.updateMany({
        data: {
          renderedAt: new Date(output.renderedAt),
          renderedMediaAssetId: output.mediaAssetId,
          status: "in_review",
        },
        where: {
          id: job.revisionId,
          organizationId: job.organizationId,
          renderedMediaAssetId: null,
        },
      });
      if (rendered.count !== 1) {
        throw new Error("La revisión perdió la carrera de render.");
      }
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: job.actorMembershipId,
          commandType: "advance",
          fromStatus: "generating_assets",
          fromVersion: job.publicationVersion,
          occurredAt: new Date(output.renderedAt),
          organizationId: job.organizationId,
          publicationId: job.publicationId,
          toStatus: "ready_for_review",
          toVersion: version,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: job.actorMembershipId,
          entityId: job.publicationId,
          entityType: "publication",
          id: randomUUID(),
          metadata: {
            checksumSha256: output.checksumSha256,
            mediaAssetId: output.mediaAssetId,
            revisionId: job.revisionId,
          },
          occurredAt: new Date(output.renderedAt),
          operation: "content.publication:render-complete",
          organizationId: job.organizationId,
          outcome: "success",
        },
      });
      let finalVersion = version;
      const automaticMaterialization =
        await transaction.recurringStoryMaterialization.findUnique({
          include: {
            rule: {
              include: {
                createdBy: { select: { roles: true, status: true } },
              },
            },
          },
          where: {
            organizationId_publicationId: {
              organizationId: job.organizationId,
              publicationId: job.publicationId,
            },
          },
        });
      const policyActor = automaticMaterialization?.rule.createdBy;
      const policyStillAuthorized =
        policyActor?.status === "active" &&
        policyActor.roles.includes("admin") &&
        policyActor.roles.includes("approver");
      if (
        automaticMaterialization !== null &&
        !automaticMaterialization.requiresHumanApproval &&
        automaticMaterialization.status === "draft_created" &&
        policyStillAuthorized
      ) {
        const renderedRevision =
          await transaction.publicationRevision.findUnique({
            include: {
              contentBriefRun: {
                select: { brief: true, evidence: true },
              },
              media: {
                include: { mediaAsset: true },
                orderBy: [{ slot: "asc" }, { id: "asc" }],
              },
            },
            where: { id: job.revisionId },
          });
        if (renderedRevision === null) {
          throw new Error("La revisión renderizada desapareció.");
        }
        const approvedAt = new Date(output.renderedAt);
        const snapshotId = randomUUID();
        await transaction.approvalSnapshot.create({
          data: {
            approvedAt,
            approvedByMembershipId:
              automaticMaterialization.rule.createdByMembershipId,
            contentHash: renderedRevision.contentHash,
            id: snapshotId,
            organizationId: job.organizationId,
            publicationId: job.publicationId,
            revisionId: job.revisionId,
            snapshot: {
              content: inputJson(renderedRevision.content),
              contentHash: renderedRevision.contentHash,
              designDocument: inputJson(renderedRevision.designDocument),
              designSchemaVersion: renderedRevision.schemaVersion,
              inputMedia: renderedRevision.media.map((reference) => ({
                alt: reference.alt,
                checksumSha256: reference.mediaAsset.checksumSha256,
                mediaAssetId: reference.mediaAssetId,
                secureUrl: reference.mediaAsset.secureUrl,
                slot: reference.slot,
                storageVersion: reference.mediaAsset.storageVersion,
              })),
              prePublishProfile: persistedBriefProfile({
                brief: renderedRevision.contentBriefRun?.brief ?? null,
                content: renderedRevision.content,
                evidence: renderedRevision.contentBriefRun?.evidence ?? [],
                recurringStorySource: automaticMaterialization.sourceSnapshot,
              }),
              publishingTargetPolicy: {
                mode: "exact",
                targets: ["instagram_story"],
              },
              renderedMedia: {
                byteSize: output.byteSize,
                checksumSha256: output.checksumSha256,
                height: output.height,
                mediaAssetId: output.mediaAssetId,
                mimeType: output.mimeType,
                secureUrl: output.secureUrl,
                storageVersion: output.storageVersion,
                width: output.width,
              },
              revisionId: job.revisionId,
              revisionNumber: renderedRevision.revisionNumber,
              snapshotSchemaVersion: 1,
            },
          },
        });
        const approvedVersion = version + 1;
        await transaction.publication.update({
          data: { status: "approved", version: approvedVersion },
          where: { id: job.publicationId },
        });
        await transaction.publicationRevision.update({
          data: { status: "approved" },
          where: { id: job.revisionId },
        });
        await transaction.publicationStateTransition.create({
          data: {
            actorMembershipId:
              automaticMaterialization.rule.createdByMembershipId,
            approvalSnapshotId: snapshotId,
            commandType: "approve",
            fromStatus: "ready_for_review",
            fromVersion: version,
            occurredAt: approvedAt,
            organizationId: job.organizationId,
            publicationId: job.publicationId,
            reasonCode: "recurring-story-policy",
            toStatus: "approved",
            toVersion: approvedVersion,
          },
        });
        const scheduleId = randomUUID();
        await transaction.publicationSchedule.create({
          data: {
            approvalSnapshotId: snapshotId,
            createdByMembershipId:
              automaticMaterialization.rule.createdByMembershipId,
            effectiveFrom: automaticMaterialization.scheduledAt,
            effectiveUntil: automaticMaterialization.scheduledAt,
            gapPolicy: "skip",
            id: scheduleId,
            kind: "once",
            lateToleranceMinutes: 15,
            localTime: automaticMaterialization.rule.localTime,
            missedPolicy: "skip",
            organizationId: job.organizationId,
            publicationId: job.publicationId,
            targets: ["instagram_story"],
            timeZone: automaticMaterialization.rule.timeZone,
          },
        });
        await transaction.publicationScheduleOccurrence.create({
          data: {
            occurrenceKey: automaticMaterialization.occurrenceKey,
            organizationId: job.organizationId,
            resolution: automaticMaterialization.resolution,
            scheduleId,
            scheduledAt: automaticMaterialization.scheduledAt,
          },
        });
        await transaction.recurringStoryMaterialization.update({
          data: { scheduleId, status: "approved_scheduled" },
          where: { id: automaticMaterialization.id },
        });
        finalVersion = approvedVersion + 1;
        await transaction.publication.update({
          data: { status: "scheduled", version: finalVersion },
          where: { id: job.publicationId },
        });
        await transaction.publicationStateTransition.create({
          data: {
            actorMembershipId:
              automaticMaterialization.rule.createdByMembershipId,
            commandType: "advance",
            fromStatus: "approved",
            fromVersion: approvedVersion,
            occurredAt: approvedAt,
            organizationId: job.organizationId,
            publicationId: job.publicationId,
            reasonCode: "recurring-story-policy",
            toStatus: "scheduled",
            toVersion: finalVersion,
          },
        });
        await transaction.auditEvent.create({
          data: {
            actorMembershipId:
              automaticMaterialization.rule.createdByMembershipId,
            entityId: job.publicationId,
            entityType: "publication",
            id: randomUUID(),
            metadata: {
              materializationId: automaticMaterialization.id,
              policy: "automatic-routine",
              scheduleId,
              snapshotId,
            },
            occurredAt: approvedAt,
            operation: "scheduling.recurring-story:auto-approve",
            organizationId: job.organizationId,
            outcome: "success",
          },
        });
      } else if (
        automaticMaterialization !== null &&
        !automaticMaterialization.requiresHumanApproval &&
        !policyStillAuthorized
      ) {
        // Un cambio de roles reduce automatización; nunca amplía permisos.
        await transaction.recurringStoryMaterialization.update({
          data: { requiresHumanApproval: true },
          where: { id: automaticMaterialization.id },
        });
      }
      return Object.freeze({ status: "completed", version: finalVersion });
    });
  }

  async failRender(
    input: PublicationRenderFailureInput,
  ): Promise<PublicationRenderCompletionResult> {
    return this.#database.$transaction(async (transaction) => {
      const version = input.publicationVersion + 1;
      const updated = await transaction.publication.updateMany({
        data: {
          failureCode: input.code,
          failureMessage: input.safeMessage,
          failureOccurredAt: new Date(input.failedAt),
          failureRetryable: input.retryable,
          status: "generation_failed",
          version,
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
          status: "generating_assets",
          version: input.publicationVersion,
        },
      });
      if (updated.count !== 1) {
        return Object.freeze({ status: "conflict" });
      }
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          commandType: "fail",
          failureCode: input.code,
          failureMessage: input.safeMessage,
          failureRetryable: input.retryable,
          fromStatus: "generating_assets",
          fromVersion: input.publicationVersion,
          occurredAt: new Date(input.failedAt),
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          toStatus: "generation_failed",
          toVersion: version,
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          entityId: input.publicationId,
          entityType: "publication",
          id: randomUUID(),
          metadata: { code: input.code, retryable: input.retryable },
          occurredAt: new Date(input.failedAt),
          operation: "content.publication:render-failed",
          organizationId: input.organizationId,
          outcome: "failure",
        },
      });
      return Object.freeze({ status: "completed", version });
    });
  }

  async approve(
    input: ApprovePublicationInput,
  ): Promise<ApprovePublicationResult> {
    return this.#database.$transaction(async (transaction) => {
      const claim = await claimReliableOperation(
        transaction,
        input.reliableOperation.claim,
      );
      switch (claim.status) {
        case "replayed":
          return replayedApproval(claim.responseBody);
        case "request-conflict":
          return Object.freeze({ status: "idempotency-conflict" });
        case "in-progress":
          return Object.freeze({
            retryAfter: claim.retryAfter,
            status: "in-progress",
          });
        case "claimed":
          break;
      }
      const publication = await transaction.publication.findFirst({
        select: {
          revisions: {
            include: {
              contentBriefRun: {
                select: { brief: true, evidence: true },
              },
              media: {
                include: { mediaAsset: true },
                orderBy: [{ slot: "asc" }, { id: "asc" }],
              },
              renderedMedia: true,
            },
            orderBy: [{ revisionNumber: "desc" }, { id: "asc" }],
            take: 1,
          },
          status: true,
          version: true,
        },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
        },
      });
      const revision = publication?.revisions[0];
      if (publication === null || revision === undefined) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "not-found" });
      }
      if (publication.version !== input.expectedVersion) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "conflict" });
      }
      if (
        publication.status !== "ready_for_review" ||
        revision.renderedMedia === null ||
        revision.renderedAt === null
      ) {
        await discardReliableOperationClaim(transaction, claim.recordId);
        return Object.freeze({ status: "invalid-state" });
      }
      const recurringMaterialization =
        await transaction.recurringStoryMaterialization.findUnique({
          include: {
            rule: {
              select: { localTime: true, timeZone: true },
            },
          },
          where: {
            organizationId_publicationId: {
              organizationId: input.organizationId,
              publicationId: input.publicationId,
            },
          },
        });
      const approvedAt = new Date(input.reliableOperation.occurredAt);
      const snapshotId = randomUUID();
      const snapshot: Prisma.InputJsonObject = {
        content: inputJson(revision.content),
        contentHash: revision.contentHash,
        designDocument: inputJson(revision.designDocument),
        designSchemaVersion: revision.schemaVersion,
        inputMedia: revision.media.map((reference) => ({
          alt: reference.alt,
          checksumSha256: reference.mediaAsset.checksumSha256,
          mediaAssetId: reference.mediaAssetId,
          secureUrl: reference.mediaAsset.secureUrl,
          slot: reference.slot,
          storageVersion: reference.mediaAsset.storageVersion,
        })),
        prePublishProfile: persistedBriefProfile({
          brief: revision.contentBriefRun?.brief ?? null,
          content: revision.content,
          evidence: revision.contentBriefRun?.evidence ?? [],
          ...(recurringMaterialization === null
            ? {}
            : {
                recurringStorySource: recurringMaterialization.sourceSnapshot,
              }),
        }),
        ...(recurringMaterialization === null
          ? {}
          : {
              publishingTargetPolicy: {
                mode: "exact",
                targets: ["instagram_story"],
              },
            }),
        renderedMedia: {
          byteSize: revision.renderedMedia.byteSize?.toString() ?? null,
          checksumSha256: revision.renderedMedia.checksumSha256,
          height: revision.renderedMedia.height,
          mediaAssetId: revision.renderedMedia.id,
          mimeType: revision.renderedMedia.mimeType,
          secureUrl: revision.renderedMedia.secureUrl,
          storageVersion: revision.renderedMedia.storageVersion,
          width: revision.renderedMedia.width,
        },
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        snapshotSchemaVersion: 1,
      };
      await transaction.approvalSnapshot.create({
        data: {
          approvedAt,
          approvedByMembershipId: input.actorMembershipId,
          contentHash: revision.contentHash,
          id: snapshotId,
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          revisionId: revision.id,
          snapshot,
        },
      });
      const version = publication.version + 1;
      const updated = await transaction.publication.updateMany({
        data: { status: "approved", version },
        where: {
          id: input.publicationId,
          organizationId: input.organizationId,
          status: "ready_for_review",
          version: publication.version,
        },
      });
      if (updated.count !== 1) {
        throw new Error("La publicación perdió la carrera de aprobación.");
      }
      await transaction.publicationRevision.update({
        data: { status: "approved" },
        where: { id: revision.id },
      });
      await transaction.publicationStateTransition.create({
        data: {
          actorMembershipId: input.actorMembershipId,
          approvalSnapshotId: snapshotId,
          commandType: "approve",
          fromStatus: "ready_for_review",
          fromVersion: publication.version,
          occurredAt: approvedAt,
          organizationId: input.organizationId,
          publicationId: input.publicationId,
          toStatus: "approved",
          toVersion: version,
        },
      });
      let approvalStatus: "approved" | "scheduled" = "approved";
      let finalVersion = version;
      if (
        recurringMaterialization !== null &&
        recurringMaterialization.status === "draft_created"
      ) {
        const scheduleId = randomUUID();
        await transaction.publicationSchedule.create({
          data: {
            approvalSnapshotId: snapshotId,
            createdByMembershipId: input.actorMembershipId,
            effectiveFrom: recurringMaterialization.scheduledAt,
            effectiveUntil: recurringMaterialization.scheduledAt,
            gapPolicy: "skip",
            id: scheduleId,
            kind: "once",
            lateToleranceMinutes: 15,
            localTime: recurringMaterialization.rule.localTime,
            missedPolicy: "skip",
            organizationId: input.organizationId,
            publicationId: input.publicationId,
            targets: ["instagram_story"],
            timeZone: recurringMaterialization.rule.timeZone,
          },
        });
        await transaction.publicationScheduleOccurrence.create({
          data: {
            occurrenceKey: recurringMaterialization.occurrenceKey,
            organizationId: input.organizationId,
            resolution: recurringMaterialization.resolution,
            scheduleId,
            scheduledAt: recurringMaterialization.scheduledAt,
          },
        });
        await transaction.recurringStoryMaterialization.update({
          data: { scheduleId, status: "approved_scheduled" },
          where: { id: recurringMaterialization.id },
        });
        finalVersion = version + 1;
        await transaction.publication.update({
          data: { status: "scheduled", version: finalVersion },
          where: { id: input.publicationId },
        });
        await transaction.publicationStateTransition.create({
          data: {
            actorMembershipId: input.actorMembershipId,
            commandType: "advance",
            fromStatus: "approved",
            fromVersion: version,
            occurredAt: approvedAt,
            organizationId: input.organizationId,
            publicationId: input.publicationId,
            toStatus: "scheduled",
            toVersion: finalVersion,
          },
        });
        approvalStatus = "scheduled";
      }
      const responseBody = {
        approvalStatus,
        publicationId: input.publicationId,
        snapshotId,
        version: finalVersion,
      } satisfies SafeJsonObject;
      const commit = reliableCommit(input, claim.recordId, responseBody, {
        entityId: input.publicationId,
        entityType: "approval_snapshot",
        metadata: {
          approvalStatus,
          revisionId: revision.id,
          snapshotId,
          version: finalVersion,
        },
        outbox: [],
      });
      if (!(await commitReliableOperation(transaction, commit))) {
        throw new Error("No se pudo confirmar la aprobación idempotente.");
      }
      return Object.freeze({
        publicationId: input.publicationId,
        snapshotId,
        status: approvalStatus,
        version: finalVersion,
      });
    });
  }
}
