import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readRecurringStorySourceSnapshot,
  recurringStorySourceEntries,
  recurringStorySourceToJson,
} from "./pre-publish-validation.ts";
import {
  assertRecurringStoryDesignRotation,
  defaultRecurringStoryDesignRotation,
  openingStoryLayoutFor,
  resolveEveryLocationStoryDraft,
  resolveRecurringStoryDraft,
  type RecurringStoryLocationSource,
} from "./recurring-story.ts";

const locationWithoutHours: RecurringStoryLocationSource = {
  addressLine: "Rivadavia 673",
  city: "Frías",
  id: "location-1",
  isActive: true,
  name: "Casa Central",
  organizationId: "organization-1",
  province: "Santiago del Estero",
  timeZone: "America/Argentina/Cordoba",
  version: 4,
};

const location: RecurringStoryLocationSource = {
  ...locationWithoutHours,
  openingHours: "de 8:00 a 12:30 y de 16:30 a 20:30",
};

const occurrence = {
  occurrenceKey: "2026-09-08T08:00",
  resolution: "exact" as const,
  scheduledAt: "2026-09-08T11:00:00.000Z",
};

test("la apertura rota por fecha civil de lunes a domingo", () => {
  assert.equal(
    openingStoryLayoutFor(
      "2026-09-14T08:30",
      defaultRecurringStoryDesignRotation,
    ),
    "historia-apertura-cartel",
  );
  assert.equal(
    openingStoryLayoutFor(
      "2026-09-15T08:30",
      defaultRecurringStoryDesignRotation,
    ),
    "historia-apertura-horario",
  );
  assert.equal(
    openingStoryLayoutFor(
      "2026-09-16T08:30",
      defaultRecurringStoryDesignRotation,
    ),
    "historia-apertura-locales",
  );
  assert.equal(
    openingStoryLayoutFor(
      "2026-09-20T08:30",
      defaultRecurringStoryDesignRotation,
    ),
    "historia-apertura-cartel",
  );
});

test("la rotación exige siete diseños válidos", () => {
  assert.throws(() => {
    assertRecurringStoryDesignRotation(["cartel", "horario"]);
  }, RangeError);
});

test("materializa una historia normal citando la versión de sucursal", () => {
  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    location,
    occurrence,
    policy: "human-each-cycle",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source.locationVersion, 4);
  assert.equal(result.source.sourceKind, "location-configuration");
  assert.equal(result.requiresHumanApproval, true);
  assert.match(result.caption, /Rivadavia 673/u);
});

test("un feriado cerrado bloquea la afirmación Ya abrimos", () => {
  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    dayOverride: {
      localDate: "2026-09-08",
      sourceLabel: "Feriado municipal",
      status: "closed",
      version: 1,
    },
    location,
    occurrence,
    policy: "automatic-routine",
  });

  assert.deepEqual(result, {
    reason: "location-closed",
    status: "blocked",
  });
});

test("un horario especial se cita y exige revisión aunque la regla sea automática", () => {
  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    dayOverride: {
      localDate: "2026-09-08",
      openingHours: "de 9:00 a 13:00",
      sourceLabel: "Horario especial aprobado",
      status: "open",
      version: 2,
    },
    location,
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source.sourceKind, "daily-override");
  assert.equal(result.source.hours, "de 9:00 a 13:00");
  assert.equal(result.requiresHumanApproval, true);
});

test("sucursal inactiva y horario faltante son bloqueos explícitos", () => {
  assert.equal(
    resolveRecurringStoryDraft({
      capturedAt: "2026-09-07T18:00:00.000Z",
      location: { ...location, isActive: false },
      occurrence,
      policy: "human-each-cycle",
    }).status,
    "blocked",
  );
  assert.deepEqual(
    resolveRecurringStoryDraft({
      capturedAt: "2026-09-07T18:00:00.000Z",
      location: locationWithoutHours,
      occurrence,
      policy: "human-each-cycle",
    }),
    { reason: "missing-hours", status: "blocked" },
  );
});

