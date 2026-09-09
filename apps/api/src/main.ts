import "reflect-metadata";

import { ConfigurationError } from "@aramayo/configuration";
import {
  parseApiEnvironment,
  type ApiConfiguration,
} from "@aramayo/configuration/api";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.ts";
import { apiLog } from "./observability/api-log.ts";
import { createCorrelationMiddleware } from "./observability/correlation.middleware.ts";
import { StructuredNestLogger } from "./observability/structured-nest-logger.ts";

/**
 * Primera operación del proceso: sin configuración válida no se crea la
 * aplicación ni se abre el puerto. El mensaje del error nombra variables y
 * códigos, nunca valores.
 */
function readConfiguration(): ApiConfiguration {
  try {
    return parseApiEnvironment(process.env);
  } catch (cause: unknown) {
    if (cause instanceof ConfigurationError) {
      apiLog.emit({
        detail: { message: cause.message },
        event: "api.configuration.rejected",
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
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule.forConfiguration(configuration),
    { logger: new StructuredNestLogger(apiLog) },
  );

  application.set("trust proxy", configuration.trustProxyHops);
  // Antes que CORS y que los guards: un preflight rechazado y un 401 también
  // pertenecen a la solicitud que los provocó.
  application.use(createCorrelationMiddleware(apiLog));
  application.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: configuration.webOrigin,
  });
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  application.enableShutdownHooks();

  await application.listen(configuration.port);

  apiLog.emit({
    detail: {
      environment: configuration.environment,
      meta: configuration.meta.enabled ? "habilitada" : "deshabilitada",
      port: configuration.port,
      timeZone: configuration.timeZone,
    },
    event: "api.ready",
    outcome: "success",
  });
}

try {
  await bootstrap();
} catch (cause: unknown) {
  apiLog.emit({
    detail: {
      message:
        cause instanceof Error
          ? cause.message
          : "Fallo desconocido de arranque.",
    },
    event: "api.start.failed",
    level: "error",
    outcome: "failure",
  });
  process.exit(1);
}
