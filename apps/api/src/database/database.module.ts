import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaApprovalSnapshotRepository,
  PrismaMediaAssetRepository,
  PrismaPublicationRepository,
  PrismaPublicationStateRepository,
} from "@aramayo/database";
import type {
  ApprovalSnapshotRepository,
  MediaAssetRepository,
  PublicationRepository,
  PublicationStateRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import {
  APPROVAL_SNAPSHOT_REPOSITORY,
  DATABASE_CLIENT,
  MEDIA_ASSET_REPOSITORY,
  PUBLICATION_REPOSITORY,
  PUBLICATION_STATE_REPOSITORY,
} from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [
        APPROVAL_SNAPSHOT_REPOSITORY,
        MEDIA_ASSET_REPOSITORY,
        PUBLICATION_REPOSITORY,
        PUBLICATION_STATE_REPOSITORY,
      ],
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_CLIENT,
          useFactory: (): DatabaseClient =>
            createDatabaseClient(databaseUrl.reveal()),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: PUBLICATION_REPOSITORY,
          useFactory: (database: DatabaseClient): PublicationRepository =>
            new PrismaPublicationRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: APPROVAL_SNAPSHOT_REPOSITORY,
          useFactory: (database: DatabaseClient): ApprovalSnapshotRepository =>
            new PrismaApprovalSnapshotRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: MEDIA_ASSET_REPOSITORY,
          useFactory: (database: DatabaseClient): MediaAssetRepository =>
            new PrismaMediaAssetRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: PUBLICATION_STATE_REPOSITORY,
          useFactory: (database: DatabaseClient): PublicationStateRepository =>
            new PrismaPublicationStateRepository(database),
        },
        DatabaseLifecycleService,
      ],
    };
  }
}
