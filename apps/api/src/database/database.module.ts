import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaApprovalSnapshotRepository,
  PrismaContentBriefRequestRepository,
  PrismaContentBriefRunRepository,
  PrismaIdentityRepository,
  PrismaMediaAssetRepository,
  PrismaOrganizationConfigurationRepository,
  PrismaPublicationDraftRepository,
  PrismaPublicationProductionRepository,
  PrismaPublicationRepository,
  PrismaPublicationStateRepository,
  PrismaReliableOperationRepository,
} from "@aramayo/database";
import type {
  ApprovalSnapshotRepository,
  ContentBriefRequestRepository,
  ContentBriefRunRepository,
  IdentityRepository,
  MediaAssetRepository,
  OrganizationConfigurationRepository,
  PublicationDraftRepository,
  PublicationProductionRepository,
  PublicationRepository,
  PublicationStateRepository,
  ReliableOperationRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import {
  APPROVAL_SNAPSHOT_REPOSITORY,
  CONTENT_BRIEF_REQUEST_REPOSITORY,
  CONTENT_BRIEF_RUN_REPOSITORY,
  DATABASE_CLIENT,
  IDENTITY_REPOSITORY,
  MEDIA_ASSET_REPOSITORY,
  ORGANIZATION_CONFIGURATION_REPOSITORY,
  PUBLICATION_DRAFT_REPOSITORY,
  PUBLICATION_PRODUCTION_REPOSITORY,
  PUBLICATION_REPOSITORY,
  PUBLICATION_STATE_REPOSITORY,
  RELIABLE_OPERATION_REPOSITORY,
} from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [
        APPROVAL_SNAPSHOT_REPOSITORY,
        CONTENT_BRIEF_REQUEST_REPOSITORY,
        CONTENT_BRIEF_RUN_REPOSITORY,
        IDENTITY_REPOSITORY,
        MEDIA_ASSET_REPOSITORY,
        ORGANIZATION_CONFIGURATION_REPOSITORY,
        PUBLICATION_DRAFT_REPOSITORY,
        PUBLICATION_PRODUCTION_REPOSITORY,
        PUBLICATION_REPOSITORY,
        PUBLICATION_STATE_REPOSITORY,
        RELIABLE_OPERATION_REPOSITORY,
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
          provide: PUBLICATION_PRODUCTION_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): PublicationProductionRepository =>
            new PrismaPublicationProductionRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: RELIABLE_OPERATION_REPOSITORY,
          useFactory: (database: DatabaseClient): ReliableOperationRepository =>
            new PrismaReliableOperationRepository(database),
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
        {
          inject: [DATABASE_CLIENT],
          provide: CONTENT_BRIEF_REQUEST_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): ContentBriefRequestRepository =>
            new PrismaContentBriefRequestRepository(database),
        },
        {
          inject: [DATABASE_CLIENT],
          provide: CONTENT_BRIEF_RUN_REPOSITORY,
          useFactory: (database: DatabaseClient): ContentBriefRunRepository =>
            new PrismaContentBriefRunRepository(database),
        },
        DatabaseLifecycleService,
      ],
    };
  }
}
