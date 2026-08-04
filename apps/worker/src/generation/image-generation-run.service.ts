/**
 * Orquestación del lote de generación.
 *
 * Ejecuta fuera del request web lo que la API sólo encoló. Su responsabilidad
 * es el ciclo de vida: tomar el lote, resolver cada variante, conservar lo que
 * salió, explicar lo que no y cerrar. No decide alcance —organización,
 * membresía y brief vienen del lote, que la API derivó de la sesión— ni compone
 * la pieza final, que es de `P4-T05`.
 *
 * Tres reglas gobiernan el gasto:
 *
 * 1. antes de cada variante se comprueba que el lote siga abierto, así que una
 *    cancelación deja de gastar en la próxima en lugar de al final;
 * 2. un fallo que el proveedor declaró no reintentable no se reintenta, porque
 *    repetir el mismo pedido repite el gasto sin cambiar el resultado;
 * 3. una variante que ya se resolvió no se vuelve a pedir, ni siquiera si el
 *    evento se reentrega.
 */

import {
  generationRunOutcome,
  ImageGenerationError,
  imageSizeForFormat,
  VisualPromptValidationError,
  type ContentBriefRunRepository,
  type DeterministicVisualReason,
  type GeneratedImage,
  type GenerationRunPlan,
  type GenerationRunRecord,
  type GenerationRunRepository,
  type GenerationVariantCompletion,
  type GenerationVariantFailure,
  type ImageGenerationFailureCode,
  type ImageGenerationPort,
  type VisualPromptPlan,
} from "@aramayo/domain";

