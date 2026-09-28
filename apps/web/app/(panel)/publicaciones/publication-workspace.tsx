"use client";

import type {
  PublicationStatusResponse,
  PublicationSummaryResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  actorCan,
  publicationAnchorId,
  schedulePublicationHref,
} from "../../../lib/panel-navigation.ts";
import {
  canPublishNow,
  canScheduleFromCard,
  editorFor,
  pieceFormatLabel,
  primaryActionFor,
  publishBlockNotice,
  type CardPermissions,
} from "../../../lib/publication-card.ts";
import {
  composerVariantHref,
  createPiecePath,
} from "../../../lib/publication-composer-contract.ts";
import { loadPublishingReadiness } from "../../../lib/publication-publishing-api.ts";
import {
  publishGate,
  type PublishGate,
} from "../../../lib/publication-publishing-presentation.ts";
import { PublicationOrderPanel } from "./publication-order-panel.tsx";
import { PublicationRelease } from "./publication-release.tsx";
import { PublicationSheet } from "./publication-sheet.tsx";
import { PublishConfirmation } from "./publish-confirmation.tsx";

import {
  approvePublication,
  loadPublicationWorkspace,
  deletePublication,
  loadPublicationPreview,
  requestPublicationRender,
  type PublicationPreviewResult,
  type PublicationWorkspaceLoadResult,
} from "../../../lib/publication-workspace-api";
import { RecurringStoryDraftEditor } from "./recurring-story-draft-editor";

function statusLabel(status: PublicationStatusResponse): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "ready_for_review":
      return "Lista para salir";
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

