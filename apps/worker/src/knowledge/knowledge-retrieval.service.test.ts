import assert from "node:assert/strict";
import test from "node:test";

import {
  knowledgeRetrievalLimits,
  KnowledgeRetrievalValidationError,
  type FindActiveKnowledgeSourcesInput,
  type KnowledgeDocumentVersionRecord,
  type KnowledgeRetrievalRepository,
  type KnowledgeSearchMatch,
  type KnowledgeSearchPort,
  type SearchKnowledgeInput,
} from "@aramayo/domain";

import { KnowledgeRetrievalService } from "./knowledge-retrieval.service.ts";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const FOREIGN_ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const LOCATION_ID = "10000000-0000-4000-8000-000000000004";
const OTHER_LOCATION_ID = "10000000-0000-4000-8000-000000000005";
const REQUESTED_AT = "2026-07-29T18:00:00.000Z";

function source(
  overrides: Partial<KnowledgeDocumentVersionRecord> = {},
): KnowledgeDocumentVersionRecord {
  const version = overrides.version ?? 1;
  return Object.freeze({
    activatedAt: "2026-07-29T13:00:00.000Z",
    approvalReference: "business-review",
    approvedAt: "2026-07-29T12:00:00.000Z",
    brand: "Aramayo",
    byteSize: 128,
    contentHash: "a".repeat(64),
    documentId: "30000000-0000-4000-8000-000000000001",
    documentType: "business_hours",
    effectiveFrom: "2026-07-29T12:00:00.000Z",
    effectiveUntil: null,
    failureCode: null,
    failureMessage: null,
    failureRetryable: null,
    filename: "horarios.md",
    id: "40000000-0000-4000-8000-000000000001",
    locationIds: [LOCATION_ID],
    mimeType: "text/markdown",
    organizationId: ORGANIZATION_ID,
    providerFileId: "file-hours",
    providerVectorStoreId: "vs_staging",
    remoteStatus: "completed",
    retiredAt: null,
    sensitivity: "internal",
    sourceKey: "operacion.horarios",
    sourceOwner: "Responsable de negocio",
    status: "active",
    title: "Horarios aprobados",
    version,
    ...overrides,
  });
}

function match(
  record: KnowledgeDocumentVersionRecord,
  fragment: string,
  overrides: Partial<KnowledgeSearchMatch> = {},
): KnowledgeSearchMatch {
  return Object.freeze({
    attributes: {
      content_hash: record.contentHash,
      organization_id: record.organizationId,
      status: "approved",
      version: record.version,
    },
    content: [fragment],
    fileId: record.providerFileId ?? "missing-file",
    filename: record.filename,
    score: 0.91,
    ...overrides,
  });
}

class FakeRetrievalRepository implements KnowledgeRetrievalRepository {
  readonly inputs: FindActiveKnowledgeSourcesInput[] = [];
  readonly records: readonly KnowledgeDocumentVersionRecord[];

  constructor(records: readonly KnowledgeDocumentVersionRecord[]) {
    this.records = records;
  }

  findActiveSources(
    input: FindActiveKnowledgeSourcesInput,
  ): Promise<readonly KnowledgeDocumentVersionRecord[]> {
    this.inputs.push(input);
    const at = Date.parse(input.at);
    return Promise.resolve(
      this.records
        .filter(
          (record) =>
            record.organizationId === input.organizationId &&
            record.status === "active" &&
            Date.parse(record.effectiveFrom) <= at &&
            (record.effectiveUntil === null ||
              Date.parse(record.effectiveUntil) > at) &&
            (input.locationId === null ||
              record.locationIds.length === 0 ||
              record.locationIds.includes(input.locationId)),
        )
        .slice(0, input.limit),
    );
  }
}

class FakeKnowledgeSearch implements KnowledgeSearchPort {
  readonly inputs: SearchKnowledgeInput[] = [];
  readonly matchesByStore: ReadonlyMap<string, readonly KnowledgeSearchMatch[]>;

  constructor(
    matchesByStore: ReadonlyMap<string, readonly KnowledgeSearchMatch[]>,
  ) {
    this.matchesByStore = matchesByStore;
  }

  search(
    input: SearchKnowledgeInput,
  ): Promise<readonly KnowledgeSearchMatch[]> {
    this.inputs.push(input);
    return Promise.resolve(this.matchesByStore.get(input.vectorStoreId) ?? []);
  }
}

function service(
  records: readonly KnowledgeDocumentVersionRecord[],
  matches: readonly KnowledgeSearchMatch[],
): {
  readonly repository: FakeRetrievalRepository;
  readonly retrieval: KnowledgeRetrievalService;
  readonly search: FakeKnowledgeSearch;
} {
  const repository = new FakeRetrievalRepository(records);
  const search = new FakeKnowledgeSearch(new Map([["vs_staging", matches]]));
  return {
    repository,
    retrieval: new KnowledgeRetrievalService(repository, search),
    search,
  };
}

const questionDataset = Object.freeze({
  answered: "¿Cuál es el horario aprobado?",
  conflicting: "¿Cuál es el horario del sábado?",
  missing: "¿Qué política de garantías está aprobada?",
});

