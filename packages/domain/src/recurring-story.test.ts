import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
