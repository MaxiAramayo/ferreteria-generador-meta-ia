import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readRecurringStorySourceSnapshot,
  recurringStorySourceEntries,
  recurringStorySourceToJson,
} from "./pre-publish-validation.ts";
import {
  openingStoryGreeting,
  recurringStoryDesignDocument,
  recurringStoryDesignVariantsFor,
  recurringStoryLayoutFor,
  recurringStoryPhotoLimits,
  recurringStoryStyleIssue,
  recurringStoryThemesFor,
  resolveEveryLocationStoryDraft,
  resolveRecurringStoryDraft,
  type RecurringStoryLocationSource,
  type RecurringStoryPhoto,
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

test("cada historia conserva el marco elegido por la regla", () => {
  assert.equal(
    recurringStoryLayoutFor("apertura", "cartel"),
    "historia-apertura-cartel",
  );
  assert.equal(
    recurringStoryLayoutFor("apertura", "placa"),
    "historia-apertura-placa",
  );
  assert.equal(
    recurringStoryLayoutFor("apertura", "esquina"),
    "historia-apertura-esquina",
  );
  assert.equal(
    recurringStoryLayoutFor("apertura", "imagen"),
    "historia-apertura-imagen",
  );
  // Los marcos heredados siguen componiendo con la plantilla estable.
  assert.equal(
    recurringStoryLayoutFor("apertura", "horario"),
    "historia-apertura-horario",
  );
  assert.equal(
    recurringStoryLayoutFor("lubricentro", "ventana"),
    "historia-lubricentro-ventana",
  );
  assert.equal(
    recurringStoryLayoutFor("lubricentro", "placa"),
    "historia-lubricentro-placa",
  );
  assert.equal(
    recurringStoryLayoutFor("lubricentro", "esquina"),
    "historia-lubricentro-esquina",
  );
  assert.equal(
    recurringStoryLayoutFor("lubricentro", "imagen"),
    "historia-lubricentro-imagen",
  );
  // Un marco que el lubricentro no ofrece cae en el suyo con la foto al medio,
  // en vez de componer un identificador que el motor no conoce.
  assert.equal(
    recurringStoryLayoutFor("lubricentro", "cartel"),
    "historia-lubricentro-ventana",
  );
});

test("cada historia ofrece sus marcos y su paleta", () => {
  assert.deepEqual(recurringStoryDesignVariantsFor("apertura"), [
    "cartel",
    "placa",
    "esquina",
    "imagen",
    "horario",
    "locales",
  ]);
  assert.deepEqual(recurringStoryDesignVariantsFor("lubricentro"), [
    "ventana",
    "placa",
    "esquina",
    "imagen",
  ]);
  assert.deepEqual(recurringStoryThemesFor("apertura"), [
    "taller",
    "claro",
    "promo",
  ]);
  assert.deepEqual(recurringStoryThemesFor("lubricentro"), ["lubricentro"]);
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
  assert.deepEqual(result.designContent, {
    callToAction: "¿Buscás algo? Escribinos",
    features: [
      { icon: "herramientas", label: "Herramientas" },
      { icon: "electricidad", label: "Electricidad" },
      { icon: "sanitarios", label: "Sanitarios" },
      { icon: "pintura", label: "Pinturas" },
      { icon: "buloneria", label: "Bulonería y fijaciones" },
      { icon: "automotor", label: "Lubricentro" },
    ],
    greeting: "Buen día, Frías",
    highlights: [
      "Asesoramiento personalizado",
      "Variedad de marcas",
      "Distintos medios de pago",
    ],
    items: ["Casa Central · Rivadavia 673"],
    subtitle: "Te esperamos en Casa Central",
    title: "¡Ya abrimos!",
    validity: "de 8:00 a 12:30 y de 16:30 a 20:30",
  });
});

test("el lubricentro afirma sus servicios y la dirección donde se atiende", () => {
  const result = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    kind: "lubricentro",
    location,
    occurrence,
    policy: "human-each-cycle",
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.designContent, {
    callToAction: "Pedí tu turno",
    features: [
      { icon: "aceite", label: "Lubricantes" },
      { icon: "lubricentro", label: "Filtros" },
      { icon: "bateria", label: "Baterías" },
    ],
    highlights: ["Autos", "Motos", "Utilitarios", "Autoelevadoras"],
    // La dirección, no el nombre de la sucursal: es donde está la fosa.
    subtitle: "Cambio de aceite con fosa en Rivadavia 673",
    title: "¿Toca el service?",
    validity: "de 8:00 a 12:30 y de 16:30 a 20:30",
  });
  assert.match(result.caption, /Cambio de aceite con fosa en Rivadavia 673/u);
  assert.match(result.caption, /Pedí tu turno por WhatsApp\./u);
  // El horario del día es el de la sucursal, no uno propio del servicio.
  assert.equal(result.source.hours, "de 8:00 a 12:30 y de 16:30 a 20:30");
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
    "Casa central · República de Siria 365",
    "Sucursal Rivadavia · Rivadavia 673",
  ]);
  assert.equal(
    result.designContent.validity,
    "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  );
  assert.equal(
    result.designContent.subtitle,
    "Te esperamos en nuestros dos locales",
  );
  assert.equal(result.designContent.greeting, "Buen día, Frías");
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
  // Sin un horario común, no hay renglón de horario aparte.
  assert.equal(result.designContent.validity, undefined);
  // La bajada sólo dice dónde se atiende: con horarios distintos, el horario
  // de cada una va en su renglón y ninguna afirmación queda de más.
  assert.equal(
    result.designContent.subtitle,
    "Te esperamos en nuestros dos locales",
  );
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
  // La abierta muestra su calle y su horario va en el renglón de horario; la
  // cerrada se nombra cerrada.
  assert.deepEqual(result.designContent.items, [
    "Casa central · República de Siria 365",
    "Sucursal Rivadavia · Cerrada hoy",
  ]);
  assert.equal(
    result.designContent.validity,
    "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  );
  // Con una cerrada se nombra la que abre: contar «nuestros dos locales» ese
  // día sería falso.
  assert.equal(
    result.designContent.subtitle,
    "Hoy te esperamos en Casa central",
  );
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
  assert.equal(result.designContent.subtitle, "Te esperamos en Casa central");
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

test("el saludo sigue la hora de publicación y cede la localidad si no entra", () => {
  assert.equal(
    openingStoryGreeting("2026-09-08T08:30", "Frías"),
    "Buen día, Frías",
  );
  assert.equal(
    openingStoryGreeting("2026-09-08T16:30", "Frías"),
    "Buenas tardes, Frías",
  );
  assert.equal(
    openingStoryGreeting("2026-09-08T20:00", "Frías"),
    "Buenas noches, Frías",
  );
  assert.equal(
    openingStoryGreeting("2026-09-08T11:59", "Santiago del Estero"),
    "Buen día",
  );
  assert.equal(openingStoryGreeting("2026-09-08T09:00", null), "Buen día");
});

test("sucursales de localidades distintas se saludan sin nombrar ninguna", () => {
  const result = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [
      { location: centralLocation },
      { location: { ...rivadaviaLocation, city: "Loreto" } },
    ],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(result.status, "ready");
  assert.equal(result.designContent.greeting, "Buen día");
});

test("la imagen propia siempre vuelve a revisión humana", () => {
  const single = resolveRecurringStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    designVariant: "imagen",
    location,
    occurrence,
    policy: "automatic-routine",
  });
  const every = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    designVariant: "imagen",
    locations: [{ location: centralLocation }, { location: rivadaviaLocation }],
    occurrence,
    policy: "automatic-routine",
  });
  const routine = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    designVariant: "cartel",
    locations: [{ location: centralLocation }, { location: rivadaviaLocation }],
    occurrence,
    policy: "automatic-routine",
  });

  assert.equal(single.status === "ready" && single.requiresHumanApproval, true);
  assert.equal(every.status === "ready" && every.requiresHumanApproval, true);
  assert.equal(
    routine.status === "ready" && routine.requiresHumanApproval,
    false,
  );
});

