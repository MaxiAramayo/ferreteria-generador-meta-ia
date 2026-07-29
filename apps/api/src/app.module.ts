import type { ApiConfiguration } from "@aramayo/configuration/api";
import { Module, type DynamicModule } from "@nestjs/common";

import { API_CONFIGURATION } from "./configuration.tokens.ts";
import { AuditModule } from "./audit/audit.module.ts";
import { ContentModule } from "./content/content.module.ts";
import { DatabaseModule } from "./database/database.module.ts";
import { HealthModule } from "./health/health.module.ts";
import { IdentityModule } from "./identity/identity.module.ts";
import { ApplicationLifecycleService } from "./lifecycle/application-lifecycle.service.ts";
import { OrganizationsModule } from "./organizations/organizations.module.ts";

@Module({})
export class AppModule {
  static forConfiguration(configuration: ApiConfiguration): DynamicModule {
    return {
      exports: [API_CONFIGURATION],
      imports: [
        AuditModule,
        DatabaseModule.forConfiguration(configuration.databaseUrl),
        ContentModule,
        HealthModule.forConfiguration(configuration),
        IdentityModule.forConfiguration(configuration),
        OrganizationsModule,
      ],
      module: AppModule,
      providers: [
        ApplicationLifecycleService,
        { provide: API_CONFIGURATION, useValue: configuration },
      ],
    };
  }
}
