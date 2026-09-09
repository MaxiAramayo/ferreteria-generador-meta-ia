"use client";

import type {
  PublicationScheduleCalendarEntryResponse,
  PublicationScheduleCalendarResponse,
} from "@aramayo/contracts";

interface ScheduleCalendarProps {
  readonly calendar: PublicationScheduleCalendarResponse;
  readonly month: Date;
  readonly onSelect: (scheduleId: string) => void;
  readonly publicationTitles: ReadonlyMap<string, string>;
  readonly selectedScheduleId: string | undefined;
}

interface CalendarEvent {
  readonly entry: PublicationScheduleCalendarEntryResponse;
  readonly occurrence: PublicationScheduleCalendarEntryResponse["occurrences"][number];
}

function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function localTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(instant));
}

function calendarDays(month: Date): readonly Date[] {
  const first = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  return Object.freeze(
    Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      return day;
    }),
  );
}

function dateKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

function titleFor(
  event: CalendarEvent,
  publicationTitles: ReadonlyMap<string, string>,
): string {
  return (
    publicationTitles.get(event.entry.schedule.publicationId) ??
    "Publicación aprobada"
  );
}

function occurrenceStatusLabel(
  status: CalendarEvent["occurrence"]["status"],
): string {
  switch (status) {
    case "planned":
      return "Planificada";
    case "cancelled":
      return "Cancelada";
    case "dispatched":
      return "Despachada";
    case "skipped":
      return "Salteada";
  }
}

export function ScheduleCalendar({
  calendar,
  month,
  onSelect,
  publicationTitles,
  selectedScheduleId,
}: ScheduleCalendarProps) {
  const events = calendar.entries.flatMap((entry) =>
    entry.occurrences.map((occurrence) => Object.freeze({ entry, occurrence })),
  );
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = localDate(
      event.occurrence.scheduledAt,
      event.entry.schedule.timeZone,
    );
    const current = eventsByDate.get(key) ?? [];
    current.push(event);
    eventsByDate.set(key, current);
  }
  const monthLabel = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(month);

  return (
    <section
      aria-labelledby="calendario-programacion"
      className="schedule-calendar"
    >
      <div className="schedule-calendar-heading">
        <div>
          <p className="workspace-eyebrow">Turnos de salida</p>
          <h2 id="calendario-programacion">{monthLabel}</h2>
        </div>
        <p>
          {events.length} ocurrencias visibles · UTC se guarda, hora local se
          decide.
        </p>
      </div>
      <div
        aria-label="Días de la semana"
        className="schedule-calendar-weekdays"
      >
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="schedule-calendar-grid">
        {calendarDays(month).map((day) => {
          const key = dateKey(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isCurrentMonth = day.getUTCMonth() === month.getUTCMonth();
          return (
            <article
              className="schedule-calendar-day"
              data-current-month={isCurrentMonth}
              key={key}
            >
              <time dateTime={key}>{day.getUTCDate()}</time>
              <ul>
                {dayEvents.map((event) => {
                  const selected =
                    selectedScheduleId === event.entry.schedule.id;
                  return (
                    <li
                      key={`${event.entry.schedule.id}-${event.occurrence.occurrenceKey}`}
                    >
                      <button
                        aria-pressed={selected}
                        data-status={event.occurrence.status}
                        onClick={() => {
                          onSelect(event.entry.schedule.id);
                        }}
                        type="button"
                      >
                        <span>
                          {localTime(
                            event.occurrence.scheduledAt,
                            event.entry.schedule.timeZone,
                          )}
                        </span>
                        <strong>{titleFor(event, publicationTitles)}</strong>
                        <small>
                          {occurrenceStatusLabel(event.occurrence.status)} ·{" "}
                          {event.entry.schedule.timeZone}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
      <ol className="schedule-timeline">
        {events.map((event) => (
          <li
            key={`${event.entry.schedule.id}-${event.occurrence.occurrenceKey}`}
          >
            <button
              aria-pressed={selectedScheduleId === event.entry.schedule.id}
              data-status={event.occurrence.status}
              onClick={() => {
                onSelect(event.entry.schedule.id);
              }}
              type="button"
            >
              <time dateTime={event.occurrence.scheduledAt}>
                {localDate(
                  event.occurrence.scheduledAt,
                  event.entry.schedule.timeZone,
                )}{" "}
                ·{" "}
                {localTime(
                  event.occurrence.scheduledAt,
                  event.entry.schedule.timeZone,
                )}
              </time>
              <strong>{titleFor(event, publicationTitles)}</strong>
              <span>
                {occurrenceStatusLabel(event.occurrence.status)} ·{" "}
                {event.entry.schedule.timeZone}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
