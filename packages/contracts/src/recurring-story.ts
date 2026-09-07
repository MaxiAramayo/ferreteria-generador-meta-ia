import type { LocationConfigurationResponse } from "./organization-configuration.ts";

export type RecurringStoryApprovalPolicyResponse =
  "automatic-routine" | "human-each-cycle";

export interface RecurringStoryRuleResponse {
  readonly approvalPolicy: RecurringStoryApprovalPolicyResponse;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  readonly locationId: string;
  readonly name: string;
  readonly status: "active" | "cancelled" | "paused";
  readonly timeZone: string;
  readonly version: number;
  readonly weekdays: readonly number[];
}

export interface RecurringStoryWorkspaceResponse {
  readonly canUseAutomaticApproval: boolean;
  readonly locations: readonly LocationConfigurationResponse[];
  readonly rules: readonly RecurringStoryRuleResponse[];
}

export interface CreateRecurringStoryRuleResponse {
  readonly rule: RecurringStoryRuleResponse;
  readonly status: "created";
}
