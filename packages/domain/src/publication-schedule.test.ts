import assert from "node:assert/strict";
import test from "node:test";

import {
  diffOccurrences,
  missedOccurrenceDisposition,
  nextOccurrenceAfter,
  occurrenceIsFrozen,
  planOccurrences,
  publicationScheduleDefaultTimeZone,
  singleOccurrenceRule,
  resolveLocalInstant,
  scheduleAcceptsOccurrences,
  scheduleExpirationDue,
  type PublicationOccurrenceRecord,
  type PublicationScheduleRecord,
  type PublicationScheduleRule,
} from "./publication-schedule.ts";

const cordoba = publicationScheduleDefaultTimeZone;
/**
 * Zona con horario de verano y transiciones conocidas en 2026: el 29 de marzo
 * el reloj salta de las 02:00 a las 03:00 —las 02:xx no existen— y el 25 de
 * octubre vuelve de las 03:00 a las 02:00 —las 02:xx ocurren dos veces—.
 * Argentina no tiene DST, así que las anomalías se prueban donde sí ocurren.
 */
const madrid = "Europe/Madrid";

function dailyRule(
  overrides: Partial<PublicationScheduleRule> = {},
): PublicationScheduleRule {
  return {
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    gapPolicy: "skip",
    localTime: "09:00",
    recurrence: { interval: 1, kind: "daily" },
    timeZone: cordoba,
    ...overrides,
  };
}

function scheduleWith(
  overrides: Partial<PublicationScheduleRecord> = {},
): PublicationScheduleRecord {
  return {
    approvalSnapshotId: "5a083000-0000-4000-8000-000000000004",
    id: "6b000000-0000-4000-8000-000000000001",
    lateToleranceMinutes: 30,
    missedPolicy: "run-late",
    organizationId: "1a000000-0000-4000-8000-000000000001",
    publicationId: "5a080000-0000-4000-8000-000000000002",
    rule: dailyRule(),
    status: "active",
    targets: ["instagram_feed", "facebook_page"],
    ...overrides,
  };
}

// --- Resolución de la hora local ---

test("una hora local sin ambigüedad resuelve exacta", () => {
  const plan = resolveLocalInstant("2026-09-15T09:00", cordoba, "skip");
  assert.deepEqual(plan, {
    occurrenceKey: "2026-09-15T09:00",
    resolution: "exact",
    // Córdoba está en UTC-3 todo el año.
    scheduledAt: "2026-09-15T12:00:00.000Z",
  });
});

test("una hora local repetida toma la primera y lo declara", () => {
  const plan = resolveLocalInstant("2026-10-25T02:30", madrid, "skip");
  assert.ok(plan);
  assert.equal(plan.resolution, "ambiguous");
  // 00:30Z es CEST y 01:30Z es CET: las dos son las 02:30 locales.
  assert.equal(plan.scheduledAt, "2026-10-25T00:30:00.000Z");
});

test("una hora local inexistente se saltea si la política lo dice", () => {
  assert.equal(
    resolveLocalInstant("2026-03-29T02:30", madrid, "skip"),
    undefined,
  );
});

test("una hora local inexistente se corre al primer instante válido", () => {
  const plan = resolveLocalInstant("2026-03-29T02:30", madrid, "next-valid");
  assert.ok(plan);
  assert.equal(plan.resolution, "shifted");
  // El salto ocurre exactamente a las 01:00Z: 02:00 local pasa a ser 03:00.
  assert.equal(plan.scheduledAt, "2026-03-29T01:00:00.000Z");
});

test("una clave mal formada no se interpreta", () => {
  assert.throws(
    () => resolveLocalInstant("2026-9-15T09:00", cordoba, "skip"),
    RangeError,
  );
});

// --- Cambio de día, mes, año y zona ---

