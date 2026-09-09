import type { ProcessName } from "@aramayo/contracts";

import { currentCorrelation } from "./correlation.ts";
import { redactDetail, type LogDetail } from "./redaction.ts";

/**
 * Log operativo estructurado.
 *
 * Una línea es un objeto JSON con campos fijos: el operador filtra por
 * `event`, `outcome` o `correlationId` sin depender de cómo estaba redactada
 * la frase. El detalle variable pasa siempre por redacción antes de salir.
 *
 * La escritura es inyectable para poder observarla en pruebas y para que el
 * proceso decida su destino sin que este paquete conozca `stdout`.
 */

export type LogLevel = "debug" | "error" | "info" | "warn";

export type LogOutcome = "degraded" | "failure" | "success";

export interface LogEvent {
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly durationMs?: number;
  readonly event: string;
  readonly level?: LogLevel;
  readonly outcome?: LogOutcome;
}

export interface LogRecord {
  readonly actorMembershipId?: string;
  readonly correlationId?: string;
  readonly detail?: LogDetail;
  readonly durationMs?: number;
  readonly event: string;
  readonly level: LogLevel;
  readonly organizationId?: string;
  readonly outcome?: LogOutcome;
  readonly process: ProcessName;
  readonly ts: string;
}

export interface LogEmitter {
  emit(event: LogEvent): void;
}

export function buildLogRecord(
  processName: ProcessName,
  event: LogEvent,
  occurredAt: Date,
): LogRecord {
  const correlation = currentCorrelation();
  const detail =
    event.detail === undefined ? undefined : redactDetail(event.detail);
  return Object.freeze({
    ...(correlation?.actorMembershipId === undefined
      ? {}
      : { actorMembershipId: correlation.actorMembershipId }),
    ...(correlation === undefined
      ? {}
      : { correlationId: correlation.correlationId }),
    ...(detail === undefined || Object.keys(detail).length === 0
      ? {}
      : { detail }),
    ...(event.durationMs === undefined
      ? {}
      : { durationMs: Math.round(event.durationMs) }),
    event: event.event,
    level: event.level ?? "info",
    ...(correlation?.organizationId === undefined
      ? {}
      : { organizationId: correlation.organizationId }),
    ...(event.outcome === undefined ? {} : { outcome: event.outcome }),
    process: processName,
    ts: occurredAt.toISOString(),
  });
}

export function createLogEmitter(
  processName: ProcessName,
  write: (line: string) => void = (line) => {
    process.stdout.write(`${line}\n`);
  },
  now: () => Date = () => new Date(),
): LogEmitter {
  return Object.freeze({
    emit(event: LogEvent): void {
      write(JSON.stringify(buildLogRecord(processName, event, now())));
    },
  });
}
