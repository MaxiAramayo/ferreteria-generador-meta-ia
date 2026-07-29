import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaMediaAssetRepository,
} from "@aramayo/database";
import type { MediaAssetRepository } from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { MEDIA_ASSET_REPOSITORY } from "../media/media.tokens.ts";
import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import { WORKER_DATABASE_CLIENT } from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [MEDIA_ASSET_REPOSITORY],
      global: true,
      module: DatabaseModule,
      providers: [
        {
          provide: WORKER_DATABASE_CLIENT,
          useFactory: (): DatabaseClient =>
            createDatabaseClient(databaseUrl.reveal()),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: MEDIA_ASSET_REPOSITORY,
          useFactory: (database: DatabaseClient): MediaAssetRepository =>
            new PrismaMediaAssetRepository(database),
        },
        DatabaseLifecycleService,
      ],
    };
  }
}
