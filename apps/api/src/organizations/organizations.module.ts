import { Module } from "@nestjs/common";

import { OrganizationConfigurationController } from "./organization-configuration.controller.ts";
import { OrganizationConfigurationService } from "./organization-configuration.service.ts";
import { GenerationPolicyController } from "./generation-policy.controller.ts";
import { GenerationPolicyService } from "./generation-policy.service.ts";

@Module({
  controllers: [
    OrganizationConfigurationController,
    GenerationPolicyController,
  ],
  providers: [OrganizationConfigurationService, GenerationPolicyService],
})
export class OrganizationsModule {}
