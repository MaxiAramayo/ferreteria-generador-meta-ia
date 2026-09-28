"use client";

import type {
  PublicationListResponse,
  PublicationScheduleCalendarEntryResponse,
  PublicationScheduleCalendarResponse,
  PreviewPublicationScheduleUpdateResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publicationHref } from "../../../lib/panel-navigation.ts";
import { approvalTargetsFor } from "../../../lib/publication-card.ts";
import {
  occurrenceStatusLabels,
  scheduleStatusLabels,
  scheduleTargetsLabel,
} from "../../../lib/publication-schedule-presentation.ts";
import {
  createPublicationSchedule,
  loadPublicationScheduleCalendar,
  previewPublicationScheduleUpdate,
  transitionPublicationSchedule,
  updatePublicationSchedule,
  type ScheduleRuleSubmission,
} from "../../../lib/publication-schedule-api";
import {
  loadPublicationWorkspace,
  type WorkspaceActor,
} from "../../../lib/publication-workspace-api";
import { ScheduleCalendar } from "./schedule-calendar";
import { ScheduleRuleForm } from "./schedule-rule-form";

type WorkspaceState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      actor: WorkspaceActor;
      calendar: PublicationScheduleCalendarResponse;
      canSchedule: boolean;
      kind: "ready";
      publications: PublicationListResponse;
    }>;

type EditorState =
  | Readonly<{ kind: "closed" }>
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "move"; scheduleId: string }>;

type Feedback =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "error" | "success"; message: string }>;

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthWindow(month: Date): Readonly<{ from: string; to: string }> {
  return Object.freeze({
    from: monthStart(month).toISOString(),
    to: new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
    ).toISOString(),
  });
}

function previousMonth(month: Date): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1));
}

function nextMonth(month: Date): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
}

/** El mes de una fecha local `AAAA-MM-DD`, o `null` si no la entiende. */
function monthOfLocalDate(localDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/u.exec(localDate);
  if (match === null) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function idempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function localDateTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone,
    timeZoneName: "short",
    weekday: "long",
    year: "numeric",
  }).format(new Date(instant));
}

function scheduleLabel(
  entry: PublicationScheduleCalendarEntryResponse,
  publicationTitles: ReadonlyMap<string, string>,
): string {
  return (
    publicationTitles.get(entry.schedule.publicationId) ??
    "Publicación aprobada"
  );
}

function recurrenceLabel(
  entry: PublicationScheduleCalendarEntryResponse,
): string {
  const recurrence = entry.schedule.recurrence;
  switch (recurrence.kind) {
    case "once":
      return "Una vez";
    case "daily":
      return `Cada ${String(recurrence.interval)} día(s)`;
    case "weekly":
      return `Cada ${String(recurrence.interval)} semana(s)`;
    case "monthly":
      return `Cada ${String(recurrence.interval)} mes(es), día ${String(recurrence.monthDay)}`;
  }
}

function selectedEntry(
  calendar: PublicationScheduleCalendarResponse,
  scheduleId: string | undefined,
): PublicationScheduleCalendarEntryResponse | undefined {
  return calendar.entries.find((entry) => entry.schedule.id === scheduleId);
}

function SchedulingStatus({
  message,
  retry,
}: Readonly<{ message: string; retry?: () => void }>) {
  return (
    <main className="workspace-shell">
      <section className="workspace-status">
        <p className="workspace-eyebrow">Programación</p>
        <h1>{message}</h1>
        {retry === undefined ? (
          <Link href="/iniciar-sesion">Ir al inicio de sesión</Link>
        ) : (
          <button
            className="workspace-primary-action"
            onClick={retry}
            type="button"
          >
            Reintentar
          </button>
        )}
      </section>
    </main>
  );
}

