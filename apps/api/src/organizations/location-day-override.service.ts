import type {
  LocationDayOverrideImpactResponse,
  LocationDayOverrideListResponse,
  LocationDayOverrideMutationResponse,
  LocationDayOverridePreviewResponse,
  LocationDayOverrideResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  ConfigurationValidationError,
  normalizeLocationDayOverrideDeletion,
  normalizeLocationDayOverrideExpectedVersion,
  normalizeLocationDayOverrideRange,
  normalizeLocationDayOverrideUpdate,
  type AuthenticatedActor,
  type DeleteLocationDayOverrideCommand,
  type LocationDayOverride,
  type LocationDayOverrideImpact,
  type LocationDayOverrideRepository,
  type OrganizationPermission,
  type PreviewLocationDayOverrideCommand,
  type UpsertLocationDayOverrideCommand,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { LOCATION_DAY_OVERRIDE_REPOSITORY } from "../database/database.tokens.ts";

function overrideResponse(
  override: LocationDayOverride,
): LocationDayOverrideResponse {
  return override.status === "closed"
    ? Object.freeze({
        id: override.id,
        localDate: override.localDate,
        locationId: override.locationId,
        sourceLabel: override.sourceLabel,
        status: "closed" as const,
        version: override.version,
      })
    : Object.freeze({
        id: override.id,
        localDate: override.localDate,
        locationId: override.locationId,
        openingHours: override.openingHours,
        sourceLabel: override.sourceLabel,
        status: "open" as const,
        version: override.version,
      });
}

function impactResponse(
  impact: LocationDayOverrideImpact,
): LocationDayOverrideImpactResponse {
  return Object.freeze({
    affectedStoryCount: impact.affectedStoryCount,
    localDate: impact.localDate,
    timeZone: impact.timeZone,
    willBlockHoursSensitiveStories: impact.willBlockHoursSensitiveStories,
    willRequireHumanApproval: impact.willRequireHumanApproval,
  });
}

@Injectable()
export class LocationDayOverrideService {
  readonly #repository: LocationDayOverrideRepository;

  constructor(
    @Inject(LOCATION_DAY_OVERRIDE_REPOSITORY)
    repository: LocationDayOverrideRepository,
  ) {
    this.#repository = repository;
  }

  async list(
    actor: AuthenticatedActor,
    locationId: string,
    range: Readonly<{ endDate: string; startDate: string }>,
  ): Promise<LocationDayOverrideListResponse> {
    this.#require(actor, "content:read");
    const normalized = this.#normalize(() =>
      normalizeLocationDayOverrideRange(range.startDate, range.endDate),
    );
    const overrides = await this.#repository.listLocationDayOverrides({
      endDate: normalized.endDate,
      locationId,
      organizationId: actor.organizationId,
      startDate: normalized.startDate,
    });
    if (overrides === null) {
      throw new NotFoundException("No se encontró la sucursal solicitada.");
    }
    return Object.freeze({
      endDate: normalized.endDate,
      locationId,
      overrides: Object.freeze(overrides.map(overrideResponse)),
      startDate: normalized.startDate,
    });
  }

  async preview(
    command: PreviewLocationDayOverrideCommand,
  ): Promise<LocationDayOverridePreviewResponse> {
    this.#require(command.actor, "organization:manage");
    const update = this.#normalize(() =>
      normalizeLocationDayOverrideUpdate(command),
    );
    const result = await this.#repository.previewLocationDayOverride({
      changedAt: new Date().toISOString(),
      locationId: command.locationId,
      organizationId: command.actor.organizationId,
      update,
    });
    if (result.status === "not-found") {
      throw new NotFoundException("No se encontró la sucursal solicitada.");
    }
    return Object.freeze({ impact: impactResponse(result.impact) });
  }

  async upsert(
    command: UpsertLocationDayOverrideCommand,
  ): Promise<LocationDayOverrideMutationResponse> {
    this.#require(command.actor, "organization:manage");
    const update = this.#normalize(() =>
      normalizeLocationDayOverrideUpdate(command),
    );
    const expectedVersion = this.#normalize(() =>
      normalizeLocationDayOverrideExpectedVersion(command),
    );
    const result = await this.#repository.upsertLocationDayOverride({
      actorMembershipId: command.actor.membershipId,
      changedAt: new Date().toISOString(),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
      locationId: command.locationId,
      organizationId: command.actor.organizationId,
      update,
    });
    switch (result.status) {
      case "updated":
        return Object.freeze({
          impact: impactResponse(result.impact),
          override: overrideResponse(result.override),
        });
      case "conflict":
        throw new ConflictException(
          "La excepción cambió en otra sesión. Recargá antes de guardar.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la sucursal solicitada.");
    }
  }

  async remove(
    command: DeleteLocationDayOverrideCommand,
  ): Promise<LocationDayOverrideMutationResponse> {
    this.#require(command.actor, "organization:manage");
    const deletion = this.#normalize(() =>
      normalizeLocationDayOverrideDeletion(command),
    );
    const result = await this.#repository.deleteLocationDayOverride({
      actorMembershipId: command.actor.membershipId,
      changedAt: new Date().toISOString(),
      expectedVersion: deletion.expectedVersion,
      localDate: deletion.localDate,
      locationId: command.locationId,
      organizationId: command.actor.organizationId,
    });
    switch (result.status) {
      case "deleted":
        return Object.freeze({ impact: impactResponse(result.impact) });
      case "conflict":
        throw new ConflictException(
          "La excepción cambió en otra sesión. Recargá antes de borrar.",
        );
      case "not-found":
        throw new NotFoundException(
          "No se encontró la excepción de esa fecha.",
        );
    }
  }

  #normalize<Value>(normalize: () => Value): Value {
    try {
      return normalize();
    } catch (cause: unknown) {
      if (cause instanceof ConfigurationValidationError) {
        throw new BadRequestException({
          field: cause.field,
          message: cause.message,
        });
      }
      throw cause;
    }
  }

  #require(
    actor: AuthenticatedActor,
    permission: OrganizationPermission,
  ): void {
    if (!authorizeActor(actor, permission, actor.organizationId).allowed) {
      throw new ForbiddenException(
        "No tenés permisos para gestionar excepciones de horario.",
      );
    }
  }
}
