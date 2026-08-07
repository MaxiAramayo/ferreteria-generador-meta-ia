/**
 * Vertical síncrona del lote de generación.
 *
 * La API no genera: reserva el lote con sus variantes, encola su evento y
 * responde. La organización y la membresía salen de la sesión, nunca del body,
 * así que un pedido no puede alcanzar el brief ni los activos de otra
 * organización aunque lo intente.
 *
 * Pedir, generar, seleccionar, aprobar y publicar siguen siendo acciones
 * distintas: ninguna de estas rutas dispara la siguiente de forma implícita.
 */

import { randomUUID } from "node:crypto";

import type {
  GenerationRunAcceptedResponse,
  GenerationRunCancellationResponse,
  GenerationRunListResponse,
  GenerationRunResponse,
  GenerationVariantSelectionResponse,
  GenerationPreflightResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  generationEditKinds,
  generationEditNeedsFactualRevalidation,
  generationRunLimits,
  generationRunProgress,
  generationImageModel,
  imageSizeForFormat,
  visualFormatIds,
  visualSubjectKinds,
  type AuthenticatedActor,
  type ContentBriefRunRepository,
  type ContentBriefRunRecord,
  type GenerationRunRecord,
  type GenerationRunEditorialRepository,
  type GenerationRunRepository,
  type GenerationPolicyRepository,
  type GenerationRunRequestRepository,
  type GenerationEditKind,
  type MediaAssetRepository,
  type VisualFormatId,
  type VisualSubjectKind,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import {
  CONTENT_BRIEF_RUN_REPOSITORY,
  GENERATION_RUN_REQUEST_REPOSITORY,
  GENERATION_RUN_REPOSITORY,
  GENERATION_RUN_EDITORIAL_REPOSITORY,
  GENERATION_POLICY_REPOSITORY,
  MEDIA_ASSET_REPOSITORY,
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

export interface RequestGenerationEditCommand {
  readonly contentBriefRunId?: string;
  readonly instruction: string;
  readonly kind: string;
  readonly parentVariantId: string;
  readonly variants?: number;
}

/**
 * Proyección pública. El hash del prompt y el detalle interno de cada fallo
 * quedan en el historial pero no salen por la API: no le sirven a quien revisa
 * y el detalle del proveedor puede traer el prompt reflejado.
 */
function toResponse(
  record: GenerationRunRecord,
  previewUrls: ReadonlyMap<string, string>,
): GenerationRunResponse {
  return {
    cancelledAt: record.cancelledAt,
    completedAt: record.completedAt,
    contentBriefRunId: record.contentBriefRunId,
    format: record.format,
    id: record.id,
    edit: record.edit === null ? null : { ...record.edit },
    lineageRootId: record.lineageRootId,
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
    selectedAt: record.selectedAt,
    selectedByMembershipId: record.selectedByMembershipId,
    selectedVariantId: record.selectedVariantId,
    selectionVersion: record.selectionVersion,
    subjectKind: record.subjectKind,
    usage: {
      cost: { ...record.cost },
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
              previewUrl:
                previewUrls.get(variant.composition.mediaAssetId) ?? "",
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
  readonly #editorial: GenerationRunEditorialRepository;
  readonly #media: MediaAssetRepository;
  readonly #reliableOperations: ReliableOperationService;
  readonly #requests: GenerationRunRequestRepository;
  readonly #runs: GenerationRunRepository;
  readonly #policies: GenerationPolicyRepository | null;

  constructor(
    @Inject(GENERATION_RUN_REQUEST_REPOSITORY)
    requests: GenerationRunRequestRepository,
    @Inject(GENERATION_RUN_REPOSITORY)
    runs: GenerationRunRepository,
    @Inject(GENERATION_RUN_EDITORIAL_REPOSITORY)
    editorial: GenerationRunEditorialRepository,
    @Inject(CONTENT_BRIEF_RUN_REPOSITORY)
    briefs: ContentBriefRunRepository,
    @Inject(MEDIA_ASSET_REPOSITORY)
    media: MediaAssetRepository,
    reliableOperations: ReliableOperationService,
    @Optional()
    @Inject(GENERATION_POLICY_REPOSITORY)
    policies: GenerationPolicyRepository | null,
  ) {
    this.#briefs = briefs;
    this.#editorial = editorial;
    this.#media = media;
    this.#reliableOperations = reliableOperations;
    this.#requests = requests;
    this.#runs = runs;
    this.#policies = policies ?? null;
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
      edit: null,
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
        return Object.freeze({
          admission: result.admission,
          runId: result.runId,
          status: "pending",
        });
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

  async preflight(
    actor: AuthenticatedActor,
    command: RequestGenerationRunCommand,
  ): Promise<GenerationPreflightResponse> {
    this.#require(actor, "content:edit");
    const format = this.#format(command.format);
    this.#subjectKind(command.subjectKind);
    const variants = this.#variants(command.variants);
    await this.#requireBrief(actor, command.contentBriefRunId);
    if (this.#policies === null) {
      throw new Error(
        "El repositorio de política de generación no está disponible.",
      );
    }
    const result = await this.#policies.preflight({
      actorMembershipId: actor.membershipId,
      at: new Date().toISOString(),
      organizationId: actor.organizationId,
      quality: "medium",
      size: imageSizeForFormat(format),
      variants,
    });
    if (result === null) {
      return {
        admission: { mode: "deterministic", reason: "generation-disabled" },
        model: generationImageModel,
        quality: "medium",
        size: imageSizeForFormat(format),
        usage: {
          alertActive: false,
          committedMicrousd: 0,
          monthUtc: new Date().toISOString().slice(0, 7),
          monthlyBudgetMicrousd: 0,
          organizationAttemptsRemaining: 0,
          reservedMicrousd: 0,
          settledMicrousd: 0,
          unconfirmedMicrousd: 0,
          userAttemptsRemaining: 0,
        },
        variants,
      };
    }
    return result;
  }

  async requestEdit(
    actor: AuthenticatedActor,
    parentRunId: string,
    command: RequestGenerationEditCommand,
    idempotencyKey?: string,
  ): Promise<GenerationRunAcceptedResponse> {
    this.#require(actor, "content:edit");
    const kind = this.#editKind(command.kind);
    const instruction = command.instruction.replaceAll(/\s+/gu, " ").trim();
    if (
      instruction.length < generationRunLimits.editInstructionMinimum ||
      instruction.length > generationRunLimits.editInstructionMaximum
    ) {
      throw new BadRequestException(
        `La instrucción debe tener entre ${String(generationRunLimits.editInstructionMinimum)} y ${String(generationRunLimits.editInstructionMaximum)} caracteres.`,
      );
    }
    if (
      kind === "visual" &&
      generationEditNeedsFactualRevalidation(instruction)
    ) {
      throw new ConflictException(
        "Ese cambio afecta hechos comerciales. Revalidá el brief antes de generar otra pieza.",
      );
    }

    const parent = await this.#runs.findById({
      id: parentRunId,
      organizationId: actor.organizationId,
    });
    if (parent === null) {
      throw new NotFoundException("El lote de generación no existe.");
    }
    const parentVariant = parent.variants.find(
      (variant) => variant.id === command.parentVariantId,
    );
    if (
      parent.status !== "completed" ||
      parentVariant?.status !== "succeeded"
    ) {
      throw new ConflictException(
        "Sólo se puede editar una variante terminada y disponible.",
      );
    }
    if (
      kind === "visual" &&
      (parentVariant.source !== "generated" ||
        parentVariant.mediaAssetId === null)
    ) {
      throw new ConflictException(
        "La variante no conserva una base generada que se pueda editar.",
      );
    }

    let contentBriefRunId = parent.contentBriefRunId;
    if (kind === "factual") {
      if (
        command.contentBriefRunId === undefined ||
        command.contentBriefRunId === parent.contentBriefRunId
      ) {
        throw new ConflictException(
          "Un cambio factual exige una ejecución nueva de brief con evidencia revalidada.",
        );
      }
      const revalidated = await this.#requireBrief(
        actor,
        command.contentBriefRunId,
      );
      if (
        Date.parse(revalidated.requestedAt) <= Date.parse(parent.requestedAt)
      ) {
        throw new ConflictException(
          "El brief revalidado debe ser posterior a la pieza que se está editando.",
        );
      }
      contentBriefRunId = revalidated.id;
    } else if (command.contentBriefRunId !== undefined) {
      throw new BadRequestException(
        "Una edición visual conserva el brief original y no acepta otro brief.",
      );
    }

    const variants = this.#variants(command.variants);
    const requestedAt = new Date();
    const runId = randomUUID();
    const reliableOperation = this.#prepare(
      actor,
      "content.generation:edit",
      idempotencyKey,
      {
        contentBriefRunId,
        instruction,
        kind,
        parentRunId,
        parentVariantId: command.parentVariantId,
        variants,
      },
      requestedAt,
    );
    const result = await this.#editorial.requestEdit({
      actorMembershipId: actor.membershipId,
      contentBriefRunId,
      edit: {
        instruction,
        kind,
        parentRunId,
        parentVariantId: command.parentVariantId,
      },
      format: parent.format,
      id: runId,
      organizationId: actor.organizationId,
      reliableOperation,
      requestedAt: requestedAt.toISOString(),
      subjectKind: parent.subjectKind,
      variantIds: Array.from({ length: variants }, () => randomUUID()),
    });
    switch (result.status) {
      case "accepted":
        return {
          admission: result.admission,
          runId: result.runId,
          status: "pending",
        };
      case "idempotency-conflict":
        throw new ConflictException(
          "La edición cambió o su variante de origen ya no está disponible.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma edición todavía está en curso.",
          retryAfter: result.retryAfter,
        });
    }
  }

  async selectVariant(
    actor: AuthenticatedActor,
    runId: string,
    command: Readonly<{
      expectedSelectionVersion: number;
      variantId: string;
    }>,
    idempotencyKey?: string,
  ): Promise<GenerationVariantSelectionResponse> {
    this.#require(actor, "content:edit");
    const selectedAt = new Date();
    const result = await this.#editorial.selectVariant({
      actorMembershipId: actor.membershipId,
      expectedSelectionVersion: command.expectedSelectionVersion,
      organizationId: actor.organizationId,
      reliableOperation: this.#prepare(
        actor,
        "content.generation:select-variant",
        idempotencyKey,
        { ...command, runId },
        selectedAt,
      ),
      runId,
      selectedAt: selectedAt.toISOString(),
      variantId: command.variantId,
    });
    switch (result.status) {
      case "selected":
        return {
          runId,
          selectedVariantId: result.selectedVariantId,
          selectionVersion: result.selectionVersion,
        };
      case "not-found":
        throw new NotFoundException("El lote de generación no existe.");
      case "variant-unavailable":
        throw new ConflictException(
          "La variante no está disponible para seleccionar.",
        );
      case "version-conflict":
        throw new ConflictException({
          currentSelectionVersion: result.selectionVersion,
          message:
            "La selección cambió en otra sesión. Actualizá el historial.",
        });
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra selección.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma selección todavía está en curso.",
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
    return this.#toResponse(record);
  }

  async list(
    actor: AuthenticatedActor,
    filter: Readonly<{
      contentBriefRunId?: string;
      lineageRootId?: string;
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
      ...(filter.lineageRootId === undefined
        ? {}
        : { lineageRootId: filter.lineageRootId }),
      limit,
      organizationId: actor.organizationId,
      page,
    });
    return {
      items: await this.#toResponses(history.items),
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
  ): Promise<ContentBriefRunRecord> {
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
    return briefRun;
  }

  #editKind(value: string): GenerationEditKind {
    const kind = generationEditKinds.find((candidate) => candidate === value);
    if (kind === undefined) {
      throw new BadRequestException("El tipo de cambio no es válido.");
    }
    return kind;
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

  #variants(value: number | undefined): number {
    const variants = value ?? defaultVariants;
    if (
      !Number.isInteger(variants) ||
      variants < generationRunLimits.variantsMinimum ||
      variants > generationRunLimits.variantsMaximum
    ) {
      throw new BadRequestException(
        `El lote admite entre ${String(generationRunLimits.variantsMinimum)} y ${String(generationRunLimits.variantsMaximum)} variantes.`,
      );
    }
    return variants;
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

  async #toResponse(
    record: GenerationRunRecord,
  ): Promise<GenerationRunResponse> {
    const [response] = await this.#toResponses([record]);
    if (response === undefined) {
      throw new InternalServerErrorException(
        "No se pudo proyectar el lote de generación.",
      );
    }
    return response;
  }

  async #toResponses(
    records: readonly GenerationRunRecord[],
  ): Promise<readonly GenerationRunResponse[]> {
    const mediaAssetIds = records.flatMap((record) =>
      record.variants.flatMap((variant) =>
        variant.composition === null ? [] : [variant.composition.mediaAssetId],
      ),
    );
    const uniqueMediaAssetIds = [...new Set(mediaAssetIds)];
    const assets =
      uniqueMediaAssetIds.length === 0
        ? []
        : await this.#media.findAvailableByIds(
            { organizationId: records[0]?.organizationId ?? "" },
            uniqueMediaAssetIds,
          );
    const previewUrls = new Map<string, string>();
    for (const asset of assets) {
      if (asset.secureUrl !== undefined)
        previewUrls.set(asset.id, asset.secureUrl);
    }
    if (previewUrls.size !== uniqueMediaAssetIds.length) {
      throw new InternalServerErrorException(
        "Una pieza generada no conserva un medio disponible para previsualizar.",
      );
    }
    return records.map((record) => toResponse(record, previewUrls));
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
