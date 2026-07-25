import type { DependencyName, DependencyReport } from "@aramayo/contracts";

/**
 * Puerto de verificación de una dependencia de infraestructura.
 *
 * Una sonda nunca propaga el error del proveedor: lo traduce a `down`. El
 * detalle técnico se registra en el log del proceso, no en la respuesta HTTP,
 * porque los mensajes de PostgreSQL y Redis pueden contener host, usuario o
 * base de datos.
 */
export interface DependencyProbe {
  readonly dependency: DependencyName;
  check(): Promise<DependencyReport>;
}

export const defaultProbeTimeoutMs = 2_000;

export async function measureProbe(
  dependency: DependencyName,
  probe: () => Promise<void>,
): Promise<DependencyReport> {
  const startedAt = performance.now();

  try {
    await probe();
    return Object.freeze({
      dependency,
      latencyMs: Math.round(performance.now() - startedAt),
      status: "up",
    });
  } catch {
    return Object.freeze({
      dependency,
      latencyMs: Math.round(performance.now() - startedAt),
      status: "down",
    });
  }
}
