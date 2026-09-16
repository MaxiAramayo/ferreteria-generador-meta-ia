/**
 * Extremo a extremo del despachador contra PostgreSQL real (`P6-T09`).
 *
 * Lo que el dominio promete —que reiniciar no pierda ni duplique trabajo— vive
 * en una sola consulta: el `FOR UPDATE SKIP LOCKED` con el que un worker reclama
 * su lote, y el lease que lo protege mientras entrega. Las pruebas unitarias del
 * despachador usan un repositorio falso, así que comprueban la decisión del
 * servicio pero no la concurrencia real, que es justo donde un duplicado
 * dolería: una pieza publicada dos veces en la cuenta de la ferretería.
 *
 * Por eso esta prueba no levanta la API ni el panel. Levanta una base efímera y
 * hace competir despachadores de verdad sobre las mismas filas.
 *
 * Se comprobó que detecta lo que dice: quitarle al `markDelivered` la condición
 * de que el lease sea del worker que confirma hace fallar el cuarto escenario, y
 * quitarle el bloqueo de fila al reclamo hace que el primero entregue setenta
 * veces sesenta mensajes. Lo que **no** detecta —y no debería pretenderlo— es
 * quitar sólo el `SKIP LOCKED`: sin él el segundo worker espera en vez de
 * saltear, y al desbloquearse la fila ya no cumple la condición de pendiente,
 * así que no la reclama. `SKIP LOCKED` es rendimiento, no corrección.
 *
 * ```bash
 * pnpm e2e:dispatch
 * ```
 */

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import {
  createDatabaseClient,
  PrismaOutboxRepository,
} from "@aramayo/database";
import {
  reliableOperationLimits,
  type OutboxMessageRecord,
  type OutboxTransport,
} from "@aramayo/domain";

import { OutboxDispatcherService } from "../../apps/worker/src/outbox/outbox-dispatcher.service.ts";
import { runProcess } from "../smoke/process-control.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const migrateTimeoutMs = 360_000;
const leaseMilliseconds = 60_000;
const topic = "publication.publish.requested";

function reportCheck(detail: string): void {
  process.stdout.write(`  ok ${detail}\n`);
}

