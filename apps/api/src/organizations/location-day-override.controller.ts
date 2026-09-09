import type {
  LocationDayOverrideListResponse,
  LocationDayOverrideMutationResponse,
  LocationDayOverridePreviewResponse,
} from "@aramayo/contracts";
import type {
  AuthenticatedSessionRecord,
  PreviewLocationDayOverrideCommand,
  UpsertLocationDayOverrideCommand,
} from "@aramayo/domain";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import {
  CurrentSession,
  RequirePermission,
} from "../identity/identity.decorators.ts";
import {
  DeleteLocationDayOverrideDto,
  ListLocationDayOverridesQueryDto,
  LocationDayOverrideDto,
} from "./dto/location-day-override.dto.ts";
import { LocationDayOverrideService } from "./location-day-override.service.ts";

/**
 * Una excepción se dirige siempre por sucursal: la zona IANA que interpreta su
 * fecha civil pertenece a esa sucursal y nunca viaja en la solicitud.
 */
@Controller("organization/configuration/locations/:locationId/day-overrides")
export class LocationDayOverrideController {
  readonly #service: LocationDayOverrideService;

  constructor(service: LocationDayOverrideService) {
    this.#service = service;
  }

  @Get()
  @RequirePermission("content:read")
  list(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Query() query: ListLocationDayOverridesQueryDto,
  ): Promise<LocationDayOverrideListResponse> {
    return this.#service.list(session.actor, locationId, {
      endDate: query.endDate,
      startDate: query.startDate,
    });
  }

  @Post("preview")
  @RequirePermission("organization:manage")
  preview(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Body() input: LocationDayOverrideDto,
  ): Promise<LocationDayOverridePreviewResponse> {
    return this.#service.preview(previewCommand(session, locationId, input));
  }

  @Post()
  @RequirePermission("organization:manage")
  upsert(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Body() input: LocationDayOverrideDto,
  ): Promise<LocationDayOverrideMutationResponse> {
    return this.#service.upsert(upsertCommand(session, locationId, input));
  }

  @Delete(":localDate")
  @RequirePermission("organization:manage")
  remove(
    @CurrentSession() session: AuthenticatedSessionRecord,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @Param("localDate") localDate: string,
    @Query() query: DeleteLocationDayOverrideDto,
  ): Promise<LocationDayOverrideMutationResponse> {
    return this.#service.remove({
      actor: session.actor,
      expectedVersion: query.expectedVersion,
      localDate,
      locationId,
    });
  }
}

function previewCommand(
  session: AuthenticatedSessionRecord,
  locationId: string,
  input: LocationDayOverrideDto,
): PreviewLocationDayOverrideCommand {
  return input.status === "closed"
    ? {
        actor: session.actor,
        localDate: input.localDate,
        locationId,
        sourceLabel: input.sourceLabel,
        status: "closed",
      }
    : {
        actor: session.actor,
        localDate: input.localDate,
        locationId,
        openingHours: input.openingHours ?? "",
        sourceLabel: input.sourceLabel,
        status: "open",
      };
}

function upsertCommand(
  session: AuthenticatedSessionRecord,
  locationId: string,
  input: LocationDayOverrideDto,
): UpsertLocationDayOverrideCommand {
  const expectedVersion =
    input.expectedVersion === undefined
      ? {}
      : { expectedVersion: input.expectedVersion };
  return input.status === "closed"
    ? {
        actor: session.actor,
        ...expectedVersion,
        localDate: input.localDate,
        locationId,
        sourceLabel: input.sourceLabel,
        status: "closed",
      }
    : {
        actor: session.actor,
        ...expectedVersion,
        localDate: input.localDate,
        locationId,
        openingHours: input.openingHours ?? "",
        sourceLabel: input.sourceLabel,
        status: "open",
      };
}