test("la fecha civil manda sobre la fecha UTC en el borde de medianoche", () => {
  // 22:00 del 31 de diciembre en Nueva York ya es 1 de enero en UTC.
  const newYearsEve = {
    occurrenceKey: "2026-12-31T22:00",
    resolution: "exact" as const,
    scheduledAt: "2027-01-01T03:00:00.000Z",
  };
  const newYork: RecurringStoryLocationSource = {
    ...location,
    timeZone: "America/New_York",
  };

  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-12-30T18:00:00.000Z",
    dayOverride: {
      localDate: "2026-12-31",
      openingHours: "de 9:00 a 13:00",
      sourceLabel: "Horario reducido de fin de año",
      status: "open",
      version: 1,
    },
    location: newYork,
    occurrence: newYearsEve,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.source.localDate, "2026-12-31");
  assert.equal(result.source.hours, "de 9:00 a 13:00");
  assert.throws(
    () =>
      resolveRecurringStoryDraft({
        capturedAt: "2026-12-30T18:00:00.000Z",
        dayOverride: {
          localDate: "2027-01-01",
          sourceLabel: "Feriado de Año Nuevo",
          status: "closed",
          version: 1,
        },
        location: newYork,
        occurrence: newYearsEve,
        policy: "automatic-routine",
      }),
    RangeError,
  );
});

test("una excepción del día de cambio de hora se aplica a ese día y no al vecino", () => {
  // 8 de marzo de 2026 adelanta la hora en Nueva York: 09:00 local existe.
  const dstDay = {
    occurrenceKey: "2026-03-08T09:00",
    resolution: "exact" as const,
    scheduledAt: "2026-03-08T13:00:00.000Z",
  };
  const newYork: RecurringStoryLocationSource = {
    ...location,
    timeZone: "America/New_York",
  };

  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-03-07T18:00:00.000Z",
    dayOverride: {
      localDate: "2026-03-08",
      sourceLabel: "Cierre inesperado por corte de energía",
      status: "closed",
      version: 3,
    },
    location: newYork,
    occurrence: dstDay,
    policy: "automatic-routine",
  });

  assert.deepEqual(result, { reason: "location-closed", status: "blocked" });
  assert.equal(
    resolveRecurringStoryDraft({
      capturedAt: "2026-03-07T18:00:00.000Z",
      location: newYork,
      occurrence: {
        occurrenceKey: "2026-03-09T09:00",
        resolution: "exact" as const,
        scheduledAt: "2026-03-09T13:00:00.000Z",
      },
      policy: "automatic-routine",
    }).status,
    "ready",
  );
});

const centralLocation: RecurringStoryLocationSource = {
  addressLine: "República de Siria 365",
  city: "Frías",
  id: "location-central",
  isActive: true,
  name: "Casa central",
  openingHours: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  organizationId: "organization-1",
  province: "Santiago del Estero",
  timeZone: "America/Argentina/Cordoba",
  version: 2,
};

const rivadaviaLocation: RecurringStoryLocationSource = {
  ...centralLocation,
  addressLine: "Rivadavia 673",
  id: "location-rivadavia",
  name: "Sucursal Rivadavia",
  version: 5,
};

test("una historia para todas con el mismo horario lo dice una vez y nombra cada dirección", () => {
  const result = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [{ location: rivadaviaLocation }, { location: centralLocation }],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.designContent.items, [
    "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
    "Casa central · República de Siria 365, Frías",
    "Sucursal Rivadavia · Rivadavia 673, Frías",
  ]);
  assert.equal(
    result.designContent.subtitle,
    "Casa central y Sucursal Rivadavia",
  );
  assert.equal(result.designContent.badge, "Estamos atendiendo");
  assert.equal(result.requiresHumanApproval, false);
  assert.match(result.caption, /Casa central y Sucursal Rivadavia/u);
  assert.match(
    result.caption,
    /República de Siria 365, Frías y Rivadavia 673/u,
  );
  assert.equal(result.source.scope, "every-location");
  assert.deepEqual(
    result.source.locations.map((entry) => [
      entry.locationId,
      entry.locationVersion,
    ]),
    [
      ["location-central", 2],
      ["location-rivadavia", 5],
    ],
  );
});

test("con horarios distintos va un renglón por sucursal", () => {
  const result = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { location: centralLocation },
      {
        location: {
          ...rivadaviaLocation,
          openingHours: "Lun a vie · 09:00 a 18:00",
        },
      },
    ],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.designContent.items, [
    "Casa central · Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
    "Sucursal Rivadavia · Lun a vie · 09:00 a 18:00",
  ]);
  assert.match(
    result.caption,
    /en Sucursal Rivadavia \(Rivadavia 673, Frías\): Lun a vie/u,
  );
});

