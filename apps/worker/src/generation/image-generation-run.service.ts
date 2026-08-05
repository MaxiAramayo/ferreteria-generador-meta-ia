/**
 * Orquestación del lote de generación.
 *
 * Ejecuta fuera del request web lo que la API sólo encoló. Su responsabilidad
 * es el ciclo de vida: tomar el lote, resolver cada variante, componerla con la
 * capa de marca, conservar lo que salió, explicar lo que no y cerrar. No decide
 * alcance: organización, membresía y brief vienen del lote, que la API derivó
 * de la sesión.
 *
 * Cuatro reglas gobiernan el gasto:
 *
 * 1. antes de cada variante se comprueba que el lote siga abierto, así que una
 *    cancelación deja de gastar en la próxima en lugar de al final;
 * 2. un fallo que el proveedor declaró no reintentable no se reintenta, porque
 *    repetir el mismo pedido repite el gasto sin cambiar el resultado;
 * 3. una variante que ya se resolvió no se vuelve a pedir, ni siquiera si el
 *    evento se reentrega;
 * 4. **componer es barato y generar es caro.** Si la composición falla, el
 *    error sube y el outbox reintrega: la base ya está persistida y la variante
 *    ya está `succeeded`, así que el reintento rehace sólo el render. Anotar
 *    resultado y composición juntos obligaría a regenerar la imagen para
 *    recuperar un render fallido.
 */

import type { DesignRenderer } from "@aramayo/design-engine";
import {
  generationRunOutcome,
  ImageGenerationError,
  imageSizeForFormat,
  VisualCompositionError,
  VisualPromptValidationError,
  type ContentBrief,
  type ContentBriefRunRepository,
  type DeterministicVisualReason,
  type GeneratedImage,
  type GenerationRunPlan,
  type GenerationRunRecord,
  type GenerationRunRepository,
  type GenerationVariantComposition,
  type GenerationVariantCompletion,
  type GenerationVariantFailure,
  type GenerationVariantFailureCode,
  type ImageGenerationPort,
  type VisualPromptPlan,
  type VisualReservedSpace,
} from "@aramayo/domain";

