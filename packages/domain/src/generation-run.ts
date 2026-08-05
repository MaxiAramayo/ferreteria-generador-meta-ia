/**
 * Ciclo de vida de una ejecución de generación de imágenes.
 *
 * Se parece al del brief pero no es el mismo, y la diferencia es deliberada: un
 * brief produce un resultado, una ejecución de generación produce un **lote de
 * variantes**. El criterio de fallo parcial —conservar las variantes válidas y
 * explicar las fallidas— sólo se puede cumplir si cada variante tiene estado,
 * motivo y activo propios, así que el lote son dos entidades y no una fila con
 * campos repetidos.
 *
 * La API reserva la ejecución y encola su evento; el worker la toma, la marca
 * en curso y resuelve cada variante. PostgreSQL conserva el estado canónico: el
 * outbox transporta el trabajo, pero perder un mensaje no pierde la ejecución,
 * y reentregarlo no vuelve a gastar una variante ya resuelta.
 */

import type { ImageGenerationFailureCode } from "./image-generation.ts";
import type { OrganizationScope } from "./persistence.ts";
import type { PaginatedRecords } from "./publication-draft.ts";
import type { ReliableMutationContext } from "./reliable-operations.ts";
import type {
  DeterministicVisualReason,
  VisualFormatId,
  VisualProfileId,
  VisualSubjectKind,
} from "./visual-prompt.ts";

export const generationRunLimits = Object.freeze({
  /**
   * Techo de variantes por lote. No es una preferencia estética: cada variante
   * es una llamada facturada, y un lote sin tope convierte un pedido en un
   * gasto arbitrario. El control de cuotas y presupuesto es de `P4-T07`; este
   * límite es la barrera estructural que existe desde el primer día.
   */
  variantsMaximum: 4,
  variantsMinimum: 1,
});

/**
 * Estados del lote.
 *
 * `running` existe para que el progreso sea consultable: separa la espera en
 * cola de la ejecución real. Sin él, quien consulta no puede distinguir un lote
 * que nadie tomó todavía de uno que está gastando llamadas ahora mismo, que es
 * justo la diferencia que importa cuando algo tarda.
 *
 * `completed` no afirma que todas las variantes salieron: afirma que el lote
 * terminó y al menos una sirve. `failed` es el lote sin ninguna variante
 * utilizable. Un lote no vuelve atrás; reintentar crea otra ejecución.
 */
export const generationRunStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type GenerationRunStatus = (typeof generationRunStatuses)[number];

const generationRunTransitions: Readonly<
  Record<GenerationRunStatus, readonly GenerationRunStatus[]>
> = Object.freeze({
  cancelled: [],
  completed: [],
  failed: [],
  // Un lote puede fallar sin llegar a ejecutarse: el plan visual se resuelve
  // determinista o el pedido no sobrevive a la validación previa.
  pending: ["running", "failed", "cancelled"],
  running: ["completed", "failed", "cancelled"],
});

export function isGenerationRunTransitionAllowed(
  from: GenerationRunStatus,
  to: GenerationRunStatus,
): boolean {
  return generationRunTransitions[from].includes(to);
}

/** Estados terminales: una ejecución acá no admite más escrituras. */
export function isGenerationRunResolved(status: GenerationRunStatus): boolean {
  return generationRunTransitions[status].length === 0;
}

/**
 * Estados de una variante.
 *
 * `discarded` no es un fallo: es la variante que nunca se intentó porque el
 * lote se canceló antes de llegar a ella. Distinguirla de `failed` importa para
 * el costo: una descartada no gastó nada y presentarla como fallida sugeriría
 * un problema del proveedor que no ocurrió.
 */
export const generationVariantStatuses = [
  "pending",
  "succeeded",
  "failed",
  "discarded",
] as const;

export type GenerationVariantStatus =
  (typeof generationVariantStatuses)[number];

