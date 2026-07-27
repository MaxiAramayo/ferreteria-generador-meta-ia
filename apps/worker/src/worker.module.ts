import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import { Module, type DynamicModule } from "@nestjs/common";

import { RenderingModule } from "./rendering/rendering.module.ts";
import { StatusModule } from "./status/status.module.ts";

@Module({})
export class WorkerModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    return {
      imports: [
        StatusModule.forConfiguration(configuration),
        RenderingModule.forConfiguration(configuration),
      ],
      module: WorkerModule,
    };
  }
}
