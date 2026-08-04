import type { KnowledgeDocumentVersionRecord } from "./knowledge-document.ts";

export const knowledgeRetrievalLimits = Object.freeze({
  maximumActiveSources: 50,
  maximumContextCharacters: 4_800,
  maximumEvidence: 6,
  maximumFragmentCharacters: 900,
  maximumQuestionCharacters: 500,
  maximumVectorStores: 4,
  minimumQuestionCharacters: 3,
  minimumScore: 0.2,
});

export interface FindActiveKnowledgeSourcesInput {
  readonly at: string;
  readonly limit: number;
  readonly locationId: string | null;
  readonly organizationId: string;
}

export interface KnowledgeRetrievalRepository {
  findActiveSources(
    input: FindActiveKnowledgeSourcesInput,
  ): Promise<readonly KnowledgeDocumentVersionRecord[]>;
}

export interface SearchKnowledgeInput {
  readonly contentHashes: readonly string[];
  readonly maximumResults: number;
  readonly organizationId: string;
  readonly query: string;
  readonly vectorStoreId: string;
}

export interface KnowledgeSearchMatch {
  readonly attributes: Readonly<
    Record<string, boolean | number | string>
  > | null;
  readonly content: readonly string[];
  readonly fileId: string;
  readonly filename: string;
  readonly score: number;
}

export interface KnowledgeSearchPort {
  search(input: SearchKnowledgeInput): Promise<readonly KnowledgeSearchMatch[]>;
}

export interface KnowledgeEvidence {
  readonly citationId: string;
  readonly contentHash: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentType: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly filename: string;
  readonly fragment: string;
  readonly locationIds: readonly string[];
  readonly score: number;
  readonly sourceKey: string;
  readonly sourceOwner: string;
  readonly version: number;
  readonly versionId: string;
}

export type MissingKnowledgeReason =
  "conflicting-evidence" | "no-approved-sources" | "no-relevant-evidence";

interface KnowledgeRetrievalBase {
  readonly evidence: readonly KnowledgeEvidence[];
  readonly question: string;
}

export type KnowledgeRetrievalResult =
  | (KnowledgeRetrievalBase &
      Readonly<{
        readonly context: string;
        readonly contextCharacters: number;
        readonly status: "grounded";
      }>)
  | (KnowledgeRetrievalBase &
      Readonly<{
        readonly context: "";
        readonly contextCharacters: 0;
        readonly missingInformation: readonly MissingKnowledgeReason[];
        readonly status: "missing_information";
      }>);

export type KnowledgeRetrievalValidationErrorCode =
  | "invalid-location"
  | "invalid-organization"
  | "invalid-question"
  | "invalid-timestamp";

export class KnowledgeRetrievalValidationError extends Error {
  readonly code: KnowledgeRetrievalValidationErrorCode;

  constructor(code: KnowledgeRetrievalValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "KnowledgeRetrievalValidationError";
  }
}
