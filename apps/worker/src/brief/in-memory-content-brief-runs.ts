/**
 * Historial de ejecuciones en memoria.
 *
 * Lo usan las pruebas, el arnés de evaluación y el smoke: los tres necesitan un
 * historial real —con su ciclo de vida y su regla de cancelación— pero ninguno
 * debe escribir en PostgreSQL. Implementa el mismo contrato que el repositorio
 * de producción para que esas rutas no se apoyen en un doble más permisivo.
 */

import type {
  ContentBriefRunCancellationOutcome,
  ContentBriefRunCompletion,
  ContentBriefRunCompletionOutcome,
  ContentBriefRunListFilter,
  ContentBriefRunRecord,
  ContentBriefRunRepository,
  ContentBriefRunReservation,
  OrganizationScope,
  PaginatedRecords,
} from "@aramayo/domain";

export class InMemoryContentBriefRunRepository implements ContentBriefRunRepository {
  readonly #runs = new Map<string, ContentBriefRunRecord>();

  get records(): readonly ContentBriefRunRecord[] {
    return [...this.#runs.values()];
  }

  reserve(reservation: ContentBriefRunReservation): Promise<void> {
    this.#runs.set(reservation.id, {
      ...reservation,
      attempts: 0,
      brief: null,
      cancelledAt: null,
      completedAt: null,
      estimatedCostUsd: null,
      evidence: [],
      knowledgeStatus: "pending",
      latencyMilliseconds: 0,
      model: "unselected",
      rejection: null,
      requestId: null,
      responseId: null,
      status: "pending",
      toolInvocations: [],
      toolNames: [],
      usage: {
        cacheWriteInputTokens: 0,
        cachedInputTokens: 0,
        estimatedCostUsd: null,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
    });
    return Promise.resolve();
  }

  complete(
    completion: ContentBriefRunCompletion,
    completedAt: string,
  ): Promise<ContentBriefRunCompletionOutcome> {
    const existing = this.#runs.get(completion.id);
    if (
      existing === undefined ||
      existing.organizationId !== completion.organizationId
    ) {
      return Promise.resolve({ status: "not-found" });
    }
    if (existing.status !== "pending") {
      return Promise.resolve({
        reason: existing.status === "cancelled" ? "cancelled" : "not-pending",
        status: "discarded",
      });
    }
    this.#runs.set(completion.id, {
      ...existing,
      ...completion,
      completedAt,
    });
    return Promise.resolve({ status: "completed" });
  }

  cancel(input: {
    readonly id: string;
    readonly cancelledAt: string;
    readonly organizationId: string;
  }): Promise<ContentBriefRunCancellationOutcome> {
    const existing = this.#runs.get(input.id);
    if (
      existing === undefined ||
      existing.organizationId !== input.organizationId
    ) {
      return Promise.resolve({ status: "not-found" });
    }
    if (existing.status !== "pending") {
      return Promise.resolve({
        resolvedStatus: existing.status,
        status: "already-resolved",
      });
    }
    this.#runs.set(input.id, {
      ...existing,
      cancelledAt: input.cancelledAt,
      status: "cancelled",
    });
    return Promise.resolve({ status: "cancelled" });
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    const existing = this.#runs.get(scope.id);
    return Promise.resolve(
      existing === undefined || existing.organizationId !== scope.organizationId
        ? null
        : existing,
    );
  }

  list(
    filter: ContentBriefRunListFilter,
  ): Promise<PaginatedRecords<ContentBriefRunRecord>> {
    const matching = [...this.#runs.values()]
      .filter(
        (run) =>
          run.organizationId === filter.organizationId &&
          (filter.actorMembershipId === undefined ||
            run.actorMembershipId === filter.actorMembershipId),
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
}
