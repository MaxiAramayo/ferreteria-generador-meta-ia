/**
 * Medición de presupuestos de rendimiento y costo (`P7-T05`).
 *
 * Levanta una base efímera con volumen representativo y la API real, mide lo
 * que el panel espera —sesión, listado, calendario, una ejecución y la salud
 * operativa—, comprueba que el listado siga paginando, que el outbox acumulado
 * se drene, que el login degrade con 429 en vez de romperse, y atribuye el
 * costo por brief, por variante y por pieza. Falla si algo se sale del
 * presupuesto declarado en el dominio.
 *
 * No usa navegador: mide la API, que es donde se gasta el tiempo.
 *
 * ```bash
 * pnpm budget:load
 * ```
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  createDatabaseClient,
  PrismaOutboxRepository,
} from "@aramayo/database";
import {
  evaluateCostBudget,
  evaluateLatencyBudget,
  evaluateQueueBudget,
  latencyBudgets,
  listVolumeBudget,
  operationalBudgetsVersion,
  summarizeLatency,
  type BudgetBreach,
  type LatencyBudgetId,
  type LatencySummary,
  type OutboxTransport,
} from "@aramayo/domain";

import { OutboxDispatcherService } from "../../apps/worker/src/outbox/outbox-dispatcher.service.ts";
import { apiEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";
import {
  budgetLoadPassword,
  observedBriefCostMicrousd,
  observedVariantCostMicrousd,
  seedBudgetLoadFixture,
} from "./fixture.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const migrateTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;
const warmupRequests = 5;
const measuredRequests = 60;
const concurrentRequests = 25;
const outboxBatchSize = 25;
const volume = Object.freeze({
  occurrencesPerSchedule: 6,
  pendingOutboxMessages: 120,
  publications: listVolumeBudget.representativeRows,
  schedules: 40,
});

const breaches: BudgetBreach[] = [];

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL es obligatorio para medir presupuestos.");
  }
  return databaseUrl;
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

function report(detail: string): void {
  process.stdout.write(`  ${detail}\n`);
}

function recordBreaches(found: readonly BudgetBreach[]): void {
  breaches.push(...found);
}

function milliseconds(value: number): string {
  return `${value.toFixed(0)} ms`;
}

function dollars(microusd: number): string {
  return `US$ ${(microusd / 1_000_000).toFixed(4)}`;
}

async function login(apiBaseUrl: string, email: string): Promise<string> {
  const response = await fetch(new URL("auth/login", apiBaseUrl), {
    body: JSON.stringify({ email, password: budgetLoadPassword }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 201, `El login de ${email} falló.`);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "El login no devolvió cookie de sesión.");
  const [pair] = setCookie.split(";");
  assert.ok(pair, "Cookie de sesión inválida.");
  return pair;
}

async function timedGet(
  apiBaseUrl: string,
  path: string,
  cookie: string,
): Promise<Readonly<{ milliseconds: number; status: number }>> {
  const startedAt = performance.now();
  const response = await fetch(new URL(path, apiBaseUrl), {
    headers: { accept: "application/json", cookie },
  });
  // Leer el cuerpo entra en la medición: es lo que espera el panel.
  await response.arrayBuffer();
  return {
    milliseconds: performance.now() - startedAt,
    status: response.status,
  };
}

async function measure(
  apiBaseUrl: string,
  path: string,
  cookie: string,
  times: number,
): Promise<LatencySummary> {
  for (let attempt = 0; attempt < warmupRequests; attempt += 1) {
    const warmup = await timedGet(apiBaseUrl, path, cookie);
    assert.equal(
      warmup.status,
      200,
      `«${path}» respondió ${String(warmup.status)}.`,
    );
  }
  const samples: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    const sample = await timedGet(apiBaseUrl, path, cookie);
    assert.equal(
      sample.status,
      200,
      `«${path}» respondió ${String(sample.status)}.`,
    );
    samples.push(sample.milliseconds);
  }
  return summarizeLatency(samples);
}

function reportLatency(id: LatencyBudgetId, summary: LatencySummary): void {
  const budget = latencyBudgets[id];
  const found = evaluateLatencyBudget(id, summary);
  recordBreaches(found);
  report(
    `${found.length === 0 ? "ok" : "incumple"} ${budget.label}: p50 ${milliseconds(summary.p50Milliseconds)}, p95 ${milliseconds(summary.p95Milliseconds)} (presupuesto ${milliseconds(budget.p95Milliseconds)}), p99 ${milliseconds(summary.p99Milliseconds)} (presupuesto ${milliseconds(budget.p99Milliseconds)})`,
  );
}

async function pendingOutbox(
  database: ReturnType<typeof createDatabaseClient>,
): Promise<Readonly<{ ageMinutes: number; pending: number }>> {
  const [pending, oldest] = await Promise.all([
    database.outboxMessage.count({ where: { status: "pending" } }),
    database.outboxMessage.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      where: { status: "pending" },
    }),
  ]);
  return {
    ageMinutes:
      oldest === null
        ? 0
        : Math.floor((Date.now() - oldest.createdAt.getTime()) / 60_000),
    pending,
  };
}

async function main(): Promise<void> {
  const configuredUrl = requiredDatabaseUrl();
  const databaseName = `budget_load_${randomBytes(6).toString("hex")}`;
  assert.match(databaseName, /^[a-z0-9_]+$/u);
  const adminPool = new Pool({
    connectionString: databaseUrlFor(configuredUrl, "postgres"),
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
  const databaseUrl = databaseUrlFor(configuredUrl, databaseName);

  let created = false;
  let api: RunningProcess | undefined;

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const migrate = await runProcess(
      {
        arguments: [prismaBinary, "migrate", "deploy"],
        environment: { ...process.env, DATABASE_URL: databaseUrl },
        workingDirectory: repositoryDirectory,
      },
      migrateTimeoutMs,
    );
    assert.equal(migrate.exitCode, 0, `La migración falló:\n${migrate.output}`);
    const seedStartedAt = performance.now();
    const fixture = await seedBudgetLoadFixture(databaseUrl, volume);
    process.stdout.write(
      `Base efímera con ${String(volume.publications)} publicaciones, ${String(volume.schedules)} programaciones y ${String(volume.pendingOutboxMessages)} avisos acumulados (${((performance.now() - seedStartedAt) / 1_000).toFixed(1)} s).\n`,
    );
    process.stdout.write(`Presupuestos: ${operationalBudgetsVersion}\n`);

    const apiPort = await reserveEphemeralPort();
    const apiBaseUrl = `http://127.0.0.1:${String(apiPort)}/`;
    const redisUrl = process.env["REDIS_URL"];
    assert.ok(redisUrl, "REDIS_URL es obligatorio para medir presupuestos.");
    api = startProcess({
      arguments: ["dist/main.js"],
      environment: {
        ...apiEnvironment(apiPort),
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
      },
      workingDirectory: apiDirectory,
    });
    try {
      await waitForHttp(`${apiBaseUrl}health`, startupTimeoutMs);
    } catch (cause) {
      throw new Error(
        `La API no arrancó:\n${api.output()}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    process.stdout.write("API en pie.\n");

    // Quien publica lee todo lo que se mide: listado, calendario, ejecución y
    // salud operativa.
    const cookie = await login(apiBaseUrl, fixture.people.publisher.email);

    process.stdout.write("\nLatencia con volumen\n");
    const paths: Readonly<Record<LatencyBudgetId, string>> = {
      "api-generation-run": `generation-runs/${fixture.generationRunId}`,
      "api-operational-health": "operational-health",
      "api-publication-list": `publications?page=1&limit=${String(listVolumeBudget.defaultPageSize)}`,
      "api-schedule-calendar":
        "schedules?from=2026-09-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z",
      "api-session": "auth/session",
    };
    for (const id of Object.keys(paths) as readonly LatencyBudgetId[]) {
      reportLatency(
        id,
        await measure(apiBaseUrl, paths[id], cookie, measuredRequests),
      );
    }

    const burstStartedAt = performance.now();
    const burst = await Promise.all(
      Array.from({ length: concurrentRequests }, () =>
        timedGet(apiBaseUrl, paths["api-publication-list"], cookie),
      ),
    );
    assert.ok(
      burst.every((response) => response.status === 200),
      "El listado falló bajo concurrencia.",
    );
    const burstSummary = summarizeLatency(
      burst.map((response) => response.milliseconds),
    );
    report(
      `ok ${String(concurrentRequests)} listados en paralelo: p95 ${milliseconds(burstSummary.p95Milliseconds)}, total ${((performance.now() - burstStartedAt) / 1_000).toFixed(2)} s`,
    );

    process.stdout.write("\nPaginación bajo volumen\n");
    const firstPage = await fetch(
      new URL(paths["api-publication-list"], apiBaseUrl),
      { headers: { accept: "application/json", cookie } },
    );
    const firstPageBody = (await firstPage.json()) as Readonly<{
      items: readonly Readonly<{ id: string }>[];
      total: number;
    }>;
    assert.equal(
      firstPageBody.items.length,
      listVolumeBudget.defaultPageSize,
      "La primera página no respetó el tamaño por omisión.",
    );
    assert.ok(
      firstPageBody.total >= listVolumeBudget.representativeRows,
      "El volumen sembrado no llegó al listado.",
    );
    const oversized = await fetch(
      new URL(
        `publications?page=1&limit=${String(listVolumeBudget.maximumPageSize + 1)}`,
        apiBaseUrl,
      ),
      { headers: { accept: "application/json", cookie } },
    );
    assert.equal(
      oversized.status,
      400,
      "Pedir más filas que el máximo debería rechazarse.",
    );
    report(
      `ok el listado devuelve ${String(listVolumeBudget.defaultPageSize)} de ${String(firstPageBody.total)} y rechaza pedir más de ${String(listVolumeBudget.maximumPageSize)}`,
    );

    process.stdout.write("\nBacklog y recuperación\n");
    const database = createDatabaseClient(databaseUrl);
    try {
      const before = await pendingOutbox(database);
      const beforeBreaches = evaluateQueueBudget("outbox-drain", before);
      assert.ok(
        beforeBreaches.length > 0,
        "El escenario debe empezar con backlog: si no, no mide recuperación.",
      );
      report(
        `ok arranca con backlog: ${String(before.pending)} avisos, el más viejo de ${String(before.ageMinutes)} min`,
      );

      const transport: OutboxTransport = { deliver: () => Promise.resolve() };
      const dispatcher = new OutboxDispatcherService(
        new PrismaOutboxRepository(database),
        transport,
        "budget-load",
      );
      const drainStartedAt = performance.now();
      let rounds = 0;
      for (; rounds < 200; rounds += 1) {
        const summary = await dispatcher.dispatchBatch(
          new Date(),
          outboxBatchSize,
        );
        if (summary.claimed === 0) break;
      }
      const drainSeconds = (performance.now() - drainStartedAt) / 1_000;
      const after = await pendingOutbox(database);
      assert.equal(after.pending, 0, "El outbox no terminó de drenarse.");
      recordBreaches(evaluateQueueBudget("outbox-drain", after));
      report(
        `ok recuperado en ${drainSeconds.toFixed(2)} s y ${String(rounds)} tandas de ${String(outboxBatchSize)}: ${(before.pending / drainSeconds).toFixed(0)} avisos por segundo`,
      );

      process.stdout.write("\nCosto por operación\n");
      const brief = await database.contentBriefRun.findFirst({
        select: { estimatedCostUsd: true, totalTokens: true },
        where: { id: fixture.briefRunId },
      });
      assert.ok(brief, "No se encontró el brief sembrado.");
      const briefMicrousd = Math.round(
        Number(brief.estimatedCostUsd ?? 0) * 1_000_000,
      );
      recordBreaches(evaluateCostBudget("content-brief", briefMicrousd));
      report(
        `${briefMicrousd <= observedBriefCostMicrousd * 2 ? "ok" : "revisar"} brief: ${dollars(briefMicrousd)} con ${String(brief.totalTokens)} tokens`,
      );

      const attempts = await database.generationAttempt.aggregate({
        _count: { _all: true },
        _sum: { reservedMicrousd: true, settledMicrousd: true },
        where: { runId: fixture.generationRunId },
      });
      const settled = attempts._sum.settledMicrousd ?? 0;
      const reserved = attempts._sum.reservedMicrousd ?? 0;
      const variants = Math.max(attempts._count._all, 1);
      const perVariant = Math.round(settled / variants);
      recordBreaches(evaluateCostBudget("generation-variant", perVariant));
      // Estimado contra observado: la reserva se toma antes de llamar al
      // proveedor y la liquidación después, con lo que el proveedor informó.
      report(
        `ok variante: ${dollars(perVariant)} liquidado, ${dollars(Math.round(reserved / variants))} reservado y ${dollars(observedVariantCostMicrousd)} medido en staging`,
      );

      // La pieza cuesta su brief más lo que costaron sus variantes: el hilo va
      // de la revisión aprobada a su brief y de ahí a las ejecuciones.
      const revision = await database.publicationRevision.findFirst({
        select: { contentBriefRunId: true },
        where: {
          organizationId: fixture.organizationId,
          publicationId: fixture.approvedPublicationId,
        },
      });
      assert.equal(
        revision?.contentBriefRunId,
        fixture.briefRunId,
        "La pieza aprobada no quedó atada a su brief.",
      );
      const pieceMicrousd = briefMicrousd + settled;
      recordBreaches(evaluateCostBudget("publication-piece", pieceMicrousd));
      report(
        `ok pieza publicable: ${dollars(pieceMicrousd)} = brief ${dollars(briefMicrousd)} + ${String(attempts._count._all)} variantes ${dollars(settled)}`,
      );
    } finally {
      await database.$disconnect();
    }

    process.stdout.write("\nDegradación ante rate limit\n");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await fetch(new URL("auth/login", apiBaseUrl), {
        body: JSON.stringify({
          email: "carga.inexistente@aramayo.invalid",
          password: "clave-que-no-existe",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      statuses.push(response.status);
    }
    assert.ok(
      statuses.every((status) => status < 500),
      `El login devolvió un error del servidor: ${statuses.join(", ")}`,
    );
    assert.ok(
      statuses.includes(429),
      `El login no limitó los intentos: ${statuses.join(", ")}`,
    );
    report(
      `ok el login corta con 429 tras ${String(statuses.indexOf(429))} rechazos, sin errores del servidor`,
    );

    process.stdout.write("\n");
    if (breaches.length > 0) {
      for (const breach of breaches) {
        process.stderr.write(
          `  incumple ${breach.budget} (${breach.kind}): ${String(Math.round(breach.measured))} contra ${String(breach.allowed)}\n`,
        );
      }
      throw new Error(`${String(breaches.length)} presupuestos incumplidos.`);
    }
    process.stdout.write("Presupuestos cumplidos.\n");
  } finally {
    await api?.terminate().catch(() => undefined);
    if (created) {
      await adminPool.query(
        `SELECT pg_terminate_backend("pid") FROM pg_stat_activity
         WHERE "datname" = $1 AND "pid" <> pg_backend_pid()`,
        [databaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
    await adminPool.end();
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message =
    cause instanceof Error ? cause.message : "Error desconocido al medir.";
  process.stderr.write(`La medición de presupuestos falló: ${message}\n`);
  process.exitCode = 1;
}