export function SchedulingWorkspace({
  apiBaseUrl,
  initialPublicationId,
}: Readonly<{ apiBaseUrl: string; initialPublicationId: string | null }>) {
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [state, setState] = useState<WorkspaceState>({ kind: "loading" });
  const [editor, setEditor] = useState<EditorState>({ kind: "closed" });
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>();
  const [createPublicationId, setCreatePublicationId] = useState<string>();
  const [preview, setPreview] =
    useState<PreviewPublicationScheduleUpdateResponse>();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const requestedPublicationId = useRef(initialPublicationId);
  const detail = useRef<HTMLElement>(null);

  // En el celular el detalle queda debajo del calendario: al elegir una salida
  // o abrir el formulario, la pantalla baja hasta él en vez de quedarse arriba.
  useEffect(() => {
    if (editor.kind === "closed" && selectedScheduleId === undefined) return;
    if (!window.matchMedia("(max-width: 48rem)").matches) return;
    detail.current?.scrollIntoView({ block: "start" });
  }, [editor.kind, selectedScheduleId]);

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    const [workspace, calendar] = await Promise.all([
      loadPublicationWorkspace(apiBaseUrl),
      loadPublicationScheduleCalendar(apiBaseUrl, monthWindow(month)),
    ]);
    if (workspace.kind === "forbidden" || calendar.kind === "forbidden") {
      setState({ kind: "forbidden" });
      return;
    }
    if (workspace.kind === "error") {
      setState({ kind: "error", message: workspace.message });
      return;
    }
    if (calendar.kind === "error") {
      setState({ kind: "error", message: calendar.message });
      return;
    }
    setState({
      actor: workspace.actor,
      calendar: calendar.value,
      canSchedule: workspace.canSchedule,
      kind: "ready",
      publications:
        workspace.kind === "ready"
          ? workspace.publications
          : Object.freeze({ items: [], limit: 20, page: 1, total: 0 }),
    });
    // Llegar desde una pieza aprobada («Programar») abre la creación con esa
    // pieza elegida, y una sola vez: cambiar de mes no la vuelve a abrir.
    const requested = requestedPublicationId.current;
    if (requested === null) return;
    requestedPublicationId.current = null;
    const eligible =
      workspace.kind === "ready" &&
      workspace.publications.items.some(
        (publication) =>
          publication.id === requested &&
          (publication.status === "approved" ||
            publication.status === "scheduled"),
      );
    if (workspace.canSchedule && eligible) {
      setCreatePublicationId(requested);
      setEditor({ kind: "create" });
      return;
    }
    setFeedback({
      kind: "error",
      message: workspace.canSchedule
        ? "Esa pieza no está entre las aprobadas que se pueden programar."
        : "Tu rol no permite programar piezas.",
    });
  }, [apiBaseUrl, month]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      void reload();
    }, 0);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [reload]);

  // Después de programar o mover, el calendario va al mes de la salida: si
  // cae el mes que viene, se ve dónde quedó en vez de desaparecer.
  const showMonthOf = useCallback(
    async (localDate: string) => {
      const target = monthOfLocalDate(localDate);
      if (target === null || target.getTime() === month.getTime()) {
        await reload();
        return;
      }
      setMonth(target);
    },
    [month, reload],
  );

  const publicationTitles = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, string>();
    return new Map(
      state.publications.items.map((publication) => [
        publication.id,
        publication.title,
      ]),
    );
  }, [state]);

  if (state.kind === "loading") {
    return <SchedulingStatus message="Leyendo los turnos programados." />;
  }
  if (state.kind === "forbidden") {
    return (
      <SchedulingStatus message="Necesitás una sesión con acceso al calendario." />
    );
  }
  if (state.kind === "error") {
    return (
      <SchedulingStatus message={state.message} retry={() => void reload()} />
    );
  }

  const activeEntry = selectedEntry(state.calendar, selectedScheduleId);
  const eligiblePublications = state.publications.items.filter(
    (publication) =>
      publication.status === "approved" || publication.status === "scheduled",
  );
  const createPublication = eligiblePublications.find(
    (publication) => publication.id === createPublicationId,
  );
  const action = async (type: "cancel" | "pause" | "resume"): Promise<void> => {
    if (activeEntry === undefined) return;
    setFeedback({ kind: "idle" });
    setPending(true);
    const result = await transitionPublicationSchedule(
      apiBaseUrl,
      activeEntry.schedule.id,
      activeEntry.schedule.version,
      type,
      idempotencyKey(),
    );
    setPending(false);
    if (result.kind === "ready") {
      setFeedback({
        kind: "success",
        message:
          type === "cancel"
            ? `Programación cancelada. ${String(result.value.cancelledOccurrenceCount)} ocurrencias futuras retiradas y ${String(result.value.dispatchedOccurrenceCount)} ya despachadas preservadas.`
            : `Programación ${type === "pause" ? "pausada" : "reanudada"}.`,
      });
      setEditor({ kind: "closed" });
      setSelectedScheduleId(undefined);
      await reload();
      return;
    }
    setFeedback({
      kind: "error",
      message:
        result.kind === "forbidden"
          ? "No tenés permiso para modificar esta programación."
          : result.message,
    });
  };

  const openCreate = (): void => {
    setPreview(undefined);
    setFeedback({ kind: "idle" });
    setCreatePublicationId(eligiblePublications[0]?.id);
    setEditor({ kind: "create" });
  };

  return (
    <main className="workspace-shell scheduling-shell">
      <section
        aria-labelledby="programacion"
        className="workspace-intro scheduling-intro"
      >
        <h1 id="programacion">Programación</h1>
        <p>Cuándo sale cada pieza aprobada.</p>
      </section>

      <section
        className="scheduling-toolbar"
        aria-label="Controles de calendario"
      >
        <div>
          <button
            className="workspace-secondary-action"
            onClick={() => {
              setMonth(previousMonth(month));
            }}
            type="button"
          >
            Mes anterior
          </button>
          <button
            className="workspace-secondary-action"
            onClick={() => {
              setMonth(nextMonth(month));
            }}
            type="button"
          >
            Mes siguiente
          </button>
        </div>
        <button
          className="workspace-primary-action"
          disabled={!state.canSchedule || eligiblePublications.length === 0}
          onClick={openCreate}
          type="button"
        >
          Programar una pieza
        </button>
      </section>

      {!state.canSchedule ? (
        <p className="schedule-boundary" role="status">
          Podés revisar los turnos, pero tu rol no permite crear ni cambiarlos.
        </p>
      ) : eligiblePublications.length === 0 ? (
        <p className="schedule-boundary" role="status">
          No hay una pieza aprobada disponible para programar. Aprobar una pieza
          no publica nada: sólo habilita esta acción.
        </p>
      ) : null}

      {feedback.kind !== "idle" ? (
        <p aria-live="polite" className={`schedule-feedback ${feedback.kind}`}>
          {feedback.message}
        </p>
      ) : null}

      <div className="scheduling-workbench">
        <ScheduleCalendar
          calendar={state.calendar}
          month={month}
          onSelect={(scheduleId) => {
            setFeedback({ kind: "idle" });
            setPreview(undefined);
            setSelectedScheduleId(scheduleId);
            setEditor({ kind: "closed" });
          }}
          publicationTitles={publicationTitles}
          selectedScheduleId={selectedScheduleId}
        />

        <aside aria-live="polite" className="schedule-detail" ref={detail}>
          {editor.kind === "create" ? (
            <>
              <label className="schedule-publication-picker">
                Pieza aprobada
                <select
                  onChange={(event) => {
                    setCreatePublicationId(event.target.value);
                  }}
                  value={createPublicationId ?? ""}
                >
                  {eligiblePublications.map((publication) => (
                    <option key={publication.id} value={publication.id}>
                      {publication.title}
                    </option>
                  ))}
                </select>
              </label>
              {createPublication === undefined ? null : (
                <ScheduleRuleForm
                  defaultTargets={approvalTargetsFor(createPublication.format)}
                  key={`create-${createPublication.id}`}
                  kind="create"
                  onCreate={async (rule: ScheduleRuleSubmission) => {
                    setPending(true);
                    setFeedback({ kind: "idle" });
                    const result = await createPublicationSchedule(
                      apiBaseUrl,
                      createPublication.id,
                      createPublication.version,
                      rule,
                      idempotencyKey(),
                    );
                    setPending(false);
                    if (result.kind === "ready") {
                      setFeedback({
                        kind: "success",
                        message: `Quedó programada: ${String(result.value.materializedOccurrenceCount)} ${result.value.materializedOccurrenceCount === 1 ? "salida" : "salidas"}.`,
                      });
                      setEditor({ kind: "closed" });
                      setSelectedScheduleId(result.value.scheduleId);
                      await showMonthOf(rule.effectiveFromLocalDate);
                      return;
                    }
                    setFeedback({
                      kind: "error",
                      message:
                        result.kind === "forbidden"
                          ? "No tenés permiso para crear esta programación."
                          : result.message,
                    });
                  }}
                  pending={pending}
                />
              )}
            </>
          ) : editor.kind === "move" && activeEntry !== undefined ? (
            <ScheduleRuleForm
              initial={activeEntry.schedule}
              key={`move-${activeEntry.schedule.id}-${activeEntry.schedule.version}`}
              kind="move"
              onPreview={async (rule: ScheduleRuleSubmission) => {
                setPreview(undefined);
                const result = await previewPublicationScheduleUpdate(
                  apiBaseUrl,
                  activeEntry.schedule.id,
                  activeEntry.schedule.version,
                  rule,
                );
                if (result.kind === "ready") {
                  setPreview(result.value);
                  return;
                }
                setFeedback({
                  kind: "error",
                  message:
                    result.kind === "forbidden"
                      ? "No tenés permiso para calcular este cambio."
                      : result.message,
                });
              }}
              onUpdate={async (rule: ScheduleRuleSubmission) => {
                setPending(true);
                const result = await updatePublicationSchedule(
                  apiBaseUrl,
                  activeEntry.schedule.id,
                  activeEntry.schedule.version,
                  rule,
                  idempotencyKey(),
                );
                setPending(false);
                if (result.kind === "ready") {
                  setFeedback({
                    kind: "success",
                    message: `Cambio guardado: ${String(result.value.createdOccurrenceCount)} salidas nuevas, ${String(result.value.rescheduledOccurrenceCount)} movidas y ${String(result.value.frozenOccurrenceCount)} que ya no se tocan.`,
                  });
                  setEditor({ kind: "closed" });
                  setPreview(undefined);
                  await showMonthOf(rule.effectiveFromLocalDate);
                  return;
                }
                setFeedback({
                  kind: "error",
                  message:
                    result.kind === "forbidden"
                      ? "No tenés permiso para mover esta programación."
                      : result.message,
                });
              }}
              pending={pending}
              preview={preview}
            />
          ) : activeEntry === undefined ? (
            <div className="schedule-detail-empty">
              <h2>Tocá una salida</h2>
              <p>
                Vas a ver cuándo sale, a dónde y cómo moverla o pausarla.
                Tocarla no cambia nada.
              </p>
            </div>
          ) : (
            <>
              <p className="workspace-eyebrow">Revisión aprobada</p>
              <h2>{scheduleLabel(activeEntry, publicationTitles)}</h2>
              <Link
                className="schedule-detail-link"
                href={publicationHref(activeEntry.schedule.publicationId)}
              >
                Ver la pieza
              </Link>
              <dl className="schedule-facts">
                <div>
                  <dt>Frecuencia</dt>
                  <dd>{recurrenceLabel(activeEntry)}</dd>
                </div>
                <div>
                  <dt>Dónde sale</dt>
                  <dd>{scheduleTargetsLabel(activeEntry.schedule.targets)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{scheduleStatusLabels[activeEntry.schedule.status]}</dd>
                </div>
              </dl>
              <ol className="schedule-occurrences">
                {activeEntry.occurrences.map((occurrence) => (
                  <li
                    data-status={occurrence.status}
                    key={occurrence.occurrenceKey}
                  >
                    <time dateTime={occurrence.scheduledAt}>
                      {localDateTime(
                        occurrence.scheduledAt,
                        activeEntry.schedule.timeZone,
                      )}
                    </time>
                    <span>
                      {occurrenceStatusLabels[occurrence.status]}
                      {occurrence.dispatchRequestedAt === undefined
                        ? ""
                        : " · despacho pedido"}
                    </span>
                  </li>
                ))}
              </ol>
              {state.canSchedule &&
              (activeEntry.schedule.status === "active" ||
                activeEntry.schedule.status === "paused") ? (
                <div className="schedule-detail-actions">
                  <button
                    className="workspace-secondary-action"
                    disabled={pending}
                    onClick={() => {
                      setPreview(undefined);
                      setEditor({
                        kind: "move",
                        scheduleId: activeEntry.schedule.id,
                      });
                    }}
                    type="button"
                  >
                    Mover
                  </button>
                  {activeEntry.schedule.status === "active" ? (
                    <button
                      className="workspace-secondary-action"
                      disabled={pending}
                      onClick={() => void action("pause")}
                      type="button"
                    >
                      Pausar
                    </button>
                  ) : (
                    <button
                      className="workspace-secondary-action"
                      disabled={pending}
                      onClick={() => void action("resume")}
                      type="button"
                    >
                      Reanudar
                    </button>
                  )}
                  <button
                    className="workspace-danger-action"
                    disabled={pending}
                    onClick={() => void action("cancel")}
                    type="button"
                  >
                    Cancelar salida
                  </button>
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
