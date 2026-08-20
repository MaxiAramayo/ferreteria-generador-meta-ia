/**
 * Disparador de los barridos de publicación.
 *
 * Corre tres pasos en un orden que no es casual:
 *
 * 1. **planificar** los fallos que nadie clasificó todavía;
 * 2. **reconciliar** los desenlaces abiertos contra Meta;
 * 3. **despachar** los reintentos cuya fecha ya llegó.
 *
 * Reconciliar antes de despachar es la regla que evita duplicar: un destino que
 * la consulta acaba de confirmar como publicado deja de tener reintento
 * pendiente en el mismo ciclo, así que el paso 3 ya no lo encuentra. Al revés,
 * el despacho publicaría algo que la consulta iba a declarar existente un
 * segundo después.
 *
 * El intervalo es largo comparado con el del outbox porque acá cada vuelta
 * puede gastar llamadas a Meta. Un barrido que corre de más no rompe nada —la
 * reconciliación sólo lee y el despacho compite en la base—, pero consume cuota
 * que la publicación real necesita.
 */

import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import type { PublicationReconciliationService } from "./publication-reconciliation.service.ts";
import type { PublicationRetryService } from "./publication-retry.service.ts";

const sweepIntervalMilliseconds = 60_000;
/** Cotas por vuelta. La de reconciliación es la que toca la red. */
const planningLimit = 50;
const reconciliationLimit = 10;
const dispatchLimit = 20;

/**
 * Sin `@Injectable()` a propósito: el módulo lo provee con `useFactory`, así que
 * Nest nunca resuelve sus parámetros por metadatos, y los ganchos de ciclo de
 * vida se detectan por los métodos del objeto. El decorador además impediría
 * probar esta clase, porque el borrado de tipos de Node no admite decoradores.
 */
export class PublicationMaintenanceService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #logger = new Logger("worker");
  readonly #reconciliation: PublicationReconciliationService | null;
  readonly #retries: PublicationRetryService | null;
  #interval: NodeJS.Timeout | undefined;
  #running = false;

  constructor(
    retries: PublicationRetryService | null,
    reconciliation: PublicationReconciliationService | null,
  ) {
    this.#reconciliation = reconciliation;
    this.#retries = retries;
  }

  onApplicationBootstrap(): void {
    // Sin Meta configurada no hay publicaciones y no hay nada que barrer.
    if (this.#retries === null || this.#reconciliation === null) return;
    this.#interval = setInterval(() => {
      void this.sweep();
    }, sweepIntervalMilliseconds);
  }

  onApplicationShutdown(): void {
    if (this.#interval !== undefined) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
  }

  /**
   * Una vuelta completa.
   *
   * Es público para que el arranque y la prueba disparen exactamente lo mismo.
   * El candado impide que dos vueltas se solapen: la reconciliación puede tardar
   * más que el intervalo si Meta responde lento, y encimarlas duplicaría las
   * llamadas sin adelantar nada.
   */
  async sweep(): Promise<void> {
    const retries = this.#retries;
    const reconciliation = this.#reconciliation;
    if (retries === null || reconciliation === null) return;
    if (this.#running) return;
    this.#running = true;

    try {
      const planned = await retries.planBatch(planningLimit);
      if (planned.reviewed > 0) {
        this.#logger.log(
          `publishing.retry.plan reviewed=${String(planned.reviewed)} planned=${String(planned.planned)} manual=${String(planned.manual)} reconcilable=${String(planned.reconcilable)}`,
        );
      }
    } catch {
      this.#logger.warn("publishing.retry.plan.failed");
    }

    try {
      const reconciled =
        await reconciliation.reconcileBatch(reconciliationLimit);
      if (reconciled.reviewed > 0) {
        this.#logger.log(
          `publishing.reconcile reviewed=${String(reconciled.reviewed)} confirmed=${String(reconciled.confirmed)} republishable=${String(reconciled.republishable)} unresolved=${String(reconciled.unresolved)} failed=${String(reconciled.failed)}`,
        );
      }
    } catch {
      this.#logger.warn("publishing.reconcile.failed");
    }

    try {
      const dispatched = await retries.dispatchDueBatch(dispatchLimit);
      if (dispatched.reviewed > 0) {
        this.#logger.log(
          `publishing.retry.dispatch reviewed=${String(dispatched.reviewed)} dispatched=${String(dispatched.dispatched)} closed=${String(dispatched.closed)} skipped=${String(dispatched.skipped)}`,
        );
      }
    } catch {
      this.#logger.warn("publishing.retry.dispatch.failed");
    } finally {
      this.#running = false;
    }
  }
}