const jpegPhoto: RecurringStoryPhoto = {
  alt: "Nuestra gata en el mostrador",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
  focusX: 50,
  focusY: 40,
  zoom: 100,
};

test("un estilo de apertura valida su foto y exige una para la imagen propia", () => {
  assert.equal(
    recurringStoryStyleIssue({ designVariant: "cartel", photo: null }),
    null,
  );
  assert.equal(
    recurringStoryStyleIssue({ designVariant: "imagen", photo: null }),
    "photo-required",
  );
  assert.equal(
    recurringStoryStyleIssue({ designVariant: "imagen", photo: jpegPhoto }),
    null,
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: { ...jpegPhoto, dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
    }),
    "photo-type-invalid",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: {
        ...jpegPhoto,
        dataUrl: `data:image/jpeg;base64,${"A".repeat(recurringStoryPhotoLimits.dataUrlMaximum)}`,
      },
    }),
    "photo-too-large",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: { ...jpegPhoto, alt: "  " },
    }),
    "photo-alt-invalid",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: { ...jpegPhoto, focusY: 101 },
    }),
    "photo-focus-invalid",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: { ...jpegPhoto, focusX: -1 },
    }),
    "photo-focus-invalid",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      photo: { ...jpegPhoto, zoom: 300 },
    }),
    "photo-zoom-invalid",
  );
  // El cartel es un marco de la apertura: el lubricentro no lo ofrece.
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "cartel",
      kind: "lubricentro",
      photo: null,
    }),
    "variant-unavailable",
  );
  assert.equal(
    recurringStoryStyleIssue({
      designVariant: "ventana",
      kind: "lubricentro",
      photo: null,
    }),
    null,
  );
});

