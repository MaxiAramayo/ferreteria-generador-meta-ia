"use client";

import type { ContentBriefRunResponse } from "@aramayo/contracts";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

import {
  acceptContentBrief,
  cancelContentBriefRun,
  loadContentBriefHistory,
  loadContentBriefRun,
  requestContentBrief,
} from "../../lib/content-brief-api";
import {
  contentBriefDisplay,
  contentBriefUsageDisplay,
  missingInformationLabel,
  shouldPollContentBriefRun,
  type ContentBriefDisplay,
} from "../../lib/content-brief-presentation";
import { GenerationVariantWorkspace } from "./generation-variant-workspace";

const pollIntervalMilliseconds = 2_000;
const requestMinimum = 8;
const requestMaximum = 600;

type ComposerNotice = Readonly<{
  text: string;
  tone: "error" | "info" | "success";
}>;

/**
 * El pedido vive separado de la ejecución a propósito: reintentar conserva el
 * texto original y crea otra ejecución en lugar de mutar la anterior.
 */
function RequestForm({
  busy,
  canEdit,
  onRequest,
  onTextChange,
  text,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly onRequest: () => void;
  readonly onTextChange: (value: string) => void;
  readonly text: string;
}) {
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onRequest();
  }
  return (
    <form
      aria-describedby="ai-creative-guidance"
      className="composer-form"
      noValidate
      onSubmit={submit}
    >
      <div>
        <p className="workspace-eyebrow">Fase 3</p>
        <h2>Creatividad con contexto comprobable</h2>
        <p id="ai-creative-guidance">
          Escribí el pedido como se lo dirías a alguien del equipo. La
          generación usa documentos aprobados y datos comerciales vigentes;
          pedirla no guarda, aprueba ni publica una pieza.
        </p>
      </div>
      <label>
        Pedido
        <textarea
          disabled={!canEdit || busy}
          maxLength={requestMaximum}
          onChange={(event) => {
            onTextChange(event.currentTarget.value);
          }}
          placeholder="Necesito una pieza para promocionar taladros percutores."
          required
          rows={4}
          value={text}
        />
      </label>
      <div className="composer-form-actions">
        <span>
          {text.trim().length} de {requestMaximum} caracteres.
        </span>
        <button
          className="workspace-primary-action"
          disabled={!canEdit || busy}
          type="submit"
        >
          {busy ? "Generando…" : "Pedir brief"}
        </button>
      </div>
    </form>
  );
}

