/**
 * Lote de generación en memoria.
 *
 * Implementa el mismo contrato que el repositorio de producción —incluidas la
 * regla de cancelación y la de variante ya resuelta— para que las pruebas no se
 * apoyen en un doble más permisivo que el sistema real. Es el mismo criterio que
 * siguió el historial de briefs.
 */

import {
  isGenerationRunResolved,
  type GenerationRunCancellationOutcome,
  type GenerationRunCompletion,
  type GenerationRunListFilter,
  type GenerationRunRecord,
  type GenerationRunRepository,
  type GenerationRunReservation,
  type GenerationRunWriteOutcome,
  type GenerationDeterministicVariantWrite,
  type GenerationVariantCompletion,
  type GenerationVariantRecord,
  type OrganizationScope,
  type PaginatedRecords,
} from "@aramayo/domain";

/** Estados en los que el lote todavía admite escrituras del worker. */
function isOpen(run: GenerationRunRecord): boolean {
  return run.status === "pending" || run.status === "running";
}

export class InMemoryGenerationRunRepository implements GenerationRunRepository {
  readonly #runs = new Map<string, GenerationRunRecord>();

  get records(): readonly GenerationRunRecord[] {
    return [...this.#runs.values()];
  }

  reserve(reservation: GenerationRunReservation): Promise<void> {
    this.#runs.set(reservation.id, {
      ...reservation,
      cancelledAt: null,
      completedAt: null,
      estimatedCostUsd: null,
      plan: null,
      resolution: null,
      startedAt: null,
      status: "pending",
      totalTokens: 0,
      variants: reservation.variantIds.map((id, index) => ({
        attempts: 0,
        completedAt: null,
        failure: null,
        height: null,
        id,
        index,
        latencyMilliseconds: 0,
        composition: null,
        mediaAssetId: null,
        model: null,
        requestId: null,
        sha256: null,
        source: "generated" as const,
        status: "pending" as const,
        width: null,
      })),
    });
    return Promise.resolve();
  }

  start(input: {
    readonly id: string;
    readonly organizationId: string;
    readonly startedAt: string;
  }): Promise<GenerationRunWriteOutcome> {
    const existing = this.#find(input.id, input.organizationId);
    if (existing === null) {
      return Promise.resolve({ status: "not-found" });
    }
    if (existing.status !== "pending") {
      return Promise.resolve(this.#refuse(existing));
    }
    this.#runs.set(input.id, {
      ...existing,
      startedAt: input.startedAt,
      status: "running",
    });
    return Promise.resolve({ status: "written" });
  }

  completeVariant(
    completion: GenerationVariantCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const existing = this.#find(completion.runId, completion.organizationId);
    if (existing === null) {
      return Promise.resolve({ status: "not-found" });
    }
    if (!isOpen(existing)) {
      return Promise.resolve(this.#refuse(existing));
    }
    const target = existing.variants.find(
      (variant) => variant.id === completion.variantId,
    );
    if (target === undefined || target.status !== "pending") {
      return Promise.resolve({ reason: "not-open", status: "discarded" });
    }
    this.#runs.set(existing.id, {
      ...existing,
      variants: existing.variants.map((variant) =>
        variant.id === completion.variantId
          ? applyVariant(variant, completion, completedAt)
          : variant,
      ),
    });
    return Promise.resolve({ status: "written" });
  }

  /**
   * Resuelve una variante que no gastó proveedor: la pieza sale del motor de
   * marca y se escribe junto con su composición.
   */
  completeDeterministicVariant(
    write: GenerationDeterministicVariantWrite,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const existing = this.#find(write.runId, write.organizationId);
    if (existing === null) {
      return Promise.resolve({ status: "not-found" });
    }
    if (!isOpen(existing)) {
      return Promise.resolve(this.#refuse(existing));
    }
    const target = existing.variants.find(
      (variant) => variant.id === write.variantId,
    );
    if (target === undefined || target.status !== "pending") {
      return Promise.resolve({ reason: "not-open", status: "discarded" });
    }
    this.#runs.set(existing.id, {
      ...existing,
      variants: existing.variants.map((variant) =>
        variant.id === write.variantId
          ? {
              ...variant,
              completedAt,
              composition: write.composition,
              source: "deterministic" as const,
              status: "succeeded" as const,
            }
          : variant,
      ),
    });
    return Promise.resolve({ status: "written" });
  }

  /** Cierra como descartadas las variantes que nunca se intentaron. */
  discardPendingVariants(input: {
    readonly discardedAt: string;
    readonly organizationId: string;
    readonly runId: string;
  }): Promise<void> {
    const existing = this.#find(input.runId, input.organizationId);
    if (existing === null) {
      return Promise.resolve();
    }
    this.#runs.set(existing.id, {
      ...existing,
      variants: existing.variants.map((variant) =>
        variant.status === "pending"
          ? {
              ...variant,
              completedAt: input.discardedAt,
              status: "discarded" as const,
            }
          : variant,
      ),
    });
    return Promise.resolve();
  }

  complete(
    completion: GenerationRunCompletion,
    completedAt: string,
  ): Promise<GenerationRunWriteOutcome> {
    const existing = this.#find(completion.id, completion.organizationId);
    if (existing === null) {
      return Promise.resolve({ status: "not-found" });
    }
    if (!isOpen(existing)) {
      return Promise.resolve(this.#refuse(existing));
    }
    this.#runs.set(existing.id, {
      ...existing,
      completedAt,
      estimatedCostUsd: completion.estimatedCostUsd,
      plan: completion.plan,
      resolution: completion.resolution,
      status: completion.status,
      totalTokens: completion.totalTokens,
      variants: existing.variants.map((variant) =>
        variant.status === "pending"
          ? { ...variant, completedAt, status: "discarded" as const }
          : variant,
      ),
    });
    return Promise.resolve({ status: "written" });
  }

  cancel(input: {
    readonly cancelledAt: string;
    readonly id: string;
    readonly organizationId: string;
  }): Promise<GenerationRunCancellationOutcome> {
    const existing = this.#find(input.id, input.organizationId);
    if (existing === null) {
      return Promise.resolve({ status: "not-found" });
    }
    if (!isOpen(existing)) {
      return Promise.resolve({
        resolvedStatus: existing.status,
        status: "already-resolved",
      });
    }
    this.#runs.set(input.id, {
      ...existing,
      cancelledAt: input.cancelledAt,
      status: "cancelled",
      variants: existing.variants.map((variant) =>
        variant.status === "pending"
          ? {
              ...variant,
              completedAt: input.cancelledAt,
              status: "discarded" as const,
            }
          : variant,
      ),
    });
    return Promise.resolve({ status: "cancelled" });
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<GenerationRunRecord | null> {
    return Promise.resolve(this.#find(scope.id, scope.organizationId));
  }

  list(
    filter: GenerationRunListFilter,
  ): Promise<PaginatedRecords<GenerationRunRecord>> {
    const matching = [...this.#runs.values()]
      .filter(
        (run) =>
          run.organizationId === filter.organizationId &&
          (filter.actorMembershipId === undefined ||
            run.actorMembershipId === filter.actorMembershipId) &&
          (filter.contentBriefRunId === undefined ||
            run.contentBriefRunId === filter.contentBriefRunId),
      )
      .toSorted((left, right) =>
        right.requestedAt.localeCompare(left.requestedAt),
      );
    const offset = (filter.page - 1) * filter.limit;
    return Promise.resolve({
      items: matching.slice(offset, offset + filter.limit),
      limit: filter.limit,
      page: filter.page,
      total: matching.length,
    });
  }

  #find(id: string, organizationId: string): GenerationRunRecord | null {
    const existing = this.#runs.get(id);
    return existing === undefined || existing.organizationId !== organizationId
      ? null
      : existing;
  }

  #refuse(run: GenerationRunRecord): GenerationRunWriteOutcome {
    return {
      reason: run.status === "cancelled" ? "cancelled" : "not-open",
      status: "discarded",
    };
  }
}

function applyVariant(
  variant: GenerationVariantRecord,
  completion: GenerationVariantCompletion,
  completedAt: string,
): GenerationVariantRecord {
  const shared = {
    ...variant,
    attempts: completion.attempts,
    completedAt,
    latencyMilliseconds: completion.latencyMilliseconds,
    requestId: completion.requestId,
  };
  if (completion.status === "succeeded") {
    return {
      ...shared,
      composition: completion.composition,
      failure: null,
      height: completion.height,
      mediaAssetId: completion.mediaAssetId,
      model: completion.model,
      sha256: completion.sha256,
      status: "succeeded",
      width: completion.width,
    };
  }
  return { ...shared, failure: completion.failure, status: "failed" };
}

/** Reexportado para que las pruebas afirmen sobre estados terminales. */
export { isGenerationRunResolved };
