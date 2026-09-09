import "reflect-metadata";

import { ConfigurationError } from "@aramayo/configuration";
import {
  parseWorkerEnvironment,
  type WorkerConfiguration,
} from "@aramayo/configuration/worker";
import { NestFactory } from "@nestjs/core";

import { workerLog } from "./observability/worker-log.ts";
import { StructuredNestLogger } from "./observability/structured-nest-logger.ts";
import { WorkerModule } from "./worker.module.ts";

/**
 * El worker valida su configuración antes de crear el contexto de aplicación:
 * un proceso sin credenciales completas no debe quedar vivo esperando trabajo.
 */
function readConfiguration(): WorkerConfiguration {
  try {
    return parseWorkerEnvironment(process.env);
  } catch (cause: unknown) {
    if (cause instanceof ConfigurationError) {
      workerLog.emit({
        detail: { message: cause.message },
        event: "worker.configuration.rejected",
        level: "error",
        outcome: "failure",
      });
      process.exit(1);
    }

    throw cause;
  }
}

async function bootstrap(): Promise<void> {
  const configuration = readConfiguration();
  const application = await NestFactory.createApplicationContext(
    WorkerModule.forConfiguration(configuration),
    { logger: new StructuredNestLogger(workerLog) },
  );

  application.enableShutdownHooks();
}

try {
  await bootstrap();
} catch (cause: unknown) {
  workerLog.emit({
    detail: {
      message:
        cause instanceof Error
          ? cause.message
          : "Fallo desconocido de arranque.",
    },
    event: "worker.start.failed",
    level: "error",
    outcome: "failure",
  });
  process.exit(1);
}
