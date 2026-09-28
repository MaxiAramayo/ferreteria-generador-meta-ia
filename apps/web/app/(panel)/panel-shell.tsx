"use client";

import type { AuthenticatedActor } from "@aramayo/domain";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  loadSession,
  logout,
  type SessionLoadResult,
} from "../../lib/authentication-api.ts";
import {
  activePanelSection,
  actorCan,
  loginPathFor,
  panelNavigationFor,
  rolesLabel,
  type PanelSectionId,
} from "../../lib/panel-navigation.ts";
import { loadOperationalAlerts } from "../../lib/publication-operational-alert-api.ts";
import { createPiecePath } from "../../lib/publication-composer-contract.ts";
import { PanelIcon, type PanelIconName } from "./panel-icons.tsx";

type ShellState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "redirecting" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ actor: AuthenticatedActor; kind: "ready" }>;

type SignOutState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "error"; message: string }>;

const PanelActorContext = createContext<AuthenticatedActor | null>(null);

/**
 * La sesión que ya confirmó la barra.
 *
 * Las pantallas del panel sólo se dibujan con una sesión confirmada, así que
 * dentro de ellas nunca falta; pedirla afuera es un error de programación.
 */
export function usePanelActor(): AuthenticatedActor {
  const actor = use(PanelActorContext);
  if (actor === null) {
    throw new Error("usePanelActor sólo puede usarse dentro del panel.");
  }
  return actor;
}

function shellStateFor(result: SessionLoadResult): ShellState {
  switch (result.kind) {
    case "authenticated":
      return { actor: result.actor, kind: "ready" };
    case "unauthenticated":
      return { kind: "redirecting" };
    case "error":
      return { kind: "error", message: result.message };
  }
}

function PanelStatus({
  onRetry,
  state,
}: Readonly<{
  onRetry: () => void;
  state: Extract<ShellState, { kind: "error" | "loading" | "redirecting" }>;
}>) {
  const copy =
    state.kind === "error"
      ? { eyebrow: "La API no respondió", message: state.message }
      : state.kind === "redirecting"
        ? {
            eyebrow: "Sin sesión",
            message: "Te llevamos al inicio de sesión.",
          }
        : {
            eyebrow: "Verificando tu sesión",
            message:
              "El panel confirma quién sos antes de mostrar lo que podés hacer.",
          };
  return (
    <main aria-busy={state.kind !== "error"} className="workspace-shell">
      <section className="workspace-status" data-kind={state.kind}>
        <p className="workspace-eyebrow">{copy.eyebrow}</p>
        <h1>Panel de contenido</h1>
        <p role={state.kind === "error" ? "alert" : "status"}>{copy.message}</p>
        {state.kind === "error" ? (
          <button
            className="workspace-primary-action"
            onClick={onRetry}
            type="button"
          >
            Reintentar
          </button>
        ) : null}
      </section>
    </main>
  );
}

/**
 * Un menú desplegable que se cierra solo: al cambiar de pantalla, al tocar
 * afuera y con Escape. Lo usan la cuenta, arriba, y «Más», abajo.
 */
