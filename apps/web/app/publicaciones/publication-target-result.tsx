"use client";

/**
 * Resultado de un destino, sin saber de dónde salió.
 *
 * Está separado del panel que lo carga para que se pueda mirar en el harness de
 * diseño en sus cuatro desenlaces a la vez. Una pantalla que sólo existe cuando
 * hay una publicación real de por medio no se revisa nunca: los estados raros
 * —el que quedó en duda, el que se detuvo esperando a alguien— son justamente
 * los que nadie ve hasta que aparecen en producción.
 *
 * No hace pedidos ni decide permisos. Recibe qué mostrar y qué acciones
 * ofrecer, y avisa cuando alguien aprieta una.
 */

import type { PublicationManualActionResponse } from "@aramayo/contracts";
import type { PublicationTarget } from "@aramayo/domain";

import {
  manualActionLabels,
  manualReasonLabels,
  publicationTargetLabels,
  publicationTargetOutcomeLabels,
  type PublicationTargetOutcome,
} from "../../lib/publication-publishing-presentation.ts";

type ManualAction = PublicationManualActionResponse["actions"][number];

export interface PublicationTargetResultProps {
  readonly actions: readonly ManualAction[];
  readonly attempts?: number;
  /** Acción en vuelo sobre este destino. Deshabilita y explica la espera. */
  readonly busyAction?: ManualAction;
  readonly disabled?: boolean;
  readonly failureCode?: string;
  readonly failureDetail?: string;
  readonly onAct?: (action: ManualAction) => void;
  readonly outcome: PublicationTargetOutcome;
  readonly permalink?: string;
  readonly reason?: PublicationManualActionResponse["reason"];
  readonly target: PublicationTarget;
}

export function PublicationTargetResult({
  actions,
  attempts,
  busyAction,
  disabled = false,
  failureCode,
  failureDetail,
  onAct,
  outcome,
  permalink,
  reason,
  target,
}: PublicationTargetResultProps): React.JSX.Element {
  return (
    <li
      className={`publication-order-target publication-order-target--${outcome}`}
    >
      <div className="publication-order-target-heading">
        <strong>{publicationTargetLabels[target]}</strong>
        {/*
          El desenlace se nombra además de pintarse. Quien no distingue rojo de
          verde tiene que poder leer qué pasó, y «no salió» y «sin confirmar»
          piden cosas distintas.
        */}
        <span data-outcome={outcome}>
          {publicationTargetOutcomeLabels[outcome]}
        </span>
      </div>

      {permalink === undefined ? null : (
        <a href={permalink} rel="noreferrer noopener" target="_blank">
          Ver la publicación
          <span className="visually-hidden">
            {" "}
            (se abre en una pestaña nueva)
          </span>
        </a>
      )}
      {failureCode === undefined ? null : (
        <p className="publication-order-target-failure">
          <code>{failureCode}</code>
          {failureDetail === undefined ? null : ` · ${failureDetail}`}
        </p>
      )}
      {reason === undefined ? null : (
        <p className="publication-order-target-reason">
          {manualReasonLabels[reason]}
          {attempts === undefined
            ? null
            : ` · ${String(attempts)} ${attempts === 1 ? "intento" : "intentos"}`}
        </p>
      )}

      {actions.length === 0 ? null : (
        <div className="publication-order-target-actions">
          {actions.map((action) => (
            <button
              disabled={disabled}
              key={action}
              onClick={() => {
                onAct?.(action);
              }}
              type="button"
            >
              {busyAction === action
                ? "Aplicando…"
                : manualActionLabels[action]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
