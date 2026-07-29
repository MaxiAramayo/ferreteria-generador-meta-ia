import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaApprovalSnapshotRepository,
  PrismaIdentityRepository,
  PrismaMediaAssetRepository,
  PrismaOrganizationConfigurationRepository,
  PrismaPublicationDraftRepository,
  PrismaPublicationRepository,
  PrismaPublicationStateRepository,
} from "@aramayo/database";
import type {
  ApprovalSnapshotRepository,
  IdentityRepository,
  MediaAssetRepository,
  OrganizationConfigurationRepository,
  PublicationDraftRepository,
  PublicationRepository,
  PublicationStateRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import {
  APPROVAL_SNAPSHOT_REPOSITORY,
  DATABASE_CLIENT,
  IDENTITY_REPOSITORY,
  MEDIA_ASSET_REPOSITORY,
  ORGANIZATION_CONFIGURATION_REPOSITORY,
  PUBLICATION_DRAFT_REPOSITORY,
  PUBLICATION_REPOSITORY,
  PUBLICATION_STATE_REPOSITORY,
} from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [
        APPROVAL_SNAPSHOT_REPOSITORY,
        IDENTITY_REPOSITORY,
        MEDIA_ASSET_REPOSITORY,
        ORGANIZATION_CONFIGURATION_REPOSITORY,
        PUBLICATION_DRAFT_REPOSITORY,
        PUBLICATION_REPOSITORY,
        PUBLICATION_STATE_REPOSITORY,
      ],
      global: true,
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE_CLIENT,
          useFactory: (): DatabaseClient =>
            createDatabaseClient(databaseUrl.reveal()),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: PUBLICATION_DRAFT_REPOSITORY,
          useFactory: (database: DatabaseClient): PublicationDraftRepository =>
            new PrismaPublicationDraftRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: IDENTITY_REPOSITORY,
          useFactory: (database: DatabaseClient): IdentityRepository =>
            new PrismaIdentityRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: PUBLICATION_REPOSITORY,
          useFactory: (database: DatabaseClient): PublicationRepository =>
            new PrismaPublicationRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: ORGANIZATION_CONFIGURATION_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): OrganizationConfigurationRepository =>
            new PrismaOrganizationConfigurationRepository(database),
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
