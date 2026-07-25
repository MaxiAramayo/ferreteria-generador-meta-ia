import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  apiEnvironment,
  forbiddenClientValues,
  webEnvironment,
  withoutVariable,
  withVariable,
  workerEnvironment,
} from "./environment.ts";
import {
  requestJson,
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type CompletedProcess,
} from "./process-control.ts";
import { scanDirectory } from "./secret-scan.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = join(repositoryDirectory, "apps", "api");
const webDirectory = join(repositoryDirectory, "apps", "web");
const workerDirectory = join(repositoryDirectory, "apps", "worker");
const nextBinary = join("node_modules", "next", "dist", "bin", "next");
const startupTimeoutMs = 30_000;
const buildTimeoutMs = 300_000;

type SmokeTarget = "api" | "web" | "worker";

const smokeTargets: readonly SmokeTarget[] = ["api", "web", "worker"];

function parseTargets(rawTarget: string | undefined): readonly SmokeTarget[] {
  switch (rawTarget) {
    case undefined:
    case "all":
      return smokeTargets;
    case "api":
      return ["api"];
    case "web":
      return ["web"];
    case "worker":
      return ["worker"];
    default:
      throw new Error(
        `Objetivo inválido. Use ${smokeTargets.join(", ")} o all.`,
      );
  }
}

function reportCheck(description: string): void {
  process.stdout.write(`  ok ${description}\n`);
}

function assertBuilt(entryPoint: string, workspace: string): void {
  if (!existsSync(entryPoint)) {
    throw new Error(
      `Falta la compilación de ${workspace}. Ejecutar "pnpm build" antes del smoke.`,
    );
  }
}

/**
 * NestJS reenvía la señal al proceso después de ejecutar los hooks de apagado,
 * así que un cierre ordenado termina por señal y no con código 0.
 */
function assertOrderedShutdown(
  shutdown: CompletedProcess,
  subject: string,
): void {
  assert.ok(
    shutdown.exitCode === 0 || shutdown.signal === "SIGTERM",
    `${subject} debe cerrar de forma ordenada ante SIGTERM (código ${
      shutdown.exitCode ?? "nulo"
    }, señal ${shutdown.signal ?? "ninguna"}).`,
  );
}

function assertWithoutSecrets(source: string, content: string): void {
  for (const forbiddenValue of forbiddenClientValues()) {
    assert.ok(
      !content.includes(forbiddenValue),
      `${source} expone un valor de configuración privado.`,
    );
  }
}

async function smokeApi(): Promise<void> {
  process.stdout.write("apps/api\n");
  assertBuilt(join(apiDirectory, "dist", "main.js"), "@aramayo/api");

  const port = await reserveEphemeralPort();
  const environment = apiEnvironment(port);

  const invalidStart = await runProcess({
    arguments: ["dist/main.js"],
    environment: withoutVariable(environment, "DATABASE_URL"),
    workingDirectory: apiDirectory,
  });

  assert.equal(
    invalidStart.exitCode,
    1,
    "La API debe terminar con código 1 cuando falta una variable.",
  );
  assert.ok(
    invalidStart.output.includes("DATABASE_URL"),
    "El error debe nombrar la variable ausente.",
  );
  assertWithoutSecrets("El error de configuración de la API", invalidStart.output);
  reportCheck(
    "una variable ausente detiene el arranque nombrando DATABASE_URL y sin revelar valores",
  );

  const api = startProcess({
    arguments: ["dist/main.js"],
    environment,
    workingDirectory: apiDirectory,
  });

  try {
    await api.waitForOutput("api.ready", startupTimeoutMs);
    reportCheck("el proceso arranca y valida su configuración");

    const liveness = await waitForHttp(
      `http://127.0.0.1:${port}/health`,
      startupTimeoutMs,
    );
    assert.equal(liveness.status, 200, "Liveness debe responder 200.");
    assert.ok(
      liveness.body.includes('"status":"alive"'),
      "Liveness debe informar el proceso vivo.",
    );
    reportCheck("GET /health responde 200 sin consultar dependencias");

    const readiness = await requestJson(`http://127.0.0.1:${port}/ready`);
    assert.equal(
      readiness.status,
      503,
      "Readiness debe responder 503 con dependencias caídas.",
    );
    assert.ok(
      readiness.body.includes('"status":"not_ready"'),
      "Readiness debe informar el estado agregado.",
    );
    for (const dependency of ['"dependency":"postgres"', '"dependency":"redis"']) {
      assert.ok(
        readiness.body.includes(dependency),
        `Readiness debe informar ${dependency}.`,
      );
    }
    assert.ok(
      !readiness.body.includes('"status":"up"'),
      "Ninguna dependencia inalcanzable puede informarse disponible.",
    );
    assertWithoutSecrets("La respuesta de readiness", readiness.body);
    reportCheck(
      "GET /ready responde 503 con PostgreSQL y Redis no disponibles y sin credenciales",
    );

    const shutdown = await api.terminate();
    assertOrderedShutdown(shutdown, "La API");
    assert.ok(
      shutdown.output.includes("api.stopped señal=SIGTERM"),
      "El cierre ordenado debe quedar registrado.",
    );
    reportCheck("SIGTERM ejecuta los hooks de apagado y detiene el proceso");
  } finally {
    await api.terminate("SIGKILL").catch(() => undefined);
  }
}

