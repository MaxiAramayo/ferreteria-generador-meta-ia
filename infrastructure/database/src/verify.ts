import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { Pool } from "pg";

const repositoryDirectory = fileURLToPath(
  new URL("../../../", import.meta.url),
);
const latestMigrationName = "20260803000000_generation_runs";
const downMigrationPath = fileURLToPath(
  new URL(
    `../prisma/migrations/${latestMigrationName}/down.sql`,
    import.meta.url,
  ),
);

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required for database verification.");
  }
  return databaseUrl;
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsedUrl = new URL(baseUrl);
  parsedUrl.pathname = `/${databaseName}`;
  parsedUrl.searchParams.delete("schema");
  return parsedUrl.toString();
}

function sanitizedOutput(output: string, databaseUrl: string): string {
  const parsedUrl = new URL(databaseUrl);
  const password = decodeURIComponent(parsedUrl.password);
  return output
    .replaceAll(databaseUrl, "[REDACTED_DATABASE_URL]")
    .replaceAll(password, "[REDACTED]");
}

function runCommand(
  command: string,
  arguments_: readonly string[],
  databaseUrl: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...arguments_], {
      cwd: repositoryDirectory,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
    };

    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${arguments_.join(" ")} failed with code ${String(exitCode)}:\n${sanitizedOutput(output, databaseUrl)}`,
        ),
      );
    });
  });
}

async function verifyDatabase(): Promise<void> {
  const configuredUrl = requiredDatabaseUrl();
  const testDatabaseName = `p2_t01_${randomBytes(8).toString("hex")}`;
  assert.match(testDatabaseName, /^[a-z0-9_]+$/u);

  const adminUrl = databaseUrlFor(configuredUrl, "postgres");
  const testDatabaseUrl = databaseUrlFor(configuredUrl, testDatabaseName);
  const adminPool = new Pool({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
  let databaseCreated = false;

  try {
    await adminPool.query(`CREATE DATABASE "${testDatabaseName}"`);
    databaseCreated = true;
    process.stdout.write("Base efímera creada.\n");

    await runCommand(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      testDatabaseUrl,
    );
    process.stdout.write("Migración aplicada desde una base vacía.\n");

    await runCommand("pnpm", ["exec", "prisma", "db", "seed"], testDatabaseUrl);
    const seededPool = new Pool({
      connectionString: testDatabaseUrl,
      connectionTimeoutMillis: 5_000,
      max: 1,
    });
    try {
      const seedEvidence = await seededPool.query<{ count: string }>(
        `
          SELECT count(*)::text AS "count"
          FROM "organizations"
          WHERE "slug" = 'aramayo'
        `,
      );
      assert.equal(seedEvidence.rows[0]?.count, "1");
    } finally {
      await seededPool.end();
    }
    process.stdout.write("Seed mínimo de desarrollo verificado.\n");

    await runCommand(
      process.execPath,
      [
        "--test",
        "infrastructure/database/dist/repositories.integration.test.js",
      ],
      testDatabaseUrl,
    );
    await runCommand(
      process.execPath,
      [
        "--test",
        "apps/worker/src/rendering/publication-render.integration.test.ts",
      ],
      testDatabaseUrl,
    );
    process.stdout.write(
      "Aislamiento, render, snapshots, referencias e índices verificados.\n",
    );

    const testPool = new Pool({
      connectionString: testDatabaseUrl,
      connectionTimeoutMillis: 5_000,
      max: 1,
    });
    try {
      const downSql = await readFile(downMigrationPath, "utf8");
      await testPool.query(downSql);
      const rollbackState = await testPool.query<{
        alt_column_exists: boolean;
        audit_table: string | null;
        brief_runs_table: string | null;
        revision_brief_run_exists: boolean;
        configuration_table: string | null;
        core_table: string | null;
        failure_column_exists: boolean;
        generation_runs_table: string | null;
        generation_variants_table: string | null;
        idempotency_table: string | null;
        knowledge_documents_table: string | null;
        knowledge_versions_table: string | null;
        outbox_table: string | null;
        rendered_at_exists: boolean;
        rendered_media_exists: boolean;
      }>(
        `
          SELECT
            to_regclass('public.organizations')::text AS "core_table",
            to_regclass('public.content_brief_runs')::text AS "brief_runs_table",
            to_regclass('public.generation_runs')::text AS "generation_runs_table",
            to_regclass('public.generation_run_variants')::text AS "generation_variants_table",
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'publication_revisions'
                AND column_name = 'content_brief_run_id'
            ) AS "revision_brief_run_exists",
            to_regclass('public.organization_configuration_events')::text AS "configuration_table",
            to_regclass('public.audit_events')::text AS "audit_table",
            to_regclass('public.idempotency_records')::text AS "idempotency_table",
            to_regclass('public.outbox_messages')::text AS "outbox_table",
            to_regclass('public.knowledge_documents')::text AS "knowledge_documents_table",
            to_regclass('public.knowledge_document_versions')::text AS "knowledge_versions_table",
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'media_assets'
                AND column_name = 'failure_code'
            ) AS "failure_column_exists",
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'publication_revision_media'
                AND column_name = 'alt'
            ) AS "alt_column_exists",
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'publication_revisions'
                AND column_name = 'rendered_at'
            ) AS "rendered_at_exists",
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'publication_revisions'
                AND column_name = 'rendered_media_asset_id'
            ) AS "rendered_media_exists"
        `,
      );
      const rollbackEvidence = rollbackState.rows[0];
      if (rollbackEvidence === undefined) {
        assert.fail("Rollback verification did not return evidence.");
      }
      assert.equal(rollbackEvidence.core_table, "organizations");
      assert.equal(
        rollbackEvidence.configuration_table,
        "organization_configuration_events",
      );
      assert.equal(rollbackEvidence.failure_column_exists, true);
      assert.equal(rollbackEvidence.alt_column_exists, true);
      assert.equal(rollbackEvidence.audit_table, "audit_events");
      assert.equal(rollbackEvidence.idempotency_table, "idempotency_records");
      assert.equal(rollbackEvidence.outbox_table, "outbox_messages");
      // La reversión afecta sólo a la última migración: el lote de generación
      // desaparece con sus variantes, y todo lo anterior —incluido el vínculo
      // entre revisión y ejecución de brief— queda intacto.
      assert.equal(rollbackEvidence.generation_runs_table, null);
      assert.equal(rollbackEvidence.generation_variants_table, null);
      assert.equal(rollbackEvidence.brief_runs_table, "content_brief_runs");
      assert.equal(rollbackEvidence.revision_brief_run_exists, true);
      assert.equal(
        rollbackEvidence.knowledge_documents_table,
        "knowledge_documents",
      );
      assert.equal(
        rollbackEvidence.knowledge_versions_table,
        "knowledge_document_versions",
      );
      assert.equal(rollbackEvidence.rendered_at_exists, true);
      assert.equal(rollbackEvidence.rendered_media_exists, true);
      await testPool.query(
        'DELETE FROM "_prisma_migrations" WHERE "migration_name" = $1',
        [latestMigrationName],
      );
    } finally {
      await testPool.end();
    }
    process.stdout.write("Última migración revertida con down.sql.\n");

    await runCommand(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      testDatabaseUrl,
    );
    await runCommand(
      process.execPath,
      [
        "--test",
        "infrastructure/database/dist/repositories.integration.test.js",
      ],
      testDatabaseUrl,
    );
    await runCommand(
      process.execPath,
      [
        "--test",
        "apps/worker/src/rendering/publication-render.integration.test.ts",
      ],
      testDatabaseUrl,
    );
    process.stdout.write("Migración reaplicada y verificada.\n");
  } finally {
    if (databaseCreated) {
      await adminPool.query(
        `
          SELECT pg_terminate_backend("pid")
          FROM pg_stat_activity
          WHERE "datname" = $1
            AND "pid" <> pg_backend_pid()
        `,
        [testDatabaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${testDatabaseName}"`);
    }
    await adminPool.end();
  }
}

try {
  await verifyDatabase();
  process.stdout.write("Verificación de base completa.\n");
} catch (cause: unknown) {
  const message =
    cause instanceof Error
      ? cause.message
      : "Unknown database verification error.";
  process.stderr.write(`Database verification failed: ${message}\n`);
  process.exitCode = 1;
}
