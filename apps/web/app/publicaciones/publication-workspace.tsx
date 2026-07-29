"use client";

import type {
  PublicationStatusResponse,
  PublicationSummaryResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";

import {
  loadPublicationWorkspace,
  type PublicationWorkspaceLoadResult,
} from "../../lib/publication-workspace-api";
import { PublicationComposer } from "./publication-composer";

function statusLabel(status: PublicationStatusResponse): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "ready_for_review":
      return "Lista para revisión";
    case "approved":
      return "Aprobada";
    case "scheduled":
      return "Programada";
    case "published":
      return "Publicada";
    case "partially_published":
      return "Publicación parcial";
    case "publishing":
      return "Publicando";
    case "retrieving_context":
    case "generating_assets":
      return "En preparación";
    case "missing_information":
    case "generation_failed":
    case "validation_failed":
    case "publish_failed":
      return "Requiere atención";
    case "cancelled":
      return "Cancelada";
    case "expired":
      return "Vencida";
  }
}

function PublicationRow({
  publication,
}: {
  readonly publication: PublicationSummaryResponse;
}) {
  return (
    <li>
      <div className="publication-state-rail" data-status={publication.status}>
        <span>{statusLabel(publication.status)}</span>
      </div>
      <div className="publication-row-main">
        <strong>{publication.title}</strong>
        <span>
          Revisión {publication.latestRevisionNumber} · versión{" "}
          {publication.version}
        </span>
      </div>
      <time dateTime={publication.updatedAt}>
        {new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(publication.updatedAt))}
      </time>
    </li>
  );
}

function WorkspaceStatus({
  kind,
  message,
  onRetry,
}: {
  readonly kind: "error" | "forbidden" | "loading";
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <main aria-busy={kind === "loading"} className="workspace-shell">
      <section className="workspace-status" data-kind={kind}>
        <p className="workspace-eyebrow">
          {kind === "forbidden"
            ? "Acceso requerido"
            : kind === "loading"
              ? "Cargando sesión y publicaciones"
              : "No se pudo cargar"}
        </p>
        <h1>Mesa de contenido</h1>
        <p>{message}</p>
        {onRetry === undefined ? (
          <Link href="/">Volver al inicio</Link>
        ) : (
          <button
            className="workspace-primary-action"
            onClick={onRetry}
            type="button"
          >
            Reintentar
          </button>
        )}
      </section>
    </main>
  );
}

export function PublicationWorkspace({
  apiBaseUrl,
}: {
  readonly apiBaseUrl: string;
}) {
  const [reloadToken, setReloadToken] = useState(0);
  const [initial, setInitial] = useState<
    PublicationWorkspaceLoadResult | Readonly<{ kind: "loading" }>
  >({ kind: "loading" });
  const reload = useCallback(() => {
    setInitial({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void loadPublicationWorkspace(apiBaseUrl).then((result) => {
      if (active) {
        startTransition(() => {
          setInitial(result);
        });
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, reloadToken]);

  if (initial.kind === "loading") {
    return (
      <WorkspaceStatus
        kind="loading"
        message="Estamos leyendo el estado actual antes de habilitar acciones."
      />
    );
  }
  if (initial.kind === "forbidden") {
    return (
      <WorkspaceStatus
        kind="forbidden"
        message="Iniciá sesión con una cuenta de Aramayo para ver publicaciones."
      />
    );
  }
  if (initial.kind === "error") {
    return (
      <WorkspaceStatus
        kind="error"
        message={initial.message}
        onRetry={reload}
      />
    );
  }
  const publications =
    initial.kind === "ready" ? initial.publications.items : [];
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <Link className="workspace-brand" href="/">
            Aramayo
          </Link>
          <span>Content Platform</span>
        </div>
        <nav aria-label="Navegación principal">
          <a aria-current="page" href="#publicaciones">
            Publicaciones
          </a>
          <Link href="/configuracion">Configuración</Link>
        </nav>
        <p>
          <span>Sesión activa</span>
          <strong>{initial.actor.displayName}</strong>
        </p>
      </header>

      <section className="workspace-intro">
        <div>
          <p className="workspace-eyebrow">Mesa de contenido</p>
          <h1>De la idea al borrador, sin saltos ocultos.</h1>
        </div>
        <p>
          Cada pieza conserva su estado real. Guardar, revisar, aprobar y
          publicar siguen siendo acciones distintas.
        </p>
      </section>

      <section aria-labelledby="publicaciones" className="publication-board">
        <div className="workspace-section-heading">
          <div>
            <p className="workspace-eyebrow">Actividad reciente</p>
            <h2 id="publicaciones">Publicaciones</h2>
          </div>
          <span>{publications.length} visibles</span>
        </div>
        {publications.length === 0 ? (
          <div className="publication-empty">
            <strong>Todavía no hay borradores.</strong>
            <p>
              Elegí una plantilla debajo y creá la primera pieza. Nada se
              publica al guardarla.
            </p>
          </div>
        ) : (
          <ul className="publication-list">
            {publications.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} />
            ))}
          </ul>
        )}
      </section>

      <PublicationComposer.Provider
        apiBaseUrl={apiBaseUrl}
        canEdit={initial.canEdit}
      >
        <section className="composer-section">
          <div className="workspace-section-heading">
            <div>
              <p className="workspace-eyebrow">Nueva pieza</p>
              <h2>Elegí el flujo correcto</h2>
            </div>
            <span>
              {initial.canEdit ? "Edición habilitada" : "Sólo lectura"}
            </span>
          </div>
          <PublicationComposer.VariantNavigation />
          <PublicationComposer.Active />
          <PublicationComposer.Notice />
        </section>
      </PublicationComposer.Provider>
    </main>
  );
}
