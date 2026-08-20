"use client";

/**
 * Resultado e inspección por destino.
 *
 * Después de publicar, la pregunta que importa no es «¿salió?» sino «¿qué salió
 * y qué no?». Un agregado solo no alcanza para decidir nada: la persona
 * necesita ver cuál destino quedó publicado, cuál falló y cuál quedó en duda,
 * porque las tres cosas piden acciones distintas.
 *
 * La duda se muestra distinta del error a propósito. Un fallo se puede
 * reintentar; un desenlace que Meta no confirma, no —puede haber salido—, y
 * pintarlos igual invitaría a pedir el reintento que duplica. Por eso las
 * acciones que se ofrecen no se deducen acá: llegan del servidor, que sabe por
 * qué se detuvo cada destino, y el panel sólo les suma el rol de quien mira.
 */

import type {
  PublicationManualActionListResponse,
  PublicationOrderResponse,
} from "@aramayo/contracts";
import type { AuthenticatedActor } from "@aramayo/domain";
import { useCallback, useEffect, useState } from "react";

import {
  applyManualAction,
  loadPendingManualActions,
  loadPublicationOrders,
  type ManualActionListResult,
  type PublicationOrderHistoryResult,
} from "../../lib/publication-publishing-api.ts";
import {
  manualActionLabels,
  manualReasonLabels,
  publicationTargetLabels,
  publicationTargetOutcome,
  publicationTargetOutcomeLabels,
  visibleManualActions,
} from "../../lib/publication-publishing-presentation.ts";

export interface PublicationOrderPanelProps {
  readonly actor: AuthenticatedActor;
  readonly apiBaseUrl: string;
  readonly publicationId: string;
}

const orderStatusLabels: Readonly<
  Record<PublicationOrderResponse["status"], string>
> = Object.freeze({
  partially_published: "Salió a medias",
  publish_failed: "No salió",
  published: "Publicada",
  publishing: "En curso",
});

export function PublicationOrderPanel({
  actor,
  apiBaseUrl,
  publicationId,
}: PublicationOrderPanelProps): React.JSX.Element {
  const [history, setHistory] = useState<
    PublicationOrderHistoryResult | Readonly<{ kind: "loading" }>
  >({ kind: "loading" });
  const [stopped, setStopped] = useState<
    PublicationManualActionListResponse["items"]
  >([]);
  /** Destino con una acción en vuelo. Impide el segundo clic y el cruce. */
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Pedir otra lectura es subir el contador, no llamar a la carga.
   *
   * La carga vive en un efecto y escribe estado dentro del `then`; invocarla
   * derecho desde un manejador o desde el cuerpo de otro efecto encadenaría
   * renders. El contador es la forma de decir «volvé a leer» sin acoplar quién
   * lo pide con cómo se lee.
   */
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadPublicationOrders(apiBaseUrl, publicationId),
      loadPendingManualActions(apiBaseUrl),
    ]).then(([loaded, pending]) => {
      if (!active) return;
      setHistory(loaded);
      if (pending.kind === "ready") setStopped(pending.items);
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, publicationId, reloadToken]);

  // Mientras haya trabajo en curso el historial se relee solo: el worker mueve
  // la orden por su cuenta y una pantalla congelada mostraría un estado que ya
  // cambió.
  useEffect(() => {
    if (
      history.kind !== "ready" ||
      !history.items.some((entry) => entry.status === "publishing")
    ) {
      return;
    }
    const timer = setTimeout(refresh, 3_000);
    return () => {
      clearTimeout(timer);
    };
  }, [history, refresh]);

  const act = useCallback(
    async (
      publicationTargetId: string,
      action: "abandon" | "reconcile" | "retry",
    ): Promise<void> => {
      if (actingOn !== null) return;
      setActingOn(publicationTargetId);
      setNotice(null);
      const result: ManualActionListResult = await applyManualAction(
        apiBaseUrl,
        publicationTargetId,
        action,
      );
      if (result.kind === "ready") {
        setStopped(result.items);
        refresh();
      } else {
        setNotice(
          result.kind === "forbidden"
            ? "La sesión no permite operar publicaciones."
            : result.message,
        );
      }
      setActingOn(null);
    },
    [actingOn, apiBaseUrl, refresh],
  );

  if (history.kind === "loading") {
    return <p aria-busy="true">Leyendo el resultado por destino…</p>;
  }
  if (history.kind === "forbidden") {
    return <p role="alert">La sesión no permite ver esta publicación.</p>;
  }
  if (history.kind === "error") {
    return <p role="alert">{history.message}</p>;
  }
  if (history.items.length === 0) {
    return <p>Esta pieza todavía no se pidió publicar.</p>;
  }

  // Se busca por destino de la orden concreta: dos órdenes de la misma pieza
  // tienen el mismo destino, y confundirlas ofrecería la acción de una sobre
  // la otra.
  const stoppedByKey = new Map(
    stopped.map((entry) => [entry.publicationTargetId, entry]),
  );

  return (
    <section
      aria-label="Historial de publicación"
      className="publication-order-history"
    >
      {history.items.map((order, index) => (
        <article className="publication-order" key={order.id}>
          <header>
            <h3>{orderStatusLabels[order.status]}</h3>
            <p>
              {index === 0 ? "Último pedido" : "Pedido anterior"} ·{" "}
              <time dateTime={order.createdAt}>
                {new Date(order.createdAt).toLocaleString("es-AR")}
              </time>
            </p>
            <p>
              {order.status === "partially_published"
                ? "Algunos destinos salieron y otros no. Cada uno se resuelve por separado."
                : order.status === "publishing"
                  ? "Todavía hay destinos sin resolver."
                  : null}
            </p>
          </header>

          <ul className="publication-order-targets">
            {order.targets.map((target) => {
              const outcome = publicationTargetOutcome(target);
              const entry = stoppedByKey.get(`${order.id}:${target.target}`);
              const actions =
                entry === undefined ? [] : visibleManualActions(actor, entry);
              return (
                <li
                  className={`publication-order-target publication-order-target--${outcome}`}
                  key={target.target}
                >
                  <div className="publication-order-target-heading">
                    <strong>{publicationTargetLabels[target.target]}</strong>
                    <span data-outcome={outcome}>
                      {publicationTargetOutcomeLabels[outcome]}
                    </span>
                  </div>

                  {target.permalink === undefined ? null : (
                    <a
                      href={target.permalink}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      Ver la publicación
                    </a>
                  )}
                  {target.failureCode === undefined ? null : (
                    <p className="publication-order-target-failure">
                      <code>{target.failureCode}</code>
                      {target.failureDetail === undefined
                        ? null
                        : ` · ${target.failureDetail}`}
                    </p>
                  )}
                  {entry === undefined ? null : (
                    <p className="publication-order-target-reason">
                      {manualReasonLabels[entry.reason]} · {entry.attempts}{" "}
                      {entry.attempts === 1 ? "intento" : "intentos"}
                    </p>
                  )}

                  {actions.length === 0 ? null : (
                    <div className="publication-order-target-actions">
                      {actions.map((action) => (
                        <button
                          disabled={actingOn !== null}
                          key={action}
                          onClick={() => {
                            void act(entry?.publicationTargetId ?? "", action);
                          }}
                          type="button"
                        >
                          {actingOn === entry?.publicationTargetId
                            ? "Aplicando…"
                            : manualActionLabels[action]}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </article>
      ))}

      <p aria-live="polite">{notice ?? ""}</p>
    </section>
  );
}