/**
 * Motivo por el que una variante no salió.
 *
 * `correction` dice qué hacer, no sólo qué pasó: es la misma decisión que tomó
 * la ingesta de entradas visuales en `P4-T02`. `detail` lo escribimos nosotros
 * y nunca arrastra el mensaje del proveedor, que puede traer el prompt
 * reflejado o una URL temporal.
 *
 * Casi todos los motivos son del proveedor de imágenes, pero no todos:
 * `composition-failed` es nuestro. La imagen puede haber llegado bien y aun así
 * la pieza no componerse —el navegador que renderiza se cayó, el documento no
 * se pudo armar—, y presentarlo como un fallo de OpenAI mandaría a reintentar
 * contra el lugar equivocado.
 */
export type GenerationVariantFailureCode =
  ImageGenerationFailureCode | "composition-failed";

export interface GenerationVariantFailure {
  readonly code: GenerationVariantFailureCode;
  readonly correction: string;
  readonly detail: string;
}

export interface GenerationVariantRecord {
  readonly attempts: number;
  readonly completedAt: string | null;
  /**
   * Pieza compuesta con la capa de marca. Toda variante que salió la tiene: se
   * escribe junto al resultado, porque componer necesita los bytes de la base
   * y esos bytes sólo existen mientras la generación está en curso.
   */
  readonly composition: GenerationVariantComposition | null;
  readonly failure: GenerationVariantFailure | null;
  readonly height: number | null;
  readonly id: string;
  /** Índice estable dentro del lote; ordena la presentación sin depender del reloj. */
  readonly index: number;
  readonly latencyMilliseconds: number;
  /** Activo persistido con la imagen; sólo existe si la variante salió. */
  readonly mediaAssetId: string | null;
  readonly model: string | null;
  readonly requestId: string | null;
  readonly sha256: string | null;
  readonly source: GenerationVariantSource;
  readonly status: GenerationVariantStatus;
  readonly width: number | null;
}

/**
 * Plan visual con el que se ejecutó el lote, tal como lo dejó `P4-T01`.
 *
 * Viaja completo a la ejecución porque es lo que permite comparar dos lotes y
 * saber si pidieron lo mismo: el hash cubre instrucciones y datos, así que una
 * edición silenciosa del prompt queda registrada aunque nadie suba la versión.
 */
export interface GenerationRunPlan {
  readonly format: VisualFormatId;
  readonly profileId: VisualProfileId;
  readonly profileVersion: string;
  readonly promptHash: string;
  readonly promptVersion: string;
}

/**
 * Por qué un lote terminó sin gastar ninguna llamada.
 *
 * Los tres motivos deterministas vienen del plan visual; `plan-invalid` es el
 * pedido que no sobrevive a la validación previa. Un lote resuelto de forma
 * determinista no es un error: es la pieza que sale con render de marca, y
 * `P4-T05` la compone igual.
 */
export interface GenerationRunResolution {
  readonly deterministicReason: DeterministicVisualReason | null;
  readonly detail: string;
}

/** Lo que se conoce al pedir el lote, antes de ejecutarlo. */
export interface GenerationRunReservation {
  readonly actorMembershipId: string;
  readonly contentBriefRunId: string;
  readonly format: VisualFormatId;
  readonly id: string;
  readonly organizationId: string;
  readonly requestedAt: string;
  /**
   * Si el sujeto tiene marca que respetar. Se conserva porque decide si la
   * pieza puede generarse: `branded` exige foto real y sin ella el lote se
   * resuelve determinista. Quien lea el historial necesita saber cuál se pidió.
   */
  readonly subjectKind: VisualSubjectKind;
  /** Identificadores de las variantes, ya sorteados por quien reserva. */
  readonly variantIds: readonly string[];
}

/**
 * Una ejecución en cualquier punto de su ciclo.
 *
 * El plan es opcional porque al reservar todavía no se construyó: lo elige el
 * worker al ejecutar, con la versión de perfil y prompt que hoy corre del otro
 * lado del outbox. Anotarlo al reservar sería adivinar cuál va a ejecutar.
 */
export interface GenerationRunRecord extends GenerationRunReservation {
  readonly cancelledAt: string | null;
  readonly completedAt: string | null;
  readonly estimatedCostUsd: number | null;
  readonly plan: GenerationRunPlan | null;
  readonly resolution: GenerationRunResolution | null;
  readonly startedAt: string | null;
  readonly status: GenerationRunStatus;
  readonly totalTokens: number;
  readonly variants: readonly GenerationVariantRecord[];
}

