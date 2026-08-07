import type { GenerationPolicyResponse } from "@aramayo/contracts";
import {
  authorizeActor,
  GenerationPolicyValidationError,
  normalizeGenerationPolicyUpdate,
  type AuthenticatedActor,
  type GenerationPolicyRepository,
  type UpdateGenerationPolicyCommand,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { GENERATION_POLICY_REPOSITORY } from "../database/database.tokens.ts";

@Injectable()
export class GenerationPolicyService {
  readonly #repository: GenerationPolicyRepository;

  constructor(
    @Inject(GENERATION_POLICY_REPOSITORY)
    repository: GenerationPolicyRepository,
  ) {
    this.#repository = repository;
  }

  async read(actor: AuthenticatedActor): Promise<GenerationPolicyResponse> {
    this.#requireAdmin(actor);
    const snapshot = await this.#repository.find({
      actorMembershipId: actor.membershipId,
      at: new Date().toISOString(),
      organizationId: actor.organizationId,
    });
    if (snapshot === null) {
      throw new NotFoundException(
        "La política de generación no está configurada.",
      );
    }
    return { ...snapshot.policy, usage: snapshot.usage };
  }

  async update(
    actor: AuthenticatedActor,
    command: UpdateGenerationPolicyCommand,
  ): Promise<GenerationPolicyResponse> {
    this.#requireAdmin(actor);
    let update: UpdateGenerationPolicyCommand;
    try {
      update = normalizeGenerationPolicyUpdate(command);
    } catch (cause: unknown) {
      if (cause instanceof GenerationPolicyValidationError) {
        throw new BadRequestException({
          field: cause.field,
          message: cause.message,
        });
      }
      throw cause;
    }
    const at = new Date().toISOString();
    const result = await this.#repository.update({
      actorMembershipId: actor.membershipId,
      at,
      organizationId: actor.organizationId,
      update,
    });
    if (result.status === "conflict") {
      throw new ConflictException(
        "La política cambió en otra sesión. Recargá antes de guardar.",
      );
    }
    if (result.status === "not-found") {
      throw new NotFoundException(
        "La política de generación no está configurada.",
      );
    }
    const snapshot = await this.#repository.find({
      actorMembershipId: actor.membershipId,
      at,
      organizationId: actor.organizationId,
    });
    if (snapshot === null)
      throw new Error("La política actualizada desapareció.");
    return { ...result.policy, usage: snapshot.usage };
  }

  #requireAdmin(actor: AuthenticatedActor): void {
    const decision = authorizeActor(
      actor,
      "organization:manage",
      actor.organizationId,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(
        "No tenés permisos para administrar la generación.",
      );
    }
  }
}
