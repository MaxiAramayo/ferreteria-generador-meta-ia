"use client";

import type {
  BrandThemeId,
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
  saveLocationConfiguration,
  type ConfigurationLoadResult,
  type ConfigurationSaveResult,
} from "../../lib/organization-configuration-api";

type ConfigurationState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      canEdit: boolean;
      configuration: OrganizationConfigurationResponse;
      kind: "ready";
      notice?: string;
      saving: boolean;
    }>;

interface ConfigurationActions {
  readonly reload: () => void;
  readonly saveBrand: (form: HTMLFormElement) => void;
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
      switch (result.kind) {
        case "saved":
          setState({
            canEdit: true,
            configuration: result.configuration,
            kind: "ready",
            notice: "Cambios guardados y auditados.",
            saving: false,
          });
          return;
        case "conflict":
          setState({
            kind: "error",
            message:
              "La configuración cambió en otra sesión. Recargá antes de editar.",
          });
          return;
        case "forbidden":
          setState({ kind: "forbidden" });
          return;
        case "error":
          setState(result);
      }
    });
  }, []);

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

  return (
    <ConfigurationContext
      value={{
        actions: { reload, saveBrand, saveLocation },
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

function ReadyView({
  state,
}: {
  readonly state: Extract<ConfigurationState, { kind: "ready" }>;
}) {
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
        <p className="configuration-success" role="status">
          {state.notice}
        </p>
      )}
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
