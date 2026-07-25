import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

/**
 * Ejecuta un comando con el `.env` de la raíz del repositorio cargado.
 *
 * Existe un único archivo de entorno local para panel, API y worker. No se usa
 * `node --env-file` porque Next.js propaga los `execArgv` del proceso padre a
 * sus procesos hijos mediante `NODE_OPTIONS`, donde esa bandera está prohibida.
 *
 * Las variables ya presentes en el entorno tienen precedencia: permite
 * sobrescribir un valor puntual sin editar el archivo.
 */
const environmentFilePath = fileURLToPath(new URL("../.env", import.meta.url));

function readRepositoryEnvironment() {
  try {
    return parseEnv(readFileSync(environmentFilePath, "utf8"));
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return {};
    }

    throw new Error("No se pudo leer el .env de la raíz del repositorio.", {
      cause,
    });
  }
}

const [command, ...commandArguments] = process.argv.slice(2);

if (command === undefined) {
  process.stderr.write(
    "Uso: node tools/run-with-env.mjs <comando> [argumentos...]\n",
  );
  process.exit(1);
}

const child = spawn(command, commandArguments, {
  env: { ...readRepositoryEnvironment(), ...process.env },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (cause) => {
  process.stderr.write(`No se pudo ejecutar ${command}: ${cause.message}\n`);
  process.exit(1);
});

child.on("close", (exitCode, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(exitCode ?? 0);
});
