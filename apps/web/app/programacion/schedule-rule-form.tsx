"use client";

import type {
  PreviewPublicationScheduleUpdateResponse,
  PublicationScheduleResponse,
} from "@aramayo/contracts";
import { useMemo, useState } from "react";

import type { ScheduleRuleSubmission } from "../../lib/publication-schedule-api";

interface RuleDraft {
  readonly effectiveFromLocalDate: string;
  readonly effectiveUntilLocalDate: string;
  readonly gapPolicy: "next-valid" | "skip";
  readonly lateToleranceMinutes: string;
  readonly localTime: string;
  readonly missedPolicy: "run-late" | "skip";
  readonly monthDay: string;
  readonly monthDayOverflow: "clamp" | "skip";
  readonly recurrenceInterval: string;
  readonly recurrenceKind: "daily" | "monthly" | "once" | "weekly";
  readonly targets: readonly (
    "facebook_page" | "instagram_feed" | "instagram_story"
  )[];
  readonly timeZone: string;
  readonly weekdays: readonly number[];
}

type ScheduleRuleFormProps =
  | Readonly<{
      kind: "create";
      onCreate: (rule: ScheduleRuleSubmission) => Promise<void>;
      pending: boolean;
    }>
  | Readonly<{
      initial: PublicationScheduleResponse;
      kind: "move";
      onPreview: (rule: ScheduleRuleSubmission) => Promise<void>;
      onUpdate: (rule: ScheduleRuleSubmission) => Promise<void>;
      pending: boolean;
      preview: PreviewPublicationScheduleUpdateResponse | undefined;
    }>;

const weekdayLabels = Object.freeze([
  { label: "L", value: 1 },
  { label: "M", value: 2 },
  { label: "X", value: 3 },
  { label: "J", value: 4 },
  { label: "V", value: 5 },
  { label: "S", value: 6 },
  { label: "D", value: 7 },
]);

