import assert from "node:assert/strict";
import test from "node:test";

import { PublicationMaintenanceService } from "./publication-maintenance.service.ts";
import type { PublicationReconciliationService } from "./publication-reconciliation.service.ts";
import type { PublicationRetryService } from "./publication-retry.service.ts";

/** Anota el orden real de los pasos para poder afirmarlo. */
function tracing(steps: string[]): Readonly<{
  reconciliation: PublicationReconciliationService;
  retries: PublicationRetryService;
}> {
  return Object.freeze({
    reconciliation: {
      reconcileBatch: (): Promise<{
        confirmed: number;
        failed: number;
        reviewed: number;
        republishable: number;
        unresolved: number;
      }> => {
        steps.push("reconcile");
        return Promise.resolve({
          confirmed: 0,
          failed: 0,
          republishable: 0,
          reviewed: 0,
          unresolved: 0,
        });
      },
    } as unknown as PublicationReconciliationService,
    retries: {
      dispatchDueBatch: (): Promise<{
        closed: number;
        dispatched: number;
        reviewed: number;
        skipped: number;
      }> => {
        steps.push("dispatch");
        return Promise.resolve({
          closed: 0,
          dispatched: 0,
          reviewed: 0,
          skipped: 0,
        });
      },
      planBatch: (): Promise<{
        manual: number;
        planned: number;
        reconcilable: number;
        reviewed: number;
        skipped: number;
      }> => {
        steps.push("plan");
        return Promise.resolve({
          manual: 0,
          planned: 0,
          reconcilable: 0,
          reviewed: 0,
          skipped: 0,
        });
      },
    } as unknown as PublicationRetryService,
  });
}

test("reconciliar corre antes de despachar", async () => {
  // Es la regla que evita duplicar: un destino que la consulta acaba de
  // confirmar deja de tener reintento pendiente antes de que el despacho lo
  // mire. Al revés, se publicaría algo que iba a declararse existente.
  const steps: string[] = [];
  const { reconciliation, retries } = tracing(steps);
  await new PublicationMaintenanceService(retries, reconciliation).sweep();

  assert.deepEqual(steps, ["plan", "reconcile", "dispatch"]);
});

test("un paso que rompe no impide los siguientes", async () => {
  const steps: string[] = [];
  const { reconciliation } = tracing(steps);
  const retries = {
    dispatchDueBatch: (): Promise<unknown> => {
      steps.push("dispatch");
      return Promise.resolve({
        closed: 0,
        dispatched: 0,
        reviewed: 0,
        skipped: 0,
      });
    },
    planBatch: (): Promise<never> =>
      Promise.reject(new Error("La planificación falló.")),
  } as unknown as PublicationRetryService;

  await new PublicationMaintenanceService(retries, reconciliation).sweep();

  // La planificación cayó y aun así se reconcilió y se despachó: un desenlace
  // en duda no puede quedar sin revisar porque otro paso rompió.
  assert.deepEqual(steps, ["reconcile", "dispatch"]);
});

test("sin Meta configurada el barrido no hace nada", async () => {
  const service = new PublicationMaintenanceService(null, null);
  await service.sweep();
  service.onApplicationBootstrap();
  // No quedó temporizador vivo que impida cerrar el proceso.
  service.onApplicationShutdown();
});

test("dos vueltas no se solapan", async () => {
  const steps: string[] = [];
  const { reconciliation } = tracing(steps);
  let release: (() => void) | undefined;
  const retries = {
    dispatchDueBatch: (): Promise<unknown> =>
      Promise.resolve({
        closed: 0,
        dispatched: 0,
        reviewed: 0,
        skipped: 0,
      }),
    planBatch: (): Promise<unknown> => {
      steps.push("plan");
      return new Promise((resolve) => {
        release = (): void => {
          resolve({
            manual: 0,
            planned: 0,
            reconcilable: 0,
            reviewed: 0,
            skipped: 0,
          });
        };
      });
    },
  } as unknown as PublicationRetryService;

  const service = new PublicationMaintenanceService(retries, reconciliation);
  const first = service.sweep();
  // La segunda entra mientras la primera sigue esperando a Meta y se descarta:
  // encimarlas duplicaría las llamadas sin adelantar nada.
  await service.sweep();
  assert.deepEqual(steps, ["plan"]);

  release?.();
  await first;
  assert.deepEqual(steps, ["plan", "reconcile"]);
});
