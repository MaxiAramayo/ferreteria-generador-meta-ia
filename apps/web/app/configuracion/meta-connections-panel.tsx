"use client";

import type { MetaConnectionResponse } from "@aramayo/contracts";
import {
  createContext,
  startTransition,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  checkMetaConnection,
  loadMetaConnections,
  renewMetaConnection,
  revokeMetaConnection,
  startMetaOAuth,
  type MetaConnectionActionResult,
} from "../../lib/meta-connections-api";

type MetaConnectionsState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      activeConnectionId?: string;
      connections: readonly MetaConnectionResponse[];
      kind: "ready";
      notice?: string;
    }>;

interface MetaConnectionsActions {
  readonly check: (connectionId: string) => void;
  readonly connect: () => void;
  readonly reload: () => void;
  readonly renew: (connectionId: string) => void;
  readonly revoke: (connectionId: string) => void;
}

interface MetaConnectionsContextValue {
  readonly actions: MetaConnectionsActions;
  readonly meta: Readonly<{ apiBaseUrl: string }>;
  readonly state: MetaConnectionsState;
}

const MetaConnectionsContext =
  createContext<MetaConnectionsContextValue | null>(null);

function useMetaConnections(): MetaConnectionsContextValue {
  const context = use(MetaConnectionsContext);
  if (context === null) {
    throw new Error("Meta connection components require their provider.");
  }
  return context;
}

