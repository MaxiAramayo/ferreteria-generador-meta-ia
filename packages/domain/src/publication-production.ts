import type { ReliableMutationContext } from "./reliable-operations.ts";

export { publicationRenderTopic } from "./reliable-operations.ts";

export interface PublicationRenderRequestInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
}

export type PublicationRenderRequestResult =
  | Readonly<{
      publicationId: string;
      revisionId: string;
      replayed?: true;
      status: "accepted";
      version: number;
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationRenderJob {
  readonly alreadyCompleted: boolean;
  readonly actorMembershipId: string;
  readonly designDocument: unknown;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly publicationVersion: number;
  readonly revisionId: string;
}

export interface PublicationRenderOutput {
  readonly byteSize: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: "image/png";
  readonly renderedAt: string;
  readonly secureUrl: string;
  readonly storageVersion: number;
  readonly width: number;
}

export type PublicationRenderCompletionResult =
  | Readonly<{ status: "completed"; version: number }>
  | Readonly<{ status: "already-completed"; version: number }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationRenderFailureInput {
  readonly actorMembershipId: string;
  readonly code: string;
  readonly failedAt: string;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly publicationVersion: number;
  readonly retryable: boolean;
  readonly safeMessage: string;
}

/**
 * Cuándo sale la pieza que se está aprobando.
 *
 * Aprobar y programar son dos decisiones, pero para quien opera son un solo
 * gesto: «esto está bien, sale el martes». Van juntas en la misma transacción
 * para que no exista una pieza aprobada que nadie agendó porque la segunda
 * pantalla se cerró antes.
 *
 * La hora es local del negocio. La zona no viaja: es la que la publicación ya
 * tiene guardada, para que el navegador de quien aprueba no la decida.
 */
export interface ApprovePublicationSchedule {
  readonly localDate: string;
  readonly localTime: string;
  readonly targets: readonly PublicationScheduleTarget[];
}

export type PublicationScheduleTarget =
  "facebook_page" | "instagram_feed" | "instagram_story";

export interface ApprovePublicationInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
  /** Ausente: aprobar y nada más, como hasta ahora. */
  readonly schedule?: ApprovePublicationSchedule;
}

export type ApprovePublicationResult =
  | Readonly<{
      publicationId: string;
      replayed?: true;
      snapshotId: string;
      status: "approved" | "scheduled";
      version: number;
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

/**
 * Eliminar para siempre una pieza que no va a publicarse.
 *
 * Borra de verdad: la pieza, sus revisiones y la foto embebida que llevan
 * adentro. Lo único que sobrevive es el renglón de auditoría, que dice quién
 * la eliminó y cuándo —un registro de la acción, no una copia de la pieza.
 *
 * Sólo alcanza a lo que nunca fue evidencia: sin aprobación, sin programación
 * y sin orden de publicación. Una pieza aprobada o publicada no se elimina
 * desde acá; sacarla exige reconciliar lo que ya salió.
 */
export interface DeletePublicationInput {
  readonly actorMembershipId: string;
  readonly expectedVersion: number;
  readonly organizationId: string;
  readonly publicationId: string;
  readonly reliableOperation: ReliableMutationContext;
}

export type DeletePublicationResult =
  | Readonly<{
      publicationId: string;
      replayed?: true;
      status: "deleted";
    }>
  | Readonly<{ status: "conflict" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>
  | Readonly<{ status: "invalid-state" }>
  | Readonly<{ status: "not-found" }>;

export interface PublicationProductionRepository {
  approve(input: ApprovePublicationInput): Promise<ApprovePublicationResult>;
  completeRender(
    job: PublicationRenderJob,
    output: PublicationRenderOutput,
  ): Promise<PublicationRenderCompletionResult>;
  delete(input: DeletePublicationInput): Promise<DeletePublicationResult>;
  failRender(
    input: PublicationRenderFailureInput,
  ): Promise<PublicationRenderCompletionResult>;
  findRenderJob(
    organizationId: string,
    publicationId: string,
    revisionId: string,
  ): Promise<PublicationRenderJob | null>;
  requestRender(
    input: PublicationRenderRequestInput,
  ): Promise<PublicationRenderRequestResult>;
}
