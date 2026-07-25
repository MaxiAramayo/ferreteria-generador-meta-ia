import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import {
  createPostgresProbe,
  createRedisProbe,
  type DependencyProbe,
} from "@aramayo/process-health";
import { Module, type DynamicModule } from "@nestjs/common";

import { DEPENDENCY_PROBES, WORKER_CONFIGURATION } from "./status.tokens.ts";
import { WorkerStatusService } from "./worker-status.service.ts";

@Module({})
export class StatusModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    const probes: readonly DependencyProbe[] = Object.freeze([
      createPostgresProbe(configuration.databaseUrl.reveal()),
      createRedisProbe(configuration.redisUrl.reveal()),
    ]);

    return {
      module: StatusModule,
      providers: [
        WorkerStatusService,
        { provide: DEPENDENCY_PROBES, useValue: probes },
        { provide: WORKER_CONFIGURATION, useValue: configuration },
      ],
    };
  }
}