function MetaConnectionsProvider({
  apiBaseUrl,
  children,
}: {
  readonly apiBaseUrl: string;
  readonly children: ReactNode;
}) {
  const [state, setState] = useState<MetaConnectionsState>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    void loadMetaConnections(apiBaseUrl).then((result) => {
      startTransition(() => {
        setState(result);
      });
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    let active = true;
    void loadMetaConnections(apiBaseUrl).then((result) => {
      if (active) {
        startTransition(() => {
          setState(result);
        });
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  const applyResult = useCallback(
    (
      connectionId: string,
      result: MetaConnectionActionResult,
      successMessage: string,
    ) => {
      if (result.kind === "authorization-required") {
        window.location.assign(result.authorizationUrl);
        return;
      }
      startTransition(() => {
        setState((current) => {
          if (result.kind === "forbidden") return { kind: "forbidden" };
          if (result.kind === "error") {
            return current.kind === "ready"
              ? {
                  connections: current.connections,
                  kind: "ready",
                  notice: result.message,
                }
              : { kind: "error", message: result.message };
          }
          if (current.kind !== "ready") return current;
          return {
            connections: current.connections.map((connection) =>
              connection.id === connectionId ? result.connection : connection,
            ),
            kind: "ready",
            notice: successMessage,
          };
        });
      });
    },
    [],
  );

  const perform = useCallback(
    (
      connectionId: string,
      operation: Promise<MetaConnectionActionResult>,
      successMessage: string,
    ) => {
      setState((current) =>
        current.kind === "ready"
          ? {
              activeConnectionId: connectionId,
              connections: current.connections,
              kind: "ready",
            }
          : current,
      );
      void operation.then((result) => {
        applyResult(connectionId, result, successMessage);
      });
    },
    [applyResult],
  );

  const connect = useCallback(() => {
    setState((current) =>
      current.kind === "ready"
        ? {
            activeConnectionId: "oauth",
            connections: current.connections,
            kind: "ready",
          }
        : current,
    );
    void startMetaOAuth(apiBaseUrl).then((result) => {
      applyResult("oauth", result, "Autorización iniciada.");
    });
  }, [apiBaseUrl, applyResult]);

  const check = useCallback(
    (connectionId: string) => {
      perform(
        connectionId,
        checkMetaConnection(apiBaseUrl, connectionId),
        "Estado de Meta actualizado.",
      );
    },
    [apiBaseUrl, perform],
  );

  const renew = useCallback(
    (connectionId: string) => {
      perform(
        connectionId,
        renewMetaConnection(apiBaseUrl, connectionId),
        "Credencial renovada y cifrada.",
      );
    },
    [apiBaseUrl, perform],
  );

  const revoke = useCallback(
    (connectionId: string) => {
      if (
        !window.confirm(
          "¿Revocar esta conexión? Se eliminará la capacidad local de publicar y hará falta autorizarla de nuevo.",
        )
      ) {
        return;
      }
      perform(
        connectionId,
        revokeMetaConnection(apiBaseUrl, connectionId),
        "Conexión revocada. Los tokens locales fueron eliminados.",
      );
    },
    [apiBaseUrl, perform],
  );

  return (
    <MetaConnectionsContext
      value={{
        actions: { check, connect, reload, renew, revoke },
        meta: { apiBaseUrl },
        state,
      }}
    >
      {children}
    </MetaConnectionsContext>
  );
}

const healthLabels: Readonly<Record<MetaConnectionResponse["health"], string>> =
  Object.freeze({
    asset_removed: "Activo removido",
    healthy: "Lista para publicar",
    permission_revoked: "Permiso revocado",
    revoked: "Revocada",
    token_expired: "Token vencido",
  });

function formattedDate(value: string | undefined): string {
  if (value === undefined) return "Sin vencimiento informado";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ConnectionCard({
  connection,
  disabled,
}: {
  readonly connection: MetaConnectionResponse;
  readonly disabled: boolean;
}) {
  const { actions } = useMetaConnections();
  const revoked = connection.health === "revoked";
  return (
    <article className="meta-connection-card" data-health={connection.health}>
      <header>
        <div>
          <p className="configuration-eyebrow">
            Meta · {connection.accountName}
          </p>
          <h3>{healthLabels[connection.health]}</h3>
        </div>
        <span>{connection.canPublish ? "Habilitada" : "Bloqueada"}</span>
      </header>
      <dl className="meta-connection-facts">
        <div>
          <dt>Último control</dt>
          <dd>{formattedDate(connection.lastCheckedAt)}</dd>
        </div>
        <div>
          <dt>Vencimiento</dt>
          <dd>{formattedDate(connection.expiresAt)}</dd>
        </div>
      </dl>
      <div className="meta-asset-list">
        {connection.assets.map((asset) => (
          <div key={asset.id}>
            <strong>
              {asset.kind === "page" ? "Facebook Page" : "Instagram Business"}
            </strong>
            <span>{asset.name}</span>
            <small>{asset.status === "active" ? "Activo" : "Removido"}</small>
          </div>
        ))}
      </div>
      <div className="meta-permissions">
        <p>
          {connection.grantedPermissions.length} permisos concedidos ·{" "}
          {connection.missingPermissions.length} faltantes
        </p>
        {connection.missingPermissions.length === 0 ? null : (
          <code>{connection.missingPermissions.join(" · ")}</code>
        )}
      </div>
      {revoked ? null : (
        <div className="meta-connection-actions">
          <button
            disabled={disabled}
            onClick={() => {
              actions.check(connection.id);
            }}
          >
            Verificar salud
          </button>
          <button
            disabled={disabled}
            onClick={() => {
              actions.renew(connection.id);
            }}
          >
            Renovar
          </button>
          <button
            className="meta-revoke-action"
            disabled={disabled}
            onClick={() => {
              actions.revoke(connection.id);
            }}
          >
            Revocar
          </button>
        </div>
      )}
    </article>
  );
}

function MetaConnectionsContent() {
  const { actions, state } = useMetaConnections();
  if (state.kind === "loading") {
    return <p className="configuration-empty">Consultando conexiones Meta…</p>;
  }
  if (state.kind === "forbidden") {
    return (
      <p className="configuration-permission">
        Sólo un administrador puede consultar o cambiar conexiones Meta.
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        className="configuration-notice configuration-notice-error"
        role="alert"
      >
        <p>{state.message}</p>
        <button className="configuration-button" onClick={actions.reload}>
          Reintentar
        </button>
      </div>
    );
  }
  const busy = state.activeConnectionId !== undefined;
  return (
    <>
      {state.notice === undefined ? null : (
        <p className="configuration-notice" role="status">
          {state.notice}
        </p>
      )}
      <div className="meta-connection-toolbar">
        <p>
          La autorización abre Meta en una pantalla separada. Ningún token se
          muestra ni se envía al navegador.
        </p>
        <button
          className="configuration-button"
          disabled={busy}
          onClick={actions.connect}
        >
          Conectar Meta
        </button>
      </div>
      {state.connections.length === 0 ? (
        <p className="configuration-empty">
          Todavía no hay una cuenta Meta autorizada para esta organización.
        </p>
      ) : (
        <div className="meta-connection-list">
          {state.connections.map((connection) => (
            <ConnectionCard
              connection={connection}
              disabled={busy}
              key={connection.id}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function MetaConnectionsPanel({
  apiBaseUrl,
}: {
  readonly apiBaseUrl: string;
}) {
  return (
    <MetaConnectionsProvider apiBaseUrl={apiBaseUrl}>
      <section className="configuration-locations meta-connections-panel">
        <div className="configuration-section-heading">
          <div>
            <p className="configuration-eyebrow">Conexiones externas</p>
            <h2>Facebook e Instagram</h2>
          </div>
          <span>OAuth seguro</span>
        </div>
        <MetaConnectionsContent />
      </section>
    </MetaConnectionsProvider>
  );
}
