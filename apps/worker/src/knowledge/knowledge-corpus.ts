import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  validateKnowledgeDocument,
  type IngestKnowledgeDocumentCommand,
  type KnowledgeDocumentSensitivity,
} from "@aramayo/domain";

import type { KnowledgeIngestionResult } from "./knowledge-ingestion.service.ts";

/**
 * Corpus de conocimiento aprobado: un manifiesto y los documentos que declara.
 *
 * El manifiesto es la única fuente de los metadatos de aprobación y vigencia;
 * cada documento sólo aporta el texto. Así una fuente no puede activarse sin
 * que su aprobación quede escrita y revisada junto al contenido.
 */

export const knowledgeCorpusManifestFilename = "manifest.json";

export interface KnowledgeCorpusEntry {
  readonly approvalReference: string;
  readonly approvedAt: string;
  readonly documentType: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly file: string;
  readonly locationIds: readonly string[];
  readonly sensitivity: KnowledgeDocumentSensitivity;
  readonly sourceKey: string;
  readonly title: string;
}

export interface KnowledgeCorpusManifest {
  readonly brand: string;
  readonly documents: readonly KnowledgeCorpusEntry[];
  readonly organizationId: string;
  readonly sourceOwner: string;
}

export interface KnowledgeCorpusDocument {
  readonly command: IngestKnowledgeDocumentCommand;
  readonly contentHash: string;
}

export interface KnowledgeCorpusIngestor {
  ingest(
    command: IngestKnowledgeDocumentCommand,
  ): Promise<KnowledgeIngestionResult>;
}

export interface KnowledgeCorpusLoadResult {
  readonly cleanupPending: boolean;
  readonly sourceKey: string;
  readonly status: KnowledgeIngestionResult["status"];
  readonly version: number;
}

export class KnowledgeCorpusError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KnowledgeCorpusError";
  }
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const manifestKeys: readonly string[] = [
  "brand",
  "documents",
  "organizationId",
  "sourceOwner",
];
const entryKeys: readonly string[] = [
  "approvalReference",
  "approvedAt",
  "documentType",
  "effectiveFrom",
  "effectiveUntil",
  "file",
  "locationIds",
  "sensitivity",
  "sourceKey",
  "title",
];
const sensitivities: readonly KnowledgeDocumentSensitivity[] = [
  "confidential",
  "internal",
  "public",
];
// Sólo nombres simples, sin separadores ni `..`: ninguna entrada puede leer
// fuera del directorio del corpus.
const MARKDOWN_FILENAME = /^[a-z0-9][a-z0-9._-]*\.md$/u;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new KnowledgeCorpusError(`${label} debe ser un objeto.`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new KnowledgeCorpusError(
      `${label} tiene campos desconocidos: ${unexpected.join(", ")}.`,
    );
  }
}

function text(value: UnknownRecord, key: string, label: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new KnowledgeCorpusError(
      `${label}.${key} debe ser un texto no vacío.`,
    );
  }
  return field;
}

function nullableText(
  value: UnknownRecord,
  key: string,
  label: string,
): string | null {
  return value[key] === null ? null : text(value, key, label);
}

function textList(
  value: UnknownRecord,
  key: string,
  label: string,
): readonly string[] {
  const field = value[key];
  if (!Array.isArray(field)) {
    throw new KnowledgeCorpusError(`${label}.${key} debe ser una lista.`);
  }
  const entries: string[] = [];
  for (const entry of field as readonly unknown[]) {
    if (typeof entry !== "string") {
      throw new KnowledgeCorpusError(`${label}.${key} sólo admite textos.`);
    }
    entries.push(entry);
  }
  return Object.freeze(entries);
}

function sensitivity(
  value: UnknownRecord,
  label: string,
): KnowledgeDocumentSensitivity {
  const field = text(value, "sensitivity", label);
  const match = sensitivities.find((candidate) => candidate === field);
  if (match === undefined) {
    throw new KnowledgeCorpusError(
      `${label}.sensitivity debe ser ${sensitivities.join(", ")}.`,
    );
  }
  return match;
}