import { deterministicMediaId } from "../media/deterministic-media-id.ts";
import type { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import { buildVisualPrompt } from "../visual/visual-prompt-builder.ts";

export interface ExecuteGenerationRunCommand {
  readonly organizationId: string;
  readonly runId: string;
}

export interface GenerationRunDependencies {
  readonly clock?: () => Date;
  /**
   * Palanca de operación. En `false` el lote se resuelve con render determinista
   * y motivo `generation-disabled`, sin intentar ninguna llamada.
   *
   * Es lo que distingue «no hay proveedor configurado» de «el proveedor falló»:
   * sin esta palanca, un worker sin credenciales gastaría el lote entero
   * acumulando errores de proveedor para terminar igual en render determinista,
   * pero presentando como falla lo que es una decisión de configuración.
   */
  readonly generationEnabled?: boolean;
  /**
   * Cuántas variantes se piden a la vez. Dos es deliberadamente bajo: el lote
   * compite con el resto del worker por el mismo proceso, y un límite de tasa
   * del proveedor se alcanza más rápido cuanto más paralelo es el pedido.
   */
  readonly concurrency?: number;
  /** Intentos por variante, contando el primero. */
  readonly maxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export type GenerationRunExecutionResult =
  | Readonly<{ runId: string; status: "completed" | "failed" }>
  /** Se canceló o ya no estaba abierto; no se promueve nada. */
  | Readonly<{ runId: string; status: "discarded" }>
  /** Se resolvió sin gastar ninguna llamada al proveedor. */
  | Readonly<{
      detail: string;
      runId: string;
      status: "deterministic";
    }>;

/**
 * Qué hacer ante cada fallo, en el idioma de quien pidió la pieza.
 *
 * No repite el mensaje del proveedor: ese texto puede traer el prompt reflejado
 * o una URL temporal, y termina guardado y mostrado.
 */
const corrections: Readonly<Record<ImageGenerationFailureCode, string>> =
  Object.freeze({
    "content-invalid":
      "El proveedor respondió sin una imagen utilizable. Volvé a pedir el lote.",
    "provider-error":
      "El proveedor de imágenes falló. Volvé a intentarlo en unos minutos.",
    "rate-limit":
      "Se alcanzó el límite de pedidos del proveedor. Reintentá en unos minutos.",
    "safety-rejection":
      "El pedido no pasó la revisión de seguridad del proveedor. Revisá el brief y la propuesta creativa.",
    timeout:
      "El proveedor tardó más de lo admitido. Reintentá con menos variantes.",
    "unsupported-parameter":
      "El pedido no es válido para el proveedor. Revisá formato y perfil visual.",
  });

function failureFrom(cause: unknown): GenerationVariantFailure {
  if (cause instanceof ImageGenerationError) {
    return Object.freeze({
      code: cause.code,
      correction: corrections[cause.code],
      detail: cause.detail,
    });
  }
  // Un fallo que no es del puerto es nuestro. Se registra como error de
  // proveedor para no inventar una categoría, pero el detalle dice que el
  // origen fue interno en lugar de atribuirlo a OpenAI.
  return Object.freeze({
    code: "provider-error" as const,
    correction: corrections["provider-error"],
    detail: "La ejecución falló antes de obtener una respuesta utilizable.",
  });
}

function isRetryable(cause: unknown): boolean {
  return cause instanceof ImageGenerationError && cause.retryable;
}

/**
 * Acota el motivo al ancho que admite la columna.
 *
 * El texto lo escribimos nosotros, pero un campo de un pedido puede llegar
 * largo: truncar acá evita que el cierre del lote falle por un dato y lo deje
 * en curso para siempre.
 */
function resolutionDetail(detail: string): string {
  return detail.length <= 300 ? detail : `${detail.slice(0, 297)}...`;
}

function toRunPlan(
  plan: Extract<VisualPromptPlan, { kind: "generated" }>,
): GenerationRunPlan {
  return Object.freeze({
    format: plan.format,
    profileId: plan.profileId,
    profileVersion: plan.profileVersion,
    promptHash: plan.promptHash,
    promptVersion: plan.promptVersion,
  });
}

export class ImageGenerationRunService {
  readonly #briefs: ContentBriefRunRepository;
  readonly #clock: () => Date;
  readonly #concurrency: number;
  readonly #generationEnabled: boolean;
  readonly #images: ImageGenerationPort;
  readonly #maxAttempts: number;
  readonly #media: Pick<MediaLifecycleService, "upload">;
  readonly #runs: GenerationRunRepository;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(
    runs: GenerationRunRepository,
    briefs: ContentBriefRunRepository,
    images: ImageGenerationPort,
    media: Pick<MediaLifecycleService, "upload">,
    dependencies: GenerationRunDependencies = {},
  ) {
    this.#briefs = briefs;
    this.#clock = dependencies.clock ?? ((): Date => new Date());
    this.#concurrency = Math.max(dependencies.concurrency ?? 2, 1);
    this.#generationEnabled = dependencies.generationEnabled ?? true;
    this.#images = images;
    this.#maxAttempts = Math.max(dependencies.maxAttempts ?? 3, 1);
    this.#media = media;
    this.#runs = runs;
    this.#sleep =
      dependencies.sleep ??
      ((milliseconds: number): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async execute(
    command: ExecuteGenerationRunCommand,
  ): Promise<GenerationRunExecutionResult> {
    const run = await this.#runs.findById({
      id: command.runId,
      organizationId: command.organizationId,
    });
    if (run === null) {
      throw new Error("El lote de generación no existe en su organización.");
    }
    // `running` también se admite, y es lo que hace recuperable un lote que
    // quedó a medias: si el worker cayó entre dos variantes, el lease del outbox
    // vence y el mensaje se reentrega. Como el lease es exclusivo, recibirlo
    // significa que nadie más lo está ejecutando, así que retomarlo es seguro.
    // Las variantes ya resueltas no se vuelven a pedir.
    if (run.status !== "pending" && run.status !== "running") {
      return { runId: run.id, status: "discarded" };
    }

    const plan = await this.#plan(run);
    if (plan.status === "unavailable") {
      return this.#resolveWithoutSpending(run, null, plan.detail, "failed");
    }
    if (plan.plan.kind === "deterministic") {
      // No es un error: la pieza sale con render de marca y `P4-T05` la compone
      // igual. Lo que corresponde conservar es por qué no se generó.
      return this.#resolveWithoutSpending(
        run,
        plan.plan.reason,
        `La pieza se resuelve con render determinista (${plan.plan.reason}).`,
        "completed",
      );
    }

    // Tomar el lote es además el candado de reentrega: dos entregas simultáneas
    // compiten por esta transición y sólo una la gana. Un lote que ya está en
    // curso se retoma sin volver a marcarlo.
    if (run.status === "pending") {
      const started = await this.#runs.start({
        id: run.id,
        organizationId: run.organizationId,
        startedAt: this.#clock().toISOString(),
      });
      if (started.status !== "written") {
        return { runId: run.id, status: "discarded" };
      }
    }

    const generated = plan.plan;
    const totals = await this.#runVariants(run, generated);
    if (totals.cancelled) {
      return { runId: run.id, status: "discarded" };
    }

    const closed = await this.#runs.complete(
      {
        // La tabla de precios de imágenes no está en el repositorio; ponerle un
        // número inventado sería peor que dejarlo vacío. Es de `P4-T07`.
        estimatedCostUsd: null,
        id: run.id,
        organizationId: run.organizationId,
        plan: toRunPlan(generated),
        resolution: null,
        status: totals.outcome,
        totalTokens: totals.totalTokens,
      },
      this.#clock().toISOString(),
    );
    if (closed.status !== "written") {
      return { runId: run.id, status: "discarded" };
    }
    return { runId: run.id, status: totals.outcome };
  }

  /**
   * Construye el plan visual desde el brief que originó el lote.
   *
   * Un brief que no llegó a producirse no puede dar una pieza: el lote termina
   * sin gastar nada y lo dice, en lugar de generar sobre un pedido vacío.
   */
  async #plan(
    run: GenerationRunRecord,
  ): Promise<
    | Readonly<{ plan: VisualPromptPlan; status: "planned" }>
    | Readonly<{ detail: string; status: "unavailable" }>
  > {
    const briefRun = await this.#briefs.findById({
      id: run.contentBriefRunId,
      organizationId: run.organizationId,
    });
    if (briefRun === null || briefRun.brief === null) {
      return {
        detail:
          "La ejecución de brief que originó el lote no produjo un brief que se pueda ilustrar.",
        status: "unavailable",
      };
    }
    try {
      return {
        plan: buildVisualPrompt({
          brief: briefRun.brief,
          format: run.format,
          // La palanca de operación: sin proveedor configurado el constructor
          // devuelve `generation-disabled` y el lote se cierra sin intentar
          // ninguna llamada.
          generationEnabled: this.#generationEnabled,
          references: [],
          subjectKind: run.subjectKind,
        }),
        status: "planned",
      };
    } catch (cause: unknown) {
      // Sólo un pedido inválido cierra el lote. Cualquier otro fallo es nuestro
      // y tiene que subir: convertirlo en un lote `failed` lo daría por
      // resuelto, perdería el error y le impediría al outbox reintentarlo.
      if (!(cause instanceof VisualPromptValidationError)) {
        throw cause;
      }
      return {
        detail: resolutionDetail(
          `El pedido no produce un prompt válido (${cause.code} en ${cause.field}).`,
        ),
        status: "unavailable",
      };
    }
  }

  /** Cierra un lote que no gastó ninguna llamada al proveedor. */
  async #resolveWithoutSpending(
    run: GenerationRunRecord,
    deterministicReason: DeterministicVisualReason | null,
    detail: string,
    status: "completed" | "failed",
  ): Promise<GenerationRunExecutionResult> {
    const closed = await this.#runs.complete(
      {
        estimatedCostUsd: null,
        id: run.id,
        organizationId: run.organizationId,
        plan: null,
        resolution: { deterministicReason, detail },
        status,
        totalTokens: 0,
      },
      this.#clock().toISOString(),
    );
    if (closed.status !== "written") {
      return { runId: run.id, status: "discarded" };
    }
    return status === "completed"
      ? { detail, runId: run.id, status: "deterministic" }
      : { runId: run.id, status: "failed" };
  }

  /**
   * Resuelve las variantes con concurrencia acotada.
   *
   * Los trabajadores toman índices de una cola compartida en lugar de repartirse
   * el lote de antemano: si una variante tarda el triple, las demás siguen
   * avanzando en lugar de esperar a que su turno termine.
   */
  async #runVariants(
    run: GenerationRunRecord,
    plan: Extract<VisualPromptPlan, { kind: "generated" }>,
  ): Promise<
    Readonly<{
      cancelled: boolean;
      outcome: "completed" | "failed";
      totalTokens: number;
    }>
  > {
    const pending = run.variants.filter(
      (variant) => variant.status === "pending",
    );
    const resolved = new Map<string, "succeeded" | "failed">();
    // El estado compartido vive en un objeto y no en variables sueltas: los
    // trabajadores lo mutan desde dentro de su cierre, y el análisis de flujo no
    // sigue esas escrituras cuando la variable es local.
    const shared = { cancelled: false, next: 0, totalTokens: 0 };

    /** Devuelve si se detuvo porque el lote dejó de admitir resultados. */
    const worker = async (): Promise<boolean> => {
      for (;;) {
        if (shared.cancelled) {
          return true;
        }
        // Leer e incrementar sin `await` en el medio es lo que evita que dos
        // trabajadores tomen el mismo índice.
        const variant = pending[shared.next++];
        if (variant === undefined) {
          return false;
        }
        const completion = await this.#runVariant(run, plan, variant.id);
        if (completion.status === "cancelled") {
          // Dejar de gastar en la próxima variante es el punto: no se puede
          // detener al proveedor, pero sí no pedirle nada más.
          shared.cancelled = true;
          return true;
        }
        shared.totalTokens += completion.totalTokens;
        resolved.set(variant.id, completion.outcome);
      }
    };

    const stops = await Promise.all(
      Array.from({ length: Math.min(this.#concurrency, pending.length) }, () =>
        worker(),
      ),
    );
    const totalTokens = shared.totalTokens;

    if (stops.includes(true)) {
      return { cancelled: true, outcome: "failed", totalTokens };
    }
    // El resultado se decide sobre lo que esta ejecución resolvió, más lo que
    // el lote ya traía resuelto de una entrega anterior.
    const variants = run.variants.map((variant) => {
      const outcome = resolved.get(variant.id);
      return outcome === undefined ? variant : { ...variant, status: outcome };
    });
    return {
      cancelled: false,
      outcome: generationRunOutcome(variants),
      totalTokens,
    };
  }

  async #runVariant(
    run: GenerationRunRecord,
    plan: Extract<VisualPromptPlan, { kind: "generated" }>,
    variantId: string,
  ): Promise<
    | Readonly<{
        outcome: "succeeded" | "failed";
        status: "resolved";
        totalTokens: number;
      }>
    | Readonly<{ status: "cancelled" }>
  > {
    const size = imageSizeForFormat(plan.format);
    let attempts = 0;
    let lastFailure: unknown = null;
    const startedAt = Date.now();

    while (attempts < this.#maxAttempts) {
      attempts += 1;
      try {
        const image = await this.#images.generate({
          background: "opaque",
          kind: "generate",
          negativeGuidance: plan.negativeGuidance,
          prompt: plan.prompt,
          quality: "medium",
          size,
        });
        const stored = await this.#store(run, image);
        const written = await this.#complete(run, {
          attempts,
          height: image.height,
          latencyMilliseconds: image.latencyMilliseconds,
          mediaAssetId: stored,
          model: image.model,
          organizationId: run.organizationId,
          requestId: image.requestId,
          runId: run.id,
          sha256: image.sha256,
          status: "succeeded",
          variantId,
          width: image.width,
        });
        // Un lote cancelado no acumula uso porque tampoco escribe totales: su
        // cierre nunca ocurre. El gasto de esta llamada existió igual, y
        // contabilizarlo es de `P4-T07`, que es donde vive el control de costos.
        return written
          ? {
              outcome: "succeeded",
              status: "resolved",
              totalTokens: image.usage?.totalTokens ?? 0,
            }
          : { status: "cancelled" };
      } catch (cause: unknown) {
        lastFailure = cause;
        if (!isRetryable(cause) || attempts >= this.#maxAttempts) {
          break;
        }
        // Espera creciente: reintentar de inmediato contra un límite de tasa
        // vuelve a chocar con él.
        await this.#sleep(2 ** attempts * 500);
      }
    }

    const written = await this.#complete(run, {
      attempts,
      failure: failureFrom(lastFailure),
      latencyMilliseconds: Date.now() - startedAt,
      organizationId: run.organizationId,
      requestId: null,
      runId: run.id,
      status: "failed",
      variantId,
    });
    return written
      ? { outcome: "failed", status: "resolved", totalTokens: 0 }
      : { status: "cancelled" };
  }

  /**
   * Escribe la variante. `false` significa que el lote ya no la admite, que es
   * el resultado tardío que no se promueve.
   */
  async #complete(
    run: GenerationRunRecord,
    completion: GenerationVariantCompletion,
  ): Promise<boolean> {
    const written = await this.#runs.completeVariant(
      completion,
      this.#clock().toISOString(),
    );
    return written.status === "written";
  }

  /**
   * Persiste la imagen antes de anotarla.
   *
   * El identificador se deriva del hash de los bytes, así que si el proceso cae
   * entre la subida y la anotación, el reintento cae sobre el mismo activo en
   * lugar de pagar la subida dos veces.
   */
  async #store(
    run: GenerationRunRecord,
    image: GeneratedImage,
  ): Promise<string> {
    const mediaAssetId = deterministicMediaId(
      "generated-variant",
      image.sha256,
    );
    const asset = await this.#media.upload({
      bytes: image.bytes,
      declaredMimeType: image.mimeType,
      mediaAssetId,
      organizationId: run.organizationId,
      origin: "generated",
      originalFileName: `generated-${image.sha256.slice(0, 16)}.${image.mimeType === "image/png" ? "png" : "jpg"}`,
      ownerMembershipId: run.actorMembershipId,
    });
    return asset.id;
  }
}
