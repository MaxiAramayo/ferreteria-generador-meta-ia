import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPublicationScheduleCalendar,
  previewPublicationScheduleUpdate,
  type ScheduleRuleSubmission,
} from "./publication-schedule-api.ts";

const apiBaseUrl = "https://api.example.invalid/";
const rule: ScheduleRuleSubmission = Object.freeze({
  effectiveFromLocalDate: "2026-09-09",
  gapPolicy: "skip",
  lateToleranceMinutes: 0,
  localTime: "09:00",
  missedPolicy: "skip",
  recurrenceKind: "once",
  targets: ["instagram_feed"],
  timeZone: "America/Argentina/Cordoba",
});

const calendar = Object.freeze({
  entries: [
    {
      occurrences: [
        {
          occurrenceKey: "2026-09-09T09:00:00[America/Argentina/Cordoba]",
          resolution: "exact",
          scheduledAt: "2026-09-09T12:00:00.000Z",
          status: "planned",
        },
      ],
      schedule: {
        approvalSnapshotId: "snapshot-1",
        effectiveFrom: "2026-09-09T12:00:00.000Z",
        gapPolicy: "skip",
        id: "schedule-1",
        lateToleranceMinutes: 0,
        localTime: "09:00",
        missedPolicy: "skip",
        publicationId: "publication-1",
        recurrence: { kind: "once" },
        status: "active",
        targets: ["instagram_feed"],
        timeZone: "America/Argentina/Cordoba",
        version: 1,
      },
    },
  ],
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-10-01T00:00:00.000Z",
});

test("carga el calendario tipado y conserva la ventana solicitada", async (context) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: URL | undefined;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input): Promise<Response> => {
    requestedUrl = new URL(input instanceof Request ? input.url : input);
    return Promise.resolve(Response.json(calendar));
  };

  const result = await loadPublicationScheduleCalendar(apiBaseUrl, {
    from: calendar.from,
    to: calendar.to,
  });

  assert.equal(result.kind, "ready");
  assert.equal(result.value.entries[0]?.schedule.timeZone, rule.timeZone);
  assert.ok(requestedUrl);
  assert.equal(requestedUrl.pathname, "/schedules");
  assert.equal(requestedUrl.searchParams.get("from"), calendar.from);
  assert.equal(requestedUrl.searchParams.get("to"), calendar.to);
});

test("rechaza un calendario que omite el snapshot aprobado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () =>
    Promise.resolve(
      Response.json({
        ...calendar,
        entries: [
          {
            ...calendar.entries[0],
            schedule: {
              ...calendar.entries[0]?.schedule,
              approvalSnapshotId: undefined,
            },
          },
        ],
      }),
    );

  assert.deepEqual(
    await loadPublicationScheduleCalendar(apiBaseUrl, {
      from: calendar.from,
      to: calendar.to,
    }),
    {
      kind: "error",
      message: "El calendario recibido no tiene un formato utilizable.",
    },
  );
});

test("calcula impacto con CSRF y sin idempotencia porque no escribe", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: { readonly headers: Headers; readonly path: string }[] = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ headers: new Headers(init?.headers), path: url.pathname });
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : Response.json({
            cancelledOccurrenceCount: 1,
            createdOccurrenceCount: 1,
            frozenOccurrenceCount: 0,
            rescheduledOccurrenceCount: 0,
            scheduleId: "schedule-1",
            status: "preview",
            version: 1,
          }),
    );
  };

  const result = await previewPublicationScheduleUpdate(
    apiBaseUrl,
    "schedule-1",
    1,
    rule,
  );

  assert.equal(result.kind, "ready");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/auth/csrf", "/schedules/schedule-1/preview"],
  );
  const previewCall = calls[1];
  assert.ok(previewCall);
  assert.equal(previewCall.headers.get("x-csrf-token"), "csrf-safe");
  assert.equal(previewCall.headers.get("idempotency-key"), null);
});
