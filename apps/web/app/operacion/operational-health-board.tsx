"use client";

import type {
  OperationalHealthReasonResponse,
  OperationalHealthResponse,
} from "@aramayo/contracts";
import { startTransition, useCallback, useEffect, useState } from "react";

import { loadOperationalHealth } from "../../lib/operational-health-api";

type BoardState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ health: OperationalHealthResponse; kind: "ready" }>;

function severityLabel(
  severity: OperationalHealthResponse["severity"],
): string {
  switch (severity) {
    case "healthy":
      return "Sin pendientes";
    case "attention":
      return "Requiere atención";
    case "urgent":
      return "Urgente";
  }
}

/**
 * El texto explica el umbral que se cruzó, no lo recalcula: el criterio vive en
 * el dominio y la pantalla sólo lo cuenta.
 */
function reasonLabel(reason: OperationalHealthReasonResponse): string {
  switch (reason.code) {
    case "ambiguous-targets":
      return `${String(reason.measured)} destino(s) sin confirmar con Meta: reconciliar antes de reintentar.`;
    case "dead-letter-messages":
      return `${String(reason.measured)} trabajo(s) agotaron sus intentos y quedaron detenidos.`;
    case "generation-budget":
      return `El presupuesto de IA del mes va en ${String(reason.measured)} % (umbral ${String(reason.threshold)} %).`;
    case "occurrence-backlog":
      return `${String(reason.measured)} turno(s) vencidos siguen sin despachar (umbral ${String(reason.threshold)}).`;
    case "occurrence-delay":
      return `El turno más atrasado lleva ${String(reason.measured)} minutos (umbral ${String(reason.threshold)}).`;
    case "open-alerts":
      return `${String(reason.measured)} alerta(s) abiertas en la bandeja.`;
    case "outbox-age":
      return `El trabajo pendiente más viejo lleva ${String(reason.measured)} minutos (umbral ${String(reason.threshold)}).`;
    case "outbox-backlog":
      return `${String(reason.measured)} trabajo(s) esperan transporte (umbral ${String(reason.threshold)}).`;
    case "partial-publications":
      return `${String(reason.measured)} publicación(es) salieron sólo a algunos destinos.`;
  }
}

function usd(microusd: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(microusd / 1_000_000);
}

function observedAtLabel(instant: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(instant));
}

export function OperationalHealthBoard({
  apiBaseUrl,
}: Readonly<{ apiBaseUrl: string }>) {
  const [state, setState] = useState<BoardState>({ kind: "loading" });

  const reload = useCallback(async () => {
    const result = await loadOperationalHealth(apiBaseUrl);
    startTransition(() => {
      setState(
        result.kind === "ready"
          ? { health: result.health, kind: "ready" }
          : result.kind === "forbidden"
            ? { kind: "forbidden" }
            : { kind: "error", message: result.message },
      );
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [reload]);

  if (state.kind === "loading" || state.kind === "forbidden") {
    return null;
  }
  if (state.kind === "error") {
    return (
      <section aria-labelledby="salud-operativa" className="operational-board">
        <div className="workspace-section-heading">
          <div>
            <p className="workspace-eyebrow">Estado del sistema</p>
            <h2 id="salud-operativa">Salud operativa</h2>
          </div>
        </div>
        <p className="operational-feedback error" role="alert">
          {state.message}
        </p>
      </section>
    );
  }

  const { health } = state;
  const signals = health.signals;

  return (
    <section aria-labelledby="salud-operativa" className="operational-board">
      <div className="workspace-section-heading">
        <div>
          <p className="workspace-eyebrow">Estado del sistema</p>
          <h2 id="salud-operativa">Salud operativa</h2>
        </div>
        <span data-severity={health.severity}>
          {severityLabel(health.severity)}
        </span>
      </div>

      {health.reasons.length === 0 ? (
        <p className="operational-health-quiet">
          Ningún umbral cruzado. Medido a las{" "}
          {observedAtLabel(health.observedAt)}.
        </p>
      ) : (
        <ul className="operational-health-reasons">
          {health.reasons.map((reason) => (
            <li data-severity={reason.severity} key={reason.code}>
              {reasonLabel(reason)}
            </li>
          ))}
        </ul>
      )}

      <dl className="operational-health-signals">
        <div>
          <dt>Turnos vencidos</dt>
          <dd>{signals.overdueOccurrences}</dd>
        </div>
        <div>
          <dt>Atraso máximo</dt>
          <dd>{signals.maximumOccurrenceDelayMinutes} min</dd>
        </div>
        <div>
          <dt>Trabajos esperando</dt>
          <dd>{signals.pendingOutboxMessages}</dd>
        </div>
        <div>
          <dt>Trabajo más viejo</dt>
          <dd>{signals.oldestPendingOutboxMinutes} min</dd>
        </div>
        <div>
          <dt>Trabajos detenidos</dt>
          <dd>{signals.deadLetterMessages}</dd>
        </div>
        <div>
          <dt>Publicaciones a medias</dt>
          <dd>{signals.partialPublications}</dd>
        </div>
        <div>
          <dt>Destinos sin confirmar</dt>
          <dd>{signals.ambiguousTargets}</dd>
        </div>
        <div>
          <dt>Costo de IA del mes</dt>
          <dd>
            {usd(signals.generationCommittedMicrousd)}
            <span>
              {signals.generationBudgetMicrousd === 0
                ? "sin presupuesto declarado"
                : `${String(health.generationBudgetPercent)} % de ${usd(signals.generationBudgetMicrousd)}`}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
