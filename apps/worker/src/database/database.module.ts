import type { SecretValue } from "@aramayo/configuration";
import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaCommercialToolAuditRepository,
  PrismaContentBriefRunRepository,
  PrismaGenerationRunRepository,
  PrismaGenerationPolicyRepository,
  PrismaGenerationAttemptLedgerRepository,
  PrismaKnowledgeDocumentRepository,
  PrismaMediaAssetRepository,
  PrismaOutboxRepository,
  PrismaMetaConnectionRepository,
  PrismaPublicationOrderRepository,
  PrismaPublicationProductionRepository,
  PrismaPublicationScheduleDispatchRepository,
} from "@aramayo/database";
import type {
  CommercialToolAuditPort,
  ContentBriefRunRepository,
  GenerationRunRepository,
  GenerationPolicyRepository,
  GenerationAttemptLedgerRepository,
  KnowledgeDocumentRepository,
  MediaAssetRepository,
  MetaConnectionRepository,
  OutboxRepository,
  PublicationProductionRepository,
  PublicationScheduleDispatchRepository,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { MEDIA_ASSET_REPOSITORY } from "../media/media.tokens.ts";
import { OUTBOX_REPOSITORY } from "../outbox/outbox.tokens.ts";
import { DatabaseLifecycleService } from "./database-lifecycle.service.ts";
import {
  COMMERCIAL_TOOL_AUDIT_REPOSITORY,
  CONTENT_BRIEF_RUN_REPOSITORY,
  GENERATION_RUN_REPOSITORY,
  GENERATION_POLICY_REPOSITORY,
  GENERATION_ATTEMPT_LEDGER_REPOSITORY,
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  META_CONNECTION_REPOSITORY,
  PUBLICATION_ORDER_REPOSITORY,
  PUBLICATION_PRODUCTION_REPOSITORY,
  PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY,
  WORKER_DATABASE_CLIENT,
} from "./database.tokens.ts";

@Module({})
export class DatabaseModule {
  static forConfiguration(databaseUrl: SecretValue): DynamicModule {
    return {
      exports: [
        COMMERCIAL_TOOL_AUDIT_REPOSITORY,
        CONTENT_BRIEF_RUN_REPOSITORY,
        GENERATION_RUN_REPOSITORY,
        GENERATION_POLICY_REPOSITORY,
        GENERATION_ATTEMPT_LEDGER_REPOSITORY,
        KNOWLEDGE_DOCUMENT_REPOSITORY,
        MEDIA_ASSET_REPOSITORY,
        META_CONNECTION_REPOSITORY,
        OUTBOX_REPOSITORY,
        PUBLICATION_ORDER_REPOSITORY,
        PUBLICATION_PRODUCTION_REPOSITORY,
        PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY,
      ],
      global: true,
      module: DatabaseModule,
      providers: [
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: GENERATION_POLICY_REPOSITORY,
          useFactory: (database: DatabaseClient): GenerationPolicyRepository =>
            new PrismaGenerationPolicyRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: GENERATION_ATTEMPT_LEDGER_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): GenerationAttemptLedgerRepository =>
            new PrismaGenerationAttemptLedgerRepository(database),
        },
        {
          provide: WORKER_DATABASE_CLIENT,
          useFactory: (): DatabaseClient =>
            createDatabaseClient(databaseUrl.reveal()),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: COMMERCIAL_TOOL_AUDIT_REPOSITORY,
          useFactory: (database: DatabaseClient): CommercialToolAuditPort =>
            new PrismaCommercialToolAuditRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: CONTENT_BRIEF_RUN_REPOSITORY,
          useFactory: (database: DatabaseClient): ContentBriefRunRepository =>
            new PrismaContentBriefRunRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: GENERATION_RUN_REPOSITORY,
          useFactory: (database: DatabaseClient): GenerationRunRepository =>
            new PrismaGenerationRunRepository(database),
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
          provide: META_CONNECTION_REPOSITORY,
          useFactory: (database: DatabaseClient): MetaConnectionRepository =>
            new PrismaMetaConnectionRepository(database),
        },
        {
          inject: [WORKER_DATABASE_CLIENT],
          provide: PUBLICATION_SCHEDULE_DISPATCH_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): PublicationScheduleDispatchRepository =>
            new PrismaPublicationScheduleDispatchRepository(database),
        },
        {
          // Una sola instancia sirve al ciclo de la orden y al diario de
          // intentos: son dos contratos sobre las mismas filas.
          inject: [WORKER_DATABASE_CLIENT],
          provide: PUBLICATION_ORDER_REPOSITORY,
          useFactory: (
            database: DatabaseClient,
          ): PrismaPublicationOrderRepository =>
            new PrismaPublicationOrderRepository(database),
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
