import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import { Module, type DynamicModule } from "@nestjs/common";

import { DatabaseModule } from "./database/database.module.ts";
import { MediaModule } from "./media/media.module.ts";
import { OutboxModule } from "./outbox/outbox.module.ts";
import { RenderingModule } from "./rendering/rendering.module.ts";
import { StatusModule } from "./status/status.module.ts";

@Module({})
export class WorkerModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    return {
      imports: [
        DatabaseModule.forConfiguration(configuration.databaseUrl),
        MediaModule.forConfiguration(configuration.cloudinary),
        OutboxModule,
        StatusModule.forConfiguration(configuration),
        RenderingModule.forConfiguration(configuration),
      ],
      module: WorkerModule,
    };
  }
}