import { deterministicMediaId } from "../media/deterministic-media-id.ts";
import type { MediaLifecycleService } from "../media/media-lifecycle.service.ts";
import {
  composePiece,
  CompositionRenderError,
  type ComposedBaseImage,
  type ComposedPiece,
} from "../visual/piece-composer.ts";
import { visualProfileFor } from "../visual/visual-profiles.ts";
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
const corrections: Readonly<Record<GenerationVariantFailureCode, string>> =
  Object.freeze({
    // La composición es nuestra, no del proveedor: la imagen puede haber
    // llegado bien y aun así el navegador no haber podido renderizar la pieza.
    "composition-failed":
      "La imagen se generó pero la pieza no se pudo componer. Volvé a pedir el lote.",
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
  // La imagen llegó y la pieza no se pudo componer: no es un fallo del
  // proveedor, y decir que lo es mandaría a reintentar contra OpenAI.
  if (cause instanceof CompositionRenderError) {
    return compositionFailure(
      `La pieza no se pudo renderizar (etapa ${cause.stage}).`,
    );
  }
  if (cause instanceof VisualCompositionError) {
    return compositionFailure(`${cause.message} ${cause.correction}`);
  }
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

function compositionFailure(detail: string): GenerationVariantFailure {
  return Object.freeze({
    code: "composition-failed" as const,
    correction: corrections["composition-failed"],
    detail: resolutionDetail(detail),
  });
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

/**
 * Identificador de la pieza dentro de la plataforma.
 *
 * El documento exige un slug con forma de identificador legible; se deriva del
 * lote para que dos piezas del mismo lote se reconozcan juntas y ninguna
 * dependa del reloj.
 */
function compositionSlug(runId: string): string {
  return `composicion-${runId.replaceAll("-", "").slice(0, 24)}`;
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
  readonly #renderer: DesignRenderer;
  readonly #runs: GenerationRunRepository;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  constructor(
    runs: GenerationRunRepository,
    briefs: ContentBriefRunRepository,
    images: ImageGenerationPort,
    media: Pick<MediaLifecycleService, "upload">,
    renderer: DesignRenderer,
    dependencies: GenerationRunDependencies = {},
  ) {
    this.#briefs = briefs;
    this.#clock = dependencies.clock ?? ((): Date => new Date());
    this.#concurrency = Math.max(dependencies.concurrency ?? 2, 1);
    this.#generationEnabled = dependencies.generationEnabled ?? true;
    this.#images = images;
    this.#maxAttempts = Math.max(dependencies.maxAttempts ?? 3, 1);
    this.#media = media;
    this.#renderer = renderer;
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

    // La composición se comprueba antes de gastar: una región sin pieza, un
    // formato que la pieza no admite o un titular que no entra son rechazos
    // deterministas, y descubrirlos después de pagarle una imagen al proveedor
    // sería gastar para nada.
    const composable = this.#assertComposable(run, plan.brief, plan.plan);
    if (composable !== null) {
      return this.#resolveWithoutSpending(run, null, composable, "failed");
    }

    if (plan.plan.kind === "deterministic") {
      // No es un error: la pieza sale enteramente del motor de marca. Lo que
      // corresponde conservar es por qué no se generó, y la pieza igual se
      // compone y se guarda: un lote determinista entrega pieza, no un motivo.
      return this.#resolveDeterministically(run, plan.brief, plan.plan);
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
    const totals = await this.#runVariants(run, plan.brief, generated);
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
  async #plan(run: GenerationRunRecord): Promise<
    | Readonly<{
        brief: ContentBrief;
        plan: VisualPromptPlan;
        status: "planned";
      }>
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
    const brief = briefRun.brief;
    try {
      return {
        brief,
        plan: buildVisualPrompt({
          brief,
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

  /**
   * Región que la capa determinista ocupa.
   *
   * En el camino generado la trae el plan, que es la misma que viajó al
   * proveedor. En el determinista no hubo prompt, así que se toma la del perfil
   * que habría correspondido; si el brief pidió plantilla no hay perfil, y el
   * tercio inferior es la región de la pieza comercial completa.
   */
  #regionFor(plan: VisualPromptPlan): VisualReservedSpace {
    if (plan.kind === "generated") {
      return plan.reservedSpace;
    }
    return plan.profileId === null
      ? "lower_third"
      : visualProfileFor(plan.profileId).reservedSpace;
  }

  /**
   * Comprueba que la pieza se pueda componer, sin componerla de verdad.
   *
   * Devuelve el motivo cuando no se puede, y `null` cuando sí. Se corre antes de
   * gastar porque los tres rechazos posibles —región sin pieza, formato no
   * admitido y titular que no entra— son deterministas: reintentar no los
   * cambia, y descubrirlos después de generar sería gastar para nada.
   */
  #assertComposable(
    run: GenerationRunRecord,
    brief: ContentBrief,
    plan: VisualPromptPlan,
  ): string | null {
    try {
      composePiece({
        base: null,
        brief,
        format: run.format,
        region: this.#regionFor(plan),
        slug: compositionSlug(run.id),
      });
      return null;
    } catch (cause: unknown) {
      if (!(cause instanceof VisualCompositionError)) {
        throw cause;
      }
      return resolutionDetail(
        `La pieza no se puede componer (${cause.code} en ${cause.field}). ${cause.correction}`,
      );
    }
  }

  /**
   * Resuelve un lote que no gasta proveedor y aun así entrega pieza.
   *
   * Los tres motivos deterministas de `P4-T01` terminan acá. La diferencia con
   * cerrar el lote y ya está es que quien pidió la pieza recibe una pieza: el
   * motivo se conserva, pero no reemplaza al resultado.
   */
  async #resolveDeterministically(
    run: GenerationRunRecord,
    brief: ContentBrief,
    plan: Extract<VisualPromptPlan, { kind: "deterministic" }>,
  ): Promise<GenerationRunExecutionResult> {
    const detail = `La pieza se resuelve con render determinista (${plan.reason}).`;
    const [variant] = run.variants;

    if (variant === undefined) {
      return this.#resolveWithoutSpending(
        run,
        plan.reason,
        detail,
        "completed",
      );
    }

    let composition: GenerationVariantComposition;
    try {
      const piece = composePiece({
        base: null,
        brief,
        format: run.format,
        region: this.#regionFor(plan),
        slug: compositionSlug(run.id),
      });
      composition = await this.#renderAndStore(run, piece);
    } catch (cause: unknown) {
      // Un fallo de render es nuestro y puede ser transitorio: sube para que el
      // outbox reentregue en lugar de cerrar el lote sin pieza.
      if (cause instanceof VisualCompositionError) {
        return this.#resolveWithoutSpending(
          run,
          null,
          resolutionDetail(`${cause.message} ${cause.correction}`),
          "failed",
        );
      }
      throw cause;
    }

    const now = this.#clock().toISOString();
    const written = await this.#runs.completeDeterministicVariant(
      {
        composition,
        organizationId: run.organizationId,
        runId: run.id,
        variantId: variant.id,
      },
      now,
    );
    if (written.status !== "written") {
      return { runId: run.id, status: "discarded" };
    }

    // Las demás variantes no se intentaron y no gastaron nada: una pieza
    // determinista es siempre la misma, así que pedir cuatro copias idénticas
    // no tendría sentido.
    await this.#runs.discardPendingVariants({
      discardedAt: now,
      organizationId: run.organizationId,
      runId: run.id,
    });

    return this.#resolveWithoutSpending(run, plan.reason, detail, "completed");
  }

  /**
   * Renderiza la pieza y la guarda.
   *
   * El identificador del activo se deriva del hash de composición y de la
   * organización, así que dos variantes que componen exactamente lo mismo caen
   * sobre el mismo archivo en lugar de pagar la subida dos veces, y un reintento
   * no duplica nada.
   */
  async #renderAndStore(
    run: GenerationRunRecord,
    piece: ComposedPiece,
  ): Promise<GenerationVariantComposition> {
    const rendered = await this.#renderer.render({
      document: piece.document,
      requestId: `${run.id}:${piece.snapshot.compositionHash.slice(0, 12)}`,
    });
    if (!rendered.ok) {
      throw new CompositionRenderError(rendered.failure.stage);
    }

    const mediaAssetId = deterministicMediaId(
      "composed-piece",
      `${run.organizationId}:${piece.snapshot.compositionHash}`,
    );
    const asset = await this.#media.upload({
      bytes: rendered.image.png,
      declaredMimeType: "image/png",
      mediaAssetId,
      organizationId: run.organizationId,
      origin: "generated",
      originalFileName: `${piece.document.slug}.png`,
      ownerMembershipId: run.actorMembershipId,
    });

    return Object.freeze({
      compositionHash: piece.snapshot.compositionHash,
      height: rendered.image.height,
      layout: piece.snapshot.layout,
      mediaAssetId: asset.id,
      overlayHash: piece.snapshot.overlayHash,
      sha256: rendered.image.sha256,
      theme: piece.snapshot.theme,
      version: piece.snapshot.version,
      width: rendered.image.width,
    });
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
    brief: ContentBrief,
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
        const completion = await this.#runVariant(run, brief, plan, variant.id);
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
    brief: ContentBrief,
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
        // Componer necesita los bytes de la base, y estos bytes sólo existen
        // acá: el almacenamiento no sabe devolverlos. Por eso la pieza se
        // compone antes de anotar la variante y las dos cosas se escriben
        // juntas, en lugar de dejar una variante que salió y no tiene pieza.
        const composition = await this.#composeVariant(run, brief, plan, image);
        const written = await this.#complete(run, {
          attempts,
          composition,
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
   * Compone la pieza de una variante generada.
   *
   * La base entra embebida con sus bytes: es el único momento en que existen
   * fuera del proveedor, porque el almacenamiento sólo guarda, borra y firma
   * URLs. Lo que devuelve es lo que se escribe junto al resultado.
   */
  async #composeVariant(
    run: GenerationRunRecord,
    brief: ContentBrief,
    plan: Extract<VisualPromptPlan, { kind: "generated" }>,
    image: GeneratedImage,
  ): Promise<GenerationVariantComposition> {
    const base: ComposedBaseImage = {
      bytes: image.bytes,
      height: image.height,
      mimeType: image.mimeType,
      sha256: image.sha256,
      width: image.width,
    };
    const piece = composePiece({
      base,
      brief,
      format: run.format,
      region: plan.reservedSpace,
      slug: compositionSlug(run.id),
    });

    return this.#renderAndStore(run, piece);
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
   *
   * La organización entra en la derivación porque `media_assets.id` es clave
   * primaria global: sin ella, dos organizaciones que generaran una imagen de
   * bytes idénticos derivarían el mismo identificador y la segunda chocaría
   * contra el activo de la primera. La comprobación de propiedad del ciclo de
   * medios lo rechazaría —no hay filtración— pero convertiría en un fallo lo que
   * debería ser un activo propio, y acopla dos organizaciones que no se conocen.
   */
  async #store(
    run: GenerationRunRecord,
    image: GeneratedImage,
  ): Promise<string> {
    const mediaAssetId = deterministicMediaId(
      "generated-variant",
      `${run.organizationId}:${image.sha256}`,
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
