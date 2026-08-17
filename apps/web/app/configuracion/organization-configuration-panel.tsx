"use client";

import type {
  BrandThemeId,
  GenerationPolicyResponse,
  LocationConfigurationResponse,
  OrganizationConfigurationResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import {
  loadConfiguration,
  saveBrandConfiguration,
  saveGenerationPolicy,
  saveLocationConfiguration,
  type ConfigurationLoadResult,
  type ConfigurationSaveResult,
  type GenerationPolicySaveResult,
} from "../../lib/organization-configuration-api";
import { MetaConnectionsPanel } from "./meta-connections-panel";

type ConfigurationNotice = Readonly<{
  kind: "conflict" | "error" | "success";
  message: string;
}>;

type ConfigurationState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      canEdit: boolean;
      configuration: OrganizationConfigurationResponse;
      generationPolicy: GenerationPolicyResponse | null;
      kind: "ready";
      notice?: ConfigurationNotice | undefined;
      saving: boolean;
    }>;

interface ConfigurationActions {
  readonly reload: () => void;
  readonly saveBrand: (form: HTMLFormElement) => void;
  readonly saveGenerationPolicy: (form: HTMLFormElement) => void;
  readonly saveLocation: (
    location: LocationConfigurationResponse,
    form: HTMLFormElement,
  ) => void;
}

interface ConfigurationMeta {
  readonly apiBaseUrl: string;
}

