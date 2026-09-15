"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { actorCan } from "../../lib/panel-navigation.ts";
import {
  countPublications,
  countPublicationsNeedingAttention,
  loadMetaConnectionState,
  loadOpenAlerts,
  loadPublishingState,
  loadUpcomingOutings,
} from "../../lib/today-board-api.ts";
import {
  greetingFor,
  initialTodaySources,
  outingDateParts,
  todayShortcuts,
  todayTickets,
  type Loadable,
  type TodayBoardSources,
  type TodayPermissions,
  type TodayTicket,
  type UpcomingOuting,
} from "../../lib/today-board-presentation.ts";
import { usePanelActor } from "./panel-shell.tsx";

const upcomingDays = 14;
const upcomingLimit = 6;

function TicketCard({ ticket }: Readonly<{ ticket: TodayTicket }>) {
  return (
    <li
      aria-busy={ticket.busy}
      className="today-ticket"
      data-tone={ticket.tone}
    >
      <p className="today-ticket-area">{ticket.area}</p>
      <p className="today-ticket-figure">
        <strong>{ticket.value}</strong>
        {ticket.unit === "" ? null : <span>{ticket.unit}</span>}
      </p>
      <p className="today-ticket-detail">{ticket.detail}</p>
      <Link className="today-ticket-link" href={ticket.href}>
        {ticket.linkLabel}
        <span aria-hidden="true"> →</span>
      </Link>
    </li>
  );
}

function UpcomingOutings({
  canSchedule,
  outings,
}: Readonly<{
  canSchedule: boolean;
  outings: Loadable<readonly UpcomingOuting[]>;
}>) {
  switch (outings.kind) {
    case "loading":
      return (
        <p aria-busy="true" className="today-note">
          Leyendo el calendario…
        </p>
      );
    case "error":
      return (
        <p className="today-note" role="alert">
          {outings.message}
        </p>
      );
    case "ready":
      return outings.value.length === 0 ? (
        <div className="publication-empty">
          <strong>No hay salidas en los próximos {upcomingDays} días.</strong>
          <p>
            {canSchedule
              ? "Programá una pieza aprobada y va a aparecer acá."
              : "Cuando se programe una pieza, va a aparecer acá."}
          </p>
        </div>
      ) : (
        <ol className="today-outings">
          {outings.value.map((outing) => {
            const parts = outingDateParts(outing.scheduledAt, outing.timeZone);
            return (
              <li key={outing.key}>
                <time dateTime={outing.scheduledAt}>
                  <strong>{parts.day}</strong>
                  <span>{parts.time} h</span>
                </time>
                <div>
                  <strong>{outing.title}</strong>
                  <span>{outing.targets}</span>
                </div>
              </li>
            );
          })}
        </ol>
      );
  }
}

/**
 * «Para hoy»: la portada del panel.
 *
 * Reúne lo que cada rol tiene pendiente y lleva a la pantalla que lo resuelve.
 * No ofrece acciones propias: aprobar, programar o publicar siguen pasando por
 * sus pantallas y sus confirmaciones.
 */
export function TodayBoard({ apiBaseUrl }: Readonly<{ apiBaseUrl: string }>) {
  const actor = usePanelActor();
  const permissions = useMemo<TodayPermissions>(
    () => ({
      approve: actorCan(actor, "content:approve"),
      connections: actorCan(actor, "connections:manage"),
      edit: actorCan(actor, "content:edit"),
      publish: actorCan(actor, "publishing:execute"),
      schedule: actorCan(actor, "content:schedule"),
    }),
    [actor],
  );
  const [now] = useState(() => new Date());
  const [sources, setSources] = useState<TodayBoardSources>(() =>
    initialTodaySources(permissions),
  );
  const [outings, setOutings] = useState<Loadable<readonly UpcomingOuting[]>>({
    kind: "loading",
  });

  useEffect(() => {
    let active = true;
    const merge = (patch: TodayBoardSources): void => {
      if (active) setSources((current) => ({ ...current, ...patch }));
    };
    if (permissions.approve) {
      void countPublications(apiBaseUrl, "ready_for_review").then(
        (readyForReview) => {
          merge({ readyForReview });
        },
      );
    }
    if (permissions.edit) {
      void countPublications(apiBaseUrl, "draft").then((drafts) => {
        merge({ drafts });
      });
      void countPublicationsNeedingAttention(apiBaseUrl).then(
        (needsAttention) => {
          merge({ needsAttention });
        },
      );
    }
    if (permissions.schedule) {
      void countPublications(apiBaseUrl, "approved").then((approved) => {
        merge({ approved });
      });
    }
    if (permissions.publish) {
      void loadOpenAlerts(apiBaseUrl).then((alerts) => {
        merge({ alerts });
      });
      void loadPublishingState(apiBaseUrl).then((publishing) => {
        merge({ publishing });
      });
    }
    if (permissions.connections) {
      void loadMetaConnectionState(apiBaseUrl).then((metaConnections) => {
        merge({ metaConnections });
      });
    }
    void loadUpcomingOutings(apiBaseUrl, now, upcomingDays, upcomingLimit).then(
      (result) => {
        if (active) setOutings(result);
      },
    );
    return () => {
      active = false;
    };
  }, [apiBaseUrl, now, permissions]);

  const tickets = todayTickets(sources);
  const shortcuts = todayShortcuts(permissions);
  const dateLabel = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(now);

  return (
    <main className="workspace-shell today-shell">
      <section
        aria-labelledby="para-hoy"
        className="workspace-intro today-intro"
      >
        <div>
          <p className="workspace-eyebrow">Para hoy · {dateLabel}</p>
          <h1 id="para-hoy">Lo que hay que mover hoy.</h1>
        </div>
        <div className="today-intro-aside">
          <p>
            {greetingFor(actor.displayName)} Esto es lo que tu rol puede
            resolver ahora; cada tarjeta lleva a la pantalla donde se hace.
          </p>
          {shortcuts.length === 0 ? null : (
            <nav aria-label="Atajos" className="today-shortcuts">
              {shortcuts.map((shortcut) => (
                <Link
                  className={
                    shortcut.primary
                      ? "workspace-primary-action"
                      : "workspace-secondary-action"
                  }
                  href={shortcut.href}
                  key={shortcut.href}
                >
                  {shortcut.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </section>

      {tickets.length === 0 ? null : (
        <section aria-labelledby="pendientes" className="today-section">
          <div className="workspace-section-heading">
            <div>
              <p className="workspace-eyebrow">Según tu rol</p>
              <h2 id="pendientes">Pendientes</h2>
            </div>
          </div>
          <ul className="today-tickets">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="proximas-salidas" className="today-section">
        <div className="workspace-section-heading">
          <div>
            <p className="workspace-eyebrow">Próximos {upcomingDays} días</p>
            <h2 id="proximas-salidas">Próximas salidas</h2>
          </div>
          <Link className="today-section-link" href="/programacion">
            Abrir Programación
          </Link>
        </div>
        <UpcomingOutings canSchedule={permissions.schedule} outings={outings} />
      </section>
    </main>
  );
}