function databaseUrlFor(baseUrl: string, name: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${name}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

/**
 * Transporte que anota a quién entregó y cuántas veces.
 *
 * Contar por mensaje es el punto: «entregado» no alcanza como aserción si lo
 * que se quiere saber es si alguien entregó dos veces.
 */
class RecordingTransport implements OutboxTransport {
  readonly deliveries: string[] = [];
  readonly #beforeReturn:
    ((message: OutboxMessageRecord) => Promise<void>) | undefined;
  readonly #fail: boolean;

  constructor(
    options: Readonly<{
      beforeReturn?: (message: OutboxMessageRecord) => Promise<void>;
      fail?: boolean;
    }> = {},
  ) {
    this.#beforeReturn = options.beforeReturn;
    this.#fail = options.fail ?? false;
  }

  async deliver(message: OutboxMessageRecord): Promise<void> {
    this.deliveries.push(message.eventId);
    if (this.#beforeReturn !== undefined) {
      await this.#beforeReturn(message);
    }
    if (this.#fail) {
      throw new Error("El destino rechazó la entrega.");
    }
  }

  countFor(eventId: string): number {
    return this.deliveries.filter((delivered) => delivered === eventId).length;
  }
}

async function main(): Promise<void> {
  const configuredUrl = process.env["DATABASE_URL"];
  assert.ok(
    configuredUrl !== undefined && configuredUrl.trim().length > 0,
    "DATABASE_URL es obligatorio para el E2E de despacho.",
  );
  const databaseName = `dispatch_e2e_${randomBytes(6).toString("hex")}`;
  assert.match(databaseName, /^[a-z0-9_]+$/u);
  const adminPool = new Pool({
    connectionString: databaseUrlFor(configuredUrl, "postgres"),
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
  const databaseUrl = databaseUrlFor(configuredUrl, databaseName);
  let created = false;

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

    const database = createDatabaseClient(databaseUrl);
    const repository = new PrismaOutboxRepository(database);
    const organizationId = randomUUID();
    await database.organization.create({
      data: {
        displayName: "Aramayo Despacho",
        id: organizationId,
        legalName: "Aramayo Despacho",
        slug: `aramayo-despacho-${organizationId.slice(0, 8)}`,
      },
    });
    process.stdout.write("Base efímera migrada.\n");

    async function seedMessages(
      count: number,
      availableAt: Date,
    ): Promise<readonly string[]> {
      const ids = Array.from({ length: count }, () => randomUUID());
      await database.outboxMessage.createMany({
        data: ids.map((id) => ({
          aggregateId: randomUUID(),
          aggregateType: "publication",
          availableAt,
          createdAt: availableAt,
          id,
          organizationId,
          payload: { destino: "facebook_page" },
          topic,
        })),
      });
      return ids;
    }

    async function statusOf(eventId: string): Promise<string> {
      const row = await database.outboxMessage.findUniqueOrThrow({
        select: { status: true },
        where: { id: eventId },
      });
      return row.status;
    }

    const now = new Date();

    // 1. Dos workers compitiendo por las mismas filas.
    const parallelCount = 60;
    const parallelIds = await seedMessages(parallelCount, now);
    const sharedTransport = new RecordingTransport();
    const workers = ["worker-a", "worker-b"].map(
      (workerId) =>
        new OutboxDispatcherService(repository, sharedTransport, workerId),
    );
    let claimedTotal = 0;
    for (let round = 0; round < 10; round += 1) {
      const summaries = await Promise.all(
        workers.map(async (worker) => worker.dispatchBatch(now, 25)),
      );
      claimedTotal += summaries.reduce(
        (total, summary) => total + summary.claimed,
        0,
      );
      if (summaries.every((summary) => summary.claimed === 0)) break;
    }
    assert.equal(
      sharedTransport.deliveries.length,
      parallelCount,
      "El transporte no entregó exactamente una vez por mensaje.",
    );
    assert.equal(
      new Set(sharedTransport.deliveries).size,
      parallelCount,
      "Un mensaje se entregó dos veces con dos workers en paralelo.",
    );
    assert.equal(
      claimedTotal,
      parallelCount,
      "Dos workers reclamaron el mismo mensaje.",
    );
    const undelivered = await database.outboxMessage.count({
      where: { id: { in: [...parallelIds] }, status: { not: "delivered" } },
    });
    assert.equal(undelivered, 0, "Quedaron mensajes sin entregar.");
    reportCheck(
      `dos workers en paralelo entregan ${String(parallelCount)} mensajes exactamente una vez cada uno`,
    );

    // 2. Un lease vigente es de quien lo tomó.
    const [leasedId] = await seedMessages(1, now);
    assert.ok(leasedId !== undefined);
    const claimed = await repository.claimBatch({
      at: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds).toISOString(),
      limit: 10,
      workerId: "worker-que-muere",
    });
    assert.equal(claimed.length, 1, "El lote reclamado no fue el esperado.");
    const intruderTransport = new RecordingTransport();
    const intruder = new OutboxDispatcherService(
      repository,
      intruderTransport,
      "worker-c",
    );
    const duringLease = await intruder.dispatchBatch(
      new Date(now.getTime() + leaseMilliseconds / 2),
      10,
    );
    assert.equal(
      duringLease.claimed,
      0,
      "Otro worker se llevó un mensaje con el lease vigente.",
    );
    reportCheck("un lease vigente no se lo lleva otro worker");

    // 3. El worker muere a mitad de lote: nadie confirmó, nadie entregó.
    const afterLease = new Date(now.getTime() + leaseMilliseconds + 1_000);
    const reclaimed = await intruder.dispatchBatch(afterLease, 10);
    assert.equal(reclaimed.claimed, 1, "El mensaje huérfano no se reclamó.");
    assert.equal(reclaimed.delivered, 1, "El mensaje huérfano no se entregó.");
    assert.equal(intruderTransport.countFor(leasedId), 1);
    assert.equal(await statusOf(leasedId), "delivered");
    const orphan = await database.outboxMessage.findUniqueOrThrow({
      select: { attempts: true, lockedBy: true },
      where: { id: leasedId },
    });
    assert.equal(
      orphan.attempts,
      2,
      "El intento del worker muerto no se contó.",
    );
    assert.equal(
      orphan.lockedBy,
      null,
      "El mensaje entregado quedó bloqueado.",
    );
    reportCheck(
      "un worker que muere a mitad de lote no deja el mensaje detenido: otro lo reclama al vencer el lease",
    );

    // 4. La entrega salió pero el proceso murió antes de confirmarla.
    const [racedId] = await seedMessages(1, now);
    assert.ok(racedId !== undefined);
    const thiefClaimAt = new Date(now.getTime() + leaseMilliseconds + 2_000);
    const robbedTransport = new RecordingTransport({
      // Mientras el primer worker entrega, su lease vence y otro **reclama** el
      // mensaje sin llegar a entregarlo todavía. Así, cuando el primero intenta
      // confirmar, el mensaje sigue en curso pero es de otro: lo único que puede
      // rechazar su confirmación es comprobar de quién es el lease. Si el ladrón
      // entregara entero acá, el estado ya sería «entregado» y la comprobación
      // de dueño nunca se ejercitaría.
      beforeReturn: async (): Promise<void> => {
        const stolen = await repository.claimBatch({
          at: thiefClaimAt.toISOString(),
          leaseExpiresAt: new Date(
            thiefClaimAt.getTime() + leaseMilliseconds,
          ).toISOString(),
          limit: 10,
          workerId: "worker-ladron",
        });
        assert.equal(stolen.length, 1, "El ladrón no llegó a robar el lease.");
      },
    });
    const robbed = new OutboxDispatcherService(
      repository,
      robbedTransport,
      "worker-robado",
    );
    const robbedSummary = await robbed.dispatchBatch(now, 10);
    assert.equal(robbedSummary.delivered, 0, "Confirmó una entrega sin lease.");
    assert.equal(
      robbedSummary.lostLease,
      1,
      "No reconoció que había perdido el lease.",
    );
    assert.equal(robbedTransport.countFor(racedId), 1);
    assert.equal(
      await statusOf(racedId),
      "processing",
      "El mensaje robado no quedó en curso del segundo worker.",
    );

    // El ladrón termina el trabajo: el mensaje se entrega una segunda vez, que
    // es la garantía real —al menos una vez en el transporte— y el motivo de que
    // la orden de publicación sea idempotente.
    const thiefTransport = new RecordingTransport();
    const thief = new OutboxDispatcherService(
      repository,
      thiefTransport,
      "worker-ladron-2",
    );
    const thiefSummary = await thief.dispatchBatch(
      new Date(thiefClaimAt.getTime() + leaseMilliseconds + 1_000),
      10,
    );
    assert.equal(thiefSummary.delivered, 1);
    assert.equal(thiefTransport.countFor(racedId), 1);
    assert.equal(await statusOf(racedId), "delivered");
    reportCheck(
      "si la entrega salió pero se perdió el lease, el worker no la da por buena y el mensaje se entrega de nuevo",
    );

    // 5. Un mensaje que siempre falla termina detenido, no en un bucle.
    const [doomedId] = await seedMessages(1, now);
    assert.ok(doomedId !== undefined);
    const failingTransport = new RecordingTransport({ fail: true });
    const failing = new OutboxDispatcherService(
      repository,
      failingTransport,
      "worker-d",
    );
    let clock = new Date(now.getTime() + 2 * leaseMilliseconds);
    for (
      let attempt = 0;
      attempt <= reliableOperationLimits.outboxAttemptsMaximum;
      attempt += 1
    ) {
      await failing.dispatchBatch(clock, 10);
      if ((await statusOf(doomedId)) === "dead_letter") break;
      clock = new Date(clock.getTime() + 20 * 60_000);
    }
    const doomed = await database.outboxMessage.findUniqueOrThrow({
      select: { attempts: true, lastErrorCode: true, status: true },
      where: { id: doomedId },
    });
    assert.equal(doomed.status, "dead_letter");
    assert.equal(
      doomed.attempts,
      reliableOperationLimits.outboxAttemptsMaximum,
    );
    assert.ok(
      doomed.lastErrorCode !== null,
      "El mensaje detenido no conserva por qué se detuvo.",
    );
    const afterDeadLetter = await failing.dispatchBatch(
      new Date(clock.getTime() + 60 * 60_000),
      10,
    );
    assert.equal(
      afterDeadLetter.claimed,
      0,
      "Un mensaje detenido se volvió a reclamar.",
    );
    reportCheck(
      `un destino que siempre falla se detiene a los ${String(reliableOperationLimits.outboxAttemptsMaximum)} intentos, conserva su error y deja de reclamarse`,
    );

    // 6. Nada quedó colgado.
    const pending = await database.outboxMessage.count({
      where: { status: { in: ["pending", "processing"] } },
    });
    assert.equal(pending, 0, "Quedó trabajo reclamado sin resolver.");
    const delivered = await database.outboxMessage.count({
      where: { status: "delivered" },
    });
    assert.equal(delivered, parallelCount + 2);
    reportCheck("al terminar no queda nada reclamado ni pendiente");

    await database.$disconnect();
    process.stdout.write("E2E de despacho completo.\n");
  } finally {
    if (created) {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
        [databaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
    await adminPool.end();
  }
}

await main();
