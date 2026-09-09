"use client";

import type { PublicationOperationalAlertResponse } from "@aramayo/contracts";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";

import {
  loadOperationalAlerts,
  resolveOperationalAlert,
} from "../../lib/publication-operational-alert-api";
import { OperationalHealthBoard } from "./operational-health-board";

type WorkspaceState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      alerts: readonly PublicationOperationalAlertResponse[];
      kind: "ready";
    }>;

type Feedback =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "error" | "success"; message: string }>;

function causeLabel(
  cause: PublicationOperationalAlertResponse["cause"],
): string {
  switch (cause) {
    case "attempts-exhausted":
      return "Se agotaron los intentos controlados";
    case "connection-not-publishable":
      return "La conexión Meta no está disponible para publicar";
    case "dispatch-not-requested":
      return "El turno venció sin pedir el despacho";
    case "execution-not-completed":
      return "El despacho no terminó de ejecutarse";
    case "outcome-unresolved":
      return "El resultado remoto todavía es ambiguo";
    case "permanent-failure":
      return "El destino reportó un error que no admite reintento automático";
  }
}

function targetLabel(
  target: PublicationOperationalAlertResponse["publicationTarget"],
): string {
  switch (target) {
    case "facebook_page":
      return "Página de Facebook";
    case "instagram_feed":
      return "Feed de Instagram";
    case "instagram_story":
      return "Historia de Instagram";
    case undefined:
      return "Sin destino individual";
  }
}

function actionFor(
  safeAction: PublicationOperationalAlertResponse["safeAction"],
): Readonly<{ href: string; label: string }> {
  switch (safeAction) {
    case "inspect-queue":
      return { href: "/programacion", label: "Revisar programación" };
    case "reconnect-meta":
      return { href: "/configuracion", label: "Revisar conexión Meta" };
    case "reconcile":
      return { href: "/publicaciones", label: "Revisar y conciliar" };
    case "retry":
      return { href: "/publicaciones", label: "Revisar el destino" };
  }
}

function observedAt(instant: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(instant));
}

function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function AlertResource({
  alert,
}: Readonly<{ alert: PublicationOperationalAlertResponse }>) {
  if (alert.kind === "connection-degraded") {
    return <span>Conexión Meta afectada</span>;
  }
  return (
    <span>
      {alert.publicationId === undefined
        ? "Publicación afectada"
        : `Pieza ${shortReference(alert.publicationId)}`}
      {alert.scheduleOccurrenceId === undefined
        ? ""
        : ` · turno ${shortReference(alert.scheduleOccurrenceId)}`}
      {alert.publicationTarget === undefined
        ? ""
        : ` · ${targetLabel(alert.publicationTarget)}`}
    </span>
  );
}

function OperationalAlertRow({
  alert,
  onResolve,
  pending,
}: Readonly<{
  alert: PublicationOperationalAlertResponse;
  onResolve: (alert: PublicationOperationalAlertResponse) => void;
  pending: boolean;
}>) {
  const action = actionFor(alert.safeAction);
  return (
    <li className="operational-alert" data-severity={alert.severity}>
      <div className="operational-alert-rail">
        <span>{alert.severity === "urgent" ? "Urgente" : "Atención"}</span>
      </div>
      <div className="operational-alert-main">
        <p className="operational-alert-resource">
          <AlertResource alert={alert} />
        </p>
        <strong>{causeLabel(alert.cause)}</strong>
        <p>
          Detectada {observedAt(alert.firstObservedAt)} · observada{" "}
          {alert.observations} vez
          {alert.observations === 1 ? "" : "es"}.
        </p>
      </div>
      <div className="operational-alert-actions">
        <Link className="workspace-secondary-action" href={action.href}>
          {action.label}
        </Link>
        <button
          className="workspace-primary-action"
          disabled={pending}
          onClick={() => {
            onResolve(alert);
          }}
          type="button"
        >
          {pending ? "Registrando…" : "Marcar revisada"}
        </button>
      </div>
    </li>
  );
}

function WorkspaceStatus({
  message,
  onRetry,
}: Readonly<{ message: string; onRetry?: () => void }>) {
  return (
    <main className="workspace-shell">
      <section className="workspace-status">
        <p className="workspace-eyebrow">Operación</p>
        <h1>{message}</h1>
        {onRetry === undefined ? (
          <Link href="/iniciar-sesion">Iniciar sesión</Link>
        ) : (
          <button
            className="workspace-primary-action"
            onClick={onRetry}
            type="button"
          >
            Reintentar
          </button>
        )}
      </section>
    </main>
  );
}

