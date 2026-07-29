import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaKnowledgeDocumentRepository,
  PrismaMediaAssetRepository,
  PrismaOutboxRepository,
  PrismaPublicationProductionRepository,
} from "@aramayo/database";
import type {
  KnowledgeDocumentRepository,
  MediaAssetRepository,
  OutboxRepository,
  PublicationProductionRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { MEDIA_ASSET_REPOSITORY } from "../media/media.tokens.ts";
import { OUTBOX_REPOSITORY } from "../outbox/outbox.tokens.ts";
import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  PUBLICATION_PRODUCTION_REPOSITORY,
  WORKER_DATABASE_CLIENT,
} from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [
        KNOWLEDGE_DOCUMENT_REPOSITORY,
        MEDIA_ASSET_REPOSITORY,
        OUTBOX_REPOSITORY,
        PUBLICATION_PRODUCTION_REPOSITORY,
      ],
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
          provide: KNOWLEDGE_DOCUMENT_REPOSITORY,
          useFactory: (database: DatabaseClient): KnowledgeDocumentRepository =>
            new PrismaKnowledgeDocumentRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: PUBLICATION_PRODUCTION_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): PublicationProductionRepository =>
            new PrismaPublicationProductionRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: MEDIA_ASSET_REPOSITORY,
          useFactory: (database: DatabaseClient): MediaAssetRepository =>
            new PrismaMediaAssetRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: OUTBOX_REPOSITORY,
          useFactory: (database: DatabaseClient): OutboxRepository =>
            new PrismaOutboxRepository(database),
        },
        DatabaseLifecycleService,
      ],
    };
  }
}
