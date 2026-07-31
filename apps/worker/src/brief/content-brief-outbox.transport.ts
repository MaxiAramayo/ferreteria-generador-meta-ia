/**
 * Consumidor del pedido de brief.
 *
 * Traduce un evento del outbox en la ejecución de una generación ya reservada.
 * No decide alcance: organización, membresía y sucursal viajan en el evento
 * porque la API las derivó de la sesión al reservar.
 *
 * Un pedido que ya no está pendiente —cancelado o resuelto— se considera
 * entregado: reintentar no debe volver a gastar una generación.
 */

import {
  contentBriefGenerationTopic,
  type ContentBriefRunRepository,
  type OutboxMessageRecord,
  type OutboxTransport,
  type SafeJsonObject,
} from "@aramayo/domain";

import type { ContentBriefGenerationService } from "./content-brief-generation.service.ts";

function payloadText(payload: SafeJsonObject, field: string): string {
  const entry = payload[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`El pedido de brief no contiene ${field}.`);
  }
  return entry;
}

function optionalPayloadText(
  payload: SafeJsonObject,
  field: string,
): string | null {
  const entry = payload[field];
  if (entry === undefined || entry === null) {
    return null;
  }
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`El pedido de brief tiene un ${field} inválido.`);
  }
  return entry;
}

export class ContentBriefOutboxTransport implements OutboxTransport {
  readonly #generation: ContentBriefGenerationService;
  readonly #runs: ContentBriefRunRepository;

  constructor(
    generation: ContentBriefGenerationService,
    runs: ContentBriefRunRepository,
  ) {
    this.#generation = generation;
    this.#runs = runs;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    if (message.topic !== contentBriefGenerationTopic) {
      throw new Error("El evento outbox no corresponde a un brief.");
    }
    const runId = payloadText(message.payload, "runId");
    const run = await this.#runs.findById({
      id: runId,
      organizationId: message.organizationId,
    });
    if (run === null) {
      throw new Error("El pedido de brief no existe en su organización.");
    }
    // El editor pudo cancelar antes de que el worker tomara el evento, o un
    // reintento pudo llegar después de una ejecución ya resuelta.
    if (run.status !== "pending") {
      return;
    }

    await this.#generation.generate({
      actorMembershipId: run.actorMembershipId,
      locationId: run.locationId,
      locationName: optionalPayloadText(message.payload, "locationName"),
      organizationId: run.organizationId,
      request: run.request,
      requestedAt: run.requestedAt,
      runId: run.id,
    });
  }
}
