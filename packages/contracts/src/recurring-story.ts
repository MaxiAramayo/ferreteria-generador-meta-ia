import type { LocationConfigurationResponse } from "./organization-configuration.ts";

export type RecurringStoryApprovalPolicyResponse =
  "automatic-routine" | "human-each-cycle";

export type RecurringStoryDesignVariantResponse =
  "cartel" | "horario" | "locales";

export interface RecurringStoryRuleResponse {
  readonly approvalPolicy: RecurringStoryApprovalPolicyResponse;
  /** Orden lunes a domingo de los diseños de apertura. */
  readonly designRotation: readonly RecurringStoryDesignVariantResponse[];
  readonly effectiveFrom: string;
  readonly id: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null`: la historia es para todas las sucursales activas. */
  readonly locationId: string | null;
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

export interface UpdateRecurringStoryDesignRotationResponse {
  readonly rule: RecurringStoryRuleResponse;
  readonly status: "updated";
}
