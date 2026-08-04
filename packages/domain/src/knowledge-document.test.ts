import assert from "node:assert/strict";
import test from "node:test";

import {
  KnowledgeDocumentValidationError,
  validateKnowledgeDocument,
  type IngestKnowledgeDocumentCommand,
} from "./knowledge-document.ts";

const approvedDocument: IngestKnowledgeDocumentCommand = Object.freeze({
  approvalReference: "business-review-2026-07-29",
  approvalStatus: "approved",
  approvedAt: "2026-07-29T12:00:00.000Z",
  brand: "Ferretería y Lubricentro Aramayo",
  content: new TextEncoder().encode("# Horarios\n\nLunes a viernes."),
  documentType: "operational_policy",
  effectiveFrom: "2026-07-29T12:00:00.000Z",
  effectiveUntil: null,
  filename: "horarios.md",
  locationIds: ["10000000-0000-4000-8000-000000000004"],
  mimeType: "text/markdown",
  organizationId: "10000000-0000-4000-8000-000000000001",
  sensitivity: "internal",
  sourceKey: "operacion.horarios",
  sourceOwner: "Responsable de negocio",
  title: "Horarios aprobados",
});

test("validates an approved UTF-8 knowledge document", () => {
  const validated = validateKnowledgeDocument(approvedDocument, "a".repeat(64));

  assert.equal(validated.contentHash, "a".repeat(64));
  assert.equal(validated.byteSize, approvedDocument.content.byteLength);
  assert.deepEqual(validated.locationIds, [
    "10000000-0000-4000-8000-000000000004",
  ]);
});

test("rejects content that is not approved", () => {
  assert.throws(
    () =>
      validateKnowledgeDocument(
        {
          ...approvedDocument,
          approvalStatus: "draft",
        },
        "a".repeat(64),
      ),
    (cause: unknown) =>
      cause instanceof KnowledgeDocumentValidationError &&
      cause.code === "approval-required",
  );
});

test("rejects mismatched file extensions and invalid content", () => {
  assert.throws(
    () =>
      validateKnowledgeDocument(
        { ...approvedDocument, filename: "horarios.pdf" },
        "a".repeat(64),
      ),
    (cause: unknown) =>
      cause instanceof KnowledgeDocumentValidationError &&
      cause.code === "filename-invalid",
  );
  assert.throws(
    () =>
      validateKnowledgeDocument(
        {
          ...approvedDocument,
          content: new Uint8Array([0xff, 0xfe, 0x00]),
        },
        "a".repeat(64),
      ),
    (cause: unknown) =>
      cause instanceof KnowledgeDocumentValidationError &&
      cause.code === "content-invalid",
  );
});

test("rejects invalid effective ranges and repeated locations", () => {
  assert.throws(
    () =>
      validateKnowledgeDocument(
        {
          ...approvedDocument,
          effectiveUntil: approvedDocument.effectiveFrom,
          locationIds: [
            "10000000-0000-4000-8000-000000000004",
            "10000000-0000-4000-8000-000000000004",
          ],
        },
        "a".repeat(64),
      ),
    (cause: unknown) =>
      cause instanceof KnowledgeDocumentValidationError &&
      cause.code === "metadata-invalid",
  );
});
