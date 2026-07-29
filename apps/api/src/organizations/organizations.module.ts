import { Module } from "@nestjs/common";

import { OrganizationConfigurationController } from "./organization-configuration.controller.ts";
import { OrganizationConfigurationService } from "./organization-configuration.service.ts";

@Module({
  controllers: [OrganizationConfigurationController],
  providers: [OrganizationConfigurationService],
})
export class OrganizationsModule {}
