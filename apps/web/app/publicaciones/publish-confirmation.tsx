"use client";

/**
 * Confirmación de publicación.
 *
 * Es la última pantalla antes de la única acción del sistema que no se puede
 * deshacer, y está construida alrededor de esa asimetría.
 *
 * **No se publica desde el editor.** Abrir esta pantalla no publica: muestra la
 * pieza aprobada, el copy exacto, la cuenta y los destinos, y recién entonces
 * ofrece confirmar. Que sean dos pasos no es fricción decorativa; es lo que
 * hace que un clic accidental cueste una pantalla y no una publicación.
 *
 * **Un envío en curso deshabilita el botón y no lo vuelve a habilitar hasta que
 * la API contesta.** La clave idempotente se sortea una sola vez por intento y
 * se conserva mientras dure, así que si alguien consigue mandar dos veces —doble
 * clic, un `Enter` repetido— la segunda llega con la misma clave y la API
 * devuelve la orden de la primera en lugar de crear otra. El botón defiende la
 * experiencia; la clave defiende el dato.
 *
 * **Un pedido sin respuesta no se declara fallido.** Puede haber salido, así
 * que la pantalla lo dice y ofrece recargar en vez de invitar a reintentar.
 */

import type { PublicationSummaryResponse } from "@aramayo/contracts";
import type { PublicationTarget } from "@aramayo/domain";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  loadPublishConfirmation,
  requestPublication,
  type PublishConfirmationResult,
} from "../../lib/publication-publishing-api.ts";
import {
  beginPublishSubmission,
  publishConfirmationTargetChoice,
  publicationTargetLabels,
  settlePublishSubmission,
  type PublishSubmission,
} from "../../lib/publication-publishing-presentation.ts";

export interface PublishConfirmationProps {
  readonly accountName: string;
  readonly apiBaseUrl: string;
  readonly availableTargets: readonly PublicationTarget[];
  readonly onCancel: () => void;
  readonly onPublished: (orderId: string) => void;
  readonly publication: PublicationSummaryResponse;
}

