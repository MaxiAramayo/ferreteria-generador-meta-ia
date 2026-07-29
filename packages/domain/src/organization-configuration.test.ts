import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigurationValidationError,
  normalizeBrandConfigurationUpdate,
  normalizeLocationConfigurationUpdate,
} from "./organization-configuration.ts";

const actor = {
  displayName: "Administradora",
  email: "admin@example.invalid",
  membershipId: "membership-a",
  organizationId: "organization-a",
  roles: ["admin"] as const,
  sessionId: "session-a",
  userId: "user-a",
};

test("normaliza identidad comercial sin admitir temas ni handles arbitrarios", () => {
  assert.deepEqual(
    normalizeBrandConfigurationUpdate({
      actor,
      brandVersion: 2,
      claim: "  Ferretería, hogar   y automotor  ",
      displayName: "  Ferretería Aramayo ",
      handle: "@LubricentroAramayo",
      legalName: " Ferretería y Lubricentro Aramayo ",
      name: " Aramayo ",
      organizationVersion: 3,
      shortName: " Aramayo ",
      themeId: "taller",
    }),
    {
      brandVersion: 2,
      claim: "Ferretería, hogar y automotor",
      displayName: "Ferretería Aramayo",
      handle: "@LubricentroAramayo",
      legalName: "Ferretería y Lubricentro Aramayo",
      name: "Aramayo",
      organizationVersion: 3,
      shortName: "Aramayo",
      themeId: "taller",
    },
  );

  assert.throws(
    () =>
      normalizeBrandConfigurationUpdate({
        actor,
        brandVersion: 1,
        claim: "Claim válido",
        displayName: "Aramayo",
        handle: "sin-arroba",
        legalName: "Aramayo",
        name: "Aramayo",
        organizationVersion: 1,
        shortName: "Aramayo",
        themeId: "inventado",
      }),
    ConfigurationValidationError,
  );
});

test("normaliza teléfonos argentinos, domicilio, horario y zona", () => {
  assert.deepEqual(
    normalizeLocationConfigurationUpdate({
      actor,
      addressLine: "  República de Siria   365 ",
      city: " Frías ",
      isActive: true,
      locationId: "location-a",
      name: " Casa central ",
      openingHours: "Lun a sáb·08:30 a 13:00/16:30 a 20:30",
      phone: "(3854) 403534",
      province: " Santiago del Estero ",
      timeZone: "America/Argentina/Cordoba",
      version: 4,
      whatsapp: "+54 3854 403534",
    }),
    {
      addressLine: "República de Siria 365",
      city: "Frías",
      isActive: true,
      name: "Casa central",
      openingHours: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
      phone: "+543854403534",
      province: "Santiago del Estero",
      timeZone: "America/Argentina/Cordoba",
      version: 4,
      whatsapp: "+543854403534",
    },
  );
});

test("rechaza horarios invertidos, teléfonos incompletos y zonas desconocidas", () => {
  const base = {
    actor,
    addressLine: "Rivadavia 673",
    city: "Frías",
    isActive: true,
    locationId: "location-a",
    name: "Sucursal",
    openingHours: "Lun · 08:30 a 13:00",
    province: "Santiago del Estero",
    timeZone: "America/Argentina/Cordoba",
    version: 1,
  };

  assert.throws(
    () =>
      normalizeLocationConfigurationUpdate({
        ...base,
        openingHours: "Lun · 13:00 a 08:30",
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeLocationConfigurationUpdate({
        ...base,
        phone: "123",
      }),
    ConfigurationValidationError,
  );
  assert.throws(
    () =>
      normalizeLocationConfigurationUpdate({
        ...base,
        timeZone: "Argentina/Desconocida",
      }),
    ConfigurationValidationError,
  );
});