interface ConfigurationContextValue {
  readonly actions: ConfigurationActions;
  readonly meta: ConfigurationMeta;
  readonly state: ConfigurationState;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(
  null,
);

function useConfiguration(): ConfigurationContextValue {
  const value = use(ConfigurationContext);
  if (value === null) {
    throw new Error("Configuration components require their provider.");
  }
  return value;
}

function resultState(result: ConfigurationLoadResult): ConfigurationState {
  return result.kind === "ready" ? { ...result, saving: false } : result;
}

function stringField(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

function numberField(form: FormData, field: string): number | null {
  const parsed = Number(stringField(form, field));
  return Number.isFinite(parsed) ? parsed : null;
}

function themeField(form: FormData): BrandThemeId {
  const themeId = stringField(form, "themeId");
  switch (themeId) {
    case "taller":
    case "claro":
    case "promo":
    case "lubricentro":
      return themeId;
    default:
      return "taller";
  }
}

function ConfigurationProvider({
  apiBaseUrl,
  children,
}: {
  readonly apiBaseUrl: string;
  readonly children: ReactNode;
}) {
  const [state, setState] = useState<ConfigurationState>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    void loadConfiguration(apiBaseUrl).then((result) => {
      startTransition(() => {
        setState(resultState(result));
      });
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;
    void loadConfiguration(apiBaseUrl).then((result) => {
      if (active) {
        startTransition(() => {
          setState(resultState(result));
        });
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const applySaveResult = useCallback((result: ConfigurationSaveResult) => {
    startTransition(() => {
      setState((current) => {
        if (result.kind === "forbidden") return { kind: "forbidden" };
        if (current.kind !== "ready") return current;
        switch (result.kind) {
          case "saved":
            return {
              ...current,
              configuration: result.configuration,
              notice: {
                kind: "success",
                message: "Cambios guardados y auditados.",
              },
              saving: false,
            };
          case "conflict":
            return {
              ...current,
              notice: {
                kind: "conflict",
                message:
                  "La configuración cambió en otra sesión. Recargá antes de editar.",
              },
              saving: false,
            };
          case "error":
            return {
              ...current,
              notice: { kind: "error", message: result.message },
              saving: false,
            };
        }
      });
    });
  }, []);

  const applyPolicySaveResult = useCallback(
    (result: GenerationPolicySaveResult) => {
      startTransition(() => {
        setState((current) => {
          if (result.kind === "forbidden") return { kind: "forbidden" };
          if (current.kind !== "ready") return current;
          switch (result.kind) {
            case "saved":
              return {
                ...current,
                generationPolicy: result.generationPolicy,
                notice: {
                  kind: "success",
                  message: "Política de generación guardada y auditada.",
                },
                saving: false,
              };
            case "conflict":
              return {
                ...current,
                notice: {
                  kind: "conflict",
                  message:
                    "La política cambió en otra sesión. Recargá para ver la versión vigente.",
                },
                saving: false,
              };
            case "error":
              return {
                ...current,
                notice: { kind: "error", message: result.message },
                saving: false,
              };
          }
        });
      });
    },
    [],
  );

  const saveBrand = useCallback(
    (form: HTMLFormElement) => {
      if (state.kind !== "ready" || !state.canEdit) {
        setState({ kind: "forbidden" });
        return;
      }
      const formData = new FormData(form);
      setState({
        canEdit: state.canEdit,
        configuration: state.configuration,
        generationPolicy: state.generationPolicy,
        kind: "ready",
        saving: true,
      });
      void saveBrandConfiguration(apiBaseUrl, state.configuration, {
        claim: stringField(formData, "claim"),
        displayName: stringField(formData, "displayName"),
        handle: stringField(formData, "handle"),
        legalName: stringField(formData, "legalName"),
        name: stringField(formData, "name"),
        shortName: stringField(formData, "shortName"),
        themeId: themeField(formData),
      }).then(applySaveResult);
    },
    [apiBaseUrl, applySaveResult, state],
  );

  const saveLocation = useCallback(
    (location: LocationConfigurationResponse, form: HTMLFormElement) => {
      if (state.kind !== "ready" || !state.canEdit) {
        setState({ kind: "forbidden" });
        return;
      }
      const formData = new FormData(form);
      setState({
        canEdit: state.canEdit,
        configuration: state.configuration,
        generationPolicy: state.generationPolicy,
        kind: "ready",
        saving: true,
      });
      void saveLocationConfiguration(apiBaseUrl, location, {
        addressLine: stringField(formData, "addressLine"),
        city: stringField(formData, "city"),
        isActive: formData.get("isActive") === "on",
        name: stringField(formData, "name"),
        openingHours: stringField(formData, "openingHours"),
        phone: stringField(formData, "phone"),
        province: stringField(formData, "province"),
        timeZone: stringField(formData, "timeZone"),
        whatsapp: stringField(formData, "whatsapp"),
      }).then(applySaveResult);
    },
    [apiBaseUrl, applySaveResult, state],
  );

  const savePolicy = useCallback(
    (form: HTMLFormElement) => {
      if (
        state.kind !== "ready" ||
        !state.canEdit ||
        state.generationPolicy === null
      ) {
        setState({ kind: "forbidden" });
        return;
      }
      const formData = new FormData(form);
      const monthlyBudgetUsd = numberField(formData, "monthlyBudgetUsd");
      const organizationDailyAttemptLimit = numberField(
        formData,
        "organizationDailyAttemptLimit",
      );
      const userDailyAttemptLimit = numberField(
        formData,
        "userDailyAttemptLimit",
      );
      const warningThresholdPercent = numberField(
        formData,
        "warningThresholdPercent",
      );
      const originalRetentionDays = numberField(
        formData,
        "originalRetentionDays",
      );
      const referenceRetentionDays = numberField(
        formData,
        "referenceRetentionDays",
      );
      const generatedOrphanRetentionHours = numberField(
        formData,
        "generatedOrphanRetentionHours",
      );
      if (
        monthlyBudgetUsd === null ||
        organizationDailyAttemptLimit === null ||
        userDailyAttemptLimit === null ||
        warningThresholdPercent === null ||
        originalRetentionDays === null ||
        referenceRetentionDays === null ||
        generatedOrphanRetentionHours === null
      ) {
        setState({
          ...state,
          notice: {
            kind: "error",
            message: "Revisá los valores numéricos de la política.",
          },
        });
        return;
      }
      setState({ ...state, notice: undefined, saving: true });
      void saveGenerationPolicy(apiBaseUrl, state.generationPolicy, {
        enabled: formData.get("enabled") === "on",
        generatedOrphanRetentionHours,
        monthlyBudgetMicrousd: Math.round(monthlyBudgetUsd * 1_000_000),
        organizationDailyAttemptLimit,
        originalRetentionDays,
        referenceRetentionDays,
        userDailyAttemptLimit,
        warningThresholdPercent,
      }).then(applyPolicySaveResult);
    },
    [apiBaseUrl, applyPolicySaveResult, state],
  );

  return (
    <ConfigurationContext
      value={{
        actions: {
          reload,
          saveBrand,
          saveGenerationPolicy: savePolicy,
          saveLocation,
        },
        meta: { apiBaseUrl },
        state,
      }}
    >
      {children}
    </ConfigurationContext>
  );
}

function StatusView({
  eyebrow,
  message,
}: {
  readonly eyebrow: string;
  readonly message: string;
}) {
  const { actions } = useConfiguration();
  return (
    <main className="configuration-shell">
      <section className="configuration-status">
        <p className="configuration-eyebrow">{eyebrow}</p>
        <h1>Configuración operativa</h1>
        <p>{message}</p>
        <button className="configuration-button" onClick={actions.reload}>
          Reintentar
        </button>
      </section>
    </main>
  );
}

function BrandForm({
  configuration,
  disabled,
}: {
  readonly configuration: OrganizationConfigurationResponse;
  readonly disabled: boolean;
}) {
  const { actions } = useConfiguration();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    actions.saveBrand(event.currentTarget);
  }
  return (
    <form
      className="configuration-form"
      key={`${configuration.version}-${configuration.brand.version}`}
      onSubmit={submit}
    >
      <div className="configuration-section-heading">
        <div>
          <p className="configuration-eyebrow">Identidad comercial</p>
          <h2>La ficha que alimenta cada pieza</h2>
        </div>
        <span>v{configuration.brand.version}</span>
      </div>
      <div className="configuration-grid">
        <label>
          Nombre visible
          <input
            defaultValue={configuration.displayName}
            disabled={disabled}
            name="displayName"
            required
          />
        </label>
        <label>
          Razón social
          <input
            defaultValue={configuration.legalName}
            disabled={disabled}
            name="legalName"
            required
          />
        </label>
        <label>
          Marca
          <input
            defaultValue={configuration.brand.name}
            disabled={disabled}
            name="name"
            required
          />
        </label>
        <label>
          Nombre corto
          <input
            defaultValue={configuration.brand.shortName}
            disabled={disabled}
            name="shortName"
            required
          />
        </label>
        <label className="configuration-wide">
          Propuesta principal
          <input
            defaultValue={configuration.brand.claim}
            disabled={disabled}
            name="claim"
            required
          />
        </label>
        <label>
          Usuario en redes
          <input
            defaultValue={configuration.brand.handle}
            disabled={disabled}
            name="handle"
            required
          />
        </label>
        <label>
          Tema predeterminado
          <select
            defaultValue={configuration.brand.themeId}
            disabled={disabled}
            name="themeId"
          >
            <option value="taller">Taller</option>
            <option value="claro">Claro</option>
            <option value="promo">Promoción</option>
            <option value="lubricentro">Lubricentro</option>
          </select>
        </label>
      </div>
      <button className="configuration-button" disabled={disabled}>
        Guardar identidad
      </button>
    </form>
  );
}

function LocationForm({
  disabled,
  location,
}: {
  readonly disabled: boolean;
  readonly location: LocationConfigurationResponse;
}) {
  const { actions } = useConfiguration();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    actions.saveLocation(location, event.currentTarget);
  }
  return (
    <form
      className="location-card"
      key={`${location.id}-${location.version}`}
      onSubmit={submit}
    >
      <div className="location-stripe" data-active={location.isActive} />
      <div className="configuration-section-heading">
        <div>
          <p className="configuration-eyebrow">Sucursal</p>
          <h3>{location.name}</h3>
        </div>
        <span>{location.isActive ? "Activa" : "Pausada"}</span>
      </div>
      <div className="configuration-grid">
        <label>
          Nombre
          <input
            defaultValue={location.name}
            disabled={disabled}
            name="name"
            required
          />
        </label>
        <label>
          Domicilio
          <input
            defaultValue={location.addressLine}
            disabled={disabled}
            name="addressLine"
            required
          />
        </label>
        <label>
          Ciudad
          <input
            defaultValue={location.city}
            disabled={disabled}
            name="city"
            required
          />
        </label>
        <label>
          Provincia
          <input
            defaultValue={location.province}
            disabled={disabled}
            name="province"
            required
          />
        </label>
        <label>
          Teléfono
          <input
            defaultValue={location.phone}
            disabled={disabled}
            name="phone"
          />
        </label>
        <label>
          WhatsApp
          <input
            defaultValue={location.whatsapp}
            disabled={disabled}
            name="whatsapp"
          />
        </label>
        <label className="configuration-wide">
          Horarios
          <input
            defaultValue={location.openingHours}
            disabled={disabled}
            name="openingHours"
            required
          />
        </label>
        <label>
          Zona horaria
          <input
            defaultValue={location.timeZone}
            disabled={disabled}
            name="timeZone"
            required
          />
        </label>
        <label className="configuration-toggle">
          <input
            defaultChecked={location.isActive}
            disabled={disabled}
            name="isActive"
            type="checkbox"
          />
          Sucursal disponible
        </label>
      </div>
      <button className="configuration-button" disabled={disabled}>
        Guardar sucursal
      </button>
    </form>
  );
}

function usd(microusd: number): string {
  return new Intl.NumberFormat("es-AR", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(microusd / 1_000_000);
}

function GenerationUsageCard({
  generationPolicy,
}: {
  readonly generationPolicy: GenerationPolicyResponse;
}) {
  const usage = generationPolicy.usage;
  const usagePercent = Math.min(
    100,
    Math.round(
      (usage.committedMicrousd / Math.max(1, usage.monthlyBudgetMicrousd)) *
        100,
    ),
  );
  return (
    <aside
      aria-labelledby="generation-usage-title"
      className="generation-usage"
    >
      <p className="configuration-eyebrow">Mes UTC {usage.monthUtc}</p>
      <h3 id="generation-usage-title">Uso comprometido</h3>
      <p className="generation-usage-total">
        {usd(usage.committedMicrousd)}{" "}
        <span>de {usd(usage.monthlyBudgetMicrousd)}</span>
      </p>
      <progress
        aria-label="Porcentaje del presupuesto mensual comprometido"
        max={100}
        value={usagePercent}
      >
        {usagePercent}%
      </progress>
      <dl>
        <div>
          <dt>Liquidado</dt>
          <dd>{usd(usage.settledMicrousd)}</dd>
        </div>
        <div>
          <dt>Reservado</dt>
          <dd>{usd(usage.reservedMicrousd)}</dd>
        </div>
        <div>
          <dt>No confirmado</dt>
          <dd>{usd(usage.unconfirmedMicrousd)}</dd>
        </div>
        <div>
          <dt>Intentos organización</dt>
          <dd>{usage.organizationAttemptsRemaining} restantes hoy</dd>
        </div>
        <div>
          <dt>Intentos de tu usuario</dt>
          <dd>{usage.userAttemptsRemaining} restantes hoy</dd>
        </div>
      </dl>
      {usage.alertActive ? (
        <p className="generation-alert" role="status">
          Alerta activa: el gasto comprometido cruzó el umbral mensual.
        </p>
      ) : null}
    </aside>
  );
}

function GenerationPolicyForm({
  disabled,
  generationPolicy,
}: {
  readonly disabled: boolean;
  readonly generationPolicy: GenerationPolicyResponse;
}) {
  const { actions } = useConfiguration();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    actions.saveGenerationPolicy(event.currentTarget);
  }
  return (
    <section className="generation-policy-layout">
      <form
        className="configuration-form"
        key={generationPolicy.version}
        onSubmit={submit}
      >
        <div className="configuration-section-heading">
          <div>
            <p className="configuration-eyebrow">Generación administrada</p>
            <h2>Política, cuotas y retención</h2>
          </div>
          <span>v{generationPolicy.version}</span>
        </div>
        <p className="configuration-policy-note">
          Las cuotas diarias se cortan a las 00:00 UTC. Si una solicitud no
          entra, se registra y usa composición determinista sin llamar a OpenAI.
        </p>
        <div className="configuration-grid">
          <label className="configuration-toggle configuration-wide">
            <input
              defaultChecked={generationPolicy.enabled}
              disabled={disabled}
              name="enabled"
              type="checkbox"
            />
            Habilitar generación con proveedor
          </label>
          <label>
            Intentos por organización / día
            <input
              defaultValue={generationPolicy.organizationDailyAttemptLimit}
              disabled={disabled}
              min={1}
              name="organizationDailyAttemptLimit"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Intentos por usuario / día
            <input
              defaultValue={generationPolicy.userDailyAttemptLimit}
              disabled={disabled}
              min={1}
              name="userDailyAttemptLimit"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Presupuesto mensual (USD)
            <input
              defaultValue={(
                generationPolicy.monthlyBudgetMicrousd / 1_000_000
              ).toFixed(2)}
              disabled={disabled}
              min="0.10"
              name="monthlyBudgetUsd"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label>
            Umbral de alerta (%)
            <input
              defaultValue={generationPolicy.warningThresholdPercent}
              disabled={disabled}
              max={100}
              min={1}
              name="warningThresholdPercent"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Retención de originales (días)
            <input
              defaultValue={generationPolicy.originalRetentionDays}
              disabled={disabled}
              min={1}
              name="originalRetentionDays"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Derivados preparados (días)
            <input
              defaultValue={generationPolicy.referenceRetentionDays}
              disabled={disabled}
              min={1}
              name="referenceRetentionDays"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Generados huérfanos (horas)
            <input
              defaultValue={generationPolicy.generatedOrphanRetentionHours}
              disabled={disabled}
              min={1}
              name="generatedOrphanRetentionHours"
              required
              step={1}
              type="number"
            />
          </label>
          <label>
            Zona horaria de cuotas
            <input disabled readOnly value={generationPolicy.timeZone} />
          </label>
        </div>
        <button className="configuration-button" disabled={disabled}>
          Guardar política
        </button>
      </form>
      <GenerationUsageCard generationPolicy={generationPolicy} />
    </section>
  );
}

function ReadyView({
  state,
}: {
  readonly state: Extract<ConfigurationState, { kind: "ready" }>;
}) {
  const { meta } = useConfiguration();
  const disabled = state.saving || !state.canEdit;
  return (
    <main className="configuration-shell">
      <header className="configuration-hero">
        <div>
          <p className="configuration-eyebrow">Base comercial aprobada</p>
          <h1>Configuración operativa</h1>
          <p>
            Estos datos llegan al copy y a las piezas. Cada cambio queda
            registrado con su autor.
          </p>
        </div>
        <Link href="/">Volver al panel</Link>
      </header>
      {!state.canEdit ? (
        <p className="configuration-permission">
          Tenés acceso de lectura. Sólo un administrador puede guardar cambios.
        </p>
      ) : null}
      {state.notice === undefined ? null : (
        <p
          className={`configuration-notice configuration-notice-${state.notice.kind}`}
          role={state.notice.kind === "error" ? "alert" : "status"}
        >
          {state.notice.message}
        </p>
      )}
      {state.generationPolicy === null ? null : (
        <GenerationPolicyForm
          disabled={disabled}
          generationPolicy={state.generationPolicy}
        />
      )}
      {state.canEdit ? (
        <MetaConnectionsPanel apiBaseUrl={meta.apiBaseUrl} />
      ) : null}
      <BrandForm configuration={state.configuration} disabled={disabled} />
      <section className="configuration-locations">
        <div className="configuration-section-heading">
          <div>
            <p className="configuration-eyebrow">Puntos de atención</p>
            <h2>Sucursales y contacto</h2>
          </div>
          <span>{state.configuration.locations.length} registradas</span>
        </div>
        {state.configuration.locations.length === 0 ? (
          <p className="configuration-empty">
            Todavía no hay sucursales configuradas.
          </p>
        ) : (
          <div className="location-list">
            {state.configuration.locations.map((location) => (
              <LocationForm
                disabled={disabled}
                key={location.id}
                location={location}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ConfigurationContent() {
  const { state } = useConfiguration();
  switch (state.kind) {
    case "loading":
      return (
        <StatusView
          eyebrow="Cargando"
          message="Estamos consultando la organización y sus sucursales."
        />
      );
    case "empty":
      return (
        <StatusView
          eyebrow="Sin configuración"
          message="La organización todavía no tiene una marca configurada."
        />
      );
    case "forbidden":
      return (
        <StatusView
          eyebrow="Acceso restringido"
          message="Tu sesión no permite ver o modificar esta configuración."
        />
      );
    case "error":
      return <StatusView eyebrow="No se pudo cargar" message={state.message} />;
    case "ready":
      return <ReadyView state={state} />;
  }
}

export function OrganizationConfigurationPanel({
  apiBaseUrl,
}: {
  readonly apiBaseUrl: string;
}) {
  return (
    <ConfigurationProvider apiBaseUrl={apiBaseUrl}>
      <ConfigurationContent />
    </ConfigurationProvider>
  );
}
