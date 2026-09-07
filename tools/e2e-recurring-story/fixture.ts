/**
 * Datos mínimos para que la cadena de historia recurrente sea navegable.
 *
 * A diferencia del E2E de publicación, acá no se siembra ninguna pieza: lo que
 * se prueba es justamente que la pieza nazca de una regla creada desde el
 * panel. Sí hacen falta una sucursal activa con horario y dirección —sin ellos
 * el compositor bloquea, que es otra prueba— y una persona con contraseña real,
 * porque una sesión falsificada no atravesaría los guards.
 */

import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@aramayo/database";
import type { OrganizationRole } from "@aramayo/domain";

import { Argon2idPasswordHasher } from "../../apps/api/src/identity/password-hasher.ts";

export const recurringStoryPassword = "Recurrencia-E2E-Segura";

export interface RecurringStoryFixture {
  readonly brandId: string;
  readonly email: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly membershipId: string;
  readonly openingHours: string;
  readonly organizationId: string;
  readonly roles: readonly OrganizationRole[];
}

export async function seedRecurringStoryFixture(
  databaseUrl: string,
): Promise<RecurringStoryFixture> {
  const database = createDatabaseClient(databaseUrl);
  const hasher = new Argon2idPasswordHasher();

  const organizationId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  // `admin` habilita la política automática y `approver` la programación; la
  // pieza se renderiza con `editor`. Las tres van juntas porque la cadena
  // recorre los tres permisos.
  const roles: readonly OrganizationRole[] = ["admin", "editor", "approver"];
  const email = "programadora.e2e@aramayo.invalid";
  const openingHours = "Lun a sáb · 08:30 a 13:00 y 17:00 a 20:30";
  const locationName = "Casa central";

  try {
    await database.organization.create({
      data: {
        displayName: "Aramayo E2E recurrencias",
        id: organizationId,
        legalName: "Aramayo E2E recurrencias",
        slug: `aramayo-recurring-${organizationId.slice(0, 8)}`,
      },
    });
    await database.user.create({
      data: {
        displayName: "Programadora E2E",
        email,
        id: userId,
        passwordChangedAt: new Date("2026-08-20T09:00:00.000Z"),
        passwordHash: await hasher.hash(recurringStoryPassword),
        passwordHashVersion: 1,
      },
    });
    await database.organizationMembership.create({
      data: { id: membershipId, organizationId, roles: [...roles], userId },
    });
    await database.brand.create({
      data: {
        id: brandId,
        name: "Aramayo",
        organizationId,
        profile: { themeId: "taller" },
      },
    });
    await database.location.create({
      data: {
        addressLine: "Avenida Belgrano 100",
        brandId,
        city: "Frías",
        id: locationId,
        name: locationName,
        openingHours: { display: openingHours },
        organizationId,
        province: "Santiago del Estero",
      },
    });

    return Object.freeze({
      brandId,
      email,
      locationId,
      locationName,
      membershipId,
      openingHours,
      organizationId,
      roles,
    });
  } finally {
    await database.$disconnect();
  }
}
