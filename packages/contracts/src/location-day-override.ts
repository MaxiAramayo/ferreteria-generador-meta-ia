/** Una excepción se identifica por fecha civil de la sucursal, no por UTC. */
export type LocationDayOverrideResponse =
  | Readonly<{
      id: string;
      localDate: string;
      locationId: string;
      openingHours: string;
      sourceLabel: string;
      status: "open";
      version: number;
    }>
  | Readonly<{
      id: string;
      localDate: string;
      locationId: string;
      sourceLabel: string;
      status: "closed";
      version: number;
    }>;

export interface LocationDayOverrideImpactResponse {
  readonly affectedStoryCount: number;
  readonly localDate: string;
  readonly timeZone: string;
  readonly willBlockHoursSensitiveStories: boolean;
  readonly willRequireHumanApproval: boolean;
}

export interface LocationDayOverridePreviewResponse {
  readonly impact: LocationDayOverrideImpactResponse;
}

export interface LocationDayOverrideMutationResponse {
  readonly impact: LocationDayOverrideImpactResponse;
  readonly override?: LocationDayOverrideResponse;
}

export interface LocationDayOverrideListResponse {
  readonly locationId: string;
  readonly overrides: readonly LocationDayOverrideResponse[];
  readonly startDate: string;
  readonly endDate: string;
}
