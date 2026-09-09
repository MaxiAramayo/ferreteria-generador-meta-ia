import type {
  OperationalHealthReasonResponse,
  OperationalHealthResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  resolveOperationalHealth,
  type AuthenticatedActor,
  type OperationalHealthReason,
  type OperationalHealthRepository,
} from "@aramayo/domain";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { OPERATIONAL_HEALTH_REPOSITORY } from "../database/database.tokens.ts";

function reasonResponse(
  reason: OperationalHealthReason,
): OperationalHealthReasonResponse {
  return Object.freeze({
    code: reason.code,
    measured: reason.measured,
    severity: reason.severity,
    threshold: reason.threshold,
  });
}

/**
 * El tablero no ejecuta efectos: lee estado y lo explica. Comparte permiso con
 * la bandeja de alertas porque responde la misma pregunta operativa y deriva a
 * las mismas pantallas.
 */
@Injectable()
export class OperationalHealthService {
  readonly #repository: OperationalHealthRepository;

  constructor(
    @Inject(OPERATIONAL_HEALTH_REPOSITORY)
    repository: OperationalHealthRepository,
  ) {
    this.#repository = repository;
  }

  async read(actor: AuthenticatedActor): Promise<OperationalHealthResponse> {
    if (
      !authorizeActor(actor, "publishing:execute", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "No tenés permisos para consultar la salud operativa.",
      );
    }
    const observedAt = new Date().toISOString();
    const report = resolveOperationalHealth(
      await this.#repository.observe(actor.organizationId, observedAt),
    );
    return Object.freeze({
      generationBudgetPercent: report.generationBudgetPercent,
      observedAt,
      reasons: Object.freeze(report.reasons.map(reasonResponse)),
      severity: report.severity,
      signals: Object.freeze({ ...report.signals }),
    });
  }
}
