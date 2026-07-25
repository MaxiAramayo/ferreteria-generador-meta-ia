import type { ApiConfiguration } from "@aramayo/configuration/api";
import {
  createPostgresProbe,
  createRedisProbe,
  type DependencyProbe,
} from "@aramayo/process-health";
import { Module, type DynamicModule } from "@nestjs/common";

import { HealthController } from "./health.controller.ts";
import { DEPENDENCY_PROBES } from "./health.tokens.ts";
import { ProcessHealthService } from "./process-health.service.ts";

@Module({})
export class HealthModule {
  /**
   * Único punto donde se revelan las cadenas de conexión: las sondas reciben
   * texto plano y el resto de la aplicación sigue viendo `SecretValue`.
   */
  static forConfiguration(configuration: ApiConfiguration): DynamicModule {
    const probes: readonly DependencyProbe[] = Object.freeze([
      createPostgresProbe(configuration.databaseUrl.reveal()),
      createRedisProbe(configuration.redisUrl.reveal()),
    ]);

    return {
      controllers: [HealthController],
      module: HealthModule,
      providers: [
        ProcessHealthService,
        { provide: DEPENDENCY_PROBES, useValue: probes },
      ],
    };
  }
}
