import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type {
  IngestKnowledgeDocumentCommand,
  KnowledgeDocumentVersionRecord,
} from "@aramayo/domain";

import {
  KnowledgeCorpusError,
  loadKnowledgeCorpus,
  parseKnowledgeCorpusManifest,
  readKnowledgeCorpus,
  type KnowledgeCorpusIngestor,
} from "./knowledge-corpus.ts";
import type { KnowledgeIngestionResult } from "./knowledge-ingestion.service.ts";

const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_CORPUS = fileURLToPath(
  new URL("../../../../packages/brand-knowledge/corpus/", import.meta.url),
);

function entry(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    approvalReference: "Catálogo de fuentes: aprobado el 2026-07-29",
    approvedAt: "2026-07-29T00:00:00.000Z",
    documentType: "services_catalog",
    effectiveFrom: "2026-09-11T00:00:00.000Z",
    effectiveUntil: "2026-10-27T00:00:00.000Z",
    file: "servicios.md",
    locationIds: [],
    sensitivity: "public",
    sourceKey: "kn-004.servicios",
    title: "Servicios",
    ...overrides,
  };
}

function manifest(
  documents: readonly unknown[] = [entry()],
): Record<string, unknown> {
  return {
    brand: "Ferretería y Lubricentro Aramayo",
    documents,
    organizationId: ORGANIZATION_ID,
    sourceOwner: "Responsable de negocio",
  };
}

async function withCorpus(
  files: Readonly<Record<string, string>>,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "aramayo-corpus-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(directory, name), content);
    }
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function ingestionResult(
  command: IngestKnowledgeDocumentCommand,
  status: KnowledgeIngestionResult["status"],
  version: number,
): KnowledgeIngestionResult {
  const record: KnowledgeDocumentVersionRecord = {
    activatedAt: "2026-09-11T12:00:00.000Z",
    approvalReference: command.approvalReference,
    approvedAt: command.approvedAt,
    brand: command.brand,
    byteSize: command.content.byteLength,
    contentHash: "a".repeat(64),
    documentId: `document-${command.sourceKey}`,
    documentType: command.documentType,
    effectiveFrom: command.effectiveFrom,
    effectiveUntil: command.effectiveUntil,
    failureCode: null,
    failureMessage: null,
    failureRetryable: null,
    filename: command.filename,
    id: `version-${command.sourceKey}-${String(version)}`,
    locationIds: command.locationIds,
    mimeType: command.mimeType,
    organizationId: command.organizationId,
    providerFileId: "file-test",
    providerVectorStoreId: "vs_test",
    remoteStatus: "completed",
    retiredAt: null,
    sensitivity: command.sensitivity,
    sourceKey: command.sourceKey,
    sourceOwner: command.sourceOwner,
    status: "active",
    title: command.title,
    version,
  };
  return { cleanupPending: false, record, status };
}

test("the committed corpus passes the ingestion validation", async () => {
  const documents = await readKnowledgeCorpus(REPOSITORY_CORPUS);

  assert.deepEqual(
    documents.map(
      ({ command }) => `${command.sourceKey}:${command.sensitivity}`,
    ),
    ["kn-004.rubros-y-servicios:public", "kn-002.politica-editorial:internal"],
  );
  for (const { command } of documents) {
    assert.equal(command.approvalStatus, "approved");
    assert.equal(command.mimeType, "text/markdown");
    assert.equal(command.organizationId, ORGANIZATION_ID);
    // Cada fuente activada declara hasta cuándo vale: vencida, deja de citarse.
    assert.notEqual(command.effectiveUntil, null);
  }
});

test("builds approved Markdown commands from the manifest", async () => {
  const content = "# Servicios\n\nCambio de aceite con fosa.\n";
  await withCorpus(
    { "manifest.json": JSON.stringify(manifest()), "servicios.md": content },
    async (directory) => {
      const [document] = await readKnowledgeCorpus(directory);

      assert.ok(document !== undefined);
      assert.equal(document.command.approvalStatus, "approved");
      assert.equal(document.command.brand, "Ferretería y Lubricentro Aramayo");
      assert.equal(document.command.sourceOwner, "Responsable de negocio");
      assert.equal(document.command.filename, "servicios.md");
      assert.equal(new TextDecoder().decode(document.command.content), content);
      assert.equal(
        document.contentHash,
        createHash("sha256").update(content).digest("hex"),
      );
    },
  );
});

