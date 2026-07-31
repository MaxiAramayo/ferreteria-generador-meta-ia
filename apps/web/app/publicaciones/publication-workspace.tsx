"use client";

import type {
  PublicationStatusResponse,
  PublicationSummaryResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import Image from "next/image";
import { startTransition, useCallback, useEffect, useState } from "react";

import {
  approvePublication,
  loadPublicationWorkspace,
  loadPublicationPreview,
  requestPublicationRender,
  type PublicationPreviewResult,
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
  canApprove,
  canEdit,
  onApprove,
  onPreview,
  onRender,
  publication,
}: {
  readonly canApprove: boolean;
  readonly canEdit: boolean;
  readonly onApprove: (publication: PublicationSummaryResponse) => void;
  readonly onPreview: (publication: PublicationSummaryResponse) => void;
  readonly onRender: (publication: PublicationSummaryResponse) => void;
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
        {publication.latestContentBriefRunId === undefined ? null : (
          // Desde la pieza se llega a la ejecución que la generó, y desde ahí
          // a la evidencia que sustenta cada afirmación.
          <span className="publication-brief-origin">
            Generada desde el brief{" "}
            <code>{publication.latestContentBriefRunId.slice(0, 8)}</code>
          </span>
        )}
        {publication.failure === undefined ? null : (
          <span className="publication-failure">
            {publication.failure.safeMessage}
            {publication.failure.retryable ? " Se puede reintentar." : ""}
          </span>
        )}
      </div>
      <time dateTime={publication.updatedAt}>
        {new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(new Date(publication.updatedAt))}
      </time>
      <div className="publication-row-actions">
        {(publication.status === "draft" ||
          publication.status === "generation_failed") &&
        canEdit ? (
          <button
            onClick={() => {
              onRender(publication);
            }}
            type="button"
          >
            {publication.status === "generation_failed"
              ? "Reintentar render"
              : "Generar PNG"}
          </button>
        ) : null}
        {(publication.status === "ready_for_review" ||
          publication.status === "approved") && (
          <button
            onClick={() => {
              onPreview(publication);
            }}
            type="button"
          >
            Ver PNG
          </button>
        )}
        {publication.status === "ready_for_review" && canApprove ? (
          <button
            onClick={() => {
              onApprove(publication);
            }}
            type="button"
          >
            Aprobar snapshot
          </button>
        ) : null}
      </div>
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
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicationPreviewResult | null>(null);
  const reload = useCallback(() => {
    setInitial({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }, []);
  const draftSaved = useCallback(
    (title: string) => {
      setCommandNotice(`Borrador guardado como “${title}”.`);
      reload();
    },
    [reload],
  );
  const runCommand = useCallback(
    async (
      publication: PublicationSummaryResponse,
      command: "approve" | "render",
    ): Promise<void> => {
      setCommandNotice(
        command === "render" ? "Solicitando render…" : "Aprobando snapshot…",
      );
      const result =
        command === "render"
          ? await requestPublicationRender(
              apiBaseUrl,
              publication.id,
              publication.version,
              crypto.randomUUID(),
            )
          : await approvePublication(
              apiBaseUrl,
              publication.id,
              publication.version,
              crypto.randomUUID(),
            );
      setCommandNotice(
        result.kind === "completed"
          ? result.message
          : result.kind === "forbidden"
            ? "La sesión no permite esta acción."
            : result.message,
      );
      if (result.kind === "completed") {
        reload();
      }
    },
    [apiBaseUrl, reload],
  );
  const showPreview = useCallback(
    async (publication: PublicationSummaryResponse): Promise<void> => {
      setPreview(null);
      const result = await loadPublicationPreview(apiBaseUrl, publication.id);
      setPreview(result);
    },
    [apiBaseUrl],
  );

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
  useEffect(() => {
    if (
      initial.kind !== "ready" ||
      !initial.publications.items.some(
        (publication) => publication.status === "generating_assets",
      )
    ) {
      return;
    }
    const refresh = setTimeout(() => {
      setReloadToken((token) => token + 1);
    }, 1_500);
    return () => {
      clearTimeout(refresh);
    };
  }, [initial]);

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
              <PublicationRow
                canApprove={initial.canApprove}
                canEdit={initial.canEdit}
                key={publication.id}
                onApprove={(selected) => {
                  void runCommand(selected, "approve");
                }}
                onPreview={(selected) => {
                  void showPreview(selected);
                }}
                onRender={(selected) => {
                  void runCommand(selected, "render");
                }}
                publication={publication}
              />
            ))}
          </ul>
        )}
        {commandNotice === null ? null : (
          <p aria-live="polite" className="publication-command-notice">
            {commandNotice}
          </p>
        )}
        {preview === null ? null : preview.kind === "error" ? (
          <p role="alert">{preview.message}</p>
        ) : (
          <figure className="publication-render-preview">
            <Image
              alt={preview.preview.alt}
              height={540}
              src={preview.preview.secureUrl}
              unoptimized
              width={432}
            />
            <figcaption>
              PNG confirmado · SHA-256{" "}
              <code>{preview.preview.checksumSha256.slice(0, 12)}…</code>
            </figcaption>
          </figure>
        )}
      </section>

      <PublicationComposer.Provider
        apiBaseUrl={apiBaseUrl}
        canEdit={initial.canEdit}
        onDraftSaved={draftSaved}
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
