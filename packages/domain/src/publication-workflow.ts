import type { PublicationStatus } from "./publication.ts";

export const PUBLICATION_TRANSITIONS: Readonly<
  Record<PublicationStatus, readonly PublicationStatus[]>
> = Object.freeze({
  approved: ["draft", "scheduled", "publishing", "cancelled", "expired"],
  cancelled: [],
  draft: [
    "retrieving_context",
    "generating_assets",
    "ready_for_review",
    "cancelled",
  ],
  expired: [],
  generating_assets: ["ready_for_review", "generation_failed", "cancelled"],
  generation_failed: ["draft", "generating_assets", "cancelled", "expired"],
  missing_information: ["draft", "retrieving_context", "cancelled", "expired"],
  partially_published: ["publishing", "published", "publish_failed"],
  published: [],
  publishing: ["partially_published", "published", "publish_failed"],
  publish_failed: ["publishing", "cancelled", "expired"],
  ready_for_review: [
    "draft",
    "approved",
    "validation_failed",
    "cancelled",
    "expired",
  ],
  retrieving_context: [
    "missing_information",
    "generating_assets",
    "generation_failed",
    "cancelled",
  ],
  scheduled: ["approved", "publishing", "cancelled", "expired"],
  validation_failed: ["draft", "ready_for_review", "cancelled", "expired"],
});

export interface PublicationApproval {
  readonly approvedAt: string;
  readonly reviewerMembershipId: string;
  readonly snapshotId: string;
}

export interface PublicationFailure {
  readonly code: string;
  readonly failedAt: string;
  readonly retryable: boolean;
  readonly safeMessage: string;
}

export interface PublicationWorkflowState {
  readonly approval?: PublicationApproval;
  readonly failure?: PublicationFailure;
  readonly id: string;
  readonly organizationId: string;
  readonly status: PublicationStatus;
  readonly version: number;
}

interface PublicationCommandBase {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly occurredAt: string;
}

export type PublicationTransitionCommand =
  | (PublicationCommandBase & {
      readonly targetStatus: PublicationStatus;
      readonly type: "advance";
    })
  | (PublicationCommandBase & {
      readonly reviewerMembershipId: string;
      readonly snapshotId: string;
      readonly type: "approve";
    })
  | (PublicationCommandBase & {
      readonly failure: Omit<PublicationFailure, "failedAt">;
      readonly stage: "generation" | "publishing" | "validation";
      readonly type: "fail";
    })
  | (PublicationCommandBase & {
      readonly reasonCode: string;
      readonly type: "cancel";
    })
  | (PublicationCommandBase & {
      readonly reasonCode: string;
      readonly type: "expire";
    })
  | (PublicationCommandBase & {
      readonly newRevisionId: string;
      readonly type: "edit_approved";
    });

export interface PublicationTransitionEvent {
  readonly actorMembershipId: string;
  readonly approval?: PublicationApproval;
  readonly commandType: PublicationTransitionCommand["type"];
  readonly failure?: PublicationFailure;
  readonly fromStatus: PublicationStatus;
  readonly fromVersion: number;
  readonly newRevisionId?: string;
  readonly occurredAt: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reasonCode?: string;
  readonly toStatus: PublicationStatus;
  readonly toVersion: number;
}

export type PublicationTransitionErrorCode =
  "invalid-command" | "invalid-transition" | "version-conflict";

export type PublicationTransitionResult =
  | {
      readonly event: PublicationTransitionEvent;
      readonly ok: true;
      readonly state: PublicationWorkflowState;
    }
  | {
      readonly error: {
        readonly code: PublicationTransitionErrorCode;
        readonly message: string;
      };
      readonly ok: false;
    };

export type PublicationStateCommitResult =
  { readonly status: "committed" } | { readonly status: "version-conflict" };

export interface PublicationStateRepository {
  commit(
    state: PublicationWorkflowState,
    event: PublicationTransitionEvent,
  ): Promise<PublicationStateCommitResult>;
  findById(
    organizationId: string,
    publicationId: string,
  ): Promise<PublicationWorkflowState | null>;
}

export function isPublicationTransitionAllowed(
  fromStatus: PublicationStatus,
  toStatus: PublicationStatus,
): boolean {
  return PUBLICATION_TRANSITIONS[fromStatus].includes(toStatus);
}

function failureStatus(
  stage: Extract<PublicationTransitionCommand, { type: "fail" }>["stage"],
): PublicationStatus {
  switch (stage) {
    case "generation":
      return "generation_failed";
    case "publishing":
      return "publish_failed";
    case "validation":
      return "validation_failed";
  }
}