/** Elegir una opción de «⋯» cierra el menú: el próximo toque lo vuelve a abrir. */
function closeMenu(event: MouseEvent<HTMLElement>): void {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

type RowAction =
  "delete" | "edit" | "preview" | "publish" | "release" | "render" | "result";

function PublicationRow({
  gate,
  onAction,
  permissions,
  publication,
}: {
  readonly gate: PublishGate;
  readonly onAction: (
    publication: PublicationSummaryResponse,
    action: RowAction,
  ) => void;
  readonly permissions: CardPermissions;
  readonly publication: PublicationSummaryResponse;
}) {
  const primary = primaryActionFor(publication, permissions, gate);
  const editor = editorFor(publication, permissions);
  const publishNow = canPublishNow(publication, primary, gate);
  const scheduleHere = canScheduleFromCard(publication, primary, permissions);
  const blockNotice = publishBlockNotice(gate);
  const showImage =
    publication.previewUrl !== undefined &&
    primary?.kind !== "release" &&
    primary?.kind !== "preview";
  const deletable = deletableStatus(publication.status) && permissions.canEdit;
  const hasMore = showImage || publishNow || scheduleHere || deletable;
  // Tocar la imagen abre la pieza: es lo primero que se toca en un celular.
  const openAction: RowAction | null =
    primary !== null &&
    (primary.kind === "release" ||
      primary.kind === "publish" ||
      primary.kind === "result" ||
      primary.kind === "preview")
      ? primary.kind
      : publication.previewUrl === undefined
        ? null
        : "preview";
  const thumbnail =
    publication.previewUrl === undefined ? (
      <span aria-hidden="true">{pieceFormatLabel(publication.format)}</span>
    ) : (
      /* eslint-disable-next-line @next/next/no-img-element -- la imagen ya viene del almacenamiento de medios */
      <img alt="" loading="lazy" src={publication.previewUrl} />
    );
  return (
    // El id deja llegar a esta pieza puntual desde una alerta o un turno.
    <li
      className="publication-card"
      data-status={publication.status}
      id={publicationAnchorId(publication.id)}
    >
      {openAction === null ? (
        <div
          className="publication-thumb"
          data-format={publication.format ?? "otro"}
        >
          {thumbnail}
        </div>
      ) : (
        <button
          aria-label={`Abrir ${publication.title}`}
          className="publication-thumb"
          data-format={publication.format ?? "otro"}
          onClick={() => {
            onAction(publication, openAction);
          }}
          type="button"
        >
          {thumbnail}
        </button>
      )}
      <div className="publication-card-body">
        <span className="publication-status" data-status={publication.status}>
          {statusLabel(publication.status)}
        </span>
        <strong className="publication-card-title">{publication.title}</strong>
        <span className="publication-card-meta">
          {pieceFormatLabel(publication.format)} ·{" "}
          <time dateTime={publication.updatedAt}>
            {new Intl.DateTimeFormat("es-AR", {
              day: "numeric",
              month: "short",
            }).format(new Date(publication.updatedAt))}
          </time>
        </span>
        {publication.failure === undefined ? null : (
          <span className="publication-failure">
            {publication.failure.safeMessage}
            {publication.failure.retryable ? " Se puede reintentar." : ""}
          </span>
        )}
        {blockNotice === null ? null : (
          // El motivo se muestra en vez de esconder el control: alguien que
          // esperaba publicar necesita saber qué falta, no un botón ausente.
          <span className="publication-publish-blocked">{blockNotice}</span>
        )}
        <div className="publication-row-actions">
          {primary === null ? null : primary.kind === "schedule" ? (
            // Aprobar no publica: elegir día y hora se hace en Programación,
            // con esta pieza ya elegida.
            <Link
              className="publication-primary"
              href={schedulePublicationHref(publication.id)}
            >
              {primary.label}
            </Link>
          ) : (
            <button
              className="publication-primary"
              disabled={primary.kind === "wait"}
              onClick={() => {
                if (primary.kind !== "wait")
                  onAction(publication, primary.kind);
              }}
              type="button"
            >
              {primary.label}
            </button>
          )}
          {editor === null ? null : (
            <button
              onClick={() => {
                onAction(publication, "edit");
              }}
              type="button"
            >
              Editar
            </button>
          )}
          {hasMore ? (
            <details className="publication-more">
              <summary aria-label="Más acciones">
                <span aria-hidden="true">⋯</span>
              </summary>
              <div>
                {showImage ? (
                  <button
                    onClick={(event) => {
                      closeMenu(event);
                      onAction(publication, "preview");
                    }}
                    type="button"
                  >
                    Ver imagen
                  </button>
                ) : null}
                {scheduleHere ? (
                  <Link href={schedulePublicationHref(publication.id)}>
                    Programar
                  </Link>
                ) : null}
                {publishNow ? (
                  // Abre la confirmación; no publica. Los puntos suspensivos
                  // avisan que sigue otra pantalla antes de algo irreversible.
                  <button
                    onClick={(event) => {
                      closeMenu(event);
                      onAction(publication, "publish");
                    }}
                    type="button"
                  >
                    Publicar…
                  </button>
                ) : null}
                {deletable ? (
                  // Elimina de verdad: la pieza y su foto. Lo único que queda
                  // es el renglón de auditoría, que dice que se eliminó.
                  <button
                    className="publication-discard"
                    onClick={(event) => {
                      closeMenu(event);
                      onAction(publication, "delete");
                    }}
                    type="button"
                  >
                    Eliminar
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
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
              ? "Cargando"
              : "No se pudo cargar"}
        </p>
        <h1>Publicaciones</h1>
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

/** Lo que ya salió o no va a salir: se muestra aparte, plegado. */
const doneStatuses: ReadonlySet<PublicationSummaryResponse["status"]> = new Set(
  ["published", "partially_published", "cancelled", "expired"],
);

/**
 * Estados desde los que eliminar es tirar trabajo propio.
 *
 * Espeja lo que admite la API: una pieza aprobada, programada o publicada ya
 * es evidencia y no se elimina desde acá.
 */
function deletableStatus(
  status: PublicationSummaryResponse["status"],
): boolean {
  return (
    status === "draft" ||
    status === "generating_assets" ||
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
  const router = useRouter();
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicationPreviewResult | null>(null);
  /** Pieza cuya imagen se está mirando: es la que se aprueba y se programa. */
  const [previewing, setPreviewing] =
    useState<PublicationSummaryResponse | null>(null);
  /** Pieza que se está sacando: la hoja de «¿Cuándo sale?» sigue su estado. */
  const [releasingId, setReleasingId] = useState<string | null>(null);
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
  /** Pieza cuya eliminación se está confirmando: borrar no se hace de un clic. */
  const [deleting, setDeleting] = useState<PublicationSummaryResponse | null>(
    null,
  );
  const anchoredToLink = useRef(false);
  /**
   * Pieza recién creada que hay que dejar lista para mirar: se le pide el PNG
   * una vez y se abre la vista cuando está. Sin esto, guardar termina en un
   * listado donde hay que pedir el PNG, esperar y abrirlo a mano.
   */
  const reviewing = useRef<Readonly<{ id: string; rendered: boolean }> | null>(
    null,
  );
  // Refrescar no borra el listado: la pieza que se acaba de tocar sigue a la
  // vista mientras llega su estado nuevo.
  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);
  /** Cierra la hoja abierta, sea cual sea. */
  const closeSheets = useCallback(() => {
    setPreview(null);
    setPreviewing(null);
    setReleasingId(null);
    setConfirming(null);
    setInspecting(null);
    setEditing(null);
    setDeleting(null);
  }, []);
  const runCommand = useCallback(
    async (
      publication: PublicationSummaryResponse,
      command: "approve" | "delete" | "render",
      schedule?: Readonly<{
        localDate: string;
        localTime: string;
        targets: readonly string[];
      }>,
    ): Promise<void> => {
      setCommandNotice(
        command === "render"
          ? "Preparando la imagen…"
          : command === "delete"
            ? "Eliminando la pieza…"
            : "Aprobando…",
      );
      const result =
        command === "render"
          ? await requestPublicationRender(
              apiBaseUrl,
              publication.id,
              publication.version,
              crypto.randomUUID(),
            )
          : command === "delete"
            ? await deletePublication(
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
                schedule,
              );
      setCommandNotice(
        result.kind === "completed"
          ? result.message
          : result.kind === "forbidden"
            ? "La sesión no permite esta acción."
            : result.message,
      );
      if (result.kind === "completed") {
        if (command !== "render") closeSheets();
        reload();
      }
    },
    [apiBaseUrl, closeSheets, reload],
  );
  const showPreview = useCallback(
    async (publication: PublicationSummaryResponse): Promise<void> => {
      closeSheets();
      setPreviewing(publication);
      const result = await loadPublicationPreview(apiBaseUrl, publication.id);
      setPreview(result);
    },
    [apiBaseUrl, closeSheets],
  );
  const act = useCallback(
    (publication: PublicationSummaryResponse, action: RowAction): void => {
      switch (action) {
        case "render":
          // La hoja de salida se abre ya, mientras se prepara la imagen.
          closeSheets();
          setReleasingId(publication.id);
          void runCommand(publication, "render");
          return;
        case "release":
          closeSheets();
          setReleasingId(publication.id);
          return;
        case "preview":
          void showPreview(publication);
          return;
        case "publish":
          closeSheets();
          setConfirming(publication);
          return;
        case "result":
          closeSheets();
          setInspecting(publication);
          return;
        case "delete":
          closeSheets();
          setDeleting(publication);
          return;
        case "edit":
          if (
            initial.kind === "ready" &&
            editorFor(publication, initial) === "product"
          ) {
            router.push(
              `${composerVariantHref("product-story")}&editar=${publication.id}`,
            );
            return;
          }
          closeSheets();
          setEditing(publication);
          return;
      }
    },
    [closeSheets, initial, router, runCommand, showPreview],
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

  // Al llegar desde «Crear pieza» con `?revisar=`, la pieza se prepara sola y
  // la hoja de salida se abre en el acto: mientras se prepara la imagen dice
  // que se está preparando, y cuando está deja publicarla. Es una sola vez por
  // pieza: el refresco periódico no la vuelve a pedir ni recargar la página.
  const openRequestedPiece = useCallback(
    (result: PublicationWorkspaceLoadResult): void => {
      if (result.kind !== "ready" || reviewing.current !== null) return;
      const requested = new URLSearchParams(window.location.search).get(
        "revisar",
      );
      if (requested === null) return;
      const publication = result.publications.items.find(
        (item) => item.id === requested,
      );
      if (publication === undefined) return;
      reviewing.current = { id: requested, rendered: true };
      window.history.replaceState(null, "", window.location.pathname);
      setReleasingId(publication.id);
      if (publication.status === "draft" && result.canEdit) {
        void runCommand(publication, "render");
      }
    },
    [runCommand],
  );

  useEffect(() => {
    let active = true;
    void loadPublicationWorkspace(apiBaseUrl).then((result) => {
      if (active) {
        startTransition(() => {
          setInitial(result);
        });
        openRequestedPiece(result);
      }
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, openRequestedPiece, reloadToken]);
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
  const permissions: CardPermissions = {
    canApprove: initial.canApprove,
    canEdit: initial.canEdit,
    canSchedule: initial.canSchedule,
  };
  const confirmGate =
    confirming === null
      ? null
      : publishGate(initial.actor, confirming, readiness);
  const done = publications.filter((publication) =>
    doneStatuses.has(publication.status),
  );
  const upcoming = publications.filter(
    (publication) => !doneStatuses.has(publication.status),
  );
  const row = (publication: PublicationSummaryResponse) => (
    <PublicationRow
      gate={publishGate(initial.actor, publication, readiness)}
      key={publication.id}
      onAction={act}
      permissions={permissions}
      publication={publication}
    />
  );
  const releasing =
    releasingId === null
      ? undefined
      : publications.find((publication) => publication.id === releasingId);
  return (
    <main className="workspace-shell">
      <section aria-labelledby="mesa-de-contenido" className="workspace-intro">
        <h1 id="mesa-de-contenido">Publicaciones</h1>
        <p>Tocá una pieza para verla o sacarla.</p>
      </section>

      <section
        aria-label="Listado de publicaciones"
        className="publication-board"
      >
        {commandNotice === null ? null : (
          <p aria-live="polite" className="publication-command-notice">
            {commandNotice}
          </p>
        )}
        {publications.length === 0 ? (
          <div className="publication-empty">
            <strong>Todavía no hay piezas.</strong>
            {canCreate ? (
              <p>
                <Link href={createPiecePath}>Creá la primera</Link>. Nada se
                publica al guardarla.
              </p>
            ) : (
              <p>Cuando se cree una pieza, va a aparecer acá.</p>
            )}
          </div>
        ) : (
          <>
            {upcoming.length === 0 ? (
              <p className="publication-sheet-note">
                No hay nada por salir.{" "}
                {canCreate ? (
                  <Link href={createPiecePath}>Crear una pieza</Link>
                ) : null}
              </p>
            ) : (
              <ul aria-label="Por salir" className="publication-list">
                {upcoming.map(row)}
              </ul>
            )}
            {done.length === 0 ? null : (
              // Lo que ya salió queda plegado: las historias duran un día y el
              // listado es para lo que todavía falta.
              <details className="publication-done">
                <summary>Ya salieron ({done.length})</summary>
                <ul aria-label="Ya salieron" className="publication-list">
                  {done.map(row)}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      {previewing === null ? null : (
        <PublicationSheet onClose={closeSheets} title={previewing.title}>
          {preview === null ? (
            <p aria-busy="true" className="publication-sheet-note">
              Cargando la imagen…
            </p>
          ) : preview.kind === "error" ? (
            <p role="alert">{preview.message}</p>
          ) : (
            <figure
              className="publication-render-preview"
              data-format={previewing.format ?? "historia"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- la imagen ya viene del almacenamiento de medios */}
              <img alt={preview.preview.alt} src={preview.preview.secureUrl} />
              <figcaption>
                {pieceFormatLabel(previewing.format)} · así sale.
              </figcaption>
            </figure>
          )}
        </PublicationSheet>
      )}

      {releasing === undefined ? null : (
        <PublicationSheet onClose={closeSheets} title={releasing.title} wide>
          <PublicationRelease
            apiBaseUrl={apiBaseUrl}
            canApprove={initial.canApprove}
            canPublish={actorCan(initial.actor, "publishing:execute")}
            canSchedule={initial.canSchedule}
            onEdit={
              editorFor(releasing, permissions) === "product"
                ? () => {
                    act(releasing, "edit");
                  }
                : null
            }
            onReleased={(result, whenText) => {
              closeSheets();
              if (result.kind === "published") {
                setInspecting(releasing);
                setCommandNotice(
                  "Publicación pedida. Seguí el resultado por destino.",
                );
              } else {
                setCommandNotice(`Quedó programada: sale ${whenText}.`);
              }
              reload();
            }}
            publication={releasing}
            readiness={readiness}
          />
        </PublicationSheet>
      )}

      {deleting === null ? null : (
        <PublicationSheet onClose={closeSheets} title="Eliminar la pieza">
          <div className="publication-discard-confirm">
            <p>
              ¿Eliminar <strong>{deleting.title}</strong>? Se borra para
              siempre, con su foto. No se puede deshacer.
            </p>
            <div>
              <button
                onClick={() => {
                  const selected = deleting;
                  void runCommand(selected, "delete");
                }}
                type="button"
              >
                Sí, eliminar
              </button>
              <button onClick={closeSheets} type="button">
                No
              </button>
            </div>
          </div>
        </PublicationSheet>
      )}

      {confirming === null || confirmGate === null ? null : (
        <PublicationSheet onClose={closeSheets} title="Publicar">
          {/* Se vuelve a evaluar al dibujar: entre que se abrió la
              confirmación y ahora, la pieza o la conexión pudieron cambiar. */}
          {confirmGate.kind === "ready" ? (
            <PublishConfirmation
              accountName={confirmGate.accountName}
              apiBaseUrl={apiBaseUrl}
              availableTargets={confirmGate.targets}
              onCancel={() => {
                closeSheets();
                reload();
              }}
              onPublished={() => {
                const published = confirming;
                closeSheets();
                setInspecting(published);
                setCommandNotice(
                  "Publicación pedida. Seguí el resultado por destino.",
                );
                reload();
              }}
              publication={confirming}
            />
          ) : (
            <p role="alert">{confirmGate.message}</p>
          )}
        </PublicationSheet>
      )}

      {inspecting === null ? null : (
        <PublicationSheet onClose={closeSheets} title={inspecting.title}>
          <PublicationOrderPanel
            actor={initial.actor}
            apiBaseUrl={apiBaseUrl}
            publicationId={inspecting.id}
          />
        </PublicationSheet>
      )}

      {editing === null ? null : (
        <PublicationSheet onClose={closeSheets} title={editing.title} wide>
          <RecurringStoryDraftEditor
            apiBaseUrl={apiBaseUrl}
            onClose={closeSheets}
            onSaved={() => {
              reload();
            }}
            publicationId={editing.id}
          />
        </PublicationSheet>
      )}
    </main>
  );
}