test("rejects unknown fields in the manifest and in each document", () => {
  assert.throws(
    () => {
      parseKnowledgeCorpusManifest({ ...manifest(), activo: true });
    },
    (error: unknown) =>
      error instanceof KnowledgeCorpusError &&
      /campos desconocidos: activo/u.test(error.message),
  );
  assert.throws(() => {
    parseKnowledgeCorpusManifest(manifest([entry({ priority: 1 })]));
  }, /campos desconocidos: priority/u);
});

test("keeps every declared file inside the corpus directory", () => {
  for (const file of ["../secreto.md", "sub/doc.md", "Doc.md", "doc.txt"]) {
    assert.throws(() => {
      parseKnowledgeCorpusManifest(manifest([entry({ file })]));
    }, /nombre de archivo Markdown dentro del corpus/u);
  }
});

test("rejects a repeated source key", () => {
  assert.throws(() => {
    parseKnowledgeCorpusManifest(
      manifest([entry(), entry({ file: "otro.md" })]),
    );
  }, /repite kn-004\.servicios/u);
});

test("rejects an unknown sensitivity", () => {
  assert.throws(() => {
    parseKnowledgeCorpusManifest(manifest([entry({ sensitivity: "secreto" })]));
  }, /sensitivity debe ser confidential, internal, public/u);
});

test("requires the end of validity to be declared, even as null", () => {
  const withoutEnd = entry();
  delete withoutEnd["effectiveUntil"];

  assert.throws(() => {
    parseKnowledgeCorpusManifest(manifest([withoutEnd]));
  }, /effectiveUntil debe ser un texto no vacío/u);
  assert.equal(
    parseKnowledgeCorpusManifest(manifest([entry({ effectiveUntil: null })]))
      .documents[0]?.effectiveUntil,
    null,
  );
});

test("names the document whose metadata fails the ingestion rules", async () => {
  await withCorpus(
    {
      "manifest.json": JSON.stringify(
        manifest([entry({ effectiveUntil: "2026-09-01T00:00:00.000Z" })]),
      ),
      "servicios.md": "# Servicios\n",
    },
    async (directory) => {
      await assert.rejects(
        readKnowledgeCorpus(directory),
        /kn-004\.servicios: La vigencia final debe ser posterior a la inicial/u,
      );
    },
  );
});

test("reports a declared file that does not exist", async () => {
  await withCorpus(
    { "manifest.json": JSON.stringify(manifest()) },
    async (directory) => {
      await assert.rejects(
        readKnowledgeCorpus(directory),
        /No se puede leer servicios\.md, declarado por kn-004\.servicios/u,
      );
    },
  );
});

test("loads the documents in order and stops at the first failure", async () => {
  await withCorpus(
    {
      "manifest.json": JSON.stringify(
        manifest([
          entry(),
          entry({
            documentType: "editorial_policy",
            file: "politica.md",
            sensitivity: "internal",
            sourceKey: "kn-002.politica",
            title: "Política",
          }),
        ]),
      ),
      "politica.md": "# Política\n\nUna idea por pieza.\n",
      "servicios.md": "# Servicios\n\nCambio de aceite con fosa.\n",
    },
    async (directory) => {
      const documents = await readKnowledgeCorpus(directory);

      const loaded: string[] = [];
      const succeeding: KnowledgeCorpusIngestor = {
        ingest: (command) => {
          loaded.push(command.sourceKey);
          return Promise.resolve(
            ingestionResult(
              command,
              loaded.length === 1 ? "activated" : "duplicate",
              loaded.length,
            ),
          );
        },
      };
      const results = await loadKnowledgeCorpus(documents, succeeding);
      assert.deepEqual(
        results.map(
          (result) =>
            `${result.sourceKey}:${result.status}:${String(result.version)}`,
        ),
        ["kn-004.servicios:activated:1", "kn-002.politica:duplicate:2"],
      );

      const attempted: string[] = [];
      const failing: KnowledgeCorpusIngestor = {
        ingest: (command) => {
          attempted.push(command.sourceKey);
          return Promise.reject(new Error("proveedor caído"));
        },
      };
      await assert.rejects(
        loadKnowledgeCorpus(documents, failing),
        /proveedor caído/u,
      );
      assert.deepEqual(attempted, ["kn-004.servicios"]);
    },
  );
});
