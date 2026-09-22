"use client";

import type {
  PublicationStatusResponse,
  PublicationSummaryResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import Image from "next/image";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  publicationAnchorId,
  schedulePublicationHref,
} from "../../../lib/panel-navigation.ts";
import { createPiecePath } from "../../../lib/publication-composer-contract.ts";
import { loadPublishingReadiness } from "../../../lib/publication-publishing-api.ts";
import {
  publishGate,
  type PublishGate,
} from "../../../lib/publication-publishing-presentation.ts";
import { PublicationOrderPanel } from "./publication-order-panel.tsx";
import { PublishConfirmation } from "./publish-confirmation.tsx";

import {
  approvePublication,
  loadPublicationWorkspace,
  discardPublication,
  loadPublicationPreview,
  requestPublicationRender,
  type PublicationPreviewResult,
  type PublicationWorkspaceLoadResult,
} from "../../../lib/publication-workspace-api";
import { PublicationsSubnav } from "./publications-subnav";
import { RecurringStoryDraftEditor } from "./recurring-story-draft-editor";

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
  canSchedule,
  gate,
  onApprove,
  onDiscard,
  onEdit,
  onHistory,
  onPreview,
  onPublish,
  onRender,
  publication,
}: {
  readonly canApprove: boolean;
  readonly canEdit: boolean;
  readonly canSchedule: boolean;
  readonly gate: PublishGate;
  readonly onApprove: (publication: PublicationSummaryResponse) => void;
  readonly onEdit: (publication: PublicationSummaryResponse) => void;
  readonly onHistory: (publication: PublicationSummaryResponse) => void;
  readonly onDiscard: (publication: PublicationSummaryResponse) => void;
  readonly onPreview: (publication: PublicationSummaryResponse) => void;
  readonly onPublish: (publication: PublicationSummaryResponse) => void;
  readonly onRender: (publication: PublicationSummaryResponse) => void;
  readonly publication: PublicationSummaryResponse;
}) {
  return (
    // El id deja llegar a esta pieza puntual desde una alerta o un turno.
    <li id={publicationAnchorId(publication.id)}>
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
          <>
            {publication.status === "draft" ? (
              <button
                onClick={() => {
                  onEdit(publication);
                }}
                type="button"
              >
                Editar borrador
              </button>
            ) : null}
            <button
              onClick={() => {
                onRender(publication);
              }}
              type="button"
            >
              {publication.status === "generation_failed"
                ? "Reintentar PNG"
                : "Generar PNG"}
            </button>
          </>
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
        {discardableStatus(publication.status) && canEdit ? (
          // Descartar no borra la fila: la saca del panel y deja quién y
          // cuándo en la auditoría. Por eso el texto dice «descartar».
          <button
            className="publication-discard"
            onClick={() => {
              onDiscard(publication);
            }}
            type="button"
          >
            Descartar
          </button>
        ) : null}
        {publication.status === "ready_for_review" && canApprove ? (
          <button
            onClick={() => {
              onApprove(publication);
            }}
            type="button"
          >
            Aprobar revisión
          </button>
        ) : null}
        {publication.status === "approved" && canSchedule ? (
          // Aprobar no publica: habilita elegir día y hora, y eso se hace en
          // Programación con esta pieza ya elegida.
          <Link href={schedulePublicationHref(publication.id)}>Programar</Link>
        ) : null}
        {gate.kind === "ready" ? (
          // Abre la confirmación; no publica. Los puntos suspensivos son la
          // convención de «esto sigue en otra pantalla», y acá esa pantalla es
          // lo único que separa un clic de una acción irreversible.
          <button
            onClick={() => {
              onPublish(publication);
            }}
            type="button"
          >
            Publicar…
          </button>
        ) : gate.reason === "missing-role" ? null : (
          // El motivo se muestra en vez de esconder el control: alguien que
          // esperaba publicar necesita saber qué falta, no un botón ausente.
          <span className="publication-publish-blocked">{gate.message}</span>
        )}
        {publication.status === "publishing" ||
        publication.status === "published" ||
        publication.status === "partially_published" ||
        publication.status === "publish_failed" ? (
          <button
            onClick={() => {
              onHistory(publication);
            }}
            type="button"
          >
            Ver resultado
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
          <Link href={kind === "forbidden" ? "/iniciar-sesion" : "/"}>
            {kind === "forbidden" ? "Iniciar sesión" : "Volver al inicio"}
          </Link>
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

/**
 * Estados desde los que descartar es tirar trabajo propio.
 *
 * Espeja lo que admite la API: una pieza aprobada, programada o publicada ya
 * es evidencia y no se descarta desde acá.
 */
function discardableStatus(
  status: PublicationSummaryResponse["status"],
): boolean {
  return (
    status === "draft" ||
    status === "generation_failed" ||
    status === "missing_information" ||
    status === "ready_for_review" ||
    status === "validation_failed"
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
  const [readiness, setReadiness] =
    useState<PublishingReadinessResponse | null>(null);
  /**
   * Publicación cuya confirmación está abierta, y publicación cuyo resultado se
   * está mirando. Son estados distintos a propósito: confirmar es antes de una
   * acción irreversible y mirar el resultado es después.
   */
  const [confirming, setConfirming] =
    useState<PublicationSummaryResponse | null>(null);
  const [inspecting, setInspecting] =
    useState<PublicationSummaryResponse | null>(null);
  const [editing, setEditing] = useState<PublicationSummaryResponse | null>(
    null,
  );
  /** Pieza cuyo descarte se está confirmando: tirar trabajo no se hace de un clic. */
  const [discarding, setDiscarding] =
    useState<PublicationSummaryResponse | null>(null);
  const anchoredToLink = useRef(false);
  const reload = useCallback(() => {
    setInitial({ kind: "loading" });
    setReloadToken((token) => token + 1);
  }, []);
  const runCommand = useCallback(
    async (
      publication: PublicationSummaryResponse,
      command: "approve" | "discard" | "render",
    ): Promise<void> => {
      setCommandNotice(
        command === "render"
          ? "Pidiendo el PNG…"
          : command === "discard"
            ? "Descartando la pieza…"
            : "Aprobando revisión…",
      );
      const result =
        command === "render"
          ? await requestPublicationRender(
              apiBaseUrl,
              publication.id,
              publication.version,
              crypto.randomUUID(),
            )
          : command === "discard"
            ? await discardPublication(
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
    void loadPublishingReadiness(apiBaseUrl).then((result) => {
      if (active) setReadiness(result);
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, reloadToken]);

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
  // Una alerta o un turno enlazan a una pieza puntual (`#publicacion-…`). El
  // enlace llega antes que el listado, así que la fila se busca cuando ya
  // cargó, y una sola vez: el refresco periódico no puede mover la página.
  useEffect(() => {
    if (initial.kind !== "ready" || anchoredToLink.current) return;
    anchoredToLink.current = true;
    const target = window.location.hash.slice(1);
    if (target === "") return;
    document.getElementById(target)?.scrollIntoView({ block: "center" });
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
  const canCreate = initial.canEdit || initial.canSchedule;
  return (
    <main className="workspace-shell">
      <section aria-labelledby="mesa-de-contenido" className="workspace-intro">
        <div>
          <p className="workspace-eyebrow">Mesa de contenido</p>
          <h1 id="mesa-de-contenido">
            De la idea al borrador, sin saltos ocultos.
          </h1>
        </div>
        <p>
          Cada pieza conserva su estado real. Guardar, revisar, aprobar y
          publicar siguen siendo acciones distintas.
        </p>
      </section>

      <PublicationsSubnav canCreate={canCreate} />

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
            {canCreate ? (
              <p>
                <Link href={createPiecePath}>Creá la primera pieza</Link>. Nada
                se publica al guardarla.
              </p>
            ) : (
              <p>
                Cuando alguien del equipo cree una pieza, va a aparecer acá.
              </p>
            )}
          </div>
        ) : (
          <ul className="publication-list">
            {publications.map((publication) => (
              <PublicationRow
                canApprove={initial.canApprove}
                canEdit={initial.canEdit}
                canSchedule={initial.canSchedule}
                gate={publishGate(initial.actor, publication, readiness)}
                key={publication.id}
                onApprove={(selected) => {
                  void runCommand(selected, "approve");
                }}
                onDiscard={(selected) => {
                  setDiscarding(selected);
                }}
                onEdit={(selected) => {
                  setEditing(selected);
                }}
                onHistory={(selected) => {
                  setConfirming(null);
                  setInspecting(selected);
                }}
                onPreview={(selected) => {
                  void showPreview(selected);
                }}
                onPublish={(selected) => {
                  setInspecting(null);
                  setConfirming(selected);
                }}
                onRender={(selected) => {
                  void runCommand(selected, "render");
                }}
                publication={publication}
              />
            ))}
          </ul>
        )}
        {discarding === null ? null : (
          <div className="publication-discard-confirm" role="dialog">
            <p>
              ¿Descartar <strong>{discarding.title}</strong>? Sale del listado y
              no se puede recuperar desde el panel.
            </p>
            <div>
              <button
                onClick={() => {
                  const selected = discarding;
                  setDiscarding(null);
                  void runCommand(selected, "discard");
                }}
                type="button"
              >
                Sí, descartar
              </button>
              <button
                onClick={() => {
                  setDiscarding(null);
                }}
                type="button"
              >
                No
              </button>
            </div>
          </div>
        )}
        {confirming === null
          ? null
          : (() => {
              const gate = publishGate(initial.actor, confirming, readiness);
              // Se vuelve a evaluar al dibujar: entre que se abrió la
              // confirmación y ahora, la pieza o la conexión pudieron cambiar.
              return gate.kind === "ready" ? (
                <PublishConfirmation
                  accountName={gate.accountName}
                  apiBaseUrl={apiBaseUrl}
                  availableTargets={gate.targets}
                  onCancel={() => {
                    setConfirming(null);
                    reload();
                  }}
                  onPublished={() => {
                    const published = confirming;
                    setConfirming(null);
                    setInspecting(published);
                    setCommandNotice(
                      "Publicación pedida. Seguí el resultado por destino.",
                    );
                    reload();
                  }}
                  publication={confirming}
                />
              ) : (
                <p role="alert">{gate.message}</p>
              );
            })()}
        {inspecting === null ? null : (
          <PublicationOrderPanel
            actor={initial.actor}
            apiBaseUrl={apiBaseUrl}
            publicationId={inspecting.id}
          />
        )}
        {editing === null ? null : (
          <RecurringStoryDraftEditor
            apiBaseUrl={apiBaseUrl}
            onClose={() => {
              setEditing(null);
            }}
            onSaved={() => {
              reload();
            }}
            publicationId={editing.id}
          />
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
    </main>
  );
}