export function PublishConfirmation({
  accountName,
  apiBaseUrl,
  availableTargets,
  onCancel,
  onPublished,
  publication,
}: PublishConfirmationProps): React.JSX.Element {
  const headingId = useId();
  const container = useRef<HTMLElement>(null);
  const [detail, setDetail] = useState<
    PublishConfirmationResult | Readonly<{ kind: "loading" }>
  >({ kind: "loading" });
  const [selected, setSelected] =
    useState<readonly PublicationTarget[]>(availableTargets);
  const [submit, setSubmit] = useState<PublishSubmission>({ kind: "idle" });
  const targetChoice = publishConfirmationTargetChoice(
    availableTargets,
    detail.kind === "ready" ? detail.publishingTargets : undefined,
  );
  const targetsForOrder =
    targetChoice.kind === "selectable" ? selected : targetChoice.targets;

  /**
   * El foco se mueve a la confirmación al abrirla.
   *
   * Sin esto, quien navega con teclado o lector de pantalla aprieta «Publicar…»
   * y no se entera de que apareció nada: el foco se queda en una fila de la
   * lista mientras la pantalla que decide una acción irreversible pasa
   * desapercibida.
   */
  useEffect(() => {
    container.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    void loadPublishConfirmation(apiBaseUrl, publication.id).then((result) => {
      if (active) setDetail(result);
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, publication.id]);

  const toggleTarget = useCallback((target: PublicationTarget) => {
    setSelected((current) =>
      current.includes(target)
        ? current.filter((entry) => entry !== target)
        : [...current, target],
    );
  }, []);

  async function confirm(): Promise<void> {
    // Segunda barrera además del `disabled`. `null` significa que ya hay un
    // envío en curso: el segundo clic no produce una segunda llamada.
    const started = beginPublishSubmission(submit, () => crypto.randomUUID());
    if (started === null || started.kind !== "sending") return;
    setSubmit(started);
    const result = await requestPublication(
      apiBaseUrl,
      publication.id,
      publication.version,
      targetsForOrder,
      started.idempotencyKey,
    );
    if (result.kind === "accepted") {
      setSubmit(settlePublishSubmission(started, { kind: "accepted" }));
      onPublished(result.order.orderId);
      return;
    }
    setSubmit(
      settlePublishSubmission(
        started,
        result.kind === "forbidden"
          ? { kind: "rejected", message: "La sesión no permite publicar." }
          : result,
      ),
    );
  }

  const sending = submit.kind === "sending";
  const ready = detail.kind === "ready";
  const canConfirm =
    ready &&
    detail.approved &&
    targetChoice.kind !== "unavailable" &&
    targetsForOrder.length > 0 &&
    !sending;

  return (
    // Sin `role="dialog"`: es contenido en el flujo de la página, no un modal.
    // Anunciarlo como diálogo prometería foco atrapado y cierre con Escape, y
    // prometer una semántica que no se cumple es peor que no tenerla.
    <section
      aria-busy={detail.kind === "loading" || sending}
      aria-labelledby={headingId}
      className="publish-confirmation"
      ref={container}
      tabIndex={-1}
    >
      <header>
        <h3 id={headingId}>Revisá antes de publicar</h3>
        <p>
          Publicar no se puede deshacer. Esto sale tal cual en {accountName}.
        </p>
      </header>

      {detail.kind === "loading" ? (
        <p>Cargando la pieza aprobada…</p>
      ) : detail.kind === "forbidden" ? (
        <p role="alert">La sesión no permite ver esta publicación.</p>
      ) : detail.kind === "error" ? (
        <p role="alert">{detail.message}</p>
      ) : (
        <>
          {detail.approved ? null : (
            <p role="alert">
              Lo que ves no es un snapshot aprobado. No se puede publicar.
            </p>
          )}
          <figure className="publish-confirmation-preview">
            <Image
              alt={detail.previewAlt}
              height={540}
              src={detail.previewUrl}
              unoptimized
              width={432}
            />
            <figcaption>
              SHA-256 <code>{detail.checksumSha256.slice(0, 12)}…</code>
            </figcaption>
          </figure>
          <div className="publish-confirmation-copy">
            <h4>Copy exacto</h4>
            {/* Se muestra tal cual, con sus saltos de línea: un copy
                reformateado no es el copy que se aprobó. */}
            <p style={{ whiteSpace: "pre-wrap" }}>{detail.caption}</p>
          </div>
        </>
      )}

      <fieldset className="publish-confirmation-targets" disabled={sending}>
        <legend>Destinos</legend>
        {targetChoice.targets.map((target) => (
          <label key={target}>
            <input
              checked={targetsForOrder.includes(target)}
              disabled={targetChoice.kind === "locked"}
              onChange={() => {
                toggleTarget(target);
              }}
              type="checkbox"
            />
            {publicationTargetLabels[target]}
          </label>
        ))}
        {targetChoice.kind === "locked" ? (
          <p>
            Estos destinos forman parte del snapshot aprobado y no se editan.
          </p>
        ) : null}
        {targetChoice.kind === "unavailable" ? (
          <p role="alert">
            La conexión ya no dispone de todos los destinos aprobados.
          </p>
        ) : targetsForOrder.length === 0 ? (
          <p role="alert">Elegí al menos un destino.</p>
        ) : null}
      </fieldset>

      <div className="publish-confirmation-actions">
        <button disabled={sending} onClick={onCancel} type="button">
          Cancelar
        </button>
        <button
          disabled={!canConfirm}
          onClick={() => {
            void confirm();
          }}
          type="button"
        >
          {sending ? "Publicando…" : "Publicar ahora"}
        </button>
      </div>

      <p aria-live="polite" className="publish-confirmation-notice">
        {submit.kind === "sending"
          ? "Enviando el pedido. No cierres esta pantalla."
          : submit.kind === "indeterminate" || submit.kind === "rejected"
            ? submit.message
            : ""}
      </p>
      {submit.kind === "indeterminate" ? (
        <button
          onClick={() => {
            onCancel();
          }}
          type="button"
        >
          Cerrar y recargar el estado
        </button>
      ) : null}
    </section>
  );
}
