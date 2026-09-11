import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { parseWorkerEnvironment } from "@aramayo/configuration/worker";
import {
  createDatabaseClient,
  PrismaKnowledgeDocumentRepository,
} from "@aramayo/database";

import {
  loadKnowledgeCorpus,
  readKnowledgeCorpus,
  type KnowledgeCorpusDocument,
} from "./knowledge-corpus.ts";
import {
  KnowledgeIngestionError,
  KnowledgeIngestionService,
} from "./knowledge-ingestion.service.ts";
import { KnowledgeRetrievalService } from "./knowledge-retrieval.service.ts";
import {
  OfficialOpenAIFileSearchAdapter,
  OpenAIFileSearchError,
} from "./openai-file-search.adapter.ts";

/**
 * Carga el corpus aprobado en la base y el vector store del ambiente.
 *
 *   --corpus <dir> --comprobar          valida el corpus sin escribir nada
 *   --crear-vector-store <nombre>       crea un vector store y muestra su ID
 *   --corpus <dir>                      carga; repetirla no duplica documentos
 *   --corpus <dir> --consultar <texto>  recupera con citas, sin mostrar fragmentos
 *
 * Nunca imprime el contenido de un documento ni lo que recupera: sólo claves,
 * versiones, estados y puntajes.
 */

const { values } = parseArgs({
  options: {
    comprobar: { default: false, type: "boolean" },
    consultar: { type: "string" },
    corpus: { type: "string" },
    "crear-vector-store": { type: "string" },
  },
  strict: true,
});

function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

function checkCorpus(documents: readonly KnowledgeCorpusDocument[]): void {
  for (const { command, contentHash } of documents) {
    write(
      `${command.sourceKey}: ${command.sensitivity}, ${String(command.content.byteLength)} bytes, sha256 ${contentHash.slice(0, 12)}, vigente de ${command.effectiveFrom} a ${command.effectiveUntil ?? "sin fin"}`,
    );
  }
  write(
    `Corpus válido: ${String(documents.length)} documentos; no se escribió nada.`,
  );
}

async function main(): Promise<void> {
  const vectorStoreName = values["crear-vector-store"];
  if (vectorStoreName !== undefined) {
    const configuration = parseWorkerEnvironment(process.env);
    if (!configuration.openAi.enabled) {
      throw new Error("OpenAI no está configurado para el worker.");
    }
    const adapter = new OfficialOpenAIFileSearchAdapter(
      configuration.openAi.credentials,
      configuration.openAi.policy,
    );
    write(
      `Vector store creado: ${await adapter.createVectorStore(vectorStoreName)}`,
    );
    return;
  }

  if (values.corpus === undefined) {
    throw new Error(
      "Indicá --corpus <directorio> o --crear-vector-store <nombre>.",
    );
  }
  const documents = await readKnowledgeCorpus(resolve(values.corpus));
  if (values.comprobar) {
    checkCorpus(documents);
    return;
  }

  const configuration = parseWorkerEnvironment(process.env);
  if (!configuration.openAi.enabled) {
    throw new Error("OpenAI no está configurado para el worker.");
  }
  const vectorStoreId = configuration.openAi.credentials.vectorStoreId;
  if (vectorStoreId === undefined) {
    throw new Error(
      "Falta OPENAI_VECTOR_STORE_ID: el corpus necesita un vector store.",
    );
  }
  const organizationId = documents[0]?.command.organizationId;
  if (organizationId === undefined) {
    throw new Error("El corpus no declara documentos.");
  }
  const adapter = new OfficialOpenAIFileSearchAdapter(
    configuration.openAi.credentials,
    configuration.openAi.policy,
  );
  const database = createDatabaseClient(configuration.databaseUrl.reveal());
  const repository = new PrismaKnowledgeDocumentRepository(database);
  try {
    if (values.consultar !== undefined) {
      const result = await new KnowledgeRetrievalService(
        repository,
        adapter,
      ).retrieve({
        locationId: null,
        organizationId,
        question: values.consultar,
        requestedAt: new Date().toISOString(),
      });
      write(
        result.status === "grounded"
          ? `Recuperación: grounded, ${String(result.evidence.length)} evidencias`
          : `Recuperación: missing_information (${result.missingInformation.join(", ")})`,
      );
      for (const evidence of result.evidence) {
        write(
          `  ${evidence.sourceKey}@${String(evidence.version)} ${evidence.documentType} score=${evidence.score.toFixed(2)}`,
        );
      }
      return;
    }

    write(`Vector store: ${vectorStoreId}`);
    const results = await loadKnowledgeCorpus(
      documents,
      new KnowledgeIngestionService(repository, adapter, vectorStoreId),
    );
    for (const result of results) {
      write(
        `${result.sourceKey}: ${result.status}, versión ${String(result.version)}${result.cleanupPending ? ", falta actualizar la versión anterior en el proveedor" : ""}`,
      );
    }
    write(`Corpus cargado: ${String(results.length)} documentos.`);
  } finally {
    await database.$disconnect();
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message =
    cause instanceof KnowledgeIngestionError
      ? `La ingestión falló con código ${cause.code}; retryable=${String(cause.retryable)}; versión ${cause.versionId}.`
      : cause instanceof OpenAIFileSearchError
        ? `File Search falló con código ${cause.code}; retryable=${String(cause.retryable)}.`
        : cause instanceof Error
          ? cause.message
          : "La carga del corpus falló sin detalle seguro.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
