import type { LogEmitter, LogLevel } from "@aramayo/observability";
import type { LoggerService } from "@nestjs/common";

/**
 * Traduce el log del framework al formato estructurado del worker. Comparte el
 * criterio con la API: una sola forma de línea en `stdout` y el mismo filtro de
 * redacción para el mensaje del framework.
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
      event: "worker.runtime",
      level,
    });
  }
}
