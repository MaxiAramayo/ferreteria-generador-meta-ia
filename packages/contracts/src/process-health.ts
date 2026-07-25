/**
 * Contrato de salud de procesos.
 *
 * `liveness` responde si el proceso está vivo y no consulta dependencias.
 * `readiness` responde si el proceso puede aceptar tráfico o trabajos, y por eso
 * sí consulta PostgreSQL y Redis.
 *
 * Ninguna respuesta puede incluir cadenas de conexión, credenciales ni mensajes
 * de error de proveedores: sólo el nombre de la dependencia y su estado.
 */

export type ProcessName = 'api' | 'worker'

export type DependencyName = 'postgres' | 'redis'

export type DependencyStatus = 'up' | 'down'

export type DependencyReport = {
  readonly dependency: DependencyName
  readonly status: DependencyStatus
  readonly latencyMs: number
}

export type LivenessResponse = {
  readonly process: ProcessName
  readonly status: 'alive'
  readonly checkedAt: string
  readonly uptimeSeconds: number
}

export type ReadinessStatus = 'ready' | 'not_ready'

export type ReadinessResponse = {
  readonly process: ProcessName
  readonly status: ReadinessStatus
  readonly checkedAt: string
  readonly dependencies: readonly DependencyReport[]
}

export function resolveReadinessStatus(
  dependencies: readonly DependencyReport[],
): ReadinessStatus {
  return dependencies.every((dependency) => dependency.status === 'up')
    ? 'ready'
    : 'not_ready'
}
