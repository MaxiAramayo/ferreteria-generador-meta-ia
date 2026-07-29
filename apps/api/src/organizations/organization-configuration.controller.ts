import type {
  AuthenticatedSessionRecord,
  OrganizationConfiguration,
} from "@aramayo/domain";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import { UpdateBrandConfigurationDto } from "./dto/update-brand-configuration.dto.ts";
import { UpdateLocationConfigurationDto } from "./dto/update-location-configuration.dto.ts";
import { OrganizationConfigurationService } from "./organization-configuration.service.ts";

@Controller("organization/configuration")
export class OrganizationConfigurationController {
  readonly #service: OrganizationConfigurationService;

  constructor(service: OrganizationConfigurationService) {
    this.#service = service;
  }

  @Get()
  @RequirePermission("content:read")
  read(
    @CurrentSession() session: AuthenticatedSessionRecord,
  ): Promise<OrganizationConfiguration> {
    return this.#service.read(session.actor);
  }

  @Patch("brand")
  @RequirePermission("organization:manage")
  updateBrand(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Body() input: UpdateBrandConfigurationDto,
  ): Promise<OrganizationConfiguration> {
    return this.#service.updateBrand({
      actor: session.actor,
      brandVersion: input.brandVersion,
      claim: input.claim,
      displayName: input.displayName,
      handle: input.handle,
      legalName: input.legalName,
      name: input.name,
      organizationVersion: input.organizationVersion,
      shortName: input.shortName,
      themeId: input.themeId,
    });
  }

  @Patch("locations/:locationId")
  @RequirePermission("organization:manage")
  updateLocation(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("locationId", new ParseUUIDPipe({ version: "4" }))
    locationId: string,
    @Body() input: UpdateLocationConfigurationDto,
  ): Promise<OrganizationConfiguration> {
    return this.#service.updateLocation({
      actor: session.actor,
      addressLine: input.addressLine,
      city: input.city,
      isActive: input.isActive,
      locationId,
      name: input.name,
      openingHours: input.openingHours,
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      province: input.province,
      timeZone: input.timeZone,
      version: input.version,
      ...(input.whatsapp === undefined ? {} : { whatsapp: input.whatsapp }),
    });
  }
}
