"use client";

import type {
  LocationConfigurationResponse,
  RecurringStoryApprovalPolicyResponse,
  RecurringStoryWorkspaceResponse,
} from "@aramayo/contracts";
import { FORMATS } from "@aramayo/design-engine";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from "react";

import {
  loadRecurringStoryWorkspace,
  saveRecurringStoryRule,
} from "../../lib/recurring-story-api.ts";

type LoadState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; workspace: RecurringStoryWorkspaceResponse }>;

const weekdays = Object.freeze([
  { label: "L", longLabel: "Lunes", value: 1 },
  { label: "M", longLabel: "Martes", value: 2 },
  { label: "X", longLabel: "Miércoles", value: 3 },
  { label: "J", longLabel: "Jueves", value: 4 },
  { label: "V", longLabel: "Viernes", value: 5 },
  { label: "S", longLabel: "Sábado", value: 6 },
  { label: "D", longLabel: "Domingo", value: 7 },
]);

function nextLocalDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// El formato y sus zonas seguras tienen una única definición en el motor de
// diseño. La vista previa las traduce a porcentajes en lugar de repetir
// márgenes propios que podrían desincronizarse del render real.
const storyFormat = FORMATS.historia;

function safeAreaPercentage(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`;
}

const storyPreviewStyle: CSSProperties &
  Record<`--story-safe-${string}`, string> = {
  "--story-safe-bottom": safeAreaPercentage(
    storyFormat.safeArea.bottom,
    storyFormat.height,
  ),
  "--story-safe-left": safeAreaPercentage(
    storyFormat.safeArea.left,
    storyFormat.width,
  ),
  "--story-safe-right": safeAreaPercentage(
    storyFormat.safeArea.right,
    storyFormat.width,
  ),
  "--story-safe-top": safeAreaPercentage(
    storyFormat.safeArea.top,
    storyFormat.height,
  ),
  aspectRatio: `${String(storyFormat.width)} / ${String(storyFormat.height)}`,
};

function LocationStoryPreview({
  location,
}: {
  readonly location: LocationConfigurationResponse;
}) {
  return (
    <aside
      aria-label={`Vista previa en zona segura de ${storyFormat.label}`}
      className="recurring-story-preview"
      style={storyPreviewStyle}
    >
      <span className="story-safe-guide story-safe-guide-top">
        Zona segura superior
      </span>
      <div className="story-preview-content">
        <span className="story-preview-badge">Estamos atendiendo</span>
        <strong>Ya abrimos</strong>
        <p>{location.name}</p>
        <ul>
          <li>{location.openingHours || "Horario pendiente"}</li>
          <li>
            {location.addressLine}, {location.city}
          </li>
        </ul>
        <span className="story-preview-cta">Consultanos por WhatsApp</span>
      </div>
      <span className="story-safe-guide story-safe-guide-bottom">
        Zona segura inferior
      </span>
    </aside>
  );
}

function MaterializationRail({
  policy,
}: {
  readonly policy: RecurringStoryApprovalPolicyResponse;
}) {
  return (
    <ol aria-label="Flujo de la historia recurrente" className="recurring-flow">
      <li>
        <span>01</span>
        <div>
          <strong>Borrador fechado</strong>
          <small>Consulta sucursal y excepción del día.</small>
        </div>
      </li>
      <li>
        <span>02</span>
        <div>
          <strong>
            {policy === "human-each-cycle"
              ? "Revisión humana"
              : "Política automática"}
          </strong>
          <small>Un horario especial siempre vuelve a revisión.</small>
        </div>
      </li>
      <li>
        <span>03</span>
        <div>
          <strong>Ocurrencia única</strong>
          <small>Recién nace después de aprobar el snapshot.</small>
        </div>
      </li>
    </ol>
  );
}

export function RecurringStoryRuleComposer({
  apiBaseUrl,
  canSchedule,
}: {
  readonly apiBaseUrl: string;
  readonly canSchedule: boolean;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [name, setName] = useState("Apertura de sucursal");
  const [locationId, setLocationId] = useState("");
  const [localTime, setLocalTime] = useState("08:30");
  const [effectiveFromLocalDate, setEffectiveFromLocalDate] =
    useState(nextLocalDate);
  const [leadTimeMinutes, setLeadTimeMinutes] = useState(120);
  const [selectedWeekdays, setSelectedWeekdays] = useState<readonly number[]>([
    1, 2, 3, 4, 5, 6,
  ]);
  const [approvalPolicy, setApprovalPolicy] =
    useState<RecurringStoryApprovalPolicyResponse>("human-each-cycle");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadRecurringStoryWorkspace(apiBaseUrl).then((result) => {
      if (!active) return;
      if (result.kind === "ready") {
        setLoadState({ kind: "ready", workspace: result.workspace });
        setLocationId(
          (current) => current || result.workspace.locations[0]?.id || "",
        );
      } else {
        setLoadState(result);
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const selectedLocation = useMemo(
    () =>
      loadState.kind === "ready"
        ? loadState.workspace.locations.find(
            (location) => location.id === locationId,
          )
        : undefined,
    [loadState, locationId],
  );

  function toggleWeekday(weekday: number): void {
    idempotencyKey.current = null;
    setSelectedWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((candidate) => candidate !== weekday)
        : [...current, weekday].sort((left, right) => left - right),
    );
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSchedule || loadState.kind !== "ready") {
      setNotice("La sesión no permite crear reglas de programación.");
      return;
    }
    if (
      selectedLocation === undefined ||
      selectedWeekdays.length === 0 ||
      name.trim().length === 0
    ) {
      setNotice(
        "Elegí una sucursal, al menos un día y un nombre para la regla.",
      );
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setSaving(true);
    setNotice(
      "Guardando la regla; todavía no se crea ni publica una historia…",
    );
    void saveRecurringStoryRule(apiBaseUrl, {
      approvalPolicy,
      effectiveFromLocalDate,
      idempotencyKey: idempotencyKey.current,
      leadTimeMinutes,
      localTime,
      locationId: selectedLocation.id,
      name: name.trim(),
      weekdays: selectedWeekdays,
    }).then((result) => {
      startTransition(() => {
        setSaving(false);
        if (result.kind === "saved") {
          idempotencyKey.current = null;
          setLoadState((current) =>
            current.kind === "ready"
              ? {
                  kind: "ready",
                  workspace: {
                    ...current.workspace,
                    rules: [result.rule, ...current.workspace.rules],
                  },
                }
              : current,
          );
          setNotice(
            `Regla “${result.rule.name}” activa. El worker creará cada borrador dentro de la anticipación elegida.`,
          );
          return;
        }
        setNotice(
          result.kind === "forbidden"
            ? "La sesión no permite crear esta regla."
            : result.message,
        );
      });
    });
  }

  if (loadState.kind === "loading") {
    return (
      <section aria-busy="true" className="recurring-story-state">
        <p className="workspace-eyebrow">Historia recurrente</p>
        <h2>Cargando sucursales y políticas…</h2>
      </section>
    );
  }
  if (loadState.kind === "forbidden") {
    return (
      <section className="recurring-story-state" role="alert">
        <p className="workspace-eyebrow">Acceso requerido</p>
        <h2>No podés consultar las reglas recurrentes.</h2>
      </section>
    );
  }
  if (loadState.kind === "error") {
    return (
      <section className="recurring-story-state" role="alert">
        <p className="workspace-eyebrow">No se pudo cargar</p>
        <h2>{loadState.message}</h2>
      </section>
    );
  }
  if (
    loadState.workspace.locations.length === 0 ||
    selectedLocation === undefined
  ) {
    return (
      <section className="recurring-story-state">
        <p className="workspace-eyebrow">Sin sucursales activas</p>
        <h2>Primero configurá una sucursal con horario vigente.</h2>
        <p>Sin dirección y horario no se puede afirmar “Ya abrimos”.</p>
      </section>
    );
  }

  return (
    <>
      <form className="recurring-story-form" noValidate onSubmit={submit}>
        <div>
          <p className="workspace-eyebrow">
            Regla editorial · {storyFormat.ratio}
          </p>
          <h2>Convertí una rutina en borradores verificables.</h2>
          <p>
            La regla consulta el horario y la dirección al materializar. Un
            cierre, feriado o dato faltante bloquea la pieza.
          </p>
        </div>
        <label>
          Nombre de la regla
          <input
            disabled={!canSchedule || saving}
            maxLength={180}
            onChange={(event) => {
              idempotencyKey.current = null;
              setName(event.currentTarget.value);
            }}
            required
            value={name}
          />
        </label>
        <div className="recurring-story-grid">
          <label>
            Sucursal
            <select
              disabled={!canSchedule || saving}
              onChange={(event) => {
                idempotencyKey.current = null;
                setLocationId(event.currentTarget.value);
              }}
              value={locationId}
            >
              {loadState.workspace.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hora de publicación
            <input
              disabled={!canSchedule || saving}
              onChange={(event) => {
                idempotencyKey.current = null;
                setLocalTime(event.currentTarget.value);
              }}
              required
              type="time"
              value={localTime}
            />
          </label>
          <label>
            Vigente desde
            <input
              disabled={!canSchedule || saving}
              onChange={(event) => {
                idempotencyKey.current = null;
                setEffectiveFromLocalDate(event.currentTarget.value);
              }}
              required
              type="date"
              value={effectiveFromLocalDate}
            />
          </label>
          <label>
            Anticipación
            <select
              disabled={!canSchedule || saving}
              onChange={(event) => {
                idempotencyKey.current = null;
                setLeadTimeMinutes(Number(event.currentTarget.value));
              }}
              value={leadTimeMinutes}
            >
              <option value={60}>1 hora antes</option>
              <option value={120}>2 horas antes</option>
              <option value={720}>12 horas antes</option>
              <option value={1440}>1 día antes</option>
              <option value={10080}>1 semana antes</option>
            </select>
          </label>
        </div>
        <fieldset className="recurring-weekdays">
          <legend>Días de la semana</legend>
          <div>
            {weekdays.map((weekday) => (
              <button
                aria-label={weekday.longLabel}
                aria-pressed={selectedWeekdays.includes(weekday.value)}
                disabled={!canSchedule || saving}
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
        <fieldset className="recurring-policy">
          <legend>Política de aprobación</legend>
          <label>
            <input
              checked={approvalPolicy === "human-each-cycle"}
              disabled={!canSchedule || saving}
              name="approval-policy"
              onChange={() => {
                idempotencyKey.current = null;
                setApprovalPolicy("human-each-cycle");
              }}
              type="radio"
            />
            <span>
              <strong>Revisar cada ciclo</strong>
              <small>Cada borrador espera aprobación humana.</small>
            </span>
          </label>
          <label>
            <input
              checked={approvalPolicy === "automatic-routine"}
              disabled={
                !canSchedule ||
                !loadState.workspace.canUseAutomaticApproval ||
                saving
              }
              name="approval-policy"
              onChange={() => {
                idempotencyKey.current = null;
                setApprovalPolicy("automatic-routine");
              }}
              type="radio"
            />
            <span>
              <strong>Aprobar rutina normal</strong>
              <small>
                Sólo administradores; una excepción exige revisión igual.
              </small>
            </span>
          </label>
        </fieldset>
        <MaterializationRail policy={approvalPolicy} />
        <div className="recurring-story-actions">
          <p
            aria-live="polite"
            role={notice?.includes("No ") ? "alert" : "status"}
          >
            {notice ??
              `Fuente visible: sucursal v${String(selectedLocation.version)}. Se vuelve a consultar al crear cada borrador.`}
          </p>
          <button
            className="workspace-primary-action"
            disabled={!canSchedule || saving}
            type="submit"
          >
            {saving ? "Guardando…" : "Activar regla"}
          </button>
        </div>
        {loadState.workspace.rules.length === 0 ? null : (
          <div className="recurring-rule-list">
            <span>Reglas activas</span>
            <ul>
              {loadState.workspace.rules.slice(0, 3).map((rule) => (
                <li key={rule.id}>
                  <strong>{rule.name}</strong>
                  <small>
                    {rule.localTime} ·{" "}
                    {rule.approvalPolicy === "human-each-cycle"
                      ? "revisión por ciclo"
                      : "rutina automática"}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
      <LocationStoryPreview location={selectedLocation} />
    </>
  );
}
