import type {
  KnowledgeCitationResponse,
  KnowledgeReviewResponse,
} from "@aramayo/contracts";

export type KnowledgeEvidencePanelState =
  KnowledgeReviewResponse | Readonly<{ readonly status: "idle" }>;

export type KnowledgeEvidenceDisplay =
  | Readonly<{
      readonly citations: readonly KnowledgeCitationResponse[];
      readonly mode: "grounded";
      readonly proposedText: string;
    }>
  | Readonly<{
      readonly citations: readonly KnowledgeCitationResponse[];
      readonly messages: readonly string[];
      readonly mode: "missing_information";
    }>
  | Readonly<{ readonly mode: "idle" }>;

function missingInformationLabel(
  reason:
    "conflicting-evidence" | "no-approved-sources" | "no-relevant-evidence",
): string {
  switch (reason) {
    case "conflicting-evidence":
      return "Las fuentes recuperadas se contradicen y requieren revisión.";
    case "no-approved-sources":
      return "No hay una fuente aprobada y vigente para este ámbito.";
    case "no-relevant-evidence":
      return "Las fuentes aprobadas no contienen evidencia suficiente.";
  }
}

export function knowledgeEvidenceDisplay(
  state: KnowledgeEvidencePanelState,
): KnowledgeEvidenceDisplay {
  switch (state.status) {
    case "idle":
      return Object.freeze({ mode: "idle" });
    case "grounded":
      return Object.freeze({
        citations: state.citations,
        mode: "grounded",
        proposedText:
          state.proposedText ??
          "La evidencia está lista; el texto se generará en una tarea posterior.",
      });
    case "missing_information":
      return Object.freeze({
        citations: state.citations,
        messages: Object.freeze(
          state.missingInformation.map(missingInformationLabel),
        ),
        mode: "missing_information",
      });
  }
}