/**
 * Progreso del lote, derivado y no almacenado.
 *
 * Guardarlo sería una segunda fuente de verdad que puede contradecir a las
 * variantes; contarlo al leer no puede.
 */
export interface GenerationRunProgress {
  readonly discarded: number;
  readonly failed: number;
  readonly pending: number;
  readonly succeeded: number;
  readonly total: number;
}

export function generationRunProgress(
  variants: readonly GenerationVariantRecord[],
): GenerationRunProgress {
  let discarded = 0;
  let failed = 0;
  let pending = 0;
  let succeeded = 0;
  for (const variant of variants) {
    switch (variant.status) {
      case "discarded":
        discarded += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "pending":
        pending += 1;
        break;
      case "succeeded":
        succeeded += 1;
        break;
    }
  }
  return Object.freeze({
    discarded,
    failed,
    pending,
    succeeded,
    total: variants.length,
  });
}

/**
 * Estado terminal que corresponde a un lote ya ejecutado.
 *
 * Una sola variante viva alcanza para que el lote sirva: el criterio de fallo
 * parcial pide conservar lo válido, no descartar el lote porque algo falló.
 */
export function generationRunOutcome(
  variants: readonly GenerationVariantRecord[],
): "completed" | "failed" {
  return variants.some((variant) => variant.status === "succeeded")
    ? "completed"
    : "failed";
}

interface GenerationVariantCompletionBase {
  readonly attempts: number;
  readonly latencyMilliseconds: number;
  readonly organizationId: string;
  readonly requestId: string | null;
  readonly runId: string;
  readonly variantId: string;
}

/**
 * Lo que agrega una variante cuando el proveedor responde.
 *
 * Es una unión discriminada y no un objeto con todo opcional: una variante que
 * salió tiene activo, hash, medidas y modelo, y una fallida tiene motivo. Con
 * campos anulables las dos combinaciones sin sentido —una exitosa sin imagen y
 * una fallida sin explicación— compilarían y sólo las frenaría la restricción
 * de la base, que es demasiado tarde.
 */
export type GenerationVariantCompletion =
  | (GenerationVariantCompletionBase &
      Readonly<{
        composition: GenerationVariantComposition;
        height: number;
        mediaAssetId: string;
        model: string;
        sha256: string;
        status: "succeeded";
        width: number;
      }>)
  | (GenerationVariantCompletionBase &
      Readonly<{
        failure: GenerationVariantFailure;
        status: "failed";
      }>);

/**
 * De dónde salió la variante.
 *
 * `deterministic` es la pieza que produce el motor de marca sin imagen
 * generada: el brief pidió plantilla, la generación está apagada o no hay foto
 * aprobada. No gastó una llamada al proveedor, así que no tiene base ni modelo,
 * pero sí es una pieza terminada. Presentarla como pendiente o como fallida
 * sugeriría un problema que no ocurrió.
 */
export const generationVariantSources = ["generated", "deterministic"] as const;

export type GenerationVariantSource = (typeof generationVariantSources)[number];

/**
 * Pieza compuesta con la capa de marca (`P4-T05`).
 *
 * Es un activo distinto de la base: la base prueba qué generó el modelo y la
 * pieza es lo que se publica. `compositionHash` cubre versión, pieza, tema,
 * formato, copy y base, así que dos composiciones iguales se reconocen sin
 * comparar píxeles; `overlayHash` cubre sólo la capa determinista, que es lo
 * que permite ver si dos variantes comparten el mismo texto sobre bases
 * distintas.
 */
export interface GenerationVariantComposition {
  readonly compositionHash: string;
  readonly height: number;
  readonly layout: string;
  readonly mediaAssetId: string;
  readonly overlayHash: string;
  readonly sha256: string;
  readonly theme: string;
  readonly version: string;
  readonly width: number;
}

/**
 * Variante que sale sin proveedor: se resuelve y se compone en una sola
 * escritura, porque no hay nada intermedio que conservar si algo falla.
 */
