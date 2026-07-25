import "reflect-metadata";

import { ConfigurationError } from "@aramayo/configuration";
import {
  parseWorkerEnvironment,
  type WorkerConfiguration,
} from "@aramayo/configuration/worker";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module.ts";

const bootstrapLogger = new Logger("worker");

/**
 * El worker valida su configuración antes de crear el contexto de aplicación:
 * un proceso sin credenciales completas no debe quedar vivo esperando trabajo.
 */
function readConfiguration(): WorkerConfiguration {
  try {
    return parseWorkerEnvironment(process.env);
  } catch (cause: unknown) {
    if (cause instanceof ConfigurationError) {
      bootstrapLogger.error(cause.message);
      process.exit(1);
    }

    throw cause;
  }
}

async function bootstrap(): Promise<void> {
  const configuration = readConfiguration();
  const application = await NestFactory.createApplicationContext(
    WorkerModule.forConfiguration(configuration),
  );

  application.enableShutdownHooks();
}

try {
  await bootstrap();
} catch (cause: unknown) {
  bootstrapLogger.error(
    cause instanceof Error ? cause.message : "Fallo desconocido de arranque.",
  );
  process.exit(1);
}
