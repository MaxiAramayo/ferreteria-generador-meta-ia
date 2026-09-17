"use client";

import type {
  LocationConfigurationResponse,
  RecurringStoryApprovalPolicyResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
} from "@aramayo/contracts";
import { FORMATS } from "@aramayo/design-engine";
import { AramayoMark } from "@aramayo/design-engine/react";
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
  saveRecurringStoryDesignRotation,
  saveRecurringStoryRule,
} from "../../../lib/recurring-story-api.ts";

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

const designVariants = Object.freeze([
  { label: "Cartel de apertura", value: "cartel" },
  { label: "Horario en foco", value: "horario" },
  { label: "Guía de sucursales", value: "locales" },
] as const satisfies readonly {
  readonly label: string;
  readonly value: RecurringStoryDesignVariantResponse;
}[]);

const defaultDesignRotation = Object.freeze([
  "cartel",
  "horario",
  "locales",
  "cartel",
  "horario",
  "locales",
  "cartel",
] as const satisfies readonly RecurringStoryDesignVariantResponse[]);

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

/**
 * Lo que la historia va a decir, con la misma regla que el worker: un horario
 * compartido se dice una vez y después las direcciones; si difiere, un renglón
 * por sucursal.
 */
function storyPreviewLines(
  locations: readonly LocationConfigurationResponse[],
): readonly string[] {
  const [first] = locations;
  if (first === undefined) return [];
  if (locations.length === 1) {
    return [
      first.openingHours || "Horario pendiente",
      `${first.addressLine}, ${first.city}`,
    ];
  }
  const shared = locations.every(
    (location) => location.openingHours === first.openingHours,
  );
  if (shared && first.openingHours && locations.length < 3) {
    return [
      first.openingHours,
      ...locations.map(
        (location) =>
          `${location.name} · ${location.addressLine}, ${location.city}`,
      ),
    ];
  }
  return locations
    .slice(0, 3)
    .map(
      (location) =>
        `${location.name} · ${location.openingHours || "Horario pendiente"}`,
    );
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1) ?? ""}`;
}

function rotationIndexForDate(localDate: string): number {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  return (date.getUTCDay() + 6) % 7;
}

function designLabel(variant: RecurringStoryDesignVariantResponse): string {
  return (
    designVariants.find((candidate) => candidate.value === variant)?.label ??
    "Diseño de apertura"
  );
}

function rotationForRule(
  rule: RecurringStoryRuleResponse,
): readonly RecurringStoryDesignVariantResponse[] {
  return rule.designRotation.length === 7
    ? rule.designRotation
    : defaultDesignRotation;
}

function LocationStoryPreview({
  design,
  locations,
}: {
  readonly design: RecurringStoryDesignVariantResponse;
  readonly locations: readonly LocationConfigurationResponse[];
}) {
  const city = locations[0]?.city ?? "la sucursal";
  return (
    <aside
      aria-label={`Vista previa en zona segura de ${storyFormat.label}`}
      className="recurring-story-preview"
      data-design={design}
      style={storyPreviewStyle}
    >
      <span className="story-safe-guide story-safe-guide-top">
        Zona segura superior
      </span>
      <div className="story-preview-content">
        <div className="story-preview-brand">
          <AramayoMark size={48} />
          <span>
            <strong>Ferretería Aramayo</strong>
            <small>En {city}</small>
          </span>
        </div>
        <span className="story-preview-badge">Estamos atendiendo</span>
        <strong>Ya abrimos</strong>
        <span className="story-preview-design">{designLabel(design)}</span>
        <p>{joinNames(locations.map((location) => location.name))}</p>
        <ul>
          {storyPreviewLines(locations).map((line) => (
            <li key={line}>{line}</li>
          ))}
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
          <strong>Programación y publicación</strong>
          <small>
            Al aprobar, se programa Instagram; el worker valida antes de
            publicar.
          </small>
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
  const [designRotation, setDesignRotation] = useState<
    readonly RecurringStoryDesignVariantResponse[]
  >(defaultDesignRotation);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRotation, setEditingRotation] = useState<
    readonly RecurringStoryDesignVariantResponse[]
  >(defaultDesignRotation);
  const [saving, setSaving] = useState(false);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const rotationIdempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadRecurringStoryWorkspace(apiBaseUrl).then((result) => {
      if (!active) return;
      if (result.kind === "ready") {
        setLoadState({ kind: "ready", workspace: result.workspace });
      } else {
        setLoadState(result);
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  // Vacío es «Ambas sucursales», el valor inicial: casi todas las historias
  // son para las dos.
  const selectedLocations = useMemo(
    () =>
      loadState.kind === "ready"
        ? loadState.workspace.locations.filter(
            (location) => locationId === "" || location.id === locationId,
          )
        : [],
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

  function chooseDesign(
    weekdayIndex: number,
    variant: RecurringStoryDesignVariantResponse,
  ): void {
    idempotencyKey.current = null;
    setDesignRotation((current) =>
      current.map((currentVariant, index) =>
        index === weekdayIndex ? variant : currentVariant,
      ),
    );
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canSchedule || loadState.kind !== "ready") {
      setNotice("La sesión no permite crear reglas de programación.");
      return;
    }
    if (
      selectedLocations.length === 0 ||
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
      designRotation,
      effectiveFromLocalDate,
      idempotencyKey: idempotencyKey.current,
      leadTimeMinutes,
      localTime,
      locationId: locationId === "" ? null : locationId,
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
            `Regla “${result.rule.name}” activa. Cada borrador se crea solo, con la anticipación elegida.`,
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

  function beginDesignEdit(rule: RecurringStoryRuleResponse): void {
    rotationIdempotencyKey.current = null;
    setEditingRotation(rotationForRule(rule));
    setEditingRuleId(rule.id);
    setNotice(
      "El cambio de diseño se aplicará a borradores futuros; no modifica historias ya aprobadas o publicadas.",
    );
  }

  function saveDesignEdit(rule: RecurringStoryRuleResponse): void {
    if (!canSchedule) {
      setNotice("La sesión no permite cambiar los diseños de esta regla.");
      return;
    }
    rotationIdempotencyKey.current ??= crypto.randomUUID();
    setSavingRuleId(rule.id);
    void saveRecurringStoryDesignRotation(apiBaseUrl, {
      designRotation: editingRotation,
      expectedVersion: rule.version,
      idempotencyKey: rotationIdempotencyKey.current,
      ruleId: rule.id,
    }).then((result) => {
      startTransition(() => {
        setSavingRuleId(null);
        if (result.kind !== "saved") {
          setNotice(
            result.kind === "forbidden"
              ? "La sesión no permite cambiar los diseños de esta regla."
              : result.message,
          );
          return;
        }
        rotationIdempotencyKey.current = null;
        setLoadState((current) =>
          current.kind !== "ready"
            ? current
            : {
                kind: "ready",
                workspace: {
                  ...current.workspace,
                  rules: current.workspace.rules.map((candidate) =>
                    candidate.id === result.rule.id ? result.rule : candidate,
                  ),
                },
              },
        );
        setEditingRuleId(null);
        setNotice(
          `Diseños de “${result.rule.name}” actualizados. Los próximos borradores usarán la nueva semana visual.`,
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
  if (selectedLocations.length === 0) {
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
              <option value="">Ambas sucursales</option>
              {loadState.workspace.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  Sólo {location.name}
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
        <fieldset className="recurring-design-rotation">
          <legend>Diseño de apertura por día</legend>
          <p>
            La alternancia es determinista: el mismo día siempre genera el mismo
            diseño. Domingo queda sin historia mientras no lo selecciones
            arriba.
          </p>
          <div>
            {weekdays.map((weekday, weekdayIndex) => (
              <label key={weekday.value}>
                <span>{weekday.longLabel}</span>
                <select
                  aria-label={`Diseño de ${weekday.longLabel}`}
                  disabled={!canSchedule || saving}
                  onChange={(event) => {
                    chooseDesign(
                      weekdayIndex,
                      event.currentTarget
                        .value as RecurringStoryDesignVariantResponse,
                    );
                  }}
                  value={designRotation[weekdayIndex]}
                >
                  {designVariants.map((variant) => (
                    <option key={variant.value} value={variant.value}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </label>
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
              `Fuente visible: ${
                selectedLocations.length === 1
                  ? `sucursal v${String(selectedLocations[0]?.version ?? 0)}`
                  : `${String(selectedLocations.length)} sucursales`
              }. Se vuelve a consultar al crear cada borrador.`}
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
                    {rule.locationId === null
                      ? "Ambas sucursales"
                      : (loadState.workspace.locations.find(
                          (location) => location.id === rule.locationId,
                        )?.name ?? "Sucursal")}{" "}
                    · {rule.localTime} ·{" "}
                    {rule.approvalPolicy === "human-each-cycle"
                      ? "revisión por ciclo"
                      : "rutina automática"}
                  </small>
                  <button
                    disabled={!canSchedule || savingRuleId === rule.id}
                    onClick={() => {
                      beginDesignEdit(rule);
                    }}
                    type="button"
                  >
                    Cambiar diseños
                  </button>
                  {editingRuleId !== rule.id ? null : (
                    <fieldset className="recurring-rule-design-editor">
                      <legend>Semana visual de {rule.name}</legend>
                      <div>
                        {weekdays.map((weekday, weekdayIndex) => (
                          <label key={weekday.value}>
                            {weekday.longLabel}
                            <select
                              aria-label={`Diseño de ${weekday.longLabel}`}
                              disabled={savingRuleId === rule.id}
                              onChange={(event) => {
                                rotationIdempotencyKey.current = null;
                                setEditingRotation((current) =>
                                  current.map((currentVariant, index) =>
                                    index === weekdayIndex
                                      ? (event.currentTarget
                                          .value as RecurringStoryDesignVariantResponse)
                                      : currentVariant,
                                  ),
                                );
                              }}
                              value={editingRotation[weekdayIndex]}
                            >
                              {designVariants.map((variant) => (
                                <option
                                  key={variant.value}
                                  value={variant.value}
                                >
                                  {variant.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <p>
                        Sólo impacta los borradores que se creen desde ahora.
                      </p>
                      <div className="recurring-rule-design-actions">
                        <button
                          disabled={savingRuleId === rule.id}
                          onClick={() => {
                            setEditingRuleId(null);
                          }}
                          type="button"
                        >
                          Cancelar
                        </button>
                        <button
                          disabled={savingRuleId === rule.id}
                          onClick={() => {
                            saveDesignEdit(rule);
                          }}
                          type="button"
                        >
                          {savingRuleId === rule.id
                            ? "Guardando…"
                            : "Guardar diseños"}
                        </button>
                      </div>
                    </fieldset>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
      <LocationStoryPreview
        design={
          designRotation[rotationIndexForDate(nextLocalDate())] ?? "cartel"
        }
        locations={selectedLocations}
      />
    </>
  );
}