export interface GenerationDeterministicVariantWrite {
  readonly composition: GenerationVariantComposition;
  readonly organizationId: string;
  readonly runId: string;
  readonly variantId: string;
}

/** Lo que agrega el lote cuando termina. */
export interface GenerationRunCompletion {
  readonly estimatedCostUsd: number | null;
  readonly id: string;
  readonly organizationId: string;
  readonly plan: GenerationRunPlan | null;
  readonly resolution: GenerationRunResolution | null;
  readonly status: "completed" | "failed";
  readonly totalTokens: number;
}

/**
 * Resultado de intentar escribir sobre una ejecución.
 *
 * `discarded` es el caso que protege el invariante de cancelación: el worker
 * terminó, pero el editor ya había cancelado y el resultado tardío no puede
 * quedar vigente. No se puede detener al proveedor, pero sí impedir que su
 * respuesta se promueva.
 */
export type GenerationRunWriteOutcome =
  | Readonly<{ status: "written" }>
  | Readonly<{ reason: "cancelled" | "not-open"; status: "discarded" }>
  | Readonly<{ status: "not-found" }>;

export type GenerationRunCancellationOutcome =
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{
      resolvedStatus: GenerationRunStatus;
      status: "already-resolved";
    }>;

export interface GenerationRunListFilter extends OrganizationScope {
  readonly actorMembershipId?: string;
  readonly contentBriefRunId?: string;
  readonly limit: number;
  readonly page: number;
}

export interface RequestGenerationRunInput extends GenerationRunReservation {
  readonly reliableOperation: ReliableMutationContext;
}

export type GenerationRunRequestResult =
  | Readonly<{ runId: string; status: "accepted" }>
  | Readonly<{ status: "idempotency-conflict" }>
  | Readonly<{ retryAfter: string; status: "in-progress" }>;

/**
 * Tópico que la API encola y el worker consume.
 *
 * Como en el brief, pedido y ejecución están separados: la API no puede generar
 * —el proveedor de imágenes vive en el worker— y quien pide necesita ver el
 * lote aceptado antes de que empiece a gastar.
 */
export const generationRunTopic = "content.generation.requested";

/**
 * Puerto de pedido, exclusivo de la API.
 *
 * Reservar el lote con sus variantes y encolar su evento ocurren en una sola
 * transacción: un pedido aceptado que no llegara al outbox quedaría pendiente
 * para siempre, y un evento sin lote reservado no tendría dónde escribir.
 */
export interface GenerationRunRequestRepository {
  request(
    input: RequestGenerationRunInput,
  ): Promise<GenerationRunRequestResult>;
}

export interface GenerationRunRepository {
  cancel(input: {
    readonly cancelledAt: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<GenerationRunCancellationOutcome>;
  /** Cierra el lote. Sólo escribe si sigue abierto. */
  complete(
    completion: GenerationRunCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome>;
  /**
   * Cierra una variante. Comprueba el estado del lote, no el de la variante:
   * lo que la cancelación protege es el lote entero.
   */
  completeVariant(
    completion: GenerationVariantCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome>;
  /**
   * Resuelve una variante que no gastó proveedor: la pieza sale del motor de
   * marca y se escribe junto con su composición.
   */
  completeDeterministicVariant(
    write: GenerationDeterministicVariantWrite,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome>;
  /** Descarta las variantes que quedaron sin intentar al cerrar el lote. */
  discardPendingVariants(input: {
    readonly discardedAt: string;
    readonly organizationId: string;
    readonly runId: string;
  }): Promise<void>;
  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<GenerationRunRecord | null>;
  list(
    filter: GenerationRunListFilter,
  ): Promise<PaginatedRecords<GenerationRunRecord>>;
  reserve(reservation: GenerationRunReservation): Promise<void>;
  /**
   * Marca el lote en curso y devuelve si lo consiguió.
   *
   * Es además el candado de reentrega: dos entregas del mismo evento compiten
   * por la misma transición y sólo una la gana, así que un mensaje repetido no
   * lanza el lote dos veces.
   */
  start(input: {
    readonly id: string;
    readonly organizationId: string;
    readonly startedAt: string;
  }): Promise<GenerationRunWriteOutcome>;
}
