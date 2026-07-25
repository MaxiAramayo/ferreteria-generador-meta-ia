import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  assertCleanupConfirmation,
  buildComposeArguments,
  localComposeProjectName,
  parseInfrastructureCommand,
  type InfrastructureCommand,
} from "./command.ts";
import { verifyLocalInfrastructureConnectivity } from "./connectivity.ts";
import { readLocalInfrastructureEnvironment } from "./environment.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const environmentFilePath = fileURLToPath(
  new URL("../../.env", import.meta.url),
);
const composeFilePath = fileURLToPath(
  new URL("../../infrastructure/local/compose.yaml", import.meta.url),
);

function runDocker(
  dockerArguments: readonly string[],
  options: { readonly captureOutput?: boolean } = {},
): string {
  const result = spawnSync("docker", dockerArguments, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error("No se pudo ejecutar Docker.", { cause: result.error });
  }
  if (result.status !== 0) {
    const diagnostic = options.captureOutput
      ? result.stderr.trim() || result.stdout.trim()
      : "";
    throw new Error(
      diagnostic
        ? `Docker terminó con error: ${diagnostic}`
        : `Docker terminó con código ${result.status ?? "desconocido"}.`,
    );
  }

  return options.captureOutput ? result.stdout.trim() : "";
}

function runCompose(composeArguments: readonly string[]): void {
  runDocker(
    buildComposeArguments(
      environmentFilePath,
      composeFilePath,
      composeArguments,
    ),
  );
}

function assertProjectVolumesRemoved(): void {
  const remainingVolumes = runDocker(
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${localComposeProjectName}`,
      "--quiet",
    ],
    { captureOutput: true },
  );
  if (remainingVolumes.length > 0) {
    throw new Error(
      "Docker conserva volúmenes del proyecto local después de la limpieza.",
    );
  }
}

async function checkConnectivity(): Promise<void> {
  const environment =
    await readLocalInfrastructureEnvironment(environmentFilePath);
  await verifyLocalInfrastructureConnectivity(environment);
  process.stdout.write(
    "PostgreSQL y Redis aceptan conexiones autenticadas en loopback.\n",
  );
}

async function executeCommand(
  command: InfrastructureCommand,
  argumentsAfterCommand: readonly string[],
): Promise<void> {
  if (command === "clean") {
    assertCleanupConfirmation(argumentsAfterCommand);
  }

  await readLocalInfrastructureEnvironment(environmentFilePath);

  switch (command) {
    case "config":
      runCompose(["config", "--quiet"]);
      process.stdout.write("Configuración local válida.\n");
      return;
    case "up":
      runCompose(["config", "--quiet"]);
      runCompose(["up", "--detach", "--wait", "--wait-timeout", "90"]);
      await checkConnectivity();
      return;
    case "down":
      runCompose(["down", "--remove-orphans"]);
      process.stdout.write("Servicios detenidos; volúmenes preservados.\n");
      return;
    case "restart":
      runCompose(["restart"]);
      runCompose(["up", "--detach", "--wait", "--wait-timeout", "90"]);
      await checkConnectivity();
      return;
    case "health":
      runCompose(["ps"]);
      await checkConnectivity();
      return;
    case "clean":
      process.stdout.write(
        `Eliminando contenedores y volúmenes de ${localComposeProjectName}.\n`,
      );
      runCompose(["down", "--volumes", "--remove-orphans"]);
      assertProjectVolumesRemoved();
      process.stdout.write("Recursos locales del proyecto eliminados.\n");
  }
}

try {
  const command = parseInfrastructureCommand(process.argv[2]);
  await executeCommand(command, process.argv.slice(3));
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Infraestructura local: ${message}\n`);
  process.exitCode = 1;
}
