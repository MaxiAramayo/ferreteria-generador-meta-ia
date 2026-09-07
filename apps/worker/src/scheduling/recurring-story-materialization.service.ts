import type { RecurringStoryMaterializationRepository } from "@aramayo/domain";

export class RecurringStoryMaterializationService {
  readonly #repository: RecurringStoryMaterializationRepository;

  constructor(repository: RecurringStoryMaterializationRepository) {
    this.#repository = repository;
  }

  materialize(
    at: Date,
    limit: number,
  ): Promise<Readonly<{ blocked: number; created: number; reviewed: number }>> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError("El límite debe estar entre 1 y 500.");
    }
    return this.#repository.materializeDue({
      at: at.toISOString(),
      limit,
    });
  }
}
