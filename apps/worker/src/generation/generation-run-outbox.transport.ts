/**
 * Consumidor del pedido de generación.
 *
 * Traduce un evento del outbox en la ejecución de un lote ya reservado. No
 * decide alcance: organización, membresía y brief viven en el lote porque la
 * API los derivó de la sesión al reservar, así que el evento sólo transporta
 * el identificador.
 *
 * Un lote que ya no está pendiente —cancelado, en curso o resuelto— se
 * considera entregado: reintentar no debe volver a gastar un lote de imágenes.
 */

import {
  generationRunTopic,
  type OutboxMessageRecord,
  type OutboxTransport,
  type SafeJsonObject,
} from "@aramayo/domain";

import type { ImageGenerationRunService } from "./image-generation-run.service.ts";

function payloadText(payload: SafeJsonObject, field: string): string {
  const entry = payload[field];
  if (typeof entry !== "string" || entry.length === 0) {
    throw new TypeError(`El pedido de generación no contiene ${field}.`);
  }
  return entry;
}

export class GenerationRunOutboxTransport implements OutboxTransport {
  readonly #generation: ImageGenerationRunService;

  constructor(generation: ImageGenerationRunService) {
    this.#generation = generation;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    if (message.topic !== generationRunTopic) {
      throw new Error("El evento outbox no corresponde a una generación.");
    }
    // El servicio vuelve a leer el lote y decide si sigue abierto. Comprobarlo
    // acá también sería una segunda lectura que puede quedar desactualizada
    // entre una y otra.
    await this.#generation.execute({
      organizationId: message.organizationId,
      runId: payloadText(message.payload, "runId"),
    });
  }
}