test("una hora local tardía cae en el día UTC siguiente", () => {
  const plans = planOccurrences(dailyRule({ localTime: "23:30" }), {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-03T00:00:00.000Z",
  });
  // 23:30 en UTC-3 es 02:30Z del día siguiente: la ventana de dos días
  // contiene las noches del 31/08 y del 01/09.
  assert.deepEqual(
    plans.map((plan) => plan.scheduledAt),
    ["2026-09-01T02:30:00.000Z", "2026-09-02T02:30:00.000Z"],
  );
  assert.deepEqual(
    plans.map((plan) => plan.occurrenceKey),
    ["2026-08-31T23:30", "2026-09-01T23:30"],
  );
});

test("el día 31 se lleva al último día del mes cuando se pide clamp", () => {
  const plans = planOccurrences(
    dailyRule({
      effectiveFrom: "2026-01-31T00:00:00.000Z",
      recurrence: {
        interval: 1,
        kind: "monthly",
        monthDay: 31,
        overflow: "clamp",
      },
    }),
    { from: "2026-04-01T00:00:00.000Z", to: "2026-05-01T00:00:00.000Z" },
  );
  assert.deepEqual(
    plans.map((plan) => plan.occurrenceKey),
    ["2026-04-30T09:00"],
  );
});

test("el día 31 saltea el mes corto cuando se pide skip", () => {
  const plans = planOccurrences(
    dailyRule({
      effectiveFrom: "2026-01-31T00:00:00.000Z",
      recurrence: {
        interval: 1,
        kind: "monthly",
        monthDay: 31,
        overflow: "skip",
      },
    }),
    { from: "2026-04-01T00:00:00.000Z", to: "2026-05-01T00:00:00.000Z" },
  );
  assert.deepEqual(plans, []);
});

test("una regla diaria cruza el cambio de año", () => {
  const plans = planOccurrences(
    dailyRule({ effectiveFrom: "2026-12-30T00:00:00.000Z" }),
    { from: "2026-12-31T00:00:00.000Z", to: "2027-01-02T00:00:00.000Z" },
  );
  assert.deepEqual(
    plans.map((plan) => plan.occurrenceKey),
    ["2026-12-31T09:00", "2027-01-01T09:00"],
  );
});

