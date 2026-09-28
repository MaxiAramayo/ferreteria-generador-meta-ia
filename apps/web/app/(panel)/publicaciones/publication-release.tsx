"use client";

import type {
  PublicationSummaryResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import type { PublicationTarget } from "@aramayo/domain";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { pieceFormatLabel } from "../../../lib/publication-card.ts";
import {
  loadPublishConfirmation,
  type PublishConfirmationResult,
} from "../../../lib/publication-publishing-api.ts";
import {
  nextHalfHour,
  releasePiece,
  releaseTargetOptions,
  type ReleaseResult,
} from "../../../lib/publication-release.ts";
import { scheduleInWords } from "./schedule-picker";

/**
 * «¿Cuándo sale?»: la última pantalla antes de que la pieza salga (`P2-T11`).
 *
 * Se abre apenas se guarda, mientras la imagen final se prepara, y cuando está
 * muestra lo que va a salir —imagen, texto, destino y cuenta—. Un toque la
 * publica o la programa; aprobar va adentro de ese toque y el botón lo dice.
 */

const preparingStatuses: ReadonlySet<PublicationSummaryResponse["status"]> =
  new Set(["draft", "generating_assets", "retrieving_context"]);

function alreadyApprovedStatus(
  status: PublicationSummaryResponse["status"],
): boolean {
  return status === "approved" || status === "scheduled";
}

export function PublicationRelease({
  apiBaseUrl,
  canApprove,
  canPublish,
  canSchedule,
  onEdit,
  onReleased,
  publication,
  readiness,
}: Readonly<{
  apiBaseUrl: string;
  canApprove: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  onEdit: (() => void) | null;
  onReleased: (
    result: Extract<ReleaseResult, { kind: "published" | "scheduled" }>,
    whenText: string,
  ) => void;
  publication: PublicationSummaryResponse;
  readiness: PublishingReadinessResponse | null;
}>) {
  const preparing = preparingStatuses.has(publication.status);
  const [details, setDetails] = useState<
    PublishConfirmationResult | Readonly<{ kind: "loading" }>
  >({ kind: "loading" });
  // Quien programa pero no publica arranca en «Más tarde», no en un botón
  // que nunca se habilita.
  const [when, setWhen] = useState<"later" | "now">(() =>
    !canPublish && canSchedule && !alreadyApprovedStatus(publication.status)
      ? "later"
      : "now",
  );
  const [later, setLater] = useState(() => nextHalfHour(new Date()));
  const [chosen, setChosen] = useState<ReadonlySet<PublicationTarget> | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Las mismas claves en un doble toque: no se aprueba dos veces ni se crean
  // dos órdenes. Cambian sólo después de un rechazo definitivo.
  const keys = useRef({
    approve: crypto.randomUUID(),
    publish: crypto.randomUUID(),
  });

  // La imagen se lee cuando existe; mientras se prepara, el listado refresca
  // el estado y esta hoja lo recibe.
  useEffect(() => {
    if (preparing) return;
    let active = true;
    void loadPublishConfirmation(apiBaseUrl, publication.id).then((result) => {
      if (active) setDetails(result);
    });
    return () => {
      active = false;
    };
  }, [apiBaseUrl, preparing, publication.id, publication.version]);

  const caption = details.kind === "ready" ? details.caption.trim() : "";
  const options = useMemo(
    () => releaseTargetOptions(publication.format, readiness, caption === ""),
    [caption, publication.format, readiness],
  );
  const selected =
    chosen ??
    new Set(
      options.filter((option) => option.checked).map((option) => option.target),
    );
  const alreadyApproved = alreadyApprovedStatus(publication.status);
  const connectionReady = readiness?.canPublish === true;
  const whenText =
    when === "now"
      ? "ahora"
      : scheduleInWords(later.localDate, later.localTime);
  const canRelease =
    details.kind === "ready" &&
    selected.size > 0 &&
    (alreadyApproved || canApprove) &&
    (when === "now"
      ? canPublish && connectionReady
      : canSchedule && !alreadyApproved);

  async function release(): Promise<void> {
    if (!canRelease || pending) return;
    setPending(true);
    setProblem(null);
    const result = await releasePiece(apiBaseUrl, {
      alreadyApproved,
      keys: keys.current,
      publicationId: publication.id,
      targets: [...selected],
      version: publication.version,
      when: when === "now" ? { kind: "now" } : { kind: "later", ...later },
    });
    setPending(false);
    switch (result.kind) {
      case "published":
      case "scheduled":
        onReleased(result, whenText);
        return;
      case "forbidden":
        setProblem("Tu sesión no permite publicar esta pieza.");
        return;
      case "indeterminate":
        setProblem(result.message);
        return;
      case "approved-not-published":
        keys.current = { ...keys.current, publish: crypto.randomUUID() };
        setProblem(
          `Quedó aprobada, pero no salió: ${result.message} Probá de nuevo.`,
        );
        return;
      case "error":
        keys.current = {
          approve: crypto.randomUUID(),
          publish: crypto.randomUUID(),
        };
        setProblem(result.message);
    }
  }

  return (
    <div className="publication-release">
      <div className="publication-release-media">
        {preparing ? (
          <div
            aria-busy="true"
            className="publication-release-preparing"
            data-format={publication.format ?? "historia"}
          >
            <span>Preparando la imagen final…</span>
          </div>
        ) : details.kind === "loading" ? (
          <p aria-busy="true" className="publication-sheet-note">
            Cargando la imagen…
          </p>
        ) : details.kind === "ready" ? (
          <figure
            className="publication-render-preview"
            data-format={publication.format ?? "historia"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- la imagen ya viene del almacenamiento de medios */}
            <img alt={details.previewAlt} src={details.previewUrl} />
            <figcaption>
              {pieceFormatLabel(publication.format)} · así sale.
              {onEdit === null ? null : (
                <>
                  {" "}
                  <button
                    className="publication-release-edit"
                    onClick={onEdit}
                    type="button"
                  >
                    Corregir
                  </button>
                </>
              )}
            </figcaption>
          </figure>
        ) : (
          <p role="alert">
            {details.kind === "forbidden"
              ? "Tu sesión no permite ver esta pieza."
              : details.message}
          </p>
        )}

        {publication.status === "generation_failed" ? (
          <p role="alert">
            No se pudo preparar la imagen. Cerrá y tocá «Reintentar imagen».
          </p>
        ) : null}
      </div>

      <div className="publication-release-options">
        {caption === "" || publication.format === "historia" ? null : (
          <p className="publication-release-caption">{caption}</p>
        )}

        <fieldset className="publication-release-choice">
          <legend>¿Cuándo sale?</legend>
          <div className="product-segmented" role="radiogroup">
            <label data-selected={String(when === "now")}>
              <input
                checked={when === "now"}
                name="release-when"
                onChange={() => {
                  setWhen("now");
                }}
                type="radio"
              />
              Ahora
            </label>
            {canSchedule && !alreadyApproved ? (
              <label data-selected={String(when === "later")}>
                <input
                  checked={when === "later"}
                  name="release-when"
                  onChange={() => {
                    setWhen("later");
                  }}
                  type="radio"
                />
                Más tarde
              </label>
            ) : null}
          </div>
          {when === "later" ? (
            <div className="publication-release-later">
              <label>
                Día
                <input
                  onChange={(event) => {
                    const localDate = event.currentTarget.value;
                    setLater((current) => ({ ...current, localDate }));
                  }}
                  type="date"
                  value={later.localDate}
                />
              </label>
              <label>
                Hora
                <input
                  onChange={(event) => {
                    const localTime = event.currentTarget.value;
                    setLater((current) => ({ ...current, localTime }));
                  }}
                  type="time"
                  value={later.localTime}
                />
              </label>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="publication-release-choice">
          <legend>¿Dónde?</legend>
          {options.map((option) => (
            <label className="publication-release-target" key={option.target}>
              <input
                checked={selected.has(option.target)}
                disabled={option.disabledReason !== null || pending}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.currentTarget.checked) next.add(option.target);
                  else next.delete(option.target);
                  setChosen(next);
                }}
                type="checkbox"
              />
              <span>
                {option.label}
                {option.disabledReason === null ? null : (
                  <small>{option.disabledReason}</small>
                )}
              </span>
            </label>
          ))}
          {connectionReady ? (
            <p className="publication-sheet-note">
              Sale en {readiness.accountName ?? "la cuenta conectada"}.
            </p>
          ) : (
            <p className="publication-release-warning">
              No hay una cuenta de Instagram lista.{" "}
              <Link href="/configuracion">Revisá la conexión</Link>.
            </p>
          )}
        </fieldset>

        {problem === null ? null : (
          <p className="publication-release-problem" role="alert">
            {problem}
          </p>
        )}

        <div className="publication-release-footer">
          <button
            className="workspace-primary-action publication-release-go"
            disabled={!canRelease || pending}
            onClick={() => {
              void release();
            }}
            type="button"
          >
            {pending
              ? when === "now"
                ? "Publicando…"
                : "Programando…"
              : when === "now"
                ? "Publicar ahora"
                : `Programar para ${whenText}`}
          </button>
          <small className="publication-sheet-note">
            {alreadyApproved
              ? "Ya está aprobada."
              : when === "now"
                ? "Al publicar queda aprobada."
                : "Al programar queda aprobada y sale sola a esa hora."}
          </small>
        </div>
      </div>
    </div>
  );
}
