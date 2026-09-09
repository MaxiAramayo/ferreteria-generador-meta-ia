import type { LogEmitter, LogLevel } from "@aramayo/observability";
import type { LoggerService } from "@nestjs/common";

/**
 * Traduce el log del framework al formato estructurado del proceso.
 *
 * Existe para que una sola línea de `stdout` no cambie de forma según quién la
 * haya escrito. El mensaje del framework viaja como detalle y pasa por la misma
 * redacción que el resto: NestJS registra rutas y errores que pueden arrastrar
 * datos de la solicitud.
 */
export class StructuredNestLogger implements LoggerService {
  readonly #emitter: LogEmitter;

  constructor(emitter: LogEmitter) {
    this.#emitter = emitter;
  }

  debug(message: unknown, context?: unknown): void {
    this.#write("debug", message, context);
  }

  error(message: unknown, context?: unknown): void {
    this.#write("error", message, context);
  }

  log(message: unknown, context?: unknown): void {
    this.#write("info", message, context);
  }

  verbose(message: unknown, context?: unknown): void {
    this.#write("debug", message, context);
  }

  warn(message: unknown, context?: unknown): void {
    this.#write("warn", message, context);
  }

  #write(level: LogLevel, message: unknown, context: unknown): void {
    this.#emitter.emit({
      detail: {
        ...(typeof context === "string" ? { context } : {}),
        message:
          message instanceof Error
            ? message.message
            : typeof message === "string"
              ? message
              : JSON.stringify(message),
      },
      event: "api.runtime",
      level,
    });
  }
}
