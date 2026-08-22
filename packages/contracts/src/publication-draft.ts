import type { DesignDocument } from "@aramayo/design-engine";

export type PublicationStatusResponse =
  | "approved"
  | "cancelled"
  | "draft"
  | "expired"
  | "generating_assets"
  | "generation_failed"
  | "missing_information"
  | "partially_published"
  | "published"
  | "publishing"
  | "publish_failed"
  | "ready_for_review"
  | "retrieving_context"
  | "scheduled"
  | "validation_failed";

export interface PublicationProductReferenceResponse {
  readonly label: string;
  readonly reference: string;
}

export interface PublicationDraftContentResponse {
  readonly caption: string;
  readonly products: readonly PublicationProductReferenceResponse[];
}

export interface PublicationRevisionMediaResponse {
  readonly alt: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: string;
  readonly secureUrl: string;
  readonly slot: string;
  readonly storageVersion: number;
  readonly width: number;
}

export interface PublicationRenderedMediaResponse {
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: string;
  readonly renderedAt: string;
  readonly secureUrl: string;
  readonly storageVersion: number;
  readonly width: number;
}

export interface PublicationRevisionResponse {
  readonly approvalSnapshotId?: string;
  readonly approvedAt?: string;
  readonly content: PublicationDraftContentResponse;
  /**
   * Ejecución del brief que originó la revisión. Ausente cuando la escribió
   * una persona: cada revisión declara su propio origen, así que editar un
   * borrador generado produce una revisión que ya no cita ninguna ejecución.
   */
  readonly contentBriefRunId?: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdByMembershipId: string;
  readonly designDocument: DesignDocument;
  readonly id: string;
  readonly media: readonly PublicationRevisionMediaResponse[];
  /** Destinos exactos fijados por el snapshot aprobado, cuando corresponde. */
  readonly publishingTargets?: readonly PublicationOrderTargetKind[];
  readonly renderedMedia?: PublicationRenderedMediaResponse;
  readonly revisionNumber: number;
  readonly status: "approved" | "draft" | "in_review" | "superseded";
}

export interface PublicationSummaryResponse {
  readonly createdAt: string;
  readonly failure?: Readonly<{
    readonly code: string;
    readonly occurredAt: string;
    readonly retryable: boolean;
    readonly safeMessage: string;
  }>;
  readonly id: string;
  /** Ejecución del brief que originó la última revisión, si la hubo. */
  readonly latestContentBriefRunId?: string;
  readonly latestContentHash: string;
  readonly latestRevisionId: string;
  readonly latestRevisionNumber: number;
  readonly locationId?: string;
  readonly status: PublicationStatusResponse;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PublicationDraftResponse {
  readonly createdAt: string;
  readonly failure?: PublicationSummaryResponse["failure"];
  readonly id: string;
  readonly latestRevision: PublicationRevisionResponse;
  readonly locationId?: string;
  readonly status: PublicationStatusResponse;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface PaginatedResponse<RecordType> {
  readonly items: readonly RecordType[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
}

export type PublicationListResponse =
  PaginatedResponse<PublicationSummaryResponse>;

export type PublicationRevisionListResponse =
  PaginatedResponse<PublicationRevisionResponse>;

export interface PublicationRenderRequestResponse {
  readonly publicationId: string;
  readonly revisionId: string;
  readonly status: "generating_assets";
  readonly version: number;
}

export interface PublicationApprovalResponse {
  readonly publicationId: string;
  readonly snapshotId: string;
  readonly status: "approved";
  readonly version: number;
}

/**
 * Destino de una orden de publicación. El contrato público no reutiliza el tipo
 * del dominio: un destino nuevo tiene que ser una decisión explícita del
 * contrato y no un efecto colateral de agregarlo adentro.
 */
export type PublicationOrderTargetKind =
  "facebook_page" | "instagram_feed" | "instagram_story";

export interface PublicationOrderRequestResponse {
  readonly orderId: string;
  readonly publicationId: string;
  readonly status: "publishing";
  readonly version: number;
}

export interface PublicationOrderTargetResponse {
  /** Código estable del fallo; nunca el mensaje del proveedor. */
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly failureRetryable?: boolean;
  readonly permalink?: string;
  /** Identificador remoto, cuando el destino lo confirmó. */
  readonly remotePostId?: string;
  readonly state:
    | "failed"
    | "media_staged"
    | "outcome_unknown"
    | "pending"
    | "published"
    | "published_unconfirmed";
  readonly target: PublicationOrderTargetKind;
  readonly updatedAt: string;
}

/**
 * Si se puede publicar, y contra qué cuenta.
 *
 * Existe separado del listado de conexiones porque las dos preguntas tienen
 * dueños distintos: administrar conexiones es de `connections:manage` y decidir
 * si una pieza se puede publicar es de `publishing:execute`. Sin esto, el panel
 * de quien publica tendría que leer datos que su rol no puede ver, y el control
 * nunca se habilitaría.
 */
export interface PublishingReadinessResponse {
  /** Cuenta contra la que se publicaría. Ausente si no hay conexión sana. */
  readonly accountName?: string;
  readonly canPublish: boolean;
  readonly targets: readonly (
    "facebook_page" | "instagram_feed" | "instagram_story"
  )[];
}

export interface PublicationOrderListResponse {
  /** De la más reciente a la más vieja. */
  readonly items: readonly PublicationOrderResponse[];
}

/**
 * Un destino detenido esperando a una persona.
 *
 * `actions` viene del servidor y no se deduce en el panel: qué es seguro hacer
 * depende de por qué se detuvo, y esa regla no puede vivir en dos lugares.
 * Reintentar un destino cuyo desenlace nadie conoce publicaría dos veces.
 */
export interface PublicationManualActionResponse {
  readonly actions: readonly ("abandon" | "reconcile" | "retry")[];
  readonly attempts: number;
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly orderId: string;
  readonly publicationId: string;
  readonly publicationTargetId: string;
  readonly reason:
    "attempts-exhausted" | "outcome-unresolved" | "permanent-failure";
  readonly state:
    | "failed"
    | "media_staged"
    | "outcome_unknown"
    | "pending"
    | "published"
    | "published_unconfirmed";
  readonly target: "facebook_page" | "instagram_feed" | "instagram_story";
  readonly updatedAt: string;
}

export interface PublicationManualActionListResponse {
  readonly items: readonly PublicationManualActionResponse[];
}

export interface PublicationOrderResponse {
  readonly cancelledAt?: string;
  readonly createdAt: string;
  readonly id: string;
  readonly publicationId: string;
  /** Agregado calculado sobre los destinos, no un campo almacenado. */
  readonly status:
    "partially_published" | "publish_failed" | "published" | "publishing";
  readonly targets: readonly PublicationOrderTargetResponse[];
  readonly updatedAt: string;
}
