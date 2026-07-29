import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";

import { createDatabaseClient } from "./client.ts";

const developmentIds = Object.freeze({
  brand: "10000000-0000-4000-8000-000000000003",
  centralLocation: "10000000-0000-4000-8000-000000000004",
  developmentUser: "10000000-0000-4000-8000-000000000002",
  membership: "10000000-0000-4000-8000-000000000007",
  organization: "10000000-0000-4000-8000-000000000001",
  rivadaviaLocation: "10000000-0000-4000-8000-000000000005",
});

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required to seed development data.");
  }
  return databaseUrl;
}

async function seed(): Promise<void> {
  const database = createDatabaseClient(requiredDatabaseUrl());

  try {
    await database.$transaction(async (transaction) => {
      await transaction.organization.upsert({
        create: {
          displayName: ARAMAYO_BRAND_PROFILE.name,
          id: developmentIds.organization,
          legalName: ARAMAYO_BRAND_PROFILE.name,
          slug: "aramayo",
        },
        update: {
          displayName: ARAMAYO_BRAND_PROFILE.name,
          legalName: ARAMAYO_BRAND_PROFILE.name,
        },
        where: { id: developmentIds.organization },
      });

      await transaction.user.upsert({
        create: {
          displayName: "Usuario local de desarrollo",
          email: "desarrollo@aramayo.invalid",
          id: developmentIds.developmentUser,
        },
        update: {
          displayName: "Usuario local de desarrollo",
          status: "active",
        },
        where: { id: developmentIds.developmentUser },
      });

      await transaction.organizationMembership.upsert({
        create: {
          id: developmentIds.membership,
          organizationId: developmentIds.organization,
          roles: ["admin", "editor", "approver", "publisher", "viewer"],
          userId: developmentIds.developmentUser,
        },
        update: {
          roles: ["admin", "editor", "approver", "publisher", "viewer"],
          status: "active",
        },
        where: { id: developmentIds.membership },
      });

      await transaction.brand.upsert({
        create: {
          id: developmentIds.brand,
          name: ARAMAYO_BRAND_PROFILE.shortName,
          organizationId: developmentIds.organization,
          profile: { ...ARAMAYO_BRAND_PROFILE, themeId: "taller" },
        },
        update: {
          profile: { ...ARAMAYO_BRAND_PROFILE, themeId: "taller" },
        },
        where: { id: developmentIds.brand },
      });

      const sharedLocation = {
        brandId: developmentIds.brand,
        city: "Frías",
        openingHours: {
          display: ARAMAYO_BRAND_PROFILE.opening,
        },
        organizationId: developmentIds.organization,
        phone: "+543854403534",
        province: "Santiago del Estero",
        whatsapp: "+543854403534",
      };

      await transaction.location.upsert({
        create: {
          ...sharedLocation,
          addressLine: ARAMAYO_BRAND_PROFILE.central,
          id: developmentIds.centralLocation,
          name: "Casa central",
        },
        update: {
          addressLine: ARAMAYO_BRAND_PROFILE.central,
          openingHours: sharedLocation.openingHours,
          phone: sharedLocation.phone,
          whatsapp: sharedLocation.whatsapp,
        },
        where: { id: developmentIds.centralLocation },
      });

      await transaction.location.upsert({
        create: {
          ...sharedLocation,
          addressLine: ARAMAYO_BRAND_PROFILE.branch,
          id: developmentIds.rivadaviaLocation,
          name: "Sucursal Rivadavia",
        },
        update: {
          addressLine: ARAMAYO_BRAND_PROFILE.branch,
          openingHours: sharedLocation.openingHours,
          phone: sharedLocation.phone,
          whatsapp: sharedLocation.whatsapp,
        },
        where: { id: developmentIds.rivadaviaLocation },
      });
    });
  } finally {
    await database.$disconnect();
  }

  process.stdout.write(
    "Seed local aplicado: Aramayo, usuario de desarrollo, marca y dos ubicaciones.\n",
  );
}

try {
  await seed();
} catch (cause: unknown) {
  const message =
    cause instanceof Error ? cause.message : "Unknown database seed error.";
  process.stderr.write(`Database seed failed: ${message}\n`);
  process.exitCode = 1;
}