async function smokeWorker(): Promise<void> {
  process.stdout.write("apps/worker\n");
  assertBuilt(join(workerDirectory, "dist", "main.js"), "@aramayo/worker");

  const environment = workerEnvironment();

  const invalidStart = await runProcess({
    arguments: ["dist/main.js"],
    environment: withVariable(environment, "WORKER_CONCURRENCY", "cuatro"),
    workingDirectory: workerDirectory,
  });

  assert.equal(
    invalidStart.exitCode,
    1,
    "El worker debe terminar con código 1 ante un formato inválido.",
  );
  assert.ok(
    invalidStart.output.includes("WORKER_CONCURRENCY"),
    "El error debe nombrar la variable inválida.",
  );
  assert.ok(
    !invalidStart.output.includes("cuatro"),
    "El error no debe incluir el valor recibido.",
  );
  assertWithoutSecrets(
    "El error de configuración del worker",
    invalidStart.output,
  );
  reportCheck(
    "un formato inválido detiene el arranque nombrando WORKER_CONCURRENCY sin revelar el valor",
  );

  const worker = startProcess({
    arguments: ["dist/main.js"],
    environment,
    workingDirectory: workerDirectory,
  });

  try {
    const readyOutput = await worker.waitForOutput(
      "worker.ready",
      startupTimeoutMs,
    );
    assert.ok(
      readyOutput.includes("dependencias=postgres:down,redis:down"),
      "El worker debe reportar el estado real de sus dependencias.",
    );
    assert.ok(
      readyOutput.includes("concurrencia=4"),
      "El worker debe reportar su concurrencia configurada.",
    );
    assertWithoutSecrets("El reporte de estado del worker", readyOutput);
    reportCheck(
      "el worker arranca, reporta estado y no procesa trabajo simulado",
    );

    const shutdown = await worker.terminate();
    assertOrderedShutdown(shutdown, "El worker");
    assert.ok(
      shutdown.output.includes("worker.stopped señal=SIGTERM"),
      "El cierre ordenado debe quedar registrado.",
    );
    reportCheck("SIGTERM detiene el reporte de estado y cierra el proceso");
  } finally {
    await worker.terminate("SIGKILL").catch(() => undefined);
  }
}

async function smokeWeb(): Promise<void> {
  process.stdout.write("apps/web\n");

  const webPort = await reserveEphemeralPort();
  const unreachableApiPort = await reserveEphemeralPort();
  const environment = webEnvironment(
    webPort,
    `https://127.0.0.1:${unreachableApiPort}`,
  );

  const build = await runProcess(
    {
      arguments: [nextBinary, "build"],
      environment,
      workingDirectory: webDirectory,
    },
    buildTimeoutMs,
  );
  assert.equal(
    build.exitCode,
    0,
    `El build del panel falló:\n${build.output}`,
  );
  reportCheck("el panel compila con la configuración del proceso presente");

  const clientFindings = await scanDirectory(
    join(webDirectory, ".next", "static"),
    forbiddenClientValues(),
  );
  assert.deepEqual(
    clientFindings,
    [],
    "El bundle del cliente no puede contener configuración privada.",
  );
  reportCheck("el bundle del cliente no contiene secretos de la plataforma");

  const web = startProcess({
    arguments: [nextBinary, "start"],
    environment,
    workingDirectory: webDirectory,
  });

  try {
    const page = await waitForHttp(
      `http://127.0.0.1:${webPort}/`,
      startupTimeoutMs,
    );
    assert.equal(page.status, 200, "El panel debe responder 200.");
    assert.ok(
      page.body.includes("Aramayo Content Platform"),
      "El panel debe renderizar su estado inicial.",
    );
    assert.ok(
      page.body.includes("Inalcanzable"),
      "El panel debe representar explícitamente una API inalcanzable.",
    );
    assertWithoutSecrets("El HTML servido por el panel", page.body);
    reportCheck(
      "el panel renderiza su estado inicial y representa la API inalcanzable",
    );

    await web.terminate();
  } finally {
    await web.terminate("SIGKILL").catch(() => undefined);
  }

  const blockedPort = await reserveEphemeralPort();
  const rejectedPublicVariable = startProcess({
    arguments: [nextBinary, "start"],
    environment: withVariable(
      webEnvironment(blockedPort, `https://127.0.0.1:${unreachableApiPort}`),
      "NEXT_PUBLIC_SECRETO_FALSO",
      "valor-no-declarado",
    ),
    workingDirectory: webDirectory,
  });

  try {
    const blockedPage = await waitForHttp(
      `http://127.0.0.1:${blockedPort}/`,
      startupTimeoutMs,
    );
    assert.equal(
      blockedPage.status,
      500,
      "Una variable pública no declarada no puede servir contenido.",
    );

    const output = rejectedPublicVariable.output();
    assert.ok(
      output.includes("NEXT_PUBLIC_SECRETO_FALSO"),
      "El error debe nombrar la variable rechazada.",
    );
    assert.ok(
      !output.includes("valor-no-declarado"),
      "El error no debe incluir el valor recibido.",
    );
    reportCheck(
      "una variable NEXT_PUBLIC_ no declarada impide servir el panel y sólo se registra su nombre",
    );
  } finally {
    await rejectedPublicVariable.terminate().catch(() => undefined);
  }
}

const smokeRunners: Readonly<Record<SmokeTarget, () => Promise<void>>> =
  Object.freeze({
    api: smokeApi,
    web: smokeWeb,
    worker: smokeWorker,
  });

try {
  const targets = parseTargets(process.argv[2]);

  for (const target of targets) {
    await smokeRunners[target]();
  }

  process.stdout.write(`Smoke completo: ${targets.join(", ")}.\n`);
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Smoke fallido: ${message}\n`);
  process.exitCode = 1;
}
