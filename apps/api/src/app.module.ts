import type { ApiConfiguration } from "@aramayo/configuration/api";
import { Module, type DynamicModule } from "@nestjs/common";

import { API_CONFIGURATION } from "./configuration.tokens.ts";
import { PublicationTransitionService } from "./content/publication-transition.service.ts";
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
        DatabaseModule.forConfiguration(configuration.databaseUrl),
        HealthModule.forConfiguration(configuration),
        IdentityModule.forConfiguration(configuration),
        OrganizationsModule,
      ],
      module: AppModule,
      providers: [
        ApplicationLifecycleService,
        PublicationTransitionService,
        { provide: API_CONFIGURATION, useValue: configuration },
      ],
    };
  }
}
