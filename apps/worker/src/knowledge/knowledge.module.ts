import type { OpenAIIntegration } from "@aramayo/configuration";
import type {
  KnowledgeDocumentRepository,
  KnowledgeRetrievalRepository,
  KnowledgeSearchPort,
  KnowledgeVectorStorePort,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { KNOWLEDGE_DOCUMENT_REPOSITORY } from "../database/database.tokens.ts";
import { KnowledgeIngestionService } from "./knowledge-ingestion.service.ts";
import { KnowledgeRetrievalService } from "./knowledge-retrieval.service.ts";
import {
  KNOWLEDGE_INGESTION_SERVICE,
  KNOWLEDGE_RETRIEVAL_SERVICE,
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
      exports: [KNOWLEDGE_INGESTION_SERVICE, KNOWLEDGE_RETRIEVAL_SERVICE],
      module: KnowledgeModule,
      providers: [
        {
          provide: KNOWLEDGE_VECTOR_STORE,
          useFactory: (): KnowledgeSearchPort & KnowledgeVectorStorePort =>
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
        {
          inject: [KNOWLEDGE_DOCUMENT_REPOSITORY, KNOWLEDGE_VECTOR_STORE],
          provide: KNOWLEDGE_RETRIEVAL_SERVICE,
          useFactory: (
            repository: KnowledgeRetrievalRepository,
            search: KnowledgeSearchPort,
          ): KnowledgeRetrievalService =>
            new KnowledgeRetrievalService(repository, search),
        },
      ],
    };
  }
}