test("returns bounded evidence with document, version and exact fragment", async () => {
  const approvedSource = source();
  const { retrieval, search } = service(
    [approvedSource],
    [
      match(
        approvedSource,
        "La casa central atiende de lunes a viernes de 8 a 12.",
      ),
    ],
  );

  const result = await retrieval.retrieve({
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    question: questionDataset.answered,
    requestedAt: REQUESTED_AT,
  });

  assert.equal(result.status, "grounded");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.documentId, approvedSource.documentId);
  assert.equal(result.evidence[0].versionId, approvedSource.id);
  assert.equal(result.evidence[0].version, 1);
  assert.equal(
    result.evidence[0].fragment,
    "La casa central atiende de lunes a viernes de 8 a 12.",
  );
  assert.equal(result.context.includes('"citation_id":"K1"'), true);
  assert.equal(
    result.contextCharacters <=
      knowledgeRetrievalLimits.maximumContextCharacters,
    true,
  );
  assert.deepEqual(search.inputs[0]?.contentHashes, [
    approvedSource.contentHash,
  ]);
  assert.equal(search.inputs[0].organizationId, ORGANIZATION_ID);
});

test("returns missing_information when approved evidence is absent", async () => {
  const { retrieval } = service([], []);

  const result = await retrieval.retrieve({
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    question: questionDataset.missing,
    requestedAt: REQUESTED_AT,
  });

  assert.equal(result.status, "missing_information");
  assert.deepEqual(result.missingInformation, ["no-approved-sources"]);
  assert.equal(result.context, "");
});

test("preserves conflicting fragments but blocks context synthesis", async () => {
  const primary = source();
  const conflicting = source({
    contentHash: "b".repeat(64),
    documentId: "30000000-0000-4000-8000-000000000002",
    filename: "horarios-excepcion.md",
    id: "40000000-0000-4000-8000-000000000002",
    providerFileId: "file-hours-exception",
    sourceKey: "operacion.horarios-excepcion",
    title: "Excepción de horarios",
  });
  const { retrieval } = service(
    [primary, conflicting],
    [
      match(primary, "Los sábados permanece cerrado."),
      match(conflicting, "Los sábados atiende de 9 a 12."),
    ],
  );

  const result = await retrieval.retrieve({
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    question: questionDataset.conflicting,
    requestedAt: REQUESTED_AT,
  });

  assert.equal(result.status, "missing_information");
  assert.equal(result.evidence.length, 2);
  assert.deepEqual(result.missingInformation, ["conflicting-evidence"]);
  assert.equal(result.context, "");
});

test("applies organization and location before search and rejects poisoned matches", async () => {
  const local = source();
  const anotherLocation = source({
    contentHash: "c".repeat(64),
    documentId: "30000000-0000-4000-8000-000000000003",
    id: "40000000-0000-4000-8000-000000000003",
    locationIds: [OTHER_LOCATION_ID],
    providerFileId: "file-other-location",
    sourceKey: "operacion.horarios-otra-sucursal",
  });
  const foreign = source({
    contentHash: "d".repeat(64),
    documentId: "30000000-0000-4000-8000-000000000004",
    id: "40000000-0000-4000-8000-000000000004",
    organizationId: FOREIGN_ORGANIZATION_ID,
    providerFileId: "file-foreign",
    sourceKey: "foreign.hours",
  });
  const { repository, retrieval, search } = service(
    [local, anotherLocation, foreign],
    [
      match(local, "Horario local aprobado."),
      match(foreign, "Contenido de otra organización."),
    ],
  );

  const result = await retrieval.retrieve({
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    question: questionDataset.answered,
    requestedAt: REQUESTED_AT,
  });

  assert.equal(result.status, "grounded");
  assert.deepEqual(
    result.evidence.map((entry) => entry.sourceKey),
    [local.sourceKey],
  );
  assert.deepEqual(search.inputs[0]?.contentHashes, [local.contentHash]);
  assert.equal(repository.inputs[0]?.locationId, LOCATION_ID);
});

test("limits evidence count, fragment size and total context", async () => {
  const records = Array.from({ length: 8 }, (_, index) =>
    source({
      contentHash: index.toString(16).repeat(64),
      documentId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      documentType: `type-${String(index)}`,
      filename: `source-${String(index)}.md`,
      id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      providerFileId: `file-${String(index)}`,
      sourceKey: `source.${String(index)}`,
      title: `Fuente ${String(index)}`,
    }),
  );
  const matches = records.map((record) => match(record, "x".repeat(2_000)));
  const { retrieval } = service(records, matches);

  const result = await retrieval.retrieve({
    locationId: LOCATION_ID,
    organizationId: ORGANIZATION_ID,
    question: questionDataset.answered,
    requestedAt: REQUESTED_AT,
  });

  assert.equal(result.status, "grounded");
  assert.equal(
    result.evidence.length <= knowledgeRetrievalLimits.maximumEvidence,
    true,
  );
  assert.equal(
    result.evidence.every(
      (entry) =>
        entry.fragment.length <=
        knowledgeRetrievalLimits.maximumFragmentCharacters,
    ),
    true,
  );
  assert.equal(
    result.contextCharacters <=
      knowledgeRetrievalLimits.maximumContextCharacters,
    true,
  );
});

test("rejects untrusted scope and oversized questions before I/O", async () => {
  const { repository, retrieval } = service([], []);

  await assert.rejects(
    retrieval.retrieve({
      locationId: null,
      organizationId: "organization-from-model",
      question: "x".repeat(501),
      requestedAt: REQUESTED_AT,
    }),
    (cause: unknown) =>
      cause instanceof KnowledgeRetrievalValidationError &&
      cause.code === "invalid-organization",
  );
  assert.equal(repository.inputs.length, 0);
});