test("una sucursal cerrada por excepción se nombra cerrada y la historia pide revisión", () => {
  const result = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { location: centralLocation },
      {
        dayOverride: {
          localDate: "2026-09-08",
          sourceLabel: "Inventario",
          status: "closed",
          version: 3,
        },
        location: rivadaviaLocation,
      },
    ],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.designContent.items, [
    "Casa central · Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
    "Sucursal Rivadavia · Cerrada hoy",
  ]);
  assert.equal(result.designContent.badge, "Horario especial");
  assert.equal(result.requiresHumanApproval, true);
  assert.match(result.caption, /Ya abrimos en Casa central\./u);
  assert.match(result.caption, /Sucursal Rivadavia permanece cerrada hoy\./u);
  const closed = result.source.locations.find(
    (entry) => entry.locationId === "location-rivadavia",
  );
  assert.equal(closed?.hours, null);
  assert.equal(closed.sourceVersion, 3);
});

test("todas cerradas, todas inactivas o una abierta sin horario bloquean la historia", () => {
  const closedDay = {
    localDate: "2026-09-08",
    sourceLabel: "Feriado",
    status: "closed" as const,
    version: 1,
  };
  const allClosed = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { dayOverride: closedDay, location: centralLocation },
      { dayOverride: closedDay, location: rivadaviaLocation },
    ],
    occurrence,
    policy: "human-each-cycle",
  });
  assert.deepEqual(allClosed, { reason: "location-closed", status: "blocked" });

  const allInactive = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { location: { ...centralLocation, isActive: false } },
      { location: { ...rivadaviaLocation, isActive: false } },
    ],
    occurrence,
    policy: "human-each-cycle",
  });
  assert.deepEqual(allInactive, {
    reason: "location-inactive",
    status: "blocked",
  });

  const { openingHours: _hours, ...withoutHours } = rivadaviaLocation;
  assert.ok(_hours !== undefined);
  const missing = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [{ location: centralLocation }, { location: withoutHours }],
    occurrence,
    policy: "human-each-cycle",
  });
  assert.deepEqual(missing, { reason: "missing-hours", status: "blocked" });
});

test("una sucursal inactiva no es parte de todas", () => {
  const result = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { location: centralLocation },
      { location: { ...rivadaviaLocation, isActive: false } },
    ],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.designContent.subtitle, "Casa central");
  assert.deepEqual(
    result.source.locations.map((entry) => entry.locationId),
    ["location-central"],
  );
});

test("la fuente para todas se persiste y se relee igual que la de una sucursal", () => {
  const every = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [{ location: centralLocation }, { location: rivadaviaLocation }],
    occurrence,
    policy: "automatic-routine",
  });
  const single = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    location: centralLocation,
    occurrence,
    policy: "automatic-routine",
  });
  assert.equal(every.status, "ready");
  assert.equal(single.status, "ready");

  const everyRead = readRecurringStorySourceSnapshot(
    JSON.parse(JSON.stringify(recurringStorySourceToJson(every.source))),
  );
  assert.ok(everyRead !== null);
  assert.deepEqual(
    recurringStorySourceEntries(everyRead),
    recurringStorySourceEntries(every.source),
  );

  const singleRead = readRecurringStorySourceSnapshot(
    JSON.parse(JSON.stringify(recurringStorySourceToJson(single.source))),
  );
  assert.ok(singleRead !== null);
  assert.deepEqual(recurringStorySourceEntries(singleRead), [
    {
      address: "República de Siria 365, Frías",
      hours: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
      locationId: "location-central",
      locationName: "Casa central",
      locationVersion: 2,
      sourceKind: "location-configuration",
      sourceLabel: "Configuración vigente de la sucursal",
      sourceVersion: 2,
    },
  ]);

  // Una fuente para todas sin sucursales no es una fuente.
  assert.equal(
    readRecurringStorySourceSnapshot({
      capturedAt: "2026-09-07T18:00:00.000Z",
      localDate: "2026-09-08",
      locations: [],
      scope: "every-location",
    }),
    null,
  );
});
