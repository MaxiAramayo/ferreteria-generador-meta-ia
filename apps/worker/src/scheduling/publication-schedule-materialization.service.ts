import {
  publicationScheduleMaterializationBatchMaximum,
  type PublicationScheduleMaterializationRepository,
} from "@aramayo/domain";

export class PublicationScheduleMaterializationService {
  readonly #repository: PublicationScheduleMaterializationRepository;

  constructor(repository: PublicationScheduleMaterializationRepository) {
    this.#repository = repository;
  }

  materialize(
    at: Date,
    limit: number,
  ): Promise<
    Readonly<{
      completed: number;
      created: number;
      expired: number;
      reviewed: number;
    }>
  > {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > publicationScheduleMaterializationBatchMaximum
    ) {
      throw new RangeError(
        `El límite debe estar entre 1 y ${String(publicationScheduleMaterializationBatchMaximum)}.`,
      );
    }
    return this.#repository.materializeDue({ at: at.toISOString(), limit });
  }
}