test("una regla quincenal cuenta semanas de calendario", () => {
  const plans = planOccurrences(
    dailyRule({
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      recurrence: { interval: 2, kind: "weekly", weekdays: [2] },
    }),
    { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  );
  // Martes 1 y 15 y 29 de septiembre: una semana sí y una no.
  assert.deepEqual(
    plans.map((plan) => plan.occurrenceKey),
    ["2026-09-01T09:00", "2026-09-15T09:00", "2026-09-29T09:00"],
  );
});

test("la misma regla en otra zona produce otro instante", () => {
  const window = {
    from: "2026-09-15T00:00:00.000Z",
    to: "2026-09-16T00:00:00.000Z",
  };
  const [enCordoba] = planOccurrences(dailyRule(), window);
  const [enMadrid] = planOccurrences(dailyRule({ timeZone: madrid }), window);
  assert.equal(enCordoba?.occurrenceKey, enMadrid?.occurrenceKey);
  assert.equal(enCordoba?.scheduledAt, "2026-09-15T12:00:00.000Z");
  // Madrid está en UTC+2 en septiembre.
  assert.equal(enMadrid?.scheduledAt, "2026-09-15T07:00:00.000Z");
});

test("la expansión respeta la vigencia", () => {
  const plans = planOccurrences(
    dailyRule({ effectiveUntil: "2026-09-02T23:59:59.000Z" }),
    { from: "2026-09-01T00:00:00.000Z", to: "2026-09-05T00:00:00.000Z" },
  );
  assert.deepEqual(
    plans.map((plan) => plan.occurrenceKey),
    ["2026-09-01T09:00", "2026-09-02T09:00"],
  );
});

test("una programación única produce exactamente una ocurrencia", () => {
  const rule = singleOccurrenceRule({
    gapPolicy: "skip",
    localDate: "2026-09-15",
    localTime: "09:00",
    timeZone: cordoba,
  });
  assert.ok(rule);
  const plans = planOccurrences(rule, {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
  });
  assert.deepEqual(plans, [
    {
      occurrenceKey: "2026-09-15T09:00",
      resolution: "exact",
      scheduledAt: "2026-09-15T12:00:00.000Z",
    },
  ]);
  assert.equal(
    nextOccurrenceAfter(rule, "2026-09-15T12:00:00.000Z"),
    undefined,
    "Una vez publicada no queda nada por delante.",
  );
});

test("una programación única en una hora inexistente no se crea", () => {
  assert.equal(
    singleOccurrenceRule({
      gapPolicy: "skip",
      localDate: "2026-03-29",
      localTime: "02:30",
      timeZone: madrid,
    }),
    undefined,
  );
});

// --- Próxima ocurrencia ---

test("la próxima ocurrencia es estrictamente posterior", () => {
  const plan = nextOccurrenceAfter(dailyRule(), "2026-09-15T12:00:00.000Z");
  assert.equal(plan?.occurrenceKey, "2026-09-16T09:00");
});

test("una regla vencida no tiene próxima ocurrencia", () => {
  const plan = nextOccurrenceAfter(
    dailyRule({ effectiveUntil: "2026-09-10T00:00:00.000Z" }),
    "2026-09-15T12:00:00.000Z",
  );
  assert.equal(plan, undefined);
});

test("una regla mensual encuentra su próxima ocurrencia lejana", () => {
  const plan = nextOccurrenceAfter(
    dailyRule({
      effectiveFrom: "2026-01-05T00:00:00.000Z",
      recurrence: {
        interval: 1,
        kind: "monthly",
        monthDay: 5,
        overflow: "skip",
      },
    }),
    "2026-09-06T00:00:00.000Z",
  );
  assert.equal(plan?.occurrenceKey, "2026-10-05T09:00");
});

// --- Edición de la regla ---

function planned(
  occurrenceKey: string,
  scheduledAt: string,
): PublicationOccurrenceRecord {
  return { occurrenceKey, resolution: "exact", scheduledAt, status: "planned" };
}

test("una ocurrencia despachada queda congelada aunque la regla ya no la produzca", () => {
  const dispatched: PublicationOccurrenceRecord = {
    occurrenceKey: "2026-09-01T09:00",
    publicationOrderId: "7c000000-0000-4000-8000-000000000001",
    resolution: "exact",
    scheduledAt: "2026-09-01T12:00:00.000Z",
    status: "dispatched",
  };
  const diff = diffOccurrences([], [dispatched]);
  assert.deepEqual(diff.frozen, ["2026-09-01T09:00"]);
  assert.deepEqual(diff.obsolete, []);
  assert.deepEqual(diff.reschedule, []);
  assert.ok(occurrenceIsFrozen(dispatched));
});

test("una ocurrencia planificada que la regla ya no produce queda obsoleta", () => {
  const diff = diffOccurrences(
    [],
    [planned("2026-09-02T09:00", "2026-09-02T12:00:00.000Z")],
  );
  assert.deepEqual(diff.obsolete, ["2026-09-02T09:00"]);
});

test("una ocurrencia ya cancelada no vuelve a retirarse", () => {
  const diff = diffOccurrences(
    [],
    [
      {
        occurrenceKey: "2026-09-02T09:00",
        resolution: "exact",
        scheduledAt: "2026-09-02T12:00:00.000Z",
        status: "cancelled",
      },
    ],
  );
  assert.deepEqual(diff.obsolete, []);
  assert.deepEqual(diff.frozen, []);
});

test("un instante movido reprograma la misma ocurrencia", () => {
  const diff = diffOccurrences(
    [
      {
        occurrenceKey: "2026-09-02T09:00",
        resolution: "exact",
        scheduledAt: "2026-09-02T13:00:00.000Z",
      },
    ],
    [planned("2026-09-02T09:00", "2026-09-02T12:00:00.000Z")],
  );
  assert.deepEqual(diff.reschedule, [
    {
      occurrenceKey: "2026-09-02T09:00",
      resolution: "exact",
      scheduledAt: "2026-09-02T13:00:00.000Z",
    },
  ]);
  assert.deepEqual(diff.create, []);
});

test("una ocurrencia nueva se crea", () => {
  const diff = diffOccurrences(
    [
      {
        occurrenceKey: "2026-09-03T09:00",
        resolution: "exact",
        scheduledAt: "2026-09-03T12:00:00.000Z",
      },
    ],
    [],
  );
  assert.deepEqual(
    diff.create.map((plan) => plan.occurrenceKey),
    ["2026-09-03T09:00"],
  );
});

// --- Estados de la programación ---

test("una programación pausada o cancelada no produce ocurrencias", () => {
  for (const status of [
    "paused",
    "cancelled",
    "expired",
    "completed",
  ] as const) {
    assert.equal(
      scheduleAcceptsOccurrences(
        scheduleWith({ status }),
        "2026-09-15T12:00:00.000Z",
      ),
      false,
      `El estado ${status} no debería producir ocurrencias.`,
    );
  }
});

test("una programación activa fuera de vigencia no produce ocurrencias", () => {
  const schedule = scheduleWith({
    rule: dailyRule({ effectiveUntil: "2026-09-10T00:00:00.000Z" }),
  });
  assert.equal(
    scheduleAcceptsOccurrences(schedule, "2026-09-09T00:00:00.000Z"),
    true,
  );
  assert.equal(
    scheduleAcceptsOccurrences(schedule, "2026-09-11T00:00:00.000Z"),
    false,
  );
});

test("la expiración se detecta sobre activas y pausadas, no sobre terminales", () => {
  const rule = dailyRule({ effectiveUntil: "2026-09-10T00:00:00.000Z" });
  const later = "2026-09-11T00:00:00.000Z";
  assert.equal(
    scheduleExpirationDue(scheduleWith({ rule, status: "active" }), later),
    true,
  );
  assert.equal(
    scheduleExpirationDue(scheduleWith({ rule, status: "paused" }), later),
    true,
  );
  assert.equal(
    scheduleExpirationDue(scheduleWith({ rule, status: "cancelled" }), later),
    false,
  );
  assert.equal(
    scheduleExpirationDue(scheduleWith({ status: "active" }), later),
    false,
    "Sin fecha de fin no hay expiración.",
  );
});

// --- Ocurrencias vencidas ---

test("una ocurrencia vencida se publica dentro de la tolerancia", () => {
  const schedule = scheduleWith({ lateToleranceMinutes: 30 });
  const occurrence = { scheduledAt: "2026-09-15T12:00:00.000Z" };
  assert.equal(
    missedOccurrenceDisposition(
      schedule,
      occurrence,
      "2026-09-15T12:20:00.000Z",
    ),
    "run",
  );
  assert.equal(
    missedOccurrenceDisposition(
      schedule,
      occurrence,
      "2026-09-15T12:31:00.000Z",
    ),
    "skip",
  );
});

test("con política skip una ocurrencia vencida no se publica nunca", () => {
  assert.equal(
    missedOccurrenceDisposition(
      scheduleWith({ missedPolicy: "skip" }),
      { scheduledAt: "2026-09-15T12:00:00.000Z" },
      "2026-09-15T12:00:01.000Z",
    ),
    "skip",
  );
});

// --- Reglas inválidas ---

test("una regla inválida se rechaza al expandirla", () => {
  const window = {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-02T00:00:00.000Z",
  };
  assert.throws(
    () => planOccurrences(dailyRule({ localTime: "9:00" }), window),
    RangeError,
  );
  assert.throws(
    () =>
      planOccurrences(
        dailyRule({ recurrence: { interval: 0, kind: "daily" } }),
        window,
      ),
    RangeError,
  );
  assert.throws(
    () =>
      planOccurrences(
        dailyRule({
          recurrence: { interval: 1, kind: "weekly", weekdays: [] },
        }),
        window,
      ),
    RangeError,
  );
  assert.throws(
    () =>
      planOccurrences(
        dailyRule({
          effectiveFrom: "2026-09-02T00:00:00.000Z",
          effectiveUntil: "2026-09-01T00:00:00.000Z",
        }),
        window,
      ),
    RangeError,
  );
  assert.throws(
    () => planOccurrences(dailyRule({ timeZone: "Marte/Olympus" }), window),
    RangeError,
  );
});
