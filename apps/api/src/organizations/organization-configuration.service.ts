import {
  authorizeActor,
  ConfigurationValidationError,
  normalizeBrandConfigurationUpdate,
  normalizeLocationConfigurationUpdate,
  type AuthenticatedActor,
  type ConfigurationMutationResult,
  type OrganizationConfiguration,
  type OrganizationConfigurationRepository,
  type OrganizationPermission,
  type UpdateBrandConfigurationCommand,
  type UpdateLocationConfigurationCommand,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { ORGANIZATION_CONFIGURATION_REPOSITORY } from "../database/database.tokens.ts";

@Injectable()
export class OrganizationConfigurationService {
  readonly #repository: OrganizationConfigurationRepository;

  constructor(
    @Inject(ORGANIZATION_CONFIGURATION_REPOSITORY)
    repository: OrganizationConfigurationRepository,
  ) {
    this.#repository = repository;
  }

  async read(actor: AuthenticatedActor): Promise<OrganizationConfiguration> {
    this.#require(actor, "content:read");
    const configuration = await this.#repository.findByOrganizationId(
      actor.organizationId,
    );
    if (configuration === null) {
      throw new NotFoundException(
        "No se encontró la configuración de la organización.",
      );
    }
    return configuration;
  }

  async updateBrand(
    command: UpdateBrandConfigurationCommand,
  ): Promise<OrganizationConfiguration> {
    this.#require(command.actor, "organization:manage");
    try {
      return this.#unwrapMutation(
        await this.#repository.updateBrand({
          actorMembershipId: command.actor.membershipId,
          changedAt: new Date().toISOString(),
          organizationId: command.actor.organizationId,
          update: normalizeBrandConfigurationUpdate(command),
        }),
      );
    } catch (cause: unknown) {
      this.#mapValidationError(cause);
    }
  }

  async updateLocation(
    command: UpdateLocationConfigurationCommand,
  ): Promise<OrganizationConfiguration> {
    this.#require(command.actor, "organization:manage");
    try {
      return this.#unwrapMutation(
        await this.#repository.updateLocation({
          actorMembershipId: command.actor.membershipId,
          changedAt: new Date().toISOString(),
          locationId: command.locationId,
          organizationId: command.actor.organizationId,
          update: normalizeLocationConfigurationUpdate(command),
        }),
      );
    } catch (cause: unknown) {
      this.#mapValidationError(cause);
    }
  }

  #mapValidationError(cause: unknown): never {
    if (cause instanceof ConfigurationValidationError) {
      throw new BadRequestException({
        field: cause.field,
        message: cause.message,
      });
    }
    throw cause;
  }

  #require(
    actor: AuthenticatedActor,
    permission: OrganizationPermission,
  ): void {
    const decision = authorizeActor(actor, permission, actor.organizationId);
    if (!decision.allowed) {
      throw new ForbiddenException(
        "No tenés permisos para realizar esta acción.",
      );
    }
  }

  #unwrapMutation(
    result: ConfigurationMutationResult,
  ): OrganizationConfiguration {
    switch (result.status) {
      case "updated":
        return result.configuration;
      case "conflict":
        throw new ConflictException(
          "La configuración cambió en otra sesión. Recargá antes de guardar.",
        );
      case "not-found":
        throw new NotFoundException(
          "No se encontró la configuración solicitada.",
        );
    }
  }
}
