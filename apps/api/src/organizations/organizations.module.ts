import { Module } from "@nestjs/common";

import { LocationDayOverrideController } from "./location-day-override.controller.ts";
import { LocationDayOverrideService } from "./location-day-override.service.ts";
import { OrganizationConfigurationController } from "./organization-configuration.controller.ts";
import { OrganizationConfigurationService } from "./organization-configuration.service.ts";
import { GenerationPolicyController } from "./generation-policy.controller.ts";
import { GenerationPolicyService } from "./generation-policy.service.ts";

@Module({
  controllers: [
    OrganizationConfigurationController,
    LocationDayOverrideController,
    GenerationPolicyController,
  ],
  providers: [
    OrganizationConfigurationService,
    LocationDayOverrideService,
    GenerationPolicyService,
  ],
})
export class OrganizationsModule {}
