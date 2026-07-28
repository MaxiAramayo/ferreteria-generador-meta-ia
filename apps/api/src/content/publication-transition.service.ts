import {
  transitionPublication,
  type PublicationStateRepository,
  type PublicationTransitionCommand,
  type PublicationTransitionResult,
} from "@aramayo/domain";
import { Inject, Injectable } from "@nestjs/common";

import { PUBLICATION_STATE_REPOSITORY } from "../database/database.tokens.ts";

export type ExecutePublicationTransitionResult =
  | PublicationTransitionResult
  | {
      readonly error: {
        readonly code: "not-found";
        readonly message: string;
      };
      readonly ok: false;
    };

@Injectable()
export class PublicationTransitionService {
  readonly #repository: PublicationStateRepository;

  constructor(
    @Inject(PUBLICATION_STATE_REPOSITORY)
    repository: PublicationStateRepository,
  ) {
    this.#repository = repository;
  }

  async execute(
    organizationId: string,
    publicationId: string,
    command: PublicationTransitionCommand,
  ): Promise<ExecutePublicationTransitionResult> {
    const current = await this.#repository.findById(
      organizationId,
      publicationId,
    );
    if (current === null) {
      return Object.freeze({
        error: Object.freeze({
          code: "not-found",
          message: "Publication not found.",
        }),
        ok: false,
      });
    }

    const transition = transitionPublication(current, command);
    if (!transition.ok) {
      return transition;
    }

    const commit = await this.#repository.commit(
      transition.state,
      transition.event,
    );
    if (commit.status === "version-conflict") {
      return Object.freeze({
        error: Object.freeze({
          code: "version-conflict",
          message: "The publication changed before this command was committed.",
        }),
        ok: false,
      });
    }

    return transition;
  }
}
