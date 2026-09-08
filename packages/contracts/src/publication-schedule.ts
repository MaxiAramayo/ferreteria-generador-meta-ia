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
