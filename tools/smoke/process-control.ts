import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import type { SmokeEnvironment } from "./environment.ts";

/** Los logs de NestJS y Next.js incluyen color; se limpia para poder comparar. */
const ansiPattern = /\u001B\[[0-9;]*m/gu;

type SmokeChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface CompletedProcess {
  readonly exitCode: number | null;
  readonly output: string;
  readonly signal: NodeJS.Signals | null;
}

export interface RunningProcess {
  readonly output: () => string;
  readonly terminate: (
    signal?: NodeJS.Signals,
  ) => Promise<CompletedProcess>;
  readonly waitForOutput: (
    expectedText: string,
    timeoutMs: number,
  ) => Promise<string>;
}

export interface ProcessOptions {
  readonly arguments: readonly string[];
  readonly environment: SmokeEnvironment;
  readonly workingDirectory: string;
}

/**
 * Cada proceso se lanza en su propio grupo (`detached`) para poder detener
 * también a sus hijos. Next.js y NestJS levantan procesos auxiliares que, si
 * quedan vivos, retienen el puerto y contaminan el siguiente escenario.
 */
function spawnProcess(
  options: ProcessOptions,
): SmokeChildProcess {
  return spawn(process.execPath, [...options.arguments], {
    cwd: options.workingDirectory,
    detached: true,
    env: { ...options.environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function killProcessTree(
  child: SmokeChildProcess,
  signal: NodeJS.Signals,
): void {
  const { pid } = child;

  if (pid === undefined) {
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

function collectOutput(child: SmokeChildProcess): () => string {
  let output = "";
  const append = (chunk: Buffer): void => {
    output += chunk.toString("utf8").replace(ansiPattern, "");
  };

  child.stdout.on("data", append);
  child.stderr.on("data", append);

  return () => output;
}

function awaitExit(
  child: SmokeChildProcess,
  readOutput: () => string,
): Promise<CompletedProcess> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      resolve({ exitCode, output: readOutput(), signal });
    });
  });
}

export async function runProcess(
  options: ProcessOptions,
  timeoutMs = 30_000,
): Promise<CompletedProcess> {
  const child = spawnProcess(options);
  const readOutput = collectOutput(child);
  const exitPromise = awaitExit(child, readOutput);

  const timeout = delay(timeoutMs, "timeout" as const);
  const result = await Promise.race([exitPromise, timeout]);

  if (result === "timeout") {
    killProcessTree(child, "SIGKILL");
    throw new Error(
      `El proceso no terminó en ${timeoutMs} ms. Salida:\n${readOutput()}`,
    );
  }

  return result;
}

export function startProcess(options: ProcessOptions): RunningProcess {
  const child = spawnProcess(options);
  const readOutput = collectOutput(child);
  const exitPromise = awaitExit(child, readOutput);
  let exited = false;
  void exitPromise.then(
    () => {
      exited = true;
    },
    () => {
      exited = true;
    },
  );

  return {
    output: readOutput,
    async terminate(signal: NodeJS.Signals = "SIGTERM") {
      if (!exited) {
        killProcessTree(child, signal);
      }

      const result = await Promise.race([
        exitPromise,
        delay(15_000, "timeout" as const),
      ]);

      if (result === "timeout") {
        killProcessTree(child, "SIGKILL");
        throw new Error(
          `El proceso ignoró ${signal}. Salida:\n${readOutput()}`,
        );
      }

      return result;
    },
    async waitForOutput(expectedText: string, timeoutMs: number) {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const output = readOutput();
        if (output.includes(expectedText)) {
          return output;
        }
        if (exited) {
          throw new Error(
            `El proceso terminó antes de emitir "${expectedText}". Salida:\n${output}`,
          );
        }
        await delay(100);
      }

      throw new Error(
        `Tiempo agotado esperando "${expectedText}". Salida:\n${readOutput()}`,
      );
    },
  };
}

export interface HttpProbeResult {
  readonly body: string;
  readonly status: number;
}

export async function requestJson(
  url: string,
  timeoutMs = 5_000,
): Promise<HttpProbeResult> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  return { body: await response.text(), status: response.status };
}

export async function waitForHttp(
  url: string,
  timeoutMs: number,
): Promise<HttpProbeResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "sin respuesta";

  while (Date.now() < deadline) {
    try {
      return await requestJson(url, 2_000);
    } catch (cause: unknown) {
      lastError = cause instanceof Error ? cause.message : "error desconocido";
      await delay(200);
    }
  }

  throw new Error(`${url} no respondió en ${timeoutMs} ms: ${lastError}.`);
}

/**
 * Reserva un puerto libre pidiéndole uno efímero al sistema y liberándolo.
 * Evita colisiones con servicios locales del desarrollador.
 */
export function reserveEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("No se pudo reservar un puerto efímero."));
        return;
      }

      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}
