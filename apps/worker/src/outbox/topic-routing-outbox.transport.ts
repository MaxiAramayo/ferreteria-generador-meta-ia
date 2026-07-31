/**
 * Ruteo de eventos por tópico.
 *
 * Con un solo consumidor alcanzaba con que el transporte rechazara lo ajeno.
 * Con dos, ese rechazo mandaría al dead-letter los eventos del otro, así que el
 * despacho pasa a resolverse por tópico y un tópico sin consumidor falla de
 * forma explícita en lugar de entregarse a quien no corresponde.
 */

import type { OutboxMessageRecord, OutboxTransport } from "@aramayo/domain";

export class TopicRoutingOutboxTransport implements OutboxTransport {
  readonly #routes: ReadonlyMap<string, OutboxTransport>;

  constructor(routes: Readonly<Record<string, OutboxTransport>>) {
    this.#routes = new Map(Object.entries(routes));
  }

  deliver(message: OutboxMessageRecord): Promise<void> {
    const transport = this.#routes.get(message.topic);
    if (transport === undefined) {
      return Promise.reject(
        new Error(`El tópico ${message.topic} no tiene consumidor.`),
      );
    }
    return transport.deliver(message);
  }
}
