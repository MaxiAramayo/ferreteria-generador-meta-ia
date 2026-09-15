import assert from "node:assert/strict";
import test from "node:test";

import type {
  MetaConnectionResponse,
  PublicationOperationalAlertResponse,
  PublicationScheduleCalendarResponse,
  PublicationScheduleResponse,
} from "@aramayo/contracts";

import {
  greetingFor,
  initialTodaySources,
  metaConnectionSummary,
  outingDateParts,
  sumCounts,
  todayShortcuts,
  todayTickets,
  upcomingOutings,
  type TodayPermissions,
} from "./today-board-presentation.ts";

const nobody: TodayPermissions = {
  approve: false,
  connections: false,
  edit: false,
  publish: false,
  schedule: false,
};

function alert(
  id: string,
  severity: PublicationOperationalAlertResponse["severity"],
): PublicationOperationalAlertResponse {
  return {
    cause: "attempts-exhausted",
    firstObservedAt: "2026-09-15T10:00:00.000Z",
    id,
    kind: "publication-manual-action",
    lastObservedAt: "2026-09-15T11:00:00.000Z",
    observations: 1,
    safeAction: "reconcile",
    severity,
  };
}

function connection(
  overrides: Partial<MetaConnectionResponse>,
): MetaConnectionResponse {
  return {
    accountName: "Ferretería Aramayo",
    assets: [],
    canPublish: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    grantedPermissions: [],
    health: "healthy",
    id: "connection-1",
    lastCheckedAt: "2026-09-15T00:00:00.000Z",
    missingPermissions: [],
    provider: "meta",
    updatedAt: "2026-09-15T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function schedule(
  overrides: Partial<PublicationScheduleResponse>,
): PublicationScheduleResponse {
  return {
    approvalSnapshotId: "snapshot-1",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    gapPolicy: "skip",
    id: "schedule-1",
    lateToleranceMinutes: 30,
    localTime: "10:30",
    missedPolicy: "skip",
    publicationId: "publication-1",
    recurrence: { kind: "once" },
    status: "active",
    targets: ["instagram_feed", "facebook_page"],
    timeZone: "America/Argentina/Cordoba",
    version: 1,
    ...overrides,
  };
}

test("cada rol arranca consultando sólo lo que puede leer", () => {
  assert.deepEqual(
    Object.keys(initialTodaySources({ ...nobody, edit: true })),
    ["drafts", "needsAttention"],
  );
  assert.deepEqual(
    Object.keys(
      initialTodaySources({ ...nobody, approve: true, schedule: true }),
    ),
    ["readyForReview", "approved"],
  );
  assert.deepEqual(
    Object.keys(initialTodaySources({ ...nobody, publish: true })),
    ["alerts", "publishing"],
  );
  assert.deepEqual(
    Object.keys(initialTodaySources({ ...nobody, connections: true })),
    ["metaConnections"],
  );
  assert.deepEqual(initialTodaySources(nobody), {});
});

test("las tarjetas cuentan en singular y plural y marcan qué pide atención", () => {
  const tickets = todayTickets({
    approved: { kind: "ready", value: 0 },
    drafts: { kind: "ready", value: 1 },
    needsAttention: { kind: "ready", value: 2 },
    readyForReview: { kind: "ready", value: 3 },
  });
  assert.deepEqual(
    tickets.map((ticket) => [
      ticket.id,
      ticket.value,
      ticket.unit,
      ticket.tone,
    ]),
    [
      ["readyForReview", "3", "piezas por aprobar", "attention"],
      ["drafts", "1", "borrador", "attention"],
      ["needsAttention", "2", "piezas con problemas", "urgent"],
      ["approved", "0", "aprobadas sin programar", "calm"],
    ],
  );
  assert.equal(tickets[3]?.href, "/programacion");
});

test("una fuente cargando o caída no se muestra como cero", () => {
  const [pending, failed] = todayTickets({
    drafts: { kind: "loading" },
    needsAttention: { kind: "error", message: "No se pudo consultar la API." },
  });
  assert.ok(pending !== undefined && failed !== undefined);
  assert.equal(pending.busy, true);
  assert.equal(pending.value, "…");
  assert.equal(failed.value, "—");
  assert.equal(failed.detail, "No se pudo consultar la API.");
  assert.equal(failed.tone, "attention");
});

test("alertas y publicación dicen qué está trabado", () => {
  const [alerts, publishing] = todayTickets({
    alerts: {
      kind: "ready",
      value: [alert("alert-1", "urgent"), alert("alert-2", "attention")],
    },
    publishing: { kind: "ready", value: { canPublish: false, targets: [] } },
  });
  assert.ok(alerts !== undefined && publishing !== undefined);
  assert.equal(alerts.value, "2");
  assert.equal(alerts.unit, "alertas abiertas");
  assert.equal(alerts.tone, "urgent");
  assert.match(alerts.detail, /^1 es urgente\./u);
  assert.equal(publishing.value, "Trabada");
  assert.equal(publishing.tone, "urgent");

  const [unconfirmed] = todayTickets({
    publishing: { kind: "ready", value: null },
  });
  assert.ok(unconfirmed !== undefined);
  assert.equal(unconfirmed.tone, "attention");
  assert.equal(unconfirmed.unit, "sin confirmar");
});

test("la conexión con Meta dice qué falta, no sólo que falla", () => {
  assert.equal(metaConnectionSummary([]).value, "Sin conectar");
  assert.equal(metaConnectionSummary([connection({})]).tone, "calm");
  assert.equal(
    metaConnectionSummary([
      connection({ canPublish: false, health: "token_expired" }),
    ]).value,
    "Vencida",
  );
  assert.equal(
    metaConnectionSummary([connection({ canPublish: false })]).value,
    "Incompleta",
  );
});

test("sumar conteos no convierte un fallo en cero", () => {
  assert.deepEqual(
    sumCounts([
      { kind: "ready", value: 2 },
      { kind: "ready", value: 3 },
    ]),
    { kind: "ready", value: 5 },
  );
  assert.deepEqual(
    sumCounts([
      { kind: "ready", value: 2 },
      { kind: "error", message: "falló" },
    ]),
    { kind: "error", message: "falló" },
  );
});

test("las próximas salidas ignoran lo pausado, lo pasado y lo ya despachado", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const calendar: PublicationScheduleCalendarResponse = {
    entries: [
      {
        occurrences: [
          {
            occurrenceKey: "later",
            resolution: "exact",
            scheduledAt: "2026-09-18T13:30:00.000Z",
            status: "planned",
          },
          {
            occurrenceKey: "past",
            resolution: "exact",
            scheduledAt: "2026-09-14T13:30:00.000Z",
            status: "planned",
          },
          {
            occurrenceKey: "sent",
            resolution: "exact",
            scheduledAt: "2026-09-16T13:30:00.000Z",
            status: "dispatched",
          },
        ],
        schedule: schedule({}),
      },
      {
        occurrences: [
          {
            occurrenceKey: "soon",
            resolution: "exact",
            scheduledAt: "2026-09-16T13:30:00.000Z",
            status: "planned",
          },
        ],
        schedule: schedule({
          id: "schedule-2",
          publicationId: "publication-2",
          targets: ["instagram_story"],
        }),
      },
      {
        occurrences: [
          {
            occurrenceKey: "paused",
            resolution: "exact",
            scheduledAt: "2026-09-16T14:00:00.000Z",
            status: "planned",
          },
        ],
        schedule: schedule({ id: "schedule-3", status: "paused" }),
      },
    ],
    from: now.toISOString(),
    to: "2026-09-29T12:00:00.000Z",
  };
  const titles = new Map([["publication-1", "Aceite PITTS 5W40"]]);
  assert.deepEqual(
    upcomingOutings(calendar, titles, now, 5).map((outing) => [
      outing.key,
      outing.title,
      outing.targets,
    ]),
    [
      ["schedule-2:soon", "Pieza programada", "Instagram historia"],
      ["schedule-1:later", "Aceite PITTS 5W40", "Instagram feed · Facebook"],
    ],
  );
  assert.equal(upcomingOutings(calendar, titles, now, 1).length, 1);
});