export function parseKnowledgeCorpusManifest(
  value: unknown,
): KnowledgeCorpusManifest {
  const manifest = record(value, "manifest");
  exactKeys(manifest, manifestKeys, "manifest");
  const rawDocuments = manifest["documents"];
  if (!Array.isArray(rawDocuments) || rawDocuments.length === 0) {
    throw new KnowledgeCorpusError(
      "El manifiesto debe declarar al menos un documento.",
    );
  }

  const sourceKeys = new Set<string>();
  const documents = (rawDocuments as readonly unknown[]).map(
    (raw, index): KnowledgeCorpusEntry => {
      const label = `documents[${String(index)}]`;
      const entry = record(raw, label);
      exactKeys(entry, entryKeys, label);
      const sourceKey = text(entry, "sourceKey", label);
      if (sourceKeys.has(sourceKey)) {
        throw new KnowledgeCorpusError(
          `${label}.sourceKey repite ${sourceKey}.`,
        );
      }
      sourceKeys.add(sourceKey);
      const file = text(entry, "file", label);
      if (!MARKDOWN_FILENAME.test(file)) {
        throw new KnowledgeCorpusError(
          `${label}.file debe ser un nombre de archivo Markdown dentro del corpus.`,
        );
      }
      return Object.freeze({
        approvalReference: text(entry, "approvalReference", label),
        approvedAt: text(entry, "approvedAt", label),
        documentType: text(entry, "documentType", label),
        effectiveFrom: text(entry, "effectiveFrom", label),
        effectiveUntil: nullableText(entry, "effectiveUntil", label),
        file,
        locationIds: textList(entry, "locationIds", label),
        sensitivity: sensitivity(entry, label),
        sourceKey,
        title: text(entry, "title", label),
      });
    },
  );

  return Object.freeze({
    brand: text(manifest, "brand", "manifest"),
    documents: Object.freeze(documents),
    organizationId: text(manifest, "organizationId", "manifest"),
    sourceOwner: text(manifest, "sourceOwner", "manifest"),
  });
}

async function readManifest(
  directory: string,
): Promise<KnowledgeCorpusManifest> {
  let source: string;
  try {
    source = await readFile(
      join(directory, knowledgeCorpusManifestFilename),
      "utf8",
    );
  } catch (cause: unknown) {
    throw new KnowledgeCorpusError(
      `No se puede leer ${knowledgeCorpusManifestFilename} en ${directory}.`,
      { cause },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause: unknown) {
    throw new KnowledgeCorpusError("El manifiesto no es JSON válido.", {
      cause,
    });
  }
  return parseKnowledgeCorpusManifest(parsed);
}

/**
 * Lee el corpus y valida cada documento con la misma regla que aplica la
 * ingestión, antes de tocar la base o el proveedor.
 */
export async function readKnowledgeCorpus(
  directory: string,
): Promise<readonly KnowledgeCorpusDocument[]> {
  const manifest = await readManifest(directory);
  const documents: KnowledgeCorpusDocument[] = [];
  for (const entry of manifest.documents) {
    let content: Uint8Array;
    try {
      content = new Uint8Array(await readFile(join(directory, entry.file)));
    } catch (cause: unknown) {
      throw new KnowledgeCorpusError(
        `No se puede leer ${entry.file}, declarado por ${entry.sourceKey}.`,
        { cause },
      );
    }
    const command: IngestKnowledgeDocumentCommand = Object.freeze({
      approvalReference: entry.approvalReference,
      approvalStatus: "approved",
      approvedAt: entry.approvedAt,
      brand: manifest.brand,
      content,
      documentType: entry.documentType,
      effectiveFrom: entry.effectiveFrom,
      effectiveUntil: entry.effectiveUntil,
      filename: entry.file,
      locationIds: entry.locationIds,
      mimeType: "text/markdown",
      organizationId: manifest.organizationId,
      sensitivity: entry.sensitivity,
      sourceKey: entry.sourceKey,
      sourceOwner: manifest.sourceOwner,
      title: entry.title,
    });
    const contentHash = createHash("sha256").update(content).digest("hex");
    try {
      validateKnowledgeDocument(command, contentHash);
    } catch (cause: unknown) {
      throw new KnowledgeCorpusError(
        `${entry.sourceKey}: ${cause instanceof Error ? cause.message : "metadatos inválidos"}`,
        { cause },
      );
    }
    documents.push(Object.freeze({ command, contentHash }));
  }
  return Object.freeze(documents);
}

/**
 * Ingiere en orden y de a uno: cada documento espera su indexación. Si uno
 * falla, los anteriores ya quedaron activos y una corrida nueva los reconoce
 * como duplicados, sin subirlos otra vez.
 */
export async function loadKnowledgeCorpus(
  documents: readonly KnowledgeCorpusDocument[],
  ingestor: KnowledgeCorpusIngestor,
): Promise<readonly KnowledgeCorpusLoadResult[]> {
  const results: KnowledgeCorpusLoadResult[] = [];
  for (const document of documents) {
    const result = await ingestor.ingest(document.command);
    results.push(
      Object.freeze({
        cleanupPending: result.cleanupPending,
        sourceKey: document.command.sourceKey,
        status: result.status,
        version: result.record.version,
      }),
    );
  }
  return Object.freeze(results);
}
