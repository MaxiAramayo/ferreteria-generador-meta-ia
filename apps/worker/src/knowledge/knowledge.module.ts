import type { OpenAIIntegration } from "@aramayo/configuration";
import type {
  KnowledgeDocumentRepository,
  KnowledgeVectorStorePort,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { KNOWLEDGE_DOCUMENT_REPOSITORY } from "../database/database.tokens.ts";
import { KnowledgeIngestionService } from "./knowledge-ingestion.service.ts";
import {
  KNOWLEDGE_INGESTION_SERVICE,
  KNOWLEDGE_VECTOR_STORE,
} from "./knowledge.tokens.ts";
import { OfficialOpenAIFileSearchAdapter } from "./openai-file-search.adapter.ts";

@Module({})
export class KnowledgeModule {
  static forConfiguration(openAi: OpenAIIntegration): DynamicModule {
    if (!openAi.enabled || openAi.credentials.vectorStoreId === undefined) {
      return { module: KnowledgeModule };
    }

    const vectorStoreId = openAi.credentials.vectorStoreId;
    return {
      exports: [KNOWLEDGE_INGESTION_SERVICE],
      module: KnowledgeModule,
      providers: [
        {
          provide: KNOWLEDGE_VECTOR_STORE,
          useFactory: (): KnowledgeVectorStorePort =>
            new OfficialOpenAIFileSearchAdapter(
              openAi.credentials,
              openAi.policy,
            ),
        },
        {
          inject: [KNOWLEDGE_DOCUMENT_REPOSITORY, KNOWLEDGE_VECTOR_STORE],
          provide: KNOWLEDGE_INGESTION_SERVICE,
          useFactory: (
            repository: KnowledgeDocumentRepository,
            vectorStore: KnowledgeVectorStorePort,
          ): KnowledgeIngestionService =>
            new KnowledgeIngestionService(
              repository,
              vectorStore,
              vectorStoreId,
            ),
        },
      ],
    };
  }
}