test("la hora de salida se muestra en la zona de la programación", () => {
  const parts = outingDateParts(
    "2026-09-16T13:30:00.000Z",
    "America/Argentina/Cordoba",
  );
  assert.equal(parts.time, "10:30");
  assert.match(parts.day, /16/u);
  assert.equal(
    outingDateParts("2026-09-16T13:30:00.000Z", "Zona/Inexistente").time,
    "13:30",
  );
});

test("los atajos siguen al permiso", () => {
  assert.deepEqual(todayShortcuts(nobody), []);
  assert.deepEqual(
    todayShortcuts({ ...nobody, edit: true, schedule: true }).map(
      (shortcut) => [shortcut.label, shortcut.primary],
    ),
    [
      ["Crear pieza", true],
      ["Programar una salida", false],
    ],
  );
  assert.equal(todayShortcuts({ ...nobody, schedule: true })[0]?.primary, true);
});

test("el saludo usa el nombre de pila y nunca lee un correo", () => {
  assert.equal(greetingFor("Marta Aramayo"), "Hola, Marta.");
  assert.equal(greetingFor("  Juan  "), "Hola, Juan.");
  assert.equal(greetingFor("editora.e2e@aramayo.invalid"), "Hola.");
  assert.equal(greetingFor(""), "Hola.");
});
