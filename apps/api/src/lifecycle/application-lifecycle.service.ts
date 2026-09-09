import { Injectable, type OnApplicationShutdown } from "@nestjs/common";

import { apiLog } from "../observability/api-log.ts";

/**
 * Deja rastro observable del cierre ordenado.
 *
 * NestJS ejecuta los hooks de apagado antes de reenviar la señal al proceso, de
 * modo que este registro aparece únicamente cuando la aplicación terminó de
 * cerrarse y no cuando fue interrumpida abruptamente.
 */
@Injectable()
export class ApplicationLifecycleService implements OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void {
    apiLog.emit({
      detail: { signal: signal ?? "sin señal" },
      event: "api.stopped",
      outcome: "success",
    });
  }
}
