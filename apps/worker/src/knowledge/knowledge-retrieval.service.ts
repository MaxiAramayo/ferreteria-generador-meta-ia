import {
  knowledgeRetrievalLimits,
  KnowledgeRetrievalValidationError,
  type KnowledgeDocumentVersionRecord,
  type KnowledgeEvidence,
  type KnowledgeRetrievalRepository,
  type KnowledgeRetrievalResult,
  type KnowledgeSearchMatch,
  type KnowledgeSearchPort,
} from "@aramayo/domain";

export interface RetrieveKnowledgeCommand {
  readonly locationId: string | null;
  readonly organizationId: string;
  readonly question: string;
  readonly requestedAt: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface SearchGroup {
  readonly contentHashes: readonly string[];
  readonly vectorStoreId: string;
}

interface MatchedEvidence {
  readonly fragment: string;
  readonly record: KnowledgeDocumentVersionRecord;
  readonly score: number;
}

function missingResult(
  question: string,
  reason:
    "conflicting-evidence" | "no-approved-sources" | "no-relevant-evidence",
  evidence: readonly KnowledgeEvidence[] = [],
): KnowledgeRetrievalResult {
  return Object.freeze({
    context: "",
    contextCharacters: 0,
    evidence: Object.freeze([...evidence]),
    missingInformation: Object.freeze([reason]),
    question,
    status: "missing_information",
  });
}

function groupSources(
  sources: readonly KnowledgeDocumentVersionRecord[],
): readonly SearchGroup[] {
  const hashesByStore = new Map<string, string[]>();
  for (const source of sources) {
    const hashes = hashesByStore.get(source.providerVectorStoreId) ?? [];
    hashes.push(source.contentHash);
    hashesByStore.set(source.providerVectorStoreId, hashes);
  }
  return Object.freeze(
    [...hashesByStore.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, knowledgeRetrievalLimits.maximumVectorStores)
      .map(([vectorStoreId, contentHashes]) =>
        Object.freeze({
          contentHashes: Object.freeze(contentHashes),
          vectorStoreId,
        }),
      ),
  );
}

function stringAttribute(
  match: KnowledgeSearchMatch,
  key: string,
): string | null {
  const value = match.attributes?.[key];
  return typeof value === "string" ? value : null;
}

function numberAttribute(
  match: KnowledgeSearchMatch,
  key: string,
): number | null {
  const value = match.attributes?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function matchToEvidence(
  match: KnowledgeSearchMatch,
  sourceByRemoteIdentity: ReadonlyMap<string, KnowledgeDocumentVersionRecord>,
  organizationId: string,
): MatchedEvidence | null {
  if (
    !Number.isFinite(match.score) ||
    match.score < knowledgeRetrievalLimits.minimumScore ||
    stringAttribute(match, "organization_id") !== organizationId ||
    stringAttribute(match, "status") !== "approved"
  ) {
    return null;
  }
  const contentHash = stringAttribute(match, "content_hash");
  if (contentHash === null) {
    return null;
  }
  const record = sourceByRemoteIdentity.get(`${match.fileId}:${contentHash}`);
  if (
    record === undefined ||
    record.filename !== match.filename ||
    numberAttribute(match, "version") !== record.version
  ) {
    return null;
  }
  const fragment = match.content
    .join("\n")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .slice(0, knowledgeRetrievalLimits.maximumFragmentCharacters);
  if (fragment.length === 0) {
    return null;
  }
  return Object.freeze({ fragment, record, score: match.score });
}

function presentationContext(evidence: readonly KnowledgeEvidence[]): string {
  return JSON.stringify({
    sources: evidence.map((entry) => ({
      citation_id: entry.citationId,
      document: entry.documentTitle,
      fragment: entry.fragment,
      source_key: entry.sourceKey,
      version: entry.version,
    })),
  });
}

function selectEvidence(
  matches: readonly MatchedEvidence[],
): readonly KnowledgeEvidence[] {
  const evidence: KnowledgeEvidence[] = [];
  const seenFragments = new Set<string>();
  for (const match of matches) {
    const identity = `${match.record.id}:${match.fragment}`;
    if (seenFragments.has(identity)) {
      continue;
    }
    const candidate: KnowledgeEvidence = Object.freeze({
      citationId: `K${String(evidence.length + 1)}`,
      contentHash: match.record.contentHash,
      documentId: match.record.documentId,
      documentTitle: match.record.title,
      documentType: match.record.documentType,
      effectiveFrom: match.record.effectiveFrom,
      effectiveUntil: match.record.effectiveUntil,
      filename: match.record.filename,
      fragment: match.fragment,
      locationIds: Object.freeze([...match.record.locationIds]),
      score: match.score,
      sourceKey: match.record.sourceKey,
      sourceOwner: match.record.sourceOwner,
      version: match.record.version,
      versionId: match.record.id,
    });
    const nextEvidence = [...evidence, candidate];
    if (
      presentationContext(nextEvidence).length >
      knowledgeRetrievalLimits.maximumContextCharacters
    ) {
      continue;
    }
    seenFragments.add(identity);
    evidence.push(candidate);
    if (evidence.length === knowledgeRetrievalLimits.maximumEvidence) {
      break;
    }
  }
  return Object.freeze(evidence);
}

function hasConflictingEvidence(
  evidence: readonly KnowledgeEvidence[],
): boolean {
  const sourcesByType = new Map<string, Set<string>>();
  for (const entry of evidence) {
    const sourceKeys =
      sourcesByType.get(entry.documentType) ?? new Set<string>();
    sourceKeys.add(entry.sourceKey);
    sourcesByType.set(entry.documentType, sourceKeys);
  }
  return [...sourcesByType.values()].some((sourceKeys) => sourceKeys.size > 1);
}

export class KnowledgeRetrievalService {
  readonly #repository: KnowledgeRetrievalRepository;
  readonly #search: KnowledgeSearchPort;

  constructor(
    repository: KnowledgeRetrievalRepository,
    search: KnowledgeSearchPort,
  ) {
    this.#repository = repository;
    this.#search = search;
  }

  async retrieve(
    command: RetrieveKnowledgeCommand,
  ): Promise<KnowledgeRetrievalResult> {
    const question = command.question.trim().replaceAll(/\s+/gu, " ");
    this.#validate(command, question);
    const sources = await this.#repository.findActiveSources({
      at: command.requestedAt,
      limit: knowledgeRetrievalLimits.maximumActiveSources,
      locationId: command.locationId,
      organizationId: command.organizationId,
    });
    if (sources.length === 0) {
      return missingResult(question, "no-approved-sources");
    }
    const groups = groupSources(sources);
    const remoteResults = await Promise.all(
      groups.map((group) =>
        this.#search.search({
          contentHashes: group.contentHashes,
          maximumResults: knowledgeRetrievalLimits.maximumEvidence,
          organizationId: command.organizationId,
          query: question,
          vectorStoreId: group.vectorStoreId,
        }),
      ),
    );
    const sourceByRemoteIdentity = new Map(
      sources.flatMap((source) =>
        source.providerFileId === null
          ? []
          : [[`${source.providerFileId}:${source.contentHash}`, source]],
      ),
    );
    const matches = remoteResults
      .flat()
      .map((match) =>
        matchToEvidence(match, sourceByRemoteIdentity, command.organizationId),
      )
      .filter((match): match is MatchedEvidence => match !== null)
      .toSorted(
        (left, right) =>
          right.score - left.score ||
          left.record.sourceKey.localeCompare(right.record.sourceKey) ||
          left.record.id.localeCompare(right.record.id),
      );
    const evidence = selectEvidence(matches);
    if (evidence.length === 0) {
      return missingResult(question, "no-relevant-evidence");
    }
    if (hasConflictingEvidence(evidence)) {
      return missingResult(question, "conflicting-evidence", evidence);
    }
    const context = presentationContext(evidence);
    return Object.freeze({
      context,
      contextCharacters: context.length,
      evidence,
      question,
      status: "grounded",
    });
  }

  #validate(command: RetrieveKnowledgeCommand, question: string): void {
    if (!UUID.test(command.organizationId)) {
      throw new KnowledgeRetrievalValidationError(
        "invalid-organization",
        "La organización de la consulta no es válida.",
      );
    }
    if (command.locationId !== null && !UUID.test(command.locationId)) {
      throw new KnowledgeRetrievalValidationError(
        "invalid-location",
        "La ubicación de la consulta no es válida.",
      );
    }
    if (
      question.length < knowledgeRetrievalLimits.minimumQuestionCharacters ||
      question.length > knowledgeRetrievalLimits.maximumQuestionCharacters
    ) {
      throw new KnowledgeRetrievalValidationError(
        "invalid-question",
        "La consulta debe tener entre 3 y 500 caracteres.",
      );
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T/u.test(command.requestedAt) ||
      !Number.isFinite(Date.parse(command.requestedAt))
    ) {
      throw new KnowledgeRetrievalValidationError(
        "invalid-timestamp",
        "La consulta requiere un timestamp ISO válido.",
      );
    }
  }
}
