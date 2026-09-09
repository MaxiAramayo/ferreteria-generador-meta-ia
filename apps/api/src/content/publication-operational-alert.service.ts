/** Bandeja de alertas operativas, separada de las acciones que las resuelven. */

import type {
  PublicationOperationalAlertListResponse,
  PublicationOperationalAlertResolutionResponse,
  PublicationOperationalAlertResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  type AuthenticatedActor,
  type PublicationOperationalAlertRecord,
  type PublicationOperationalAlertRepository,
} from "@aramayo/domain";
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PUBLICATION_OPERATIONAL_ALERT_REPOSITORY } from "../database/database.tokens.ts";

const operationalAlertLimit = 100;

function response(
  alert: PublicationOperationalAlertRecord,
): PublicationOperationalAlertResponse {
  return Object.freeze({
    cause: alert.cause,
    firstObservedAt: alert.firstObservedAt,
    id: alert.id,
    kind: alert.kind,
    lastObservedAt: alert.lastObservedAt,
    ...(alert.metaConnectionId === undefined
      ? {}
      : { metaConnectionId: alert.metaConnectionId }),
    observations: alert.observations,
    ...(alert.publicationId === undefined
      ? {}
      : { publicationId: alert.publicationId }),
    ...(alert.publicationTarget === undefined
      ? {}
      : { publicationTarget: alert.publicationTarget }),
    safeAction: alert.safeAction,
    ...(alert.scheduleOccurrenceId === undefined
      ? {}
      : { scheduleOccurrenceId: alert.scheduleOccurrenceId }),
    severity: alert.severity,
  });
}

@Injectable()
export class PublicationOperationalAlertService {
  readonly #repository: PublicationOperationalAlertRepository;

  constructor(
    @Inject(PUBLICATION_OPERATIONAL_ALERT_REPOSITORY)
    repository: PublicationOperationalAlertRepository,
  ) {
    this.#repository = repository;
  }

  async list(
    actor: AuthenticatedActor,
  ): Promise<PublicationOperationalAlertListResponse> {
    this.#require(actor);
    const alerts = await this.#repository.listOpen(
      actor.organizationId,
      operationalAlertLimit,
    );
    return Object.freeze({ items: Object.freeze(alerts.map(response)) });
  }

  async resolve(
    actor: AuthenticatedActor,
    id: string,
  ): Promise<PublicationOperationalAlertResolutionResponse> {
    this.#require(actor);
    const result = await this.#repository.resolve({
      actorMembershipId: actor.membershipId,
      at: new Date().toISOString(),
      id,
      organizationId: actor.organizationId,
    });
    if (result.status === "not-found") {
      throw new NotFoundException("No se encontró la alerta operativa.");
    }
    return Object.freeze({
      alert: response(result.alert),
      status: result.status,
    });
  }

  #require(actor: AuthenticatedActor): void {
    if (
      !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "Falta el permiso para operar publicaciones.",
      );
    }
  }
}
