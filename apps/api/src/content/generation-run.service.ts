/**
 * Vertical síncrona del lote de generación.
 *
 * La API no genera: reserva el lote con sus variantes, encola su evento y
 * responde. La organización y la membresía salen de la sesión, nunca del body,
 * así que un pedido no puede alcanzar el brief ni los activos de otra
 * organización aunque lo intente.
 *
 * Pedir, generar, aceptar y publicar siguen siendo acciones distintas: aceptar
 * una variante es de `P4-T06` y ninguna de estas rutas la dispara.
 */

import { randomUUID } from "node:crypto";

import type {
  GenerationRunAcceptedResponse,
  GenerationRunCancellationResponse,
  GenerationRunListResponse,
  GenerationRunResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  generationRunLimits,
  generationRunProgress,
  visualFormatIds,
  visualSubjectKinds,
  type AuthenticatedActor,
  type ContentBriefRunRepository,
  type GenerationRunRecord,
  type GenerationRunRepository,
  type GenerationRunRequestRepository,
  type VisualFormatId,
  type VisualSubjectKind,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import {
  CONTENT_BRIEF_RUN_REPOSITORY,
  GENERATION_RUN_REQUEST_REPOSITORY,
  GENERATION_RUN_REPOSITORY,
} from "../database/database.tokens.ts";

export const generationRunHistoryLimits = Object.freeze({
  defaultLimit: 20,
  maximumLimit: 50,
});

/** Cuántas variantes se piden cuando el pedido no lo dice. */
const defaultVariants = 2;

export interface RequestGenerationRunCommand {
  readonly contentBriefRunId: string;
  readonly format?: string;
  readonly subjectKind?: string;
  readonly variants?: number;
}

/**
 * Proyección pública. El hash del prompt y el detalle interno de cada fallo
 * quedan en el historial pero no salen por la API: no le sirven a quien revisa
 * y el detalle del proveedor puede traer el prompt reflejado.
 */
function toResponse(record: GenerationRunRecord): GenerationRunResponse {
  return {
    cancelledAt: record.cancelledAt,
    completedAt: record.completedAt,
    contentBriefRunId: record.contentBriefRunId,
    format: record.format,
    id: record.id,
    plan:
      record.plan === null
        ? null
        : {
            format: record.plan.format,
            profileId: record.plan.profileId,
            profileVersion: record.plan.profileVersion,
            promptVersion: record.plan.promptVersion,
          },
    progress: { ...generationRunProgress(record.variants) },
    requestedAt: record.requestedAt,
    resolution:
      record.resolution === null
        ? null
        : {
            deterministicReason: record.resolution.deterministicReason,
            detail: record.resolution.detail,
          },
    startedAt: record.startedAt,
    status: record.status,
    subjectKind: record.subjectKind,
    usage: {
      estimatedCostUsd: record.estimatedCostUsd,
      totalTokens: record.totalTokens,
    },
    variants: record.variants.map((variant) => ({
      composition:
        variant.composition === null
          ? null
          : {
              compositionHash: variant.composition.compositionHash,
              height: variant.composition.height,
              layout: variant.composition.layout,
              mediaAssetId: variant.composition.mediaAssetId,
              theme: variant.composition.theme,
              version: variant.composition.version,
              width: variant.composition.width,
            },
      failure:
        variant.failure === null
          ? null
          : {
              code: variant.failure.code,
              correction: variant.failure.correction,
            },
      height: variant.height,
      id: variant.id,
      index: variant.index,
      mediaAssetId: variant.mediaAssetId,
      source: variant.source,
      status: variant.status,
      width: variant.width,
    })),
  };
}

@Injectable()
export class GenerationRunService {
  readonly #briefs: ContentBriefRunRepository;
  readonly #reliableOperations: ReliableOperationService;
  readonly #requests: GenerationRunRequestRepository;
  readonly #runs: GenerationRunRepository;

  constructor(
    @Inject(GENERATION_RUN_REQUEST_REPOSITORY)
    requests: GenerationRunRequestRepository,
    @Inject(GENERATION_RUN_REPOSITORY)
    runs: GenerationRunRepository,
    @Inject(CONTENT_BRIEF_RUN_REPOSITORY)
    briefs: ContentBriefRunRepository,
    reliableOperations: ReliableOperationService,
  ) {
    this.#briefs = briefs;
    this.#reliableOperations = reliableOperations;
    this.#requests = requests;
    this.#runs = runs;
  }

  async request(
    actor: AuthenticatedActor,
    command: RequestGenerationRunCommand,
    idempotencyKey?: string,
  ): Promise<GenerationRunAcceptedResponse> {
    this.#require(actor, "content:edit");
    const format = this.#format(command.format);
    const subjectKind = this.#subjectKind(command.subjectKind);
    const variants = command.variants ?? defaultVariants;
    if (
      !Number.isInteger(variants) ||
      variants < generationRunLimits.variantsMinimum ||
      variants > generationRunLimits.variantsMaximum
    ) {
      throw new BadRequestException(
        `El lote admite entre ${String(generationRunLimits.variantsMinimum)} y ${String(generationRunLimits.variantsMaximum)} variantes.`,
      );
    }

    // El brief se resuelve acá y no dentro de la transacción: una ejecución
    // ajena o inexistente responde 404 en lugar de romper contra la clave
    // foránea, y una que no produjo brief no llega a gastar un lote.
    await this.#requireBrief(actor, command.contentBriefRunId);

    const runId = randomUUID();
    const requestedAt = new Date();
    const reliableOperation = this.#prepare(
      actor,
      "content.generation:request",
      idempotencyKey,
      {
        contentBriefRunId: command.contentBriefRunId,
        format,
        subjectKind,
        variants,
      },
      requestedAt,
    );

    const result = await this.#requests.request({
      actorMembershipId: actor.membershipId,
      contentBriefRunId: command.contentBriefRunId,
      format,
      id: runId,
      organizationId: actor.organizationId,
      reliableOperation,
      requestedAt: requestedAt.toISOString(),
      subjectKind,
      variantIds: Array.from({ length: variants }, () => randomUUID()),
    });

    switch (result.status) {
      case "accepted":
        return Object.freeze({ runId: result.runId, status: "pending" });
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otro pedido.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "El mismo pedido todavía está en curso.",
          retryAfter: result.retryAfter,
        });
    }
  }

  async findById(
    actor: AuthenticatedActor,
    runId: string,
  ): Promise<GenerationRunResponse> {
    this.#require(actor, "content:read");
    const record = await this.#runs.findById({
      id: runId,
      organizationId: actor.organizationId,
    });
    if (record === null) {
      throw new NotFoundException("El lote de generación no existe.");
    }
    return toResponse(record);
  }

  async list(
    actor: AuthenticatedActor,
    filter: Readonly<{
      contentBriefRunId?: string;
      limit?: number;
      mine?: boolean;
      page?: number;
    }>,
  ): Promise<GenerationRunListResponse> {
    this.#require(actor, "content:read");
    const limit = Math.min(
      Math.max(filter.limit ?? generationRunHistoryLimits.defaultLimit, 1),
      generationRunHistoryLimits.maximumLimit,
    );
    const page = Math.max(filter.page ?? 1, 1);
    const history = await this.#runs.list({
      ...(filter.mine === true
        ? { actorMembershipId: actor.membershipId }
        : {}),
      ...(filter.contentBriefRunId === undefined
        ? {}
        : { contentBriefRunId: filter.contentBriefRunId }),
      limit,
      organizationId: actor.organizationId,
      page,
    });
    return {
      items: history.items.map(toResponse),
      limit: history.limit,
      page: history.page,
      total: history.total,
    };
  }

  /**
   * Cancelar es idempotente hacia el editor: si el lote ya se resolvió, la
   * respuesta informa el estado real en lugar de fallar. Lo que nunca ocurre es
   * que una cancelación revierta variantes ya confirmadas.
   */
  async cancel(
    actor: AuthenticatedActor,
    runId: string,
  ): Promise<GenerationRunCancellationResponse> {
    this.#require(actor, "content:edit");
    const outcome = await this.#runs.cancel({
      cancelledAt: new Date().toISOString(),
      id: runId,
      organizationId: actor.organizationId,
    });
    switch (outcome.status) {
      case "cancelled":
        return Object.freeze({ runId, status: "cancelled" });
      case "already-resolved":
        return Object.freeze({ runId, status: outcome.resolvedStatus });
      case "not-found":
        throw new NotFoundException("El lote de generación no existe.");
    }
  }

  /**
   * Un lote ilustra un brief que existe y produjo contenido.
   *
   * Sin esta comprobación, pedir sobre una ejecución pendiente o rechazada
   * reservaría un lote que el worker sólo puede cerrar como fallido, después de
   * haber ocupado la cola.
   */
  async #requireBrief(
    actor: AuthenticatedActor,
    contentBriefRunId: string,
  ): Promise<void> {
    const briefRun = await this.#briefs.findById({
      id: contentBriefRunId,
      organizationId: actor.organizationId,
    });
    if (briefRun === null) {
      throw new NotFoundException("La ejecución de brief no existe.");
    }
    if (briefRun.status !== "generated" || briefRun.brief === null) {
      throw new ConflictException(
        "La ejecución de brief no produjo un brief que se pueda ilustrar.",
      );
    }
  }

  #format(value: string | undefined): VisualFormatId {
    if (value === undefined) {
      return "feed";
    }
    const format = visualFormatIds.find((candidate) => candidate === value);
    if (format === undefined) {
      throw new BadRequestException("El formato pedido no está aprobado.");
    }
    return format;
  }

  #subjectKind(value: string | undefined): VisualSubjectKind {
    if (value === undefined) {
      return "branded";
    }
    const subjectKind = visualSubjectKinds.find(
      (candidate) => candidate === value,
    );
    if (subjectKind === undefined) {
      throw new BadRequestException("El tipo de sujeto no es válido.");
    }
    return subjectKind;
  }

  #prepare(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string | undefined,
    payload: Readonly<Record<string, unknown>>,
    at: Date,
  ): ReturnType<ReliableOperationService["prepare"]> {
    if (idempotencyKey === undefined) {
      throw new BadRequestException("Falta la cabecera idempotency-key.");
    }
    try {
      return this.#reliableOperations.prepare(
        actor,
        operation,
        idempotencyKey,
        payload,
        at,
      );
    } catch (cause: unknown) {
      // Sólo un valor mal formado es culpa de quien pide. Cualquier otra falla
      // es nuestra y debe subir como tal en lugar de disfrazarse de 400.
      if (cause instanceof RangeError || cause instanceof TypeError) {
        throw new BadRequestException(
          "La cabecera idempotency-key o el pedido no son válidos.",
        );
      }
      throw cause;
    }
  }

  #require(
    actor: AuthenticatedActor,
    permission: "content:edit" | "content:read",
  ): void {
    const decision = authorizeActor(actor, permission, actor.organizationId);
    if (!decision.allowed) {
      throw new ForbiddenException("La sesión no habilita esta acción.");
    }
  }
}
