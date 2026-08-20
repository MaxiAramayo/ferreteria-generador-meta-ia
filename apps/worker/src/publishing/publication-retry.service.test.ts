import assert from "node:assert/strict";
import test from "node:test";

import {
  publicationRetryLimits,
  type MetaPublishingFailureCode,
  type PublicationRetryRepository,
  type PublicationRetryTargetRecord,
  type PublicationRetryWriteResult,
  type RequireManualActionInput,
  type ScheduleRetryInput,
} from "@aramayo/domain";

import { PublicationRetryService } from "./publication-retry.service.ts";

const organizationId = "org-aramayo";
const now = new Date("2026-08-20T12:00:00.000Z");

function failure(
  code: MetaPublishingFailureCode,
  attempts = 0,
): PublicationRetryTargetRecord {
  return Object.freeze({
    attempts,
    failureCode: code,
    orderId: "orden-1",
    organizationId,
    publicationTargetId: "orden-1:instagram_feed",
    sequence: 1,
    state: "failed" as const,
    target: "instagram_feed" as const,
  });
}

/**
 * Doble del calendario que registra lo escrito.
 *
 * `writeResult` permite forzar el conflicto: es la respuesta que da la base
 * cuando un publicador movió la fila entre la lectura y la escritura.
 */
class RetryRepositoryDouble implements PublicationRetryRepository {
  readonly scheduled: ScheduleRetryInput[] = [];
  readonly manual: RequireManualActionInput[] = [];
  writeResult: PublicationRetryWriteResult = "saved";
  #failures: readonly PublicationRetryTargetRecord[];

  constructor(failures: readonly PublicationRetryTargetRecord[]) {
    this.#failures = failures;
  }

  unplannedFailures(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(this.#failures);
  }

  dueRetries(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(Object.freeze([]));
  }

  openOutcomes(): Promise<readonly PublicationRetryTargetRecord[]> {
    return Promise.resolve(Object.freeze([]));
  }

  scheduleRetry(
    input: ScheduleRetryInput,
  ): Promise<PublicationRetryWriteResult> {
    this.scheduled.push(input);
    return Promise.resolve(this.writeResult);
  }

  requireManualAction(
    input: RequireManualActionInput,
  ): Promise<PublicationRetryWriteResult> {
    this.manual.push(input);
    return Promise.resolve(this.writeResult);
  }

  confirmRemotePublication(): Promise<PublicationRetryWriteResult> {
    return Promise.reject(new Error("La planificación no confirma nada."));
  }

  confirmWithoutIdentifier(): Promise<PublicationRetryWriteResult> {
    return Promise.reject(new Error("La planificación no confirma nada."));
  }

  reopenForRepublish(): Promise<PublicationRetryWriteResult> {
    return Promise.reject(new Error("La planificación no republica nada."));
  }
}

function serviceFor(
  failures: readonly PublicationRetryTargetRecord[],
): Readonly<{
  repository: RetryRepositoryDouble;
  service: PublicationRetryService;
}> {
  const repository = new RetryRepositoryDouble(failures);
  return Object.freeze({
    repository,
    service: new PublicationRetryService(repository, {
      jitter: () => 0,
      now: () => now,
    }),
  });
}

test("un límite de Meta se reintenta después de su ventana", async () => {
  const { repository, service } = serviceFor([failure("rate-limit")]);
  const summary = await service.planBatch(10);

  assert.equal(summary.planned, 1);
  assert.equal(summary.manual, 0);
  const [scheduled] = repository.scheduled;
  assert.ok(scheduled);
  // Volver antes de que se reponga la ventana sumaría otra llamada al mismo
  // contador que causó el rechazo.
  assert.ok(
    Date.parse(scheduled.nextAttemptAt) - now.getTime() >=
      publicationRetryLimits.rateLimitFloorMilliseconds,
  );
  assert.equal(scheduled.sequence, 1);
});

test("un token vencido no se reintenta: se reconecta", async () => {
  const { repository, service } = serviceFor([failure("token-expired")]);
  const summary = await service.planBatch(10);

  assert.equal(summary.manual, 1);
  assert.equal(summary.planned, 0);
  assert.equal(repository.scheduled.length, 0);
  assert.deepEqual(repository.manual[0]?.reason, "permanent-failure");
});

test("agotar los intentos deriva a una persona con su propio motivo", async () => {
  const { repository, service } = serviceFor([
    failure("provider-error", publicationRetryLimits.attemptsMaximum),
  ]);
  const summary = await service.planBatch(10);

  assert.equal(summary.manual, 1);
  assert.equal(repository.scheduled.length, 0);
  // No se confunde con un fallo permanente: la causa era temporal y se
  // acabaron las oportunidades, que es otra cosa y se informa distinto.
  assert.equal(repository.manual[0]?.reason, "attempts-exhausted");
});

test("un fallo ambiguo no se planifica: lo levanta la reconciliación", async () => {
  const { repository, service } = serviceFor([failure("request-timeout")]);
  const summary = await service.planBatch(10);

  assert.equal(summary.reconcilable, 1);
  // Ni reintento ni derivación: decidir acá exigiría publicar o abandonar sin
  // haber preguntado.
  assert.equal(repository.scheduled.length, 0);
  assert.equal(repository.manual.length, 0);
});

test("perder la carrera contra un publicador no cuenta como plan", async () => {
  const { repository, service } = serviceFor([failure("provider-error")]);
  repository.writeResult = "conflict";
  const summary = await service.planBatch(10);

  assert.equal(summary.skipped, 1);
  assert.equal(summary.planned, 0);
});

test("un destino que rompe no impide planificar los demás", async () => {
  const { repository, service } = serviceFor([
    failure("provider-error"),
    failure("token-expired"),
    failure("rate-limit"),
  ]);
  const summary = await service.planBatch(10);

  assert.equal(summary.reviewed, 3);
  assert.equal(summary.planned, 2);
  assert.equal(summary.manual, 1);
  assert.equal(repository.scheduled.length, 2);
});
