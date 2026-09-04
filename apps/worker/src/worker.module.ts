import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import { Module, type DynamicModule } from "@nestjs/common";

import { BriefModule } from "./brief/brief.module.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { CatalogModule } from "./catalog/catalog.module.ts";
import { GenerationModule } from "./generation/generation.module.ts";
import { KnowledgeModule } from "./knowledge/knowledge.module.ts";
import { MediaModule } from "./media/media.module.ts";
import { OutboxModule } from "./outbox/outbox.module.ts";
import { PublishingModule } from "./publishing/publishing.module.ts";
import { RenderingModule } from "./rendering/rendering.module.ts";
import { SchedulingModule } from "./scheduling/scheduling.module.ts";
import { StatusModule } from "./status/status.module.ts";

@Module({})
export class WorkerModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    // Catálogo y conocimiento se construyen una sola vez: el módulo de brief
    // recibe esas mismas definiciones para compartir sus proveedores.
    const catalogModule = CatalogModule.forConfiguration(
      configuration.commercialCatalog,
    );
    const knowledgeModule = KnowledgeModule.forConfiguration(
      configuration.openAi,
    );
    const briefAvailable =
      configuration.openAi.enabled &&
      configuration.openAi.credentials.vectorStoreId !== undefined;
    const briefModule = BriefModule.forConfiguration({
      available: briefAvailable,
      imports: [catalogModule, knowledgeModule],
    });
    const publishingModule = PublishingModule.forConfiguration(configuration);
    const schedulingModule = SchedulingModule.forConfiguration(configuration);

    return {
      imports: [
        DatabaseModule.forConfiguration(configuration.databaseUrl),
        catalogModule,
        GenerationModule.forConfiguration(configuration.openAi),
        knowledgeModule,
        briefModule,
        MediaModule.forConfiguration(configuration.cloudinary),
        RenderingModule.forConfiguration(configuration),
        publishingModule,
        OutboxModule.forConfiguration({
          briefAvailable,
          imports: [briefModule, publishingModule, schedulingModule],
        }),
        StatusModule.forConfiguration(configuration),
      ],
      module: WorkerModule,
    };
  }
}
