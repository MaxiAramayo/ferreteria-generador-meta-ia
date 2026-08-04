import type { CommercialCatalogIntegration } from "@aramayo/configuration";
import type {
  CommercialCatalogPort,
  CommercialToolAuditPort,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import { COMMERCIAL_TOOL_AUDIT_REPOSITORY } from "../database/database.tokens.ts";
import {
  CommercialToolExecutionService,
  DisabledCommercialToolExecutionService,
  type CommercialToolExecutionPort,
} from "./commercial-tool-execution.service.ts";
import {
  COMMERCIAL_CATALOG_PORT,
  COMMERCIAL_TOOL_EXECUTION_PORT,
} from "./catalog.tokens.ts";
import { OdooCommercialCatalogAdapter } from "./odoo-commercial-catalog.adapter.ts";

@Module({})
export class CatalogModule {
  static forConfiguration(
    integration: CommercialCatalogIntegration,
  ): DynamicModule {
    if (!integration.enabled) {
      return {
        exports: [COMMERCIAL_TOOL_EXECUTION_PORT],
        module: CatalogModule,
        providers: [
          {
            provide: COMMERCIAL_TOOL_EXECUTION_PORT,
            useFactory: (): CommercialToolExecutionPort =>
              new DisabledCommercialToolExecutionService(),
          },
        ],
      };
    }
    return {
      exports: [COMMERCIAL_TOOL_EXECUTION_PORT],
      module: CatalogModule,
      providers: [
        {
          provide: COMMERCIAL_CATALOG_PORT,
          useFactory: (): CommercialCatalogPort =>
            new OdooCommercialCatalogAdapter(
              integration.credentials,
              integration.policy,
            ),
        },
        {
          inject: [COMMERCIAL_CATALOG_PORT, COMMERCIAL_TOOL_AUDIT_REPOSITORY],
          provide: COMMERCIAL_TOOL_EXECUTION_PORT,
          useFactory: (
            catalog: CommercialCatalogPort,
            audit: CommercialToolAuditPort,
          ): CommercialToolExecutionPort =>
            new CommercialToolExecutionService(
              catalog,
              audit,
              integration.credentials,
              integration.policy,
            ),
        },
      ],
    };
  }
}