const recurrenceOptions: readonly Readonly<{
  label: string;
  value: RuleDraft["recurrenceKind"];
}>[] = Object.freeze([
  { label: "Una vez", value: "once" },
  { label: "Diaria", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensual", value: "monthly" },
]);

const targetOptions: readonly Readonly<{
  label: string;
  value: RuleDraft["targets"][number];
}>[] = Object.freeze([
  { label: "Instagram feed", value: "instagram_feed" },
  { label: "Instagram story", value: "instagram_story" },
  { label: "Facebook Page", value: "facebook_page" },
]);

function localDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const part = (kind: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function initialDraft(schedule?: PublicationScheduleResponse): RuleDraft {
  if (schedule === undefined) {
    const targets: RuleDraft["targets"] = ["instagram_feed"];
    const weekdays: RuleDraft["weekdays"] = [1];
    return Object.freeze({
      effectiveFromLocalDate: "",
      effectiveUntilLocalDate: "",
      gapPolicy: "skip",
      lateToleranceMinutes: "0",
      localTime: "09:00",
      missedPolicy: "skip",
      monthDay: "1",
      monthDayOverflow: "clamp",
      recurrenceInterval: "1",
      recurrenceKind: "once",
      targets,
      timeZone: "America/Argentina/Cordoba",
      weekdays,
    });
  }
  const recurrence = schedule.recurrence;
  return Object.freeze({
    effectiveFromLocalDate: localDate(
      schedule.effectiveFrom,
      schedule.timeZone,
    ),
    effectiveUntilLocalDate:
      recurrence.kind === "once" || schedule.effectiveUntil === undefined
        ? ""
        : localDate(schedule.effectiveUntil, schedule.timeZone),
    gapPolicy: schedule.gapPolicy,
    lateToleranceMinutes: String(schedule.lateToleranceMinutes),
    localTime: schedule.localTime,
    missedPolicy: schedule.missedPolicy,
    monthDay: recurrence.kind === "monthly" ? String(recurrence.monthDay) : "1",
    monthDayOverflow:
      recurrence.kind === "monthly" ? recurrence.overflow : "clamp",
    recurrenceInterval:
      recurrence.kind === "once" ? "1" : String(recurrence.interval),
    recurrenceKind: recurrence.kind,
    targets: schedule.targets,
    timeZone: schedule.timeZone,
    weekdays: recurrence.kind === "weekly" ? recurrence.weekdays : [1],
  });
}

function submission(draft: RuleDraft): ScheduleRuleSubmission | null {
  const lateToleranceMinutes = Number(draft.lateToleranceMinutes);
  if (
    draft.effectiveFromLocalDate.length === 0 ||
    !Number.isSafeInteger(lateToleranceMinutes) ||
    lateToleranceMinutes < 0 ||
    draft.targets.length === 0
  ) {
    return null;
  }
  const base: Readonly<{
    effectiveFromLocalDate: string;
    effectiveUntilLocalDate?: string;
    gapPolicy: "next-valid" | "skip";
    lateToleranceMinutes: number;
    localTime: string;
    missedPolicy: "run-late" | "skip";
    recurrenceKind: RuleDraft["recurrenceKind"];
    targets: RuleDraft["targets"];
    timeZone: string;
  }> = {
    effectiveFromLocalDate: draft.effectiveFromLocalDate,
    ...(draft.effectiveUntilLocalDate.length === 0
      ? {}
      : { effectiveUntilLocalDate: draft.effectiveUntilLocalDate }),
    gapPolicy: draft.gapPolicy,
    lateToleranceMinutes,
    localTime: draft.localTime,
    missedPolicy: draft.missedPolicy,
    recurrenceKind: draft.recurrenceKind,
    targets: draft.targets,
    timeZone: draft.timeZone,
  };
  switch (draft.recurrenceKind) {
    case "once":
      return Object.freeze(base);
    case "daily": {
      const recurrenceInterval = Number(draft.recurrenceInterval);
      return Number.isSafeInteger(recurrenceInterval) && recurrenceInterval > 0
        ? Object.freeze({ ...base, recurrenceInterval })
        : null;
    }
    case "weekly": {
      const recurrenceInterval = Number(draft.recurrenceInterval);
      return Number.isSafeInteger(recurrenceInterval) &&
        recurrenceInterval > 0 &&
        draft.weekdays.length > 0
        ? Object.freeze({
            ...base,
            recurrenceInterval,
            weekdays: draft.weekdays,
          })
        : null;
    }
    case "monthly": {
      const recurrenceInterval = Number(draft.recurrenceInterval);
      const monthDay = Number(draft.monthDay);
      return Number.isSafeInteger(recurrenceInterval) &&
        recurrenceInterval > 0 &&
        Number.isSafeInteger(monthDay) &&
        monthDay >= 1 &&
        monthDay <= 31
        ? Object.freeze({
            ...base,
            monthDay,
            monthDayOverflow: draft.monthDayOverflow,
            recurrenceInterval,
          })
        : null;
    }
  }
}

function ruleKey(rule: ScheduleRuleSubmission): string {
  return JSON.stringify(rule);
}

function impactText(preview: PreviewPublicationScheduleUpdateResponse): string {
  return `${String(preview.createdOccurrenceCount)} nuevas, ${String(preview.rescheduledOccurrenceCount)} reprogramadas, ${String(preview.cancelledOccurrenceCount)} retiradas y ${String(preview.frozenOccurrenceCount)} congeladas.`;
}

export function ScheduleRuleForm(props: ScheduleRuleFormProps) {
  const [draft, setDraft] = useState<RuleDraft>(() =>
    initialDraft(props.kind === "move" ? props.initial : undefined),
  );
  const [previewKey, setPreviewKey] = useState<string | undefined>();
  const currentSubmission = useMemo(() => submission(draft), [draft]);
  const canConfirmMove =
    props.kind === "move" &&
    currentSubmission !== null &&
    previewKey === ruleKey(currentSubmission) &&
    props.preview !== undefined;
  const update = (next: Partial<RuleDraft>): void => {
    setPreviewKey(undefined);
    setDraft((current) => Object.freeze({ ...current, ...next }));
  };
  const toggleTarget = (
    target: "facebook_page" | "instagram_feed" | "instagram_story",
  ): void => {
    const hasTarget = draft.targets.includes(target);
    update({
      targets: hasTarget
        ? draft.targets.filter((entry) => entry !== target)
        : [...draft.targets, target],
    });
  };
  const toggleWeekday = (weekday: number): void => {
    const hasWeekday = draft.weekdays.includes(weekday);
    update({
      weekdays: hasWeekday
        ? draft.weekdays.filter((entry) => entry !== weekday)
        : [...draft.weekdays, weekday].sort((left, right) => left - right),
    });
  };
  const submitCreate = async (): Promise<void> => {
    if (currentSubmission !== null && props.kind === "create") {
      await props.onCreate(currentSubmission);
    }
  };
  const calculateImpact = async (): Promise<void> => {
    if (currentSubmission !== null && props.kind === "move") {
      await props.onPreview(currentSubmission);
      setPreviewKey(ruleKey(currentSubmission));
    }
  };
  const submitMove = async (): Promise<void> => {
    if (canConfirmMove) {
      await props.onUpdate(currentSubmission);
    }
  };

  return (
    <form
      className="schedule-rule-form"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div>
        <p className="workspace-eyebrow">
          {props.kind === "create" ? "Nueva intención" : "Mover regla"}
        </p>
        <h2>
          {props.kind === "create" ? "Definí el turno" : "Calculá el impacto"}
        </h2>
        <p>
          La fecha civil, la hora y la zona IANA son la intención original. El
          instante UTC se deriva al guardar.
        </p>
      </div>

      <div className="schedule-rule-grid">
        <label>
          Fecha local inicial
          <input
            onChange={(event) => {
              update({ effectiveFromLocalDate: event.target.value });
            }}
            required
            type="date"
            value={draft.effectiveFromLocalDate}
          />
        </label>
        <label>
          Hora local
          <input
            onChange={(event) => {
              update({ localTime: event.target.value });
            }}
            required
            type="time"
            value={draft.localTime}
          />
        </label>
        <label>
          Zona IANA
          <input
            onChange={(event) => {
              update({ timeZone: event.target.value });
            }}
            required
            value={draft.timeZone}
          />
        </label>
        <label>
          Vigencia final (opcional)
          <input
            disabled={draft.recurrenceKind === "once"}
            onChange={(event) => {
              update({ effectiveUntilLocalDate: event.target.value });
            }}
            type="date"
            value={draft.effectiveUntilLocalDate}
          />
        </label>
      </div>

      <fieldset className="schedule-recurrence">
        <legend>Frecuencia</legend>
        <div>
          {recurrenceOptions.map(({ label, value }) => (
            <label key={value}>
              <input
                checked={draft.recurrenceKind === value}
                name="recurrenceKind"
                onChange={() => {
                  update({
                    effectiveUntilLocalDate:
                      value === "once" ? "" : draft.effectiveUntilLocalDate,
                    recurrenceKind: value,
                  });
                }}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {draft.recurrenceKind !== "once" ? (
        <label className="schedule-rule-number">
          Cada cuántas unidades
          <input
            min="1"
            onChange={(event) => {
              update({ recurrenceInterval: event.target.value });
            }}
            required
            type="number"
            value={draft.recurrenceInterval}
          />
        </label>
      ) : null}

      {draft.recurrenceKind === "weekly" ? (
        <fieldset className="schedule-weekdays">
          <legend>Días de salida</legend>
          <div>
            {weekdayLabels.map((weekday) => (
              <button
                aria-pressed={draft.weekdays.includes(weekday.value)}
                key={weekday.value}
                onClick={() => {
                  toggleWeekday(weekday.value);
                }}
                type="button"
              >
                {weekday.label}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {draft.recurrenceKind === "monthly" ? (
        <div className="schedule-rule-grid">
          <label>
            Día del mes
            <input
              max="31"
              min="1"
              onChange={(event) => {
                update({ monthDay: event.target.value });
              }}
              required
              type="number"
              value={draft.monthDay}
            />
          </label>
          <label>
            Si no existe ese día
            <select
              onChange={(event) => {
                if (
                  event.target.value === "clamp" ||
                  event.target.value === "skip"
                ) {
                  update({ monthDayOverflow: event.target.value });
                }
              }}
              value={draft.monthDayOverflow}
            >
              <option value="clamp">Usar último día</option>
              <option value="skip">Saltear el mes</option>
            </select>
          </label>
        </div>
      ) : null}

      <fieldset className="schedule-targets">
        <legend>Destinos aprobados</legend>
        {targetOptions.map(({ label, value }) => (
          <label key={value}>
            <input
              checked={draft.targets.includes(value)}
              onChange={() => {
                toggleTarget(value);
              }}
              type="checkbox"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="schedule-rule-grid">
        <label>
          Atraso permitido (minutos)
          <input
            max="1440"
            min="0"
            onChange={(event) => {
              update({ lateToleranceMinutes: event.target.value });
            }}
            required
            type="number"
            value={draft.lateToleranceMinutes}
          />
        </label>
        <label>
          Si llega tarde
          <select
            onChange={(event) => {
              if (
                event.target.value === "run-late" ||
                event.target.value === "skip"
              ) {
                update({ missedPolicy: event.target.value });
              }
            }}
            value={draft.missedPolicy}
          >
            <option value="skip">No publicar</option>
            <option value="run-late">Publicar dentro de la tolerancia</option>
          </select>
        </label>
      </div>

      {props.kind === "move" && props.preview !== undefined ? (
        <p aria-live="polite" className="schedule-impact">
          <strong>Impacto calculado:</strong> {impactText(props.preview)} Las
          congeladas ya tienen job u orden y no se moverán.
        </p>
      ) : null}

      <div className="schedule-rule-actions">
        {props.kind === "create" ? (
          <button
            className="workspace-primary-action"
            disabled={props.pending || currentSubmission === null}
            onClick={() => void submitCreate()}
            type="button"
          >
            Crear programación
          </button>
        ) : (
          <>
            <button
              className="workspace-secondary-action"
              disabled={props.pending || currentSubmission === null}
              onClick={() => void calculateImpact()}
              type="button"
            >
              Calcular impacto
            </button>
            <button
              className="workspace-primary-action"
              disabled={props.pending || !canConfirmMove}
              onClick={() => void submitMove()}
              type="button"
            >
              Confirmar cambio
            </button>
          </>
        )}
        <span>
          {props.pending
            ? "Procesando acción…"
            : props.kind === "move" && !canConfirmMove
              ? "Primero calculá el impacto de esta versión."
              : "No publica ni despacha esta acción."}
        </span>
      </div>
    </form>
  );
}
