"use client";

import type {
  LocationConfigurationResponse,
  LocationDayOverrideImpactResponse,
  LocationDayOverrideResponse,
} from "@aramayo/contracts";
import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
} from "react";

import {
  deleteLocationDayOverride,
  loadLocationDayOverrides,
  previewLocationDayOverride,
  saveLocationDayOverride,
  type LocationDayOverrideSubmission,
} from "../../lib/location-day-override-api";

type OverrideDraft = Readonly<{
  localDate: string;
  openingHours: string;
  sourceLabel: string;
  status: "closed" | "open";
}>;

type OverridesState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      kind: "ready";
      notice?: Readonly<{ message: string; tone: "error" | "success" }>;
      overrides: readonly LocationDayOverrideResponse[];
      pending: boolean;
    }>;

/** El impacto sólo vale para el borrador exacto con el que se calculó. */
type PreviewState = Readonly<{
  draft: OverrideDraft;
  impact: LocationDayOverrideImpactResponse;
}>;

const rangeDays = 92;
const millisecondsPerDay = 86_400_000;

function civilToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const field = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

function civilDatePlus(localDate: string, days: number): string {
  return new Date(
    Date.parse(`${localDate}T00:00:00.000Z`) + days * millisecondsPerDay,
  )
    .toISOString()
    .slice(0, 10);
}

function emptyDraft(localDate: string): OverrideDraft {
  return {
    localDate,
    openingHours: "",
    sourceLabel: "",
    status: "closed",
  };
}

function draftOf(override: LocationDayOverrideResponse): OverrideDraft {
  return {
    localDate: override.localDate,
    openingHours: override.status === "open" ? override.openingHours : "",
    sourceLabel: override.sourceLabel,
    status: override.status,
  };
}

function submissionOf(
  draft: OverrideDraft,
  expectedVersion: number | undefined,
): LocationDayOverrideSubmission {
  const version = expectedVersion === undefined ? {} : { expectedVersion };
  return draft.status === "closed"
    ? {
        ...version,
        localDate: draft.localDate,
        sourceLabel: draft.sourceLabel,
        status: "closed",
      }
    : {
        ...version,
        localDate: draft.localDate,
        openingHours: draft.openingHours,
        sourceLabel: draft.sourceLabel,
        status: "open",
      };
}

function sameDraft(left: OverrideDraft, right: OverrideDraft): boolean {
  return (
    left.localDate === right.localDate &&
    left.openingHours === right.openingHours &&
    left.sourceLabel === right.sourceLabel &&
    left.status === right.status
  );
}

function civilDateLabel(localDate: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(new Date(`${localDate}T00:00:00.000Z`));
}

function impactSentence(impact: LocationDayOverrideImpactResponse): string {
  const stories =
    impact.affectedStoryCount === 0
      ? "No hay historias futuras de esa fecha que cambien"
      : impact.affectedStoryCount === 1
        ? "1 historia futura vuelve a revisión y su programación se cancela"
        : `${String(impact.affectedStoryCount)} historias futuras vuelven a revisión y sus programaciones se cancelan`;
  const consequence = impact.willBlockHoursSensitiveStories
    ? "Con la sucursal cerrada, ninguna historia sensible a horario se publica ese día."
    : "El horario especial se cita como fuente y exige aprobación humana.";
  return `${stories}. ${consequence}`;
}

