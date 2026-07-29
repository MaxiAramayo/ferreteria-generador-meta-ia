import "reflect-metadata";

import { ConfigurationError } from "@aramayo/configuration";
import {
  parseApiEnvironment,
  type ApiConfiguration,
} from "@aramayo/configuration/api";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.ts";

const bootstrapLogger = new Logger("api");

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
      bootstrapLogger.error(cause.message);
      process.exit(1);
    }

    throw cause;
  }
}

async function bootstrap(): Promise<void> {
  const configuration = readConfiguration();
  const application = await NestFactory.create<NestExpressApplication>(
    AppModule.forConfiguration(configuration),
  );

  application.set("trust proxy", configuration.trustProxyHops);
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

  bootstrapLogger.log(
    `api.ready puerto=${configuration.port} ambiente=${configuration.environment} zona=${configuration.timeZone} meta=${configuration.meta.enabled ? "habilitada" : "deshabilitada"}`,
  );
}

try {
  await bootstrap();
} catch (cause: unknown) {
  bootstrapLogger.error(
    cause instanceof Error ? cause.message : "Fallo desconocido de arranque.",
  );
  process.exit(1);
}
