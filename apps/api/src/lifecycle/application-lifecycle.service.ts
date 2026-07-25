import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from "@nestjs/common";

/**
 * Deja rastro observable del cierre ordenado.
 *
 * NestJS ejecuta los hooks de apagado antes de reenviar la señal al proceso, de
 * modo que este registro aparece únicamente cuando la aplicación terminó de
 * cerrarse y no cuando fue interrumpida abruptamente.
 */
@Injectable()
export class ApplicationLifecycleService implements OnApplicationShutdown {
  readonly #logger = new Logger("api");

  onApplicationShutdown(signal?: string): void {
    this.#logger.log(`api.stopped señal=${signal ?? "sin señal"}`);
  }
}
