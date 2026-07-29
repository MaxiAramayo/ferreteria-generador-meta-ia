import type { KnowledgeCitationResponse } from "@aramayo/contracts";

import {
  knowledgeEvidenceDisplay,
  type KnowledgeEvidencePanelState,
} from "../../lib/knowledge-evidence-presentation";

export type { KnowledgeEvidencePanelState };

function CitationCard({
  citation,
}: {
  readonly citation: KnowledgeCitationResponse;
}) {
  return (
    <li className="knowledge-citation">
      <div>
        <span>{citation.citationId}</span>
        <strong>{citation.documentTitle}</strong>
        <small>Versión {citation.version}</small>
      </div>
      <blockquote>{citation.fragment}</blockquote>
      <p>
        Responsable: {citation.sourceOwner} · coincidencia{" "}
        {Math.round(citation.score * 100)}%
      </p>
    </li>
  );
}

export function KnowledgeEvidencePanel({
  state,
}: {
  readonly state: KnowledgeEvidencePanelState;
}) {
  const display = knowledgeEvidenceDisplay(state);
  if (display.mode === "idle") {
    return (
      <aside
        aria-label="Fuentes verificadas"
        className="knowledge-evidence-panel"
        data-status="idle"
      >
        <p className="workspace-eyebrow">Fuentes verificadas</p>
        <h3>La evidencia queda separada del texto.</h3>
        <p>
          Cuando se consulte el conocimiento aprobado, cada fragmento aparecerá
          con documento y versión. Sin evidencia, la propuesta quedará
          bloqueada.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Revisión de evidencia"
      className="knowledge-evidence-panel"
      data-status={display.mode}
    >
      {display.mode === "grounded" ? (
        <section
          aria-labelledby="knowledge-generated-title"
          className="knowledge-generated-text"
        >
          <p className="workspace-eyebrow">Texto propuesto</p>
          <h3 id="knowledge-generated-title">Respuesta interna</h3>
          <p>{display.proposedText}</p>
        </section>
      ) : (
        <div className="knowledge-missing" role="alert">
          <p className="workspace-eyebrow">Información faltante</p>
          {display.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <section aria-labelledby="knowledge-sources-title">
        <div className="knowledge-source-heading">
          <div>
            <p className="workspace-eyebrow">Fuentes verificadas</p>
            <h3 id="knowledge-sources-title">Evidencia recuperada</h3>
          </div>
          <span>{display.citations.length}</span>
        </div>
        {display.citations.length === 0 ? (
          <p className="knowledge-source-empty">
            No hay fragmentos aptos para respaldar una afirmación.
          </p>
        ) : (
          <ol className="knowledge-citation-list">
            {display.citations.map((citation) => (
              <CitationCard citation={citation} key={citation.citationId} />
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