export function LocationDayOverridesSection({
  apiBaseUrl,
  canEdit,
  location,
}: {
  readonly apiBaseUrl: string;
  readonly canEdit: boolean;
  readonly location: LocationConfigurationResponse;
}) {
  const [state, setState] = useState<OverridesState>({ kind: "loading" });
  const [draft, setDraft] = useState<OverrideDraft>(() =>
    emptyDraft(civilToday(location.timeZone)),
  );
  const [editing, setEditing] = useState<LocationDayOverrideResponse | null>(
    null,
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const startDate = civilToday(location.timeZone);
  const endDate = civilDatePlus(startDate, rangeDays);

  const reload = useCallback(
    (notice?: string) => {
      void loadLocationDayOverrides(apiBaseUrl, location.id, {
        endDate,
        startDate,
      }).then((result) => {
        startTransition(() => {
          setState(
            result.kind === "ready"
              ? {
                  kind: "ready",
                  ...(notice === undefined
                    ? {}
                    : {
                        notice: { message: notice, tone: "success" as const },
                      }),
                  overrides: result.value.overrides,
                  pending: false,
                }
              : result.kind === "forbidden"
                ? { kind: "forbidden" }
                : {
                    kind: "error",
                    message:
                      result.kind === "conflict"
                        ? "Las excepciones cambiaron en otra sesión. Recargá la pantalla."
                        : result.message,
                  },
          );
        });
      });
    },
    [apiBaseUrl, endDate, location.id, startDate],
  );

  useEffect(() => {
    let active = true;
    void loadLocationDayOverrides(apiBaseUrl, location.id, {
      endDate,
      startDate,
    }).then((result) => {
      if (!active) return;
      startTransition(() => {
        setState(
          result.kind === "ready"
            ? {
                kind: "ready",
                overrides: result.value.overrides,
                pending: false,
              }
            : result.kind === "forbidden"
              ? { kind: "forbidden" }
              : {
                  kind: "error",
                  message:
                    result.kind === "conflict"
                      ? "Las excepciones cambiaron en otra sesión. Recargá la pantalla."
                      : result.message,
                },
        );
      });
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, endDate, location.id, startDate]);

  const changeDraft = useCallback((update: Partial<OverrideDraft>) => {
    // Un impacto calculado deja de valer apenas cambia cualquier campo.
    setPreview(null);
    setDraft((current) => ({ ...current, ...update }));
  }, []);

  const notice = useCallback((message: string, tone: "error" | "success") => {
    startTransition(() => {
      setState((current) =>
        current.kind === "ready"
          ? { ...current, notice: { message, tone }, pending: false }
          : current,
      );
    });
  }, []);

  const pending = useCallback((value: boolean) => {
    startTransition(() => {
      setState((current) =>
        current.kind === "ready" ? { ...current, pending: value } : current,
      );
    });
  }, []);

  function edit(override: LocationDayOverrideResponse): void {
    setPreview(null);
    setRemoving(null);
    setEditing(override);
    setDraft(draftOf(override));
  }

  function cancelEdit(): void {
    setPreview(null);
    setEditing(null);
    setDraft(emptyDraft(startDate));
  }

  function calculateImpact(event: SyntheticEvent<HTMLButtonElement>): void {
    event.preventDefault();
    const requested = draft;
    pending(true);
    void previewLocationDayOverride(
      apiBaseUrl,
      location.id,
      submissionOf(requested, undefined),
    ).then((result) => {
      pending(false);
      if (result.kind === "ready") {
        startTransition(() => {
          setPreview({ draft: requested, impact: result.value.impact });
        });
        return;
      }
      notice(
        result.kind === "forbidden"
          ? "No tenés permisos para gestionar excepciones."
          : result.kind === "conflict"
            ? "La excepción cambió en otra sesión. Recargá antes de calcular."
            : result.message,
        "error",
      );
    });
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (preview === null || !sameDraft(preview.draft, draft)) return;
    pending(true);
    void saveLocationDayOverride(
      apiBaseUrl,
      location.id,
      submissionOf(draft, editing?.version),
    ).then((result) => {
      if (result.kind === "ready") {
        const saved = result.value.impact;
        setPreview(null);
        setEditing(null);
        setDraft(emptyDraft(startDate));
        reload(
          `Excepción guardada para el ${civilDateLabel(saved.localDate)}. ${impactSentence(saved)}.`,
        );
        return;
      }
      pending(false);
      notice(
        result.kind === "forbidden"
          ? "No tenés permisos para gestionar excepciones."
          : result.kind === "conflict"
            ? "La excepción cambió en otra sesión. Recargá antes de guardar."
            : result.message,
        "error",
      );
    });
  }

  function remove(override: LocationDayOverrideResponse): void {
    pending(true);
    void deleteLocationDayOverride(
      apiBaseUrl,
      location.id,
      override.localDate,
      override.version,
    ).then((result) => {
      setRemoving(null);
      if (result.kind === "ready") {
        if (editing?.id === override.id) cancelEdit();
        reload(
          `Excepción quitada del ${civilDateLabel(override.localDate)}. ${impactSentence(result.value.impact)}.`,
        );
        return;
      }
      pending(false);
      notice(
        result.kind === "forbidden"
          ? "No tenés permisos para gestionar excepciones."
          : result.kind === "conflict"
            ? "La excepción cambió en otra sesión. Recargá antes de quitarla."
            : result.message,
        "error",
      );
    });
  }

  const headingId = `location-overrides-${location.id}`;
  const busy = state.kind === "ready" && state.pending;
  const impactMatchesDraft =
    preview !== null && sameDraft(preview.draft, draft);

  return (
    <section aria-labelledby={headingId} className="location-overrides">
      <div className="configuration-section-heading">
        <div>
          <p className="configuration-eyebrow">
            Feriados y horarios especiales
          </p>
          <h4 id={headingId}>Excepciones de {location.name}</h4>
          <p className="location-overrides-hint">
            Las fechas son civiles en {location.timeZone}. Una excepción manda
            sobre el horario semanal y obliga a revisar de nuevo lo que ya
            estaba programado para ese día.
          </p>
        </div>
        <span>
          {civilDateLabel(startDate)} — {civilDateLabel(endDate)}
        </span>
      </div>

      {state.kind === "loading" ? (
        <p className="configuration-empty">Consultando excepciones…</p>
      ) : null}
      {state.kind === "forbidden" ? (
        <p className="configuration-empty">
          No tenés permisos para ver las excepciones de esta sucursal.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p
          className="configuration-notice configuration-notice-error"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {state.notice === undefined ? null : (
            <p
              className={`configuration-notice configuration-notice-${state.notice.tone}`}
              role={state.notice.tone === "error" ? "alert" : "status"}
            >
              {state.notice.message}
            </p>
          )}
          {state.overrides.length === 0 ? (
            <p className="configuration-empty">
              No hay cierres ni horarios especiales cargados en esta ventana.
            </p>
          ) : (
            <ul className="location-override-list">
              {state.overrides.map((override) => (
                <li key={override.id}>
                  <div>
                    <p className="location-override-date">
                      {civilDateLabel(override.localDate)}
                    </p>
                    <p className="location-override-detail">
                      {override.status === "closed"
                        ? "Cerrado todo el día"
                        : `Horario especial: ${override.openingHours}`}
                    </p>
                    <p className="location-override-source">
                      {override.sourceLabel} · versión {override.version}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="location-override-actions">
                      <button
                        disabled={busy}
                        onClick={() => {
                          edit(override);
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                      {removing === override.id ? (
                        <button
                          disabled={busy}
                          onClick={() => {
                            remove(override);
                          }}
                          type="button"
                        >
                          Confirmar quitar
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => {
                            setRemoving(override.id);
                          }}
                          type="button"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ) : null}
                  {removing === override.id ? (
                    <p className="location-override-warning" role="status">
                      Quitar la excepción devuelve el día al horario semanal y
                      manda a revisión las historias futuras que ya la citaban.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <form className="location-override-form" onSubmit={submit}>
              <div className="configuration-grid">
                <label>
                  Fecha
                  <input
                    disabled={busy || editing !== null}
                    name="localDate"
                    onChange={(event) => {
                      changeDraft({ localDate: event.currentTarget.value });
                    }}
                    required
                    type="date"
                    value={draft.localDate}
                  />
                </label>
                <label>
                  Qué pasa ese día
                  <select
                    disabled={busy}
                    name="status"
                    onChange={(event) => {
                      changeDraft({
                        status:
                          event.currentTarget.value === "open"
                            ? "open"
                            : "closed",
                      });
                    }}
                    value={draft.status}
                  >
                    <option value="closed">Cerrado todo el día</option>
                    <option value="open">Abre con horario especial</option>
                  </select>
                </label>
                {draft.status === "open" ? (
                  <label className="configuration-wide">
                    Horario especial
                    <input
                      disabled={busy}
                      name="openingHours"
                      onChange={(event) => {
                        changeDraft({
                          openingHours: event.currentTarget.value,
                        });
                      }}
                      placeholder="09:00 a 13:00"
                      required
                      value={draft.openingHours}
                    />
                  </label>
                ) : null}
                <label className="configuration-wide">
                  Fuente del dato
                  <input
                    disabled={busy}
                    name="sourceLabel"
                    onChange={(event) => {
                      changeDraft({ sourceLabel: event.currentTarget.value });
                    }}
                    placeholder="Feriado nacional confirmado por la dueña"
                    required
                    value={draft.sourceLabel}
                  />
                </label>
              </div>

              {impactMatchesDraft ? (
                <p className="location-override-impact" role="status">
                  {impactSentence(preview.impact)} Fecha civil{" "}
                  {preview.impact.localDate} en {preview.impact.timeZone}.
                </p>
              ) : (
                <p className="location-override-impact" role="status">
                  Calculá el impacto antes de guardar: hasta verlo, el botón de
                  guardar queda bloqueado.
                </p>
              )}

              <div className="location-override-actions">
                <button
                  className="configuration-button"
                  disabled={busy}
                  onClick={calculateImpact}
                  type="button"
                >
                  Ver impacto
                </button>
                <button
                  className="configuration-button"
                  disabled={busy || !impactMatchesDraft}
                  type="submit"
                >
                  {editing === null
                    ? "Guardar excepción"
                    : "Actualizar excepción"}
                </button>
                {editing === null ? null : (
                  <button disabled={busy} onClick={cancelEdit} type="button">
                    Cancelar edición
                  </button>
                )}
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