export function OperationalAlertWorkspace({
  apiBaseUrl,
}: Readonly<{ apiBaseUrl: string }>) {
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [pendingAlertId, setPendingAlertId] = useState<string>();

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await loadOperationalAlerts(apiBaseUrl);
    startTransition(() => {
      switch (result.kind) {
        case "ready":
          setState({ alerts: result.alerts, kind: "ready" });
          return;
        case "forbidden":
          setState({ kind: "forbidden" });
          return;
        case "error":
          setState({ kind: "error", message: result.message });
      }
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

  const acknowledge = useCallback(
    async (alert: PublicationOperationalAlertResponse) => {
      setFeedback({ kind: "idle" });
      setPendingAlertId(alert.id);
      const result = await resolveOperationalAlert(apiBaseUrl, alert.id);
      setPendingAlertId(undefined);
      if (result.kind === "forbidden") {
        setState({ kind: "forbidden" });
        return;
      }
      if (result.kind === "error") {
        setFeedback({ kind: "error", message: result.message });
        return;
      }
      startTransition(() => {
        setState((current) =>
          current.kind !== "ready"
            ? current
            : {
                ...current,
                alerts: current.alerts.filter(
                  (openAlert) => openAlert.id !== alert.id,
                ),
              },
        );
        setFeedback({
          kind: "success",
          message:
            "La revisión quedó registrada. Si la condición persiste, la alerta volverá a abrirse en el próximo barrido.",
        });
      });
    },
    [apiBaseUrl],
  );

  if (state.kind === "loading") {
    return <WorkspaceStatus message="Consultando riesgos operativos." />;
  }
  if (state.kind === "forbidden") {
    return (
      <WorkspaceStatus message="Necesitás iniciar sesión con permiso para operar publicaciones." />
    );
  }
  if (state.kind === "error") {
    return (
      <WorkspaceStatus message={state.message} onRetry={() => void reload()} />
    );
  }

  return (
    <main className="workspace-shell operational-shell">
      <header className="workspace-header">
        <div>
          <Link className="workspace-brand" href="/">
            Aramayo
          </Link>
          <span>Content Platform</span>
        </div>
        <nav aria-label="Navegación principal">
          <Link href="/publicaciones">Publicaciones</Link>
          <Link href="/programacion">Programación</Link>
          <Link aria-current="page" href="/operacion">
            Operación
          </Link>
          <Link href="/configuracion">Configuración</Link>
        </nav>
      </header>

      <section
        aria-labelledby="operacion"
        className="workspace-intro operational-intro"
      >
        <div>
          <p className="workspace-eyebrow">Centro de control</p>
          <h1 id="operacion">Lo que necesita una decisión.</h1>
        </div>
        <p>
          Cada alerta conserva el recurso afectado, la causa comprobada y el
          paso seguro. Esta bandeja no reintenta ni publica por sí sola.
        </p>
      </section>

      <OperationalHealthBoard apiBaseUrl={apiBaseUrl} />

      <section aria-labelledby="alertas-activas" className="operational-board">
        <div className="workspace-section-heading">
          <div>
            <p className="workspace-eyebrow">Señales activas</p>
            <h2 id="alertas-activas">Alertas operativas</h2>
          </div>
          <span>{state.alerts.length} abiertas</span>
        </div>
        {feedback.kind === "idle" ? null : (
          <p
            aria-live="polite"
            className={`operational-feedback ${feedback.kind}`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
        {state.alerts.length === 0 ? (
          <div className="operational-empty">
            <strong>No hay decisiones operativas pendientes.</strong>
            <p>
              Los barridos siguen verificando turnos, destinos y conexiones; una
              señal nueva aparecerá acá con su acción segura.
            </p>
          </div>
        ) : (
          <ul className="operational-alert-list">
            {state.alerts.map((alert) => (
              <OperationalAlertRow
                alert={alert}
                key={alert.id}
                onResolve={(selected) => {
                  void acknowledge(selected);
                }}
                pending={pendingAlertId === alert.id}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
