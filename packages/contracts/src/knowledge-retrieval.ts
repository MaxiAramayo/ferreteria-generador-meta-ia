export interface KnowledgeCitationResponse {
  readonly citationId: string;
  readonly documentTitle: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly fragment: string;
  readonly score: number;
  readonly sourceKey: string;
  readonly sourceOwner: string;
  readonly version: number;
}

export type KnowledgeReviewResponse =
  | Readonly<{
      readonly citations: readonly KnowledgeCitationResponse[];
      readonly proposedText: string | null;
      readonly status: "grounded";
    }>
  | Readonly<{
      readonly citations: readonly KnowledgeCitationResponse[];
      readonly missingInformation: readonly (
        "conflicting-evidence" | "no-approved-sources" | "no-relevant-evidence"
      )[];
      readonly status: "missing_information";
    }>;
