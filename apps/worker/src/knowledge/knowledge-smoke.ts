import assert from "node:assert/strict";

import { parseWorkerEnvironment } from "@aramayo/configuration/worker";
import {
  createDatabaseClient,
  PrismaKnowledgeDocumentRepository,
} from "@aramayo/database";
import type { IngestKnowledgeDocumentCommand } from "@aramayo/domain";

import { KnowledgeIngestionService } from "./knowledge-ingestion.service.ts";
import {
  OfficialOpenAIFileSearchAdapter,
  OpenAIFileSearchError,
} from "./openai-file-search.adapter.ts";

const ARAMAYO_DEVELOPMENT_ORGANIZATION_ID =
  "10000000-0000-4000-8000-000000000001";

function smokeCommand(
  runId: string,
  approvedAt: string,
  answer: "alfa" | "beta",
): IngestKnowledgeDocumentCommand {
  return Object.freeze({
    approvalReference: `p3-t03-smoke-${runId}`,
    approvalStatus: "approved",
    approvedAt,
    brand: "Ferretería y Lubricentro Aramayo",
    content: new TextEncoder().encode(
      `# Documento de verificación\n\nEl código aprobado de esta versión es ${answer}-${runId}.`,
    ),
    documentType: "smoke_test",
    effectiveFrom: approvedAt,
    effectiveUntil: null,
    filename: `p3-t03-${answer}-${runId}.md`,
    locationIds: [],
    mimeType: "text/markdown",
    organizationId: ARAMAYO_DEVELOPMENT_ORGANIZATION_ID,
    sensitivity: "internal",
    sourceKey: `smoke.file-search.${runId}`,
    sourceOwner: "Responsable de negocio",
    title: "Verificación de File Search",
  });
}

async function waitUntilRetiredIsNotSearchable(
  adapter: OfficialOpenAIFileSearchAdapter,
  vectorStoreId: string,
  contentHash: string,
): Promise<void> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const results = await adapter.search(
      vectorStoreId,
      "¿Cuál es el código aprobado?",
      contentHash,
    );
    if (results.length === 0) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error(
    "La fuente retirada siguió apareciendo después del margen de consistencia remota.",
  );
}

async function smoke(): Promise<void> {
  const configuration = parseWorkerEnvironment(process.env);
  if (configuration.environment !== "staging") {
    throw new Error(
      "El smoke de File Search sólo puede ejecutarse con NODE_ENV=staging.",
    );
  }
  if (!configuration.openAi.enabled) {
    throw new Error("OpenAI no está configurado para el worker.");
  }
  const adapter = new OfficialOpenAIFileSearchAdapter(
    configuration.openAi.credentials,
    configuration.openAi.policy,
  );
  const configuredVectorStoreId =
    configuration.openAi.credentials.vectorStoreId;
  const vectorStoreId =
    configuredVectorStoreId ??
    (await adapter.createVectorStore("Aramayo staging knowledge"));
  const database = createDatabaseClient(configuration.databaseUrl.reveal());
  const repository = new PrismaKnowledgeDocumentRepository(database);
  const service = new KnowledgeIngestionService(
    repository,
    adapter,
    vectorStoreId,
  );
  const runId = Date.now().toString();
  const approvedAt = new Date().toISOString();

  try {
    const first = await service.ingest(smokeCommand(runId, approvedAt, "alfa"));
    assert.equal(first.record.status, "active");
    const firstResults = await adapter.search(
      vectorStoreId,
      "¿Cuál es el código aprobado de esta versión?",
      first.record.contentHash,
    );
    assert.equal(
      firstResults.some((result) =>
        result.content.some((fragment) => fragment.includes(`alfa-${runId}`)),
      ),
      true,
    );

    const replacement = await service.ingest(
      smokeCommand(runId, approvedAt, "beta"),
    );
    assert.equal(replacement.record.version, 2);
    assert.equal(replacement.record.status, "active");
    const previous = await repository.findVersion(
      first.record.organizationId,
      first.record.id,
    );
    assert.equal(previous?.status, "superseded");
    const replacementResults = await adapter.search(
      vectorStoreId,
      "¿Cuál es el código aprobado de esta versión?",
      replacement.record.contentHash,
    );
    assert.equal(
      replacementResults.some((result) =>
        result.content.some((fragment) => fragment.includes(`beta-${runId}`)),
      ),
      true,
    );

    const retired = await service.retire(
      replacement.record.organizationId,
      replacement.record.documentId,
    );
    assert.equal(retired?.status, "retired");
    await waitUntilRetiredIsNotSearchable(
      adapter,
      vectorStoreId,
      replacement.record.contentHash,
    );

    process.stdout.write(
      [
        "OpenAI File Search staging verificado.",
        `vectorStoreId=${vectorStoreId}`,
        `created=${String(configuredVectorStoreId === undefined)}`,
        `versions=${String(first.record.version)},${String(replacement.record.version)}`,
        `finalStatus=${retired.status}`,
      ].join(" "),
    );
    process.stdout.write("\n");
  } catch (cause: unknown) {
    if (cause instanceof OpenAIFileSearchError) {
      throw new Error(
        `File Search falló con código seguro ${cause.code}; retryable=${String(cause.retryable)}.`,
        { cause },
      );
    }
    throw cause;
  } finally {
    await database.$disconnect();
  }
}

try {
  await smoke();
} catch (cause: unknown) {
  const message =
    cause instanceof Error
      ? cause.message
      : "El smoke de File Search falló sin detalle seguro.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