function MissingInformation({
  display,
}: {
  readonly display: ContentBriefDisplay;
}) {
  if (display.missingInformation.length === 0) {
    return null;
  }
  return (
    <div className="knowledge-missing" role="alert">
      <p className="workspace-eyebrow">Falta información</p>
      <p>
        Resolvé esto antes de aceptar. El brief declaró estos huecos en lugar de
        completarlos por su cuenta.
      </p>
      <ul>
        {display.missingInformation.map((entry) => (
          <li key={`${entry.subject}-${entry.kind}`}>
            <strong>{missingInformationLabel(entry)}</strong>
            <span>{entry.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvidenceList({ display }: { readonly display: ContentBriefDisplay }) {
  return (
    <section aria-labelledby="brief-evidence-title">
      <div className="knowledge-source-heading">
        <div>
          <p className="workspace-eyebrow">Fuentes verificadas</p>
          <h3 id="brief-evidence-title">Evidencia de esta ejecución</h3>
        </div>
        <span>{display.evidence.length}</span>
      </div>
      {display.evidence.length === 0 ? (
        <p className="knowledge-source-empty">
          Esta ejecución todavía no citó ninguna fuente.
        </p>
      ) : (
        <ol className="knowledge-citation-list">
          {display.evidence.map((entry) => (
            <li className="knowledge-citation" key={entry.citationId}>
              <div>
                <span>{entry.citationId}</span>
                <strong>{entry.reference}</strong>
                <small>
                  {entry.kind === "commercial" ? "Comercial" : "Documento"}
                </small>
              </div>
              <p>
                {entry.observedAt === null
                  ? "Conocimiento aprobado, sin instante de lectura."
                  : `Leído el ${new Date(entry.observedAt).toLocaleString("es-AR")}.`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BriefResult({
  busy,
  canEdit,
  display,
  onAccept,
  onCancel,
  onRetry,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly display: ContentBriefDisplay;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <aside
      aria-label="Resultado de la generación"
      className="knowledge-evidence-panel"
      data-status={display.phase}
    >
      <p aria-live="polite" className="composer-notice" role="status">
        {display.statusLabel}
      </p>

      <MissingInformation display={display} />

      {display.title === null ? null : (
        <section
          aria-labelledby="brief-copy-title"
          className="knowledge-generated-text"
        >
          <p className="workspace-eyebrow">Texto propuesto</p>
          <h3 id="brief-copy-title">{display.title}</h3>
          <p>{display.caption}</p>
          {display.facts.length === 0 ? null : (
            <ul>
              {display.facts.map((fact) => (
                <li key={`${fact.evidenceId}-${fact.claimKind}`}>
                  {fact.statement} <small>[{fact.evidenceId}]</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <EvidenceList display={display} />

      <p className="composer-boundary-note">
        {display.usage.tokens} · {display.usage.cost} · {display.usage.latency}
      </p>

      <div className="composer-form-actions">
        {display.canCancel ? (
          <button disabled={busy} onClick={onCancel} type="button">
            Cancelar generación
          </button>
        ) : null}
        {display.canRetry ? (
          <button disabled={!canEdit || busy} onClick={onRetry} type="button">
            Reintentar el mismo pedido
          </button>
        ) : null}
        {display.canAccept ? (
          <button
            className="workspace-primary-action"
            disabled={!canEdit || busy}
            onClick={onAccept}
            type="button"
          >
            {display.requiresHumanApproval
              ? "Aceptar con revisión humana"
              : "Aceptar y crear revisión"}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function AttemptHistory({
  runs,
  onSelect,
}: {
  readonly onSelect: (runId: string) => void;
  readonly runs: readonly ContentBriefRunResponse[];
}) {
  if (runs.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="brief-history-title" className="composer-history">
      <p className="workspace-eyebrow">Intentos</p>
      <h3 id="brief-history-title">Historial de generaciones</h3>
      <ol>
        {runs.map((entry) => {
          const usage = contentBriefUsageDisplay(entry);
          return (
            <li key={entry.id}>
              <button
                onClick={() => {
                  onSelect(entry.id);
                }}
                type="button"
              >
                <span data-status={entry.status}>{entry.status}</span>
                <strong>{entry.request}</strong>
                <small>
                  {new Date(entry.requestedAt).toLocaleString("es-AR")} ·{" "}
                  {usage.tokens} · {usage.cost}
                </small>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function AICreativeComposer({
  apiBaseUrl,
  canEdit,
}: {
  readonly apiBaseUrl: string;
  readonly canEdit: boolean;
}) {
  const [text, setText] = useState("");
  const [run, setRun] = useState<ContentBriefRunResponse | null>(null);
  const [history, setHistory] = useState<readonly ContentBriefRunResponse[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ComposerNotice | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const refreshHistory = useCallback(() => {
    void loadContentBriefHistory(apiBaseUrl, {
      limit: 10,
      mine: true,
      page: 1,
    }).then((result) => {
      if (result.kind === "ready") {
        startTransition(() => {
          setHistory(result.history.items);
        });
      }
    });
  }, [apiBaseUrl]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Mientras la ejecución siga pendiente hay que volver a preguntar: la API no
  // empuja el resultado y el worker puede tardar.
  useEffect(() => {
    if (run === null || !shouldPollContentBriefRun(run)) {
      return;
    }
    const runId = run.id;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadContentBriefRun(apiBaseUrl, runId).then((result) => {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          if (result.kind === "ready") {
            setRun(result.run);
            if (!shouldPollContentBriefRun(result.run)) {
              refreshHistory();
            }
            return;
          }
          setNotice({
            text:
              result.kind === "forbidden"
                ? "La sesión no permite consultar esta ejecución."
                : result.message,
            tone: "error",
          });
        });
      });
    }, pollIntervalMilliseconds);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [apiBaseUrl, refreshHistory, run]);

  const startRun = useCallback(
    (requestText: string) => {
      const trimmed = requestText.trim();
      if (trimmed.length < requestMinimum || trimmed.length > requestMaximum) {
        setNotice({
          text: `El pedido debe tener entre ${requestMinimum} y ${requestMaximum} caracteres.`,
          tone: "error",
        });
        return;
      }
      idempotencyKey.current ??= crypto.randomUUID();
      setBusy(true);
      setNotice({ text: "Pedido enviado. Esperando al worker…", tone: "info" });
      void requestContentBrief(apiBaseUrl, {
        idempotencyKey: idempotencyKey.current,
        request: trimmed,
      }).then((result) => {
        startTransition(() => {
          setBusy(false);
          switch (result.kind) {
            case "accepted":
              idempotencyKey.current = null;
              void loadContentBriefRun(apiBaseUrl, result.runId).then(
                (loaded) => {
                  startTransition(() => {
                    if (loaded.kind === "ready") {
                      setRun(loaded.run);
                    }
                  });
                },
              );
              refreshHistory();
              return;
            case "forbidden":
              setNotice({
                text: "La sesión no permite pedir generaciones.",
                tone: "error",
              });
              return;
            case "error":
              setNotice({ text: result.message, tone: "error" });
          }
        });
      });
    },
    [apiBaseUrl, refreshHistory],
  );

  const cancel = useCallback(() => {
    if (run === null) {
      return;
    }
    setBusy(true);
    void cancelContentBriefRun(apiBaseUrl, run.id).then((result) => {
      startTransition(() => {
        setBusy(false);
        if (result.kind !== "resolved") {
          setNotice({
            text:
              result.kind === "forbidden"
                ? "La sesión no permite cancelar."
                : result.message,
            tone: "error",
          });
          return;
        }
        // Si la generación había terminado antes, decirlo: cancelar no revierte
        // un resultado ya confirmado.
        setNotice({
          text:
            result.status === "cancelled"
              ? "Generación cancelada. Su resultado no quedará vigente."
              : "La generación ya había terminado; su resultado sigue vigente.",
          tone: "info",
        });
        void loadContentBriefRun(apiBaseUrl, run.id).then((loaded) => {
          startTransition(() => {
            if (loaded.kind === "ready") {
              setRun(loaded.run);
            }
            refreshHistory();
          });
        });
      });
    });
  }, [apiBaseUrl, refreshHistory, run]);

  const accept = useCallback(() => {
    if (run?.brief == null) {
      return;
    }
    const designTitle = run.brief.title;
    setBusy(true);
    void acceptContentBrief(apiBaseUrl, {
      designTitle,
      idempotencyKey: crypto.randomUUID(),
      runId: run.id,
    }).then((result) => {
      startTransition(() => {
        setBusy(false);
        switch (result.kind) {
          case "accepted":
            setNotice({
              text: `Revisión creada como “${result.publication.title}”. Todavía no está publicada.`,
              tone: "success",
            });
            return;
          case "conflict":
          case "error":
            setNotice({ text: result.message, tone: "error" });
            return;
          case "forbidden":
            setNotice({
              text: "La sesión no permite aceptar briefs.",
              tone: "error",
            });
        }
      });
    });
  }, [apiBaseUrl, run]);

  const selectRun = useCallback(
    (runId: string) => {
      void loadContentBriefRun(apiBaseUrl, runId).then((result) => {
        startTransition(() => {
          if (result.kind === "ready") {
            setRun(result.run);
            setNotice(null);
          }
        });
      });
    },
    [apiBaseUrl],
  );

  const display = run === null ? null : contentBriefDisplay(run);

  return (
    <section
      aria-label="Compositor de creatividad con IA"
      className="composer-workbench"
      data-variant="ai-creative"
    >
      <div className="composer-ai-request">
        <RequestForm
          busy={busy || (display?.canCancel ?? false)}
          canEdit={canEdit}
          onRequest={() => {
            startRun(text);
          }}
          onTextChange={setText}
          text={text}
        />
        {notice === null ? null : (
          <p
            aria-live="polite"
            className="composer-notice"
            data-status={notice.tone}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}
        <AttemptHistory onSelect={selectRun} runs={history} />
      </div>

      {display === null ? (
        <aside
          aria-label="Resultado de la generación"
          className="knowledge-evidence-panel"
          data-status="idle"
        >
          <p className="workspace-eyebrow">Fuentes verificadas</p>
          <h3>La evidencia queda separada del texto.</h3>
          <p>
            Cada afirmación del brief citará el documento o la observación
            comercial que la respalda. Sin evidencia vigente, la generación se
            detiene en lugar de completar el hueco.
          </p>
        </aside>
      ) : (
        <BriefResult
          busy={busy}
          canEdit={canEdit}
          display={display}
          onAccept={accept}
          onCancel={cancel}
          // Reintentar reusa el pedido de la ejecución, no lo que haya quedado
          // escrito en el formulario.
          onRetry={() => {
            startRun(display.headline);
          }}
        />
      )}
      {run?.status === "generated" && run.brief !== null ? (
        <GenerationVariantWorkspace
          apiBaseUrl={apiBaseUrl}
          briefRun={run}
          canEdit={canEdit}
          key={run.id}
        />
      ) : null}
    </section>
  );
}