test("el documento usa la foto de la regla o, sin ella, la del local", () => {
  const resolution = resolveEveryLocationStoryDraft({
    capturedAt: "2026-09-07T18:00:00.000Z",
    locations: [{ location: centralLocation }, { location: rivadaviaLocation }],
    occurrence,
    policy: "automatic-routine",
  });
  assert.equal(resolution.status, "ready");

  const withoutPhoto = recurringStoryDesignDocument({
    accent: "marca",
    content: resolution.designContent,
    designVariant: "cartel",
    kind: "apertura",
    localDate: "2026-09-08",
    photo: null,
    ruleId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    theme: "promo",
  });
  assert.equal(withoutPhoto.layout, "historia-apertura-cartel");
  assert.equal(withoutPhoto.slug, "story-0f5ee2d4-20260908");
  assert.deepEqual(withoutPhoto.media[0]?.["reference"], {
    assetId: "brand/interior-herramientas",
    source: "brand-library",
  });
  assert.equal(withoutPhoto.content.accent, "marca");

  const withPhoto = recurringStoryDesignDocument({
    accent: "verde",
    content: resolution.designContent,
    designVariant: "imagen",
    kind: "apertura",
    localDate: "2026-09-08",
    photo: jpegPhoto,
    ruleId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    theme: "promo",
  });
  assert.equal(withPhoto.layout, "historia-apertura-imagen");
  assert.deepEqual(withPhoto.media[0], {
    alt: "Nuestra gata en el mostrador",
    fit: "cover",
    focus: { x: 50, y: 40 },
    reference: { dataUrl: jpegPhoto.dataUrl, source: "inline" },
    zoom: 1,
  });

  // El encuadre del panel viaja al documento: el acercamiento va en porcentaje
  // en la regla y como factor en el motor.
  const framed = recurringStoryDesignDocument({
    accent: "marca",
    content: resolution.designContent,
    designVariant: "esquina",
    kind: "apertura",
    localDate: "2026-09-08",
    photo: { ...jpegPhoto, focusX: 100, focusY: 0, zoom: 140 },
    ruleId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    theme: "promo",
  });
  assert.equal(framed.layout, "historia-apertura-esquina");
  const [framedMedia] = framed.media;
  assert.ok(framedMedia);
  assert.deepEqual(framedMedia["focus"], { x: 100, y: 0 });
  assert.equal(framedMedia["zoom"], 1.4);

  // Sin foto propia, cada historia usa la suya de la biblioteca aprobada.
  const lubricentro = recurringStoryDesignDocument({
    accent: "marca",
    content: resolution.designContent,
    designVariant: "ventana",
    kind: "lubricentro",
    localDate: "2026-09-08",
    photo: null,
    ruleId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    theme: "lubricentro",
  });
  assert.equal(lubricentro.layout, "historia-lubricentro-ventana");
  assert.deepEqual(lubricentro.media[0]?.["reference"], {
    assetId: "brand/lubricentro-filtros",
    source: "brand-library",
  });

  assert.throws(
    () =>
      recurringStoryDesignDocument({
        accent: "marca",
        content: resolution.designContent,
        designVariant: "imagen",
        kind: "apertura",
        localDate: "2026-09-08",
        photo: null,
        ruleId: "0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
        theme: "promo",
      }),
    RangeError,
  );
});
