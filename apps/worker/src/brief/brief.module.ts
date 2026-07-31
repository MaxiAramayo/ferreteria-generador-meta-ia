import type {
  ContentBriefRunRepository,
  StructuredGenerationPort,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { COMMERCIAL_TOOL_EXECUTION_PORT } from "../catalog/catalog.tokens.ts";
import type { CommercialToolExecutionPort } from "../catalog/commercial-tool-execution.service.ts";
import { CONTENT_BRIEF_RUN_REPOSITORY } from "../database/database.tokens.ts";
import { STRUCTURED_GENERATION_PORT } from "../generation/generation.tokens.ts";
import { KNOWLEDGE_RETRIEVAL_SERVICE } from "../knowledge/knowledge.tokens.ts";
import type { KnowledgeRetrievalService } from "../knowledge/knowledge-retrieval.service.ts";
import { CONTENT_BRIEF_GENERATION_SERVICE } from "./brief.tokens.ts";
import { ContentBriefGenerationService } from "./content-brief-generation.service.ts";

export interface BriefModuleDependencies {
  /** Falso cuando no hay recuperación documental configurada. */
  readonly available: boolean;
  /**
   * Definiciones ya construidas de los módulos que exportan las dependencias.
   * Se reciben por referencia para que Nest reutilice la misma instancia que
   * usa el worker y no cree adaptadores paralelos.
   */
  readonly imports: readonly DynamicModule[];
}

/**
 * El brief depende de recuperación documental con citas. Sin ese servicio no
 * hay evidencia que citar, así que el módulo no se provee en lugar de ofrecer
 * una generación sin fundamento.
 */
@Module({})
export class BriefModule {
  static forConfiguration(
    dependencies: BriefModuleDependencies,
  ): DynamicModule {
    if (!dependencies.available) {
      return { module: BriefModule };
    }
    return {
      exports: [CONTENT_BRIEF_GENERATION_SERVICE],
      imports: [...dependencies.imports],
      module: BriefModule,
      providers: [
        {
          inject: [
            KNOWLEDGE_RETRIEVAL_SERVICE,
            COMMERCIAL_TOOL_EXECUTION_PORT,
            STRUCTURED_GENERATION_PORT,
            CONTENT_BRIEF_RUN_REPOSITORY,
          ],
          provide: CONTENT_BRIEF_GENERATION_SERVICE,
          useFactory: (
            knowledge: KnowledgeRetrievalService,
            commercial: CommercialToolExecutionPort,
            generation: StructuredGenerationPort,
            runs: ContentBriefRunRepository,
          ): ContentBriefGenerationService =>
            new ContentBriefGenerationService(
              knowledge,
              commercial,
              generation,
              runs,
            ),
        },
      ],
    };
  }
}
