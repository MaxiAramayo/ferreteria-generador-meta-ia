export interface PublicationSchedulePublicationResponse {
  readonly status:
    | "approved"
    | "cancelled"
    | "draft"
    | "expired"
    | "generating_assets"
    | "generation_failed"
    | "missing_information"
    | "partially_published"
    | "publish_failed"
    | "published"
    | "publishing"
    | "ready_for_review"
    | "retrieving_context"
    | "scheduled"
    | "validation_failed";
  readonly version: number;
}

export interface CreatePublicationScheduleResponse {
  /** Filas futuras listas para que el dispatcher las reclame. */
  readonly materializedOccurrenceCount: number;
  readonly publication: PublicationSchedulePublicationResponse;
  readonly scheduleId: string;
  readonly status: "created";
  /** La regla empieza en versión 1 y evoluciona con compare-and-swap. */
  readonly version: number;
}

export interface PublicationScheduleTransitionResponse {
  /** Ocurrencias futuras que la cancelación retiró del calendario. */
  readonly cancelledOccurrenceCount: number;
  /** Ocurrencias ya convertidas en orden; se conservan como historial. */
  readonly dispatchedOccurrenceCount: number;
  readonly publication: PublicationSchedulePublicationResponse;
  readonly scheduleId: string;
  readonly status: "updated";
  /** Nueva versión de la programación para el siguiente compare-and-swap. */
  readonly version: number;
}

export interface UpdatePublicationScheduleResponse {
  /** Ocurrencias futuras que la nueva regla retiró. */
  readonly cancelledOccurrenceCount: number;
  /** Ocurrencias que la nueva regla agregó al calendario. */
  readonly createdOccurrenceCount: number;
  /** Ocurrencias ya solicitadas o despachadas, que no pudieron alterarse. */
  readonly frozenOccurrenceCount: number;
  /** Ocurrencias de la misma clave civil que cambiaron de instante. */
  readonly rescheduledOccurrenceCount: number;
  readonly scheduleId: string;
  readonly status: "updated";
  readonly version: number;
}

export interface PublicationScheduleOccurrenceResponse {
  readonly dispatchRequestedAt?: string;
  readonly occurrenceKey: string;
  readonly publicationOrderId?: string;
  readonly resolution: "ambiguous" | "exact" | "shifted";
  readonly scheduledAt: string;
  readonly status: "cancelled" | "dispatched" | "planned" | "skipped";
}

export interface PublicationScheduleResponse {
  readonly approvalSnapshotId: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly gapPolicy: "next-valid" | "skip";
  readonly id: string;
  readonly lateToleranceMinutes: number;
  readonly localTime: string;
  readonly missedPolicy: "run-late" | "skip";
  readonly publicationId: string;
  readonly recurrence:
    | Readonly<{ readonly kind: "once" }>
    | Readonly<{ readonly interval: number; readonly kind: "daily" }>
    | Readonly<{
        readonly interval: number;
        readonly kind: "weekly";
        readonly weekdays: readonly number[];
      }>
    | Readonly<{
        readonly interval: number;
        readonly kind: "monthly";
        readonly monthDay: number;
        readonly overflow: "clamp" | "skip";
      }>;
  readonly status: "active" | "cancelled" | "completed" | "expired" | "paused";
  readonly targets: readonly (
    "facebook_page" | "instagram_feed" | "instagram_story"
  )[];
  readonly timeZone: string;
  readonly version: number;
}

export interface PublicationScheduleCalendarEntryResponse {
  readonly occurrences: readonly PublicationScheduleOccurrenceResponse[];
  readonly schedule: PublicationScheduleResponse;
}

export interface PublicationScheduleCalendarResponse {
  readonly entries: readonly PublicationScheduleCalendarEntryResponse[];
  readonly from: string;
  readonly to: string;
}
