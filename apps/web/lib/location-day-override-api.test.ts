import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import {
  deleteLocationDayOverride,
  loadLocationDayOverrides,
  previewLocationDayOverride,
  saveLocationDayOverride,
} from "./location-day-override-api.ts";

const apiBaseUrl = "https://api.example.invalid/";
const locationId = "location-1";

const closedOverride = Object.freeze({
  id: "override-1",
  localDate: "2026-12-25",
  locationId,
  sourceLabel: "Feriado nacional",
  status: "closed",
  version: 1,
});

const impact = Object.freeze({
  affectedStoryCount: 2,
  localDate: "2026-12-25",
  timeZone: "America/Argentina/Cordoba",
  willBlockHoursSensitiveStories: true,
  willRequireHumanApproval: false,
});

type RecordedRequest = Readonly<{
  body: unknown;
  csrfToken: string | null;
  method: string;
  url: URL;
}>;

function stubFetch(
  context: TestContext,
  handler: (url: URL) => Response,
): { readonly requests: readonly RecordedRequest[] } {
  const originalFetch = globalThis.fetch;
  const requests: RecordedRequest[] = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.pathname === "/auth/csrf") {
      return Promise.resolve(Response.json({ csrfToken: "csrf-token" }));
    }
    const body = init?.body;
    requests.push({
      body: typeof body === "string" ? (JSON.parse(body) as unknown) : body,
      csrfToken: new Headers(init?.headers).get("x-csrf-token"),
      method: init?.method ?? "GET",
      url,
    });
    return Promise.resolve(handler(url));
  };
  return { requests };
}

test("consulta excepciones por rango de fechas civiles", async (context) => {
  const calls = stubFetch(context, () =>
    Response.json({
      endDate: "2026-12-31",
      locationId,
      overrides: [closedOverride],
      startDate: "2026-12-01",
    }),
  );

  const result = await loadLocationDayOverrides(apiBaseUrl, locationId, {
    endDate: "2026-12-31",
    startDate: "2026-12-01",
  });

  assert.equal(result.kind, "ready");
  assert.deepEqual(result.value.overrides, [closedOverride]);
  const request = calls.requests[0];
  assert.ok(request);
  assert.equal(
    request.url.pathname,
    `/organization/configuration/locations/${locationId}/day-overrides`,
  );
  assert.equal(request.url.searchParams.get("startDate"), "2026-12-01");
  assert.equal(request.url.searchParams.get("endDate"), "2026-12-31");
});

test("rechaza una excepción abierta que llega sin horario", async (context) => {
  stubFetch(context, () =>
    Response.json({
      endDate: "2026-12-31",
      locationId,
      overrides: [{ ...closedOverride, status: "open" }],
      startDate: "2026-12-01",
    }),
  );

  const result = await loadLocationDayOverrides(apiBaseUrl, locationId, {
    endDate: "2026-12-31",
    startDate: "2026-12-01",
  });

  assert.equal(result.kind, "error");
});

test("previsualizar no envía versión esperada y sí exige CSRF", async (context) => {
  const calls = stubFetch(context, () => Response.json({ impact }));

  const result = await previewLocationDayOverride(apiBaseUrl, locationId, {
    expectedVersion: 3,
    localDate: "2026-12-25",
    sourceLabel: "Feriado nacional",
    status: "closed",
  });

  assert.equal(result.kind, "ready");
  assert.deepEqual(result.value.impact, impact);
  const request = calls.requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.equal(
    request.url.pathname,
    `/organization/configuration/locations/${locationId}/day-overrides/preview`,
  );
  assert.deepEqual(request.body, {
    localDate: "2026-12-25",
    sourceLabel: "Feriado nacional",
    status: "closed",
  });
  assert.equal(request.csrfToken, "csrf-token");
});

test("guardar envía versión esperada y devuelve la excepción persistida", async (context) => {
  const openOverride = {
    id: "override-2",
    localDate: "2026-12-24",
    locationId,
    openingHours: "09:00 a 13:00",
    sourceLabel: "Horario reducido de Nochebuena",
    status: "open",
    version: 2,
  };
  const calls = stubFetch(context, () =>
    Response.json({
      impact: { ...impact, localDate: "2026-12-24" },
      override: openOverride,
    }),
  );

  const result = await saveLocationDayOverride(apiBaseUrl, locationId, {
    expectedVersion: 1,
    localDate: "2026-12-24",
    openingHours: "09:00 a 13:00",
    sourceLabel: "Horario reducido de Nochebuena",
    status: "open",
  });

  assert.equal(result.kind, "ready");
  assert.deepEqual(result.value.override, openOverride);
  const request = calls.requests[0];
  assert.ok(request);
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, {
    expectedVersion: 1,
    localDate: "2026-12-24",
    openingHours: "09:00 a 13:00",
    sourceLabel: "Horario reducido de Nochebuena",
    status: "open",
  });
});

test("una versión vencida se distingue de un error de red", async (context) => {
  stubFetch(context, () => new Response(null, { status: 409 }));

  assert.deepEqual(
    await saveLocationDayOverride(apiBaseUrl, locationId, {
      expectedVersion: 1,
      localDate: "2026-12-25",
      sourceLabel: "Feriado nacional",
      status: "closed",
    }),
    { kind: "conflict" },
  );
});

test("borrar viaja con la fecha civil y su versión esperada", async (context) => {
  const calls = stubFetch(context, () =>
    Response.json({ impact: { ...impact, affectedStoryCount: 0 } }),
  );

  const result = await deleteLocationDayOverride(
    apiBaseUrl,
    locationId,
    "2026-12-25",
    4,
  );

  assert.equal(result.kind, "ready");
  assert.equal(result.value.override, undefined);
  const request = calls.requests[0];
  assert.ok(request);
  assert.equal(request.method, "DELETE");
  assert.equal(request.body, undefined);
  assert.equal(
    request.url.pathname,
    `/organization/configuration/locations/${locationId}/day-overrides/2026-12-25`,
  );
  assert.equal(request.url.searchParams.get("expectedVersion"), "4");
});