function useClosingMenu(pathname: string) {
  const menu = useRef<HTMLDetailsElement>(null);

  // Cambiar de pantalla cierra el menú: quedaría abierto tapando la nueva.
  useEffect(() => {
    menu.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    function closeOutside(event: PointerEvent): void {
      const element = menu.current;
      if (
        element?.open === true &&
        event.target instanceof Node &&
        !element.contains(event.target)
      ) {
        element.removeAttribute("open");
      }
    }
    function closeOnEscape(event: KeyboardEvent): void {
      const element = menu.current;
      if (event.key !== "Escape" || element?.open !== true) return;
      element.removeAttribute("open");
      element.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return menu;
}

function useSignOut(apiBaseUrl: string) {
  const [signOut, setSignOut] = useState<SignOutState>({ kind: "idle" });

  async function endSession(): Promise<void> {
    setSignOut({ kind: "pending" });
    const result = await logout(apiBaseUrl);
    if (result.kind === "signed-out") {
      window.location.assign("/iniciar-sesion");
      return;
    }
    setSignOut({ kind: "error", message: result.message });
  }

  return { endSession, signOut };
}

function SignOutButton({ apiBaseUrl }: Readonly<{ apiBaseUrl: string }>) {
  const { endSession, signOut } = useSignOut(apiBaseUrl);
  return (
    <>
      <button
        disabled={signOut.kind === "pending"}
        onClick={() => {
          void endSession();
        }}
        type="button"
      >
        {signOut.kind === "pending" ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
      {signOut.kind === "error" ? <p role="alert">{signOut.message}</p> : null}
    </>
  );
}

function AccountMenu({
  actor,
  apiBaseUrl,
  current,
  pathname,
}: Readonly<{
  actor: AuthenticatedActor;
  apiBaseUrl: string;
  current: PanelSectionId | "cuenta" | null;
  pathname: string;
}>) {
  const menu = useClosingMenu(pathname);

  return (
    <details className="panel-account" ref={menu}>
      <summary>
        <span>Sesión</span> <strong>{actor.displayName}</strong>
      </summary>
      <div className="panel-account-menu">
        <p className="panel-account-identity">
          <strong>{actor.displayName}</strong>
          <span>{actor.email}</span>
          <span>{rolesLabel(actor.roles)}</span>
        </p>
        <Link
          aria-current={current === "cuenta" ? "page" : undefined}
          href="/cuenta"
        >
          Cambiar contraseña
        </Link>
        <SignOutButton apiBaseUrl={apiBaseUrl} />
      </div>
    </details>
  );
}

/** Lo que va en la barra de abajo; el resto de las secciones, en «Más». */
const tabSections: ReadonlySet<PanelSectionId> = new Set([
  "inicio",
  "publicaciones",
  "programacion",
]);

const tabIcons: Readonly<Partial<Record<PanelSectionId, PanelIconName>>> = {
  inicio: "home",
  programacion: "calendar",
  publicaciones: "list",
};

function AlertCount({ count }: Readonly<{ count: number | null }>) {
  return count !== null && count > 0 ? (
    <>
      <span aria-hidden="true" className="panel-nav-count">
        {count}
      </span>
      <span className="panel-visually-hidden">
        {`, ${String(count)} ${count === 1 ? "alerta abierta" : "alertas abiertas"}`}
      </span>
    </>
  ) : null;
}

/**
 * La barra de abajo del celular: las tres secciones de todos los días, el
 * botón para crear en el medio —al alcance del pulgar— y «Más» con el resto.
 */
function TabBar({
  actor,
  apiBaseUrl,
  canCreate,
  current,
  openAlerts,
  pathname,
}: Readonly<{
  actor: AuthenticatedActor;
  apiBaseUrl: string;
  canCreate: boolean;
  current: PanelSectionId | "cuenta" | null;
  openAlerts: number | null;
  pathname: string;
}>) {
  const menu = useClosingMenu(pathname);
  const sections = panelNavigationFor(actor);
  const creating = pathname.startsWith(createPiecePath);
  const tabs = sections.filter((section) => tabSections.has(section.id));
  const more = sections.filter((section) => !tabSections.has(section.id));
  const moreCurrent =
    current === "cuenta" || more.some((section) => section.id === current);
  const tab = (section: (typeof sections)[number]) => (
    <Link
      aria-current={current === section.id && !creating ? "page" : undefined}
      href={section.href}
      key={section.id}
    >
      <PanelIcon name={tabIcons[section.id] ?? "list"} />
      <span>{section.label}</span>
    </Link>
  );

  return (
    <nav aria-label="Secciones del panel" className="panel-tabbar">
      {tabs.slice(0, 2).map(tab)}
      {canCreate ? (
        <Link
          aria-current={creating ? "page" : undefined}
          className="panel-tabbar-create"
          href={createPiecePath}
        >
          <PanelIcon name="plus" size={26} />
          <span>Crear</span>
        </Link>
      ) : null}
      {tabs.slice(2).map(tab)}
      <details className="panel-tabbar-more" ref={menu}>
        <summary aria-current={moreCurrent ? "page" : undefined}>
          <PanelIcon name="menu" />
          <span>
            Más
            <AlertCount count={openAlerts} />
          </span>
        </summary>
        <div className="panel-tabbar-sheet">
          <p className="panel-account-identity">
            <strong>{actor.displayName}</strong>
            <span>{actor.email}</span>
          </p>
          {more.map((section) => (
            <Link
              aria-current={current === section.id ? "page" : undefined}
              href={section.href}
              key={section.id}
            >
              {section.label}
              {section.id === "operacion" ? (
                <AlertCount count={openAlerts} />
              ) : null}
            </Link>
          ))}
          <Link
            aria-current={current === "cuenta" ? "page" : undefined}
            href="/cuenta"
          >
            Cambiar contraseña
          </Link>
          <SignOutButton apiBaseUrl={apiBaseUrl} />
        </div>
      </details>
    </nav>
  );
}

/**
 * Barra compartida de todas las pantallas con sesión.
 *
 * Verifica la sesión una vez por carga: sin sesión lleva al login recordando
 * la pantalla pedida, y con la API caída lo dice en vez de mandar a loguearse.
 */
export function PanelShell({
  apiBaseUrl,
  children,
}: Readonly<{ apiBaseUrl: string; children: ReactNode }>) {
  const pathname = usePathname();
  const [state, setState] = useState<ShellState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [openAlerts, setOpenAlerts] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void loadSession(apiBaseUrl).then((result) => {
      if (!active) return;
      const next = shellStateFor(result);
      setState(next);
      if (next.kind === "redirecting") {
        window.location.replace(
          loginPathFor(window.location.pathname, window.location.search),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, attempt]);

  const actor = state.kind === "ready" ? state.actor : null;
  const canOperate = actor !== null && actorCan(actor, "publishing:execute");
  const canCreate =
    actor !== null &&
    (actorCan(actor, "content:edit") || actorCan(actor, "content:schedule"));

  // Se vuelve a contar al cambiar de pantalla: revisar una alerta en Operación
  // y salir tiene que bajar el número sin recargar el panel.
  useEffect(() => {
    if (!canOperate) return;
    let active = true;
    void loadOperationalAlerts(apiBaseUrl).then((result) => {
      if (active) {
        setOpenAlerts(result.kind === "ready" ? result.alerts.length : null);
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, canOperate, pathname]);

  const current = activePanelSection(pathname);

  return (
    <div className="panel-shell">
      <a className="panel-skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="panel-bar">
        <Link className="panel-brand" href="/">
          <strong>Aramayo</strong> <span>Content Platform</span>
        </Link>
        {actor === null ? null : (
          <>
            <nav aria-label="Secciones del panel" className="panel-nav">
              {panelNavigationFor(actor).map((item) => (
                <Link
                  aria-current={current === item.id ? "page" : undefined}
                  href={item.href}
                  key={item.id}
                >
                  {item.label}
                  {item.id === "operacion" ? (
                    <AlertCount count={openAlerts} />
                  ) : null}
                </Link>
              ))}
            </nav>
            {canCreate ? (
              <Link className="panel-create" href={createPiecePath}>
                <PanelIcon name="plus" size={18} />
                Crear pieza
              </Link>
            ) : null}
            <AccountMenu
              actor={actor}
              apiBaseUrl={apiBaseUrl}
              current={current}
              pathname={pathname}
            />
          </>
        )}
      </header>
      <div className="panel-content" id="contenido" tabIndex={-1}>
        {state.kind === "ready" ? (
          <PanelActorContext value={state.actor}>{children}</PanelActorContext>
        ) : (
          <PanelStatus
            onRetry={() => {
              setState({ kind: "loading" });
              setAttempt((value) => value + 1);
            }}
            state={state}
          />
        )}
      </div>
      {actor === null ? null : (
        <TabBar
          actor={actor}
          apiBaseUrl={apiBaseUrl}
          canCreate={canCreate}
          current={current}
          openAlerts={openAlerts}
          pathname={pathname}
        />
      )}
    </div>
  );
}
