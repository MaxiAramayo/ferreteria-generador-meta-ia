"use client";

import type {
  RecurringStoryAccentResponse,
  RecurringStoryApprovalPolicyResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryPhotoPayload,
  RecurringStoryRuleResponse,
  RecurringStoryThemeResponse,
  RecurringStoryWorkspaceResponse,
} from "@aramayo/contracts";
import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import { openingStoryPreviewDocument } from "../../../lib/opening-story-preview.ts";
import {
  loadRecurringStoryWorkspace,
  saveRecurringStoryVisualStyle,
  saveRecurringStoryRule,
} from "../../../lib/recurring-story-api.ts";
import {
  OpeningStoryPreview,
  OpeningStoryStyleControls,
  openingStoryThemes,
  openingStoryVariantLabel,
} from "./opening-story-style-controls.tsx";

interface VisualStyle {
  readonly accent: RecurringStoryAccentResponse;
  readonly designVariant: RecurringStoryDesignVariantResponse;
  readonly photo: RecurringStoryPhotoPayload | null;
  readonly theme: RecurringStoryThemeResponse;
}

const ownImageMissing =
  "Subí la imagen que querés publicar: «Imagen propia» no tiene otra cosa que mostrar.";

function styleCaption(style: VisualStyle): string {
  const theme =
    openingStoryThemes.find((candidate) => candidate.value === style.theme)
      ?.label ?? "";
  return style.designVariant === "imagen"
    ? "Imagen propia · se publica tal cual"
    : `${openingStoryVariantLabel(style.designVariant)} · ${theme}`;
}

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
  // El rojo de marca es el del cartel del local: el punto de partida.
  const [style, setStyle] = useState<VisualStyle>({
    accent: "marca",
    designVariant: "cartel",
    photo: null,
    theme: "promo",
  });
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingVisualStyle, setEditingVisualStyle] = useState<VisualStyle>({
    accent: "marca",
    designVariant: "cartel",
    photo: null,
    theme: "promo",
  });
  const [saving, setSaving] = useState(false);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const visualStyleIdempotencyKey = useRef<string | null>(null);

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

  function changeStyle(change: Partial<VisualStyle>): void {
    idempotencyKey.current = null;
    setStyle((current) => ({ ...current, ...change }));
  }

  function changeEditingStyle(change: Partial<VisualStyle>): void {
    visualStyleIdempotencyKey.current = null;
    setEditingVisualStyle((current) => ({ ...current, ...change }));
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
    if (style.designVariant === "imagen" && style.photo === null) {
      setNotice(ownImageMissing);
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setSaving(true);
    setNotice(
      "Guardando la regla; todavía no se crea ni publica una historia…",
    );
    void saveRecurringStoryRule(apiBaseUrl, {
      accent: style.accent,
      approvalPolicy,
      designVariant: style.designVariant,
      effectiveFromLocalDate,
      idempotencyKey: idempotencyKey.current,
      leadTimeMinutes,
      localTime,
      locationId: locationId === "" ? null : locationId,
      name: name.trim(),
      photo: style.photo,
      theme: style.theme,
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

  function beginVisualStyleEdit(rule: RecurringStoryRuleResponse): void {
    visualStyleIdempotencyKey.current = null;
    setEditingVisualStyle({
      accent: rule.accent,
      designVariant: rule.designVariant,
      photo: rule.photo,
      theme: rule.theme,
    });
    setEditingRuleId(rule.id);
    setNotice(
      "El cambio de estilo se aplicará a borradores futuros; no modifica historias ya aprobadas o publicadas.",
    );
  }

  function saveVisualStyleEdit(rule: RecurringStoryRuleResponse): void {
    if (!canSchedule) {
      setNotice("La sesión no permite cambiar el estilo de esta regla.");
      return;
    }
    if (
      editingVisualStyle.designVariant === "imagen" &&
      editingVisualStyle.photo === null
    ) {
      setNotice(ownImageMissing);
      return;
    }
    visualStyleIdempotencyKey.current ??= crypto.randomUUID();
    setSavingRuleId(rule.id);
    void saveRecurringStoryVisualStyle(apiBaseUrl, {
      accent: editingVisualStyle.accent,
      designVariant: editingVisualStyle.designVariant,
      expectedVersion: rule.version,
      idempotencyKey: visualStyleIdempotencyKey.current,
      photo: editingVisualStyle.photo,
      ruleId: rule.id,
      theme: editingVisualStyle.theme,
    }).then((result) => {
      startTransition(() => {
        setSavingRuleId(null);
        if (result.kind !== "saved") {
          setNotice(
            result.kind === "forbidden"
              ? "La sesión no permite cambiar el estilo de esta regla."
              : result.message,
          );
          return;
        }
        visualStyleIdempotencyKey.current = null;
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
          `Estilo de “${result.rule.name}” actualizado. Los próximos borradores usarán esta composición.`,
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
          <p className="workspace-eyebrow">Historia recurrente · Instagram</p>
          <h2>Definí el ritmo. Elegí el look. Revisá cada historia.</h2>
          <p>
            Esta regla prepara un borrador para los días elegidos. Nunca publica
            sola: antes podés ajustar texto, datos, marco y color en cada fecha.
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
              data-testid="recurring-story-location"
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
        <OpeningStoryStyleControls
          accent={style.accent}
          designVariant={style.designVariant}
          disabled={!canSchedule || saving}
          inputName="new-recurring-story"
          onAccentChange={(accent) => {
            changeStyle({ accent });
          }}
          onDesignVariantChange={(designVariant) => {
            changeStyle({ designVariant });
          }}
          onPhotoChange={(photo) => {
            changeStyle({ photo });
          }}
          onThemeChange={(theme) => {
            changeStyle({ theme });
          }}
          photo={style.photo}
          theme={style.theme}
        />
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
                      beginVisualStyleEdit(rule);
                    }}
                    type="button"
                  >
                    Cambiar estilo
                  </button>
                  {editingRuleId !== rule.id ? null : (
                    <fieldset className="recurring-rule-design-editor">
                      <legend>Estilo de {rule.name}</legend>
                      <OpeningStoryStyleControls
                        accent={editingVisualStyle.accent}
                        designVariant={editingVisualStyle.designVariant}
                        disabled={savingRuleId === rule.id}
                        inputName={`rule-${rule.id}`}
                        onAccentChange={(accent) => {
                          changeEditingStyle({ accent });
                        }}
                        onDesignVariantChange={(designVariant) => {
                          changeEditingStyle({ designVariant });
                        }}
                        onPhotoChange={(photo) => {
                          changeEditingStyle({ photo });
                        }}
                        onThemeChange={(theme) => {
                          changeEditingStyle({ theme });
                        }}
                        photo={editingVisualStyle.photo}
                        theme={editingVisualStyle.theme}
                      />
                      <OpeningStoryPreview
                        caption={styleCaption(editingVisualStyle)}
                        preview={openingStoryPreviewDocument({
                          ...editingVisualStyle,
                          localDate: nextLocalDate(),
                          localTime: rule.localTime,
                          locationId: rule.locationId,
                          locations: loadState.workspace.locations,
                        })}
                      />
                      <p>
                        Sólo impacta los borradores que se creen desde ahora.
                        Las historias aprobadas, programadas o publicadas no se
                        modifican.
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
                            saveVisualStyleEdit(rule);
                          }}
                          type="button"
                        >
                          {savingRuleId === rule.id
                            ? "Guardando…"
                            : "Guardar estilo"}
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
      <OpeningStoryPreview
        caption={styleCaption(style)}
        preview={openingStoryPreviewDocument({
          ...style,
          localDate: effectiveFromLocalDate,
          localTime,
          locationId: locationId === "" ? null : locationId,
          locations: loadState.workspace.locations,
        })}
      />
    </>
  );
}