function invalid(
  code: PublicationTransitionErrorCode,
  message: string,
): PublicationTransitionResult {
  return Object.freeze({
    error: Object.freeze({ code, message }),
    ok: false,
  });
}

function isIsoTimestamp(timestamp: string): boolean {
  return (
    timestamp.length > 0 &&
    Number.isFinite(Date.parse(timestamp)) &&
    new Date(timestamp).toISOString() === timestamp
  );
}

function isSafeCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,79}$/u.test(code);
}

function commandTarget(
  current: PublicationWorkflowState,
  command: PublicationTransitionCommand,
): PublicationStatus | PublicationTransitionResult {
  switch (command.type) {
    case "advance":
      if (
        command.targetStatus === "approved" ||
        command.targetStatus === "cancelled" ||
        command.targetStatus === "expired" ||
        command.targetStatus === "generation_failed" ||
        command.targetStatus === "publish_failed" ||
        command.targetStatus === "validation_failed" ||
        (command.targetStatus === "draft" &&
          (current.status === "approved" || current.status === "scheduled"))
      ) {
        return invalid(
          "invalid-command",
          `Transition to ${command.targetStatus} requires its explicit command.`,
        );
      }
      return command.targetStatus;
    case "approve":
      if (
        command.snapshotId.length === 0 ||
        command.reviewerMembershipId.length === 0
      ) {
        return invalid(
          "invalid-command",
          "Approval requires a snapshot and reviewer.",
        );
      }
      return "approved";
    case "cancel":
      return isSafeCode(command.reasonCode)
        ? "cancelled"
        : invalid(
            "invalid-command",
            "Cancellation requires a safe reason code.",
          );
    case "edit_approved":
      if (command.newRevisionId.length === 0) {
        return invalid(
          "invalid-command",
          "Editing approved content requires a new revision.",
        );
      }
      return "draft";
    case "expire":
      return isSafeCode(command.reasonCode)
        ? "expired"
        : invalid("invalid-command", "Expiration requires a safe reason code.");
    case "fail":
      if (
        !isSafeCode(command.failure.code) ||
        command.failure.safeMessage.trim().length === 0 ||
        command.failure.safeMessage.length > 300
      ) {
        return invalid(
          "invalid-command",
          "Failure requires a safe code and user-facing message.",
        );
      }
      return failureStatus(command.stage);
  }
}

export function transitionPublication(
  current: PublicationWorkflowState,
  command: PublicationTransitionCommand,
): PublicationTransitionResult {
  if (current.version !== command.expectedVersion) {
    return invalid(
      "version-conflict",
      "The publication changed before this command was applied.",
    );
  }
  if (
    current.version < 1 ||
    command.actorMembershipId.length === 0 ||
    !isIsoTimestamp(command.occurredAt)
  ) {
    return invalid(
      "invalid-command",
      "The command actor, version and timestamp must be valid.",
    );
  }

  const target = commandTarget(current, command);
  if (typeof target !== "string") {
    return target;
  }
  if (!isPublicationTransitionAllowed(current.status, target)) {
    return invalid(
      "invalid-transition",
      `${current.status} cannot transition to ${target}.`,
    );
  }

  const approval =
    command.type === "approve"
      ? Object.freeze({
          approvedAt: command.occurredAt,
          reviewerMembershipId: command.reviewerMembershipId,
          snapshotId: command.snapshotId,
        })
      : target === "approved"
        ? current.approval
        : undefined;
  if (target === "approved" && approval === undefined) {
    return invalid(
      "invalid-command",
      "Approval state requires an immutable snapshot.",
    );
  }

  const failure =
    command.type === "fail"
      ? Object.freeze({
          ...command.failure,
          failedAt: command.occurredAt,
        })
      : undefined;
  const toVersion = current.version + 1;
  const state = Object.freeze({
    ...(approval === undefined ? {} : { approval }),
    ...(failure === undefined ? {} : { failure }),
    id: current.id,
    organizationId: current.organizationId,
    status: target,
    version: toVersion,
  });
  const event = Object.freeze({
    actorMembershipId: command.actorMembershipId,
    ...(approval === undefined ? {} : { approval }),
    commandType: command.type,
    ...(failure === undefined ? {} : { failure }),
    fromStatus: current.status,
    fromVersion: current.version,
    ...(command.type === "edit_approved"
      ? { newRevisionId: command.newRevisionId }
      : {}),
    occurredAt: command.occurredAt,
    organizationId: current.organizationId,
    publicationId: current.id,
    ...("reasonCode" in command ? { reasonCode: command.reasonCode } : {}),
    toStatus: target,
    toVersion,
  });

  return Object.freeze({ event, ok: true, state });
}
