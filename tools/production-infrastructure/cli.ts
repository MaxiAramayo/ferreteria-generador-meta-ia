import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildProductionComposeArguments,
  parseProductionInfrastructureCommand,
  type ProductionInfrastructureCommand,
} from "./command.ts";
import { assertProductionComposeConfiguration } from "./validator.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const environmentFilePath = fileURLToPath(
  new URL("../../infrastructure/production/.env.example", import.meta.url),
);
const composeFilePath = fileURLToPath(
  new URL("../../infrastructure/production/compose.yaml", import.meta.url),
);
const composeBuildFilePath = fileURLToPath(
  new URL(
    "../../infrastructure/production/compose.build.yaml",
    import.meta.url,
  ),
);
const caddyFilePath = fileURLToPath(
  new URL("../../infrastructure/production/Caddyfile", import.meta.url),
);
const caddyImage =
  "caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648";

const validationEnvironment = Object.freeze({
  ACME_EMAIL: "operator@example.invalid",
  API_DOMAIN: "api.content.ferreteriaaramayo.com.ar",
  APP_TIMEZONE: "America/Argentina/Cordoba",
  AUTH_SESSION_TTL_SECONDS: "43200",
  BUILD_DATE: "2026-07-29T00:00:00Z",
  COMPOSE_PROJECT_NAME: "aramayo-content-production-validation",
  IMAGE_REGISTRY: "local.invalid/aramayo",
  IMAGE_TAG: "validation-commit",
  NODE_ENV: "production",
  POSTGRES_DB: "aramayo_content",
  POSTGRES_PASSWORD: "validation-postgres-password",
  POSTGRES_USER: "aramayo",
  REDIS_PASSWORD: "validation-redis-password",
  TOKEN_ENCRYPTION_KEYS: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  WEB_DOMAIN: "content.ferreteriaaramayo.com.ar",
  WORKER_CONCURRENCY: "1",
});

function runDocker(
  dockerArguments: readonly string[],
  captureOutput = false,
): string {
  const result = spawnSync("docker", dockerArguments, {
    cwd: repositoryDirectory,
    encoding: "utf8",
    env: { ...process.env, ...validationEnvironment },
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error("No se pudo ejecutar Docker.", { cause: result.error });
  }
  if (result.status !== 0) {
    const diagnostic = captureOutput
      ? result.stderr.trim() || result.stdout.trim()
      : "";
    throw new Error(
      diagnostic
        ? `Docker terminó con error: ${diagnostic}`
        : `Docker terminó con código ${result.status ?? "desconocido"}.`,
    );
  }
  return captureOutput ? result.stdout.trim() : "";
}

function composeArguments(composeArgumentsValue: readonly string[]): string[] {
  return buildProductionComposeArguments(
    environmentFilePath,
    [composeFilePath, composeBuildFilePath],
    composeArgumentsValue,
  );
}

function validateCompose(): void {
  const configurationJson = runDocker(
    composeArguments(["config", "--format", "json"]),
    true,
  );
  assertProductionComposeConfiguration(JSON.parse(configurationJson));
  process.stdout.write(
    "Compose válido: sólo Caddy publica puertos y backend permanece privado.\n",
  );
}

function validateCaddy(): void {
  runDocker([
    "run",
    "--rm",
    "--env",
    `ACME_EMAIL=${validationEnvironment.ACME_EMAIL}`,
    "--env",
    `API_DOMAIN=${validationEnvironment.API_DOMAIN}`,
    "--env",
    `WEB_DOMAIN=${validationEnvironment.WEB_DOMAIN}`,
    "--volume",
    `${caddyFilePath}:/etc/caddy/Caddyfile:ro`,
    caddyImage,
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
  process.stdout.write("Caddyfile válido.\n");
}

function smokeContainers(): void {
  let failure: unknown;
  try {
    runDocker(
      composeArguments([
        "up",
        "--detach",
        "--wait",
        "--wait-timeout",
        "180",
        "postgres",
        "redis",
        "migrate",
        "api",
        "worker",
        "web",
      ]),
    );
    runDocker(
      composeArguments([
        "exec",
        "-T",
        "api",
        "node",
        "-e",
        "fetch('http://127.0.0.1:3001/ready').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))",
      ]),
    );
    runDocker(
      composeArguments([
        "exec",
        "-T",
        "web",
        "node",
        "-e",
        "fetch('http://127.0.0.1:3000/').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))",
      ]),
    );
    runDocker(
      composeArguments([
        "exec",
        "-T",
        "worker",
        "node",
        "-e",
        "const {chromium}=await import('playwright-core');const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});const page=await browser.newPage();await page.setContent('<p>aramayo-smoke</p>');const png=await page.screenshot();await browser.close();if(png.length<100)process.exit(1)",
      ]),
    );
    process.stdout.write(
      "Contenedores válidos: migración, readiness, web y Chromium verificados.\n",
    );
  } catch (cause: unknown) {
    failure = cause;
    try {
      runDocker(
        composeArguments([
          "logs",
          "--no-color",
          "--tail",
          "100",
          "migrate",
          "api",
          "worker",
          "web",
        ]),
      );
    } catch (logCause: unknown) {
      const logMessage =
        logCause instanceof Error
          ? logCause.message
          : "Error desconocido al leer logs.";
      process.stderr.write(
        `No se pudieron recopilar los logs del smoke fallido: ${logMessage}\n`,
      );
    }
  }

  try {
    runDocker(
      composeArguments([
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        "30",
      ]),
    );
    process.stdout.write(
      "Recursos efímeros de validación eliminados; no se tocaron datos reales.\n",
    );
  } catch (cleanupCause: unknown) {
    if (failure === undefined) {
      failure = cleanupCause;
    } else {
      const cleanupMessage =
        cleanupCause instanceof Error
          ? cleanupCause.message
          : "Error desconocido de limpieza.";
      process.stderr.write(
        `Además falló la limpieza del proyecto local de validación: ${cleanupMessage}\n`,
      );
    }
  }

  if (failure !== undefined) {
    throw failure instanceof Error
      ? failure
      : new Error("El smoke de contenedores falló.", { cause: failure });
  }
}

function executeCommand(command: ProductionInfrastructureCommand): void {
  switch (command) {
    case "build":
      validateCompose();
      runDocker(composeArguments(["build", "--pull"]));
      process.stdout.write("Imágenes de producción construidas localmente.\n");
      return;
    case "caddy":
      validateCaddy();
      return;
    case "config":
      validateCompose();
      return;
    case "smoke":
      validateCompose();
      smokeContainers();
      return;
    case "verify":
      validateCompose();
      validateCaddy();
  }
}

try {
  executeCommand(parseProductionInfrastructureCommand(process.argv[2]));
} catch (cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Error desconocido.";
  process.stderr.write(`Infraestructura de producción: ${message}\n`);
  process.exitCode = 1;
}
