import assert from "node:assert/strict";
import test from "node:test";

import {
  loadRecurringStoryWorkspace,
  saveRecurringStoryVisualStyle,
  saveRecurringStoryRule,
} from "./recurring-story-api.ts";

const apiBaseUrl = "https://api.example.invalid/";
const photo = {
  alt: "Nuestra gata en el mostrador",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
  focusY: 40,
};
const rule = {
  accent: "marca",
  approvalPolicy: "human-each-cycle",
  designVariant: "cartel",
  effectiveFrom: "2026-09-08T11:30:00.000Z",
  id: "rule-1",
  leadTimeMinutes: 120,
  localTime: "08:30",
  locationId: "location-1",
  name: "Apertura",
  photo: null,
  status: "active",
  theme: "taller",
  timeZone: "America/Argentina/Cordoba",
  version: 1,
  weekdays: [1, 2, 3, 4, 5, 6],
};
const workspace = {
  canUseAutomaticApproval: true,
  locations: [
    {
      addressLine: "Rivadavia 673",
      city: "Frías",
      id: "location-1",
      isActive: true,
      name: "Sucursal Rivadavia",
      openingHours: "Lun a sáb · 08:30 a 13:00",
      province: "Santiago del Estero",
      timeZone: "America/Argentina/Cordoba",
      version: 2,
    },
  ],
  rules: [rule],
};

test("carga reglas y fuentes de sucursal tipadas", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () => Promise.resolve(Response.json(workspace));

  const result = await loadRecurringStoryWorkspace(apiBaseUrl);

  assert.equal(result.kind, "ready");
  assert.equal(result.workspace.locations[0]?.version, 2);
  assert.equal(result.workspace.rules[0]?.approvalPolicy, "human-each-cycle");
});

test("guarda con CSRF e idempotencia sin enviar una orden de publicación", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: Readonly<{ headers: Headers; path: string }>[] = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({ headers: new Headers(init?.headers), path: url.pathname });
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : Response.json({ rule, status: "created" }),
    );
  };

  const result = await saveRecurringStoryRule(apiBaseUrl, {
    accent: "marca",
    approvalPolicy: "human-each-cycle",
    designVariant: "cartel",
    effectiveFromLocalDate: "2026-09-08",
    idempotencyKey: "recurring-rule-123",
    leadTimeMinutes: 120,
    localTime: "08:30",
    locationId: "location-1",
    name: "Apertura",
    photo: null,
    theme: "taller",
    weekdays: [1, 2, 3, 4, 5, 6],
  });

  assert.equal(result.kind, "saved");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/auth/csrf", "/scheduling/recurring-stories"],
  );
  const ruleCall = calls[1];
  assert.ok(ruleCall);
  assert.equal(ruleCall.headers.get("idempotency-key"), "recurring-rule-123");
  assert.equal(ruleCall.headers.get("x-csrf-token"), "csrf-safe");
});

test("un contrato incompleto falla cerrado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () => Promise.resolve(Response.json({ rules: [] }));

  assert.deepEqual(await loadRecurringStoryWorkspace(apiBaseUrl), {
    kind: "error",
    message: "La API devolvió reglas recurrentes que el panel no puede usar.",
  });
});

test("actualiza el estilo con versión, CSRF e idempotencia", async (context) => {
  const originalFetch = globalThis.fetch;
  const calls: {
    body?: string;
    headers: Headers;
    method?: string;
    path: string;
  }[] = [];
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({
      headers: new Headers(init?.headers),
      path: url.pathname,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
      ...(init?.method === undefined ? {} : { method: init.method }),
    });
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : Response.json({ rule: { ...rule, version: 2 }, status: "updated" }),
    );
  };

  const result = await saveRecurringStoryVisualStyle(apiBaseUrl, {
    accent: "verde",
    designVariant: "locales",
    expectedVersion: 1,
    idempotencyKey: "recurring-visual-style-123",
    photo,
    ruleId: "rule-1",
    theme: "promo",
  });

  assert.equal(result.kind, "saved");
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/auth/csrf", "/scheduling/recurring-stories/rule-1/visual-style"],
  );
  const updateCall = calls[1];
  assert.ok(updateCall);
  assert.equal(updateCall.method, "PATCH");
  assert.equal(
    updateCall.headers.get("idempotency-key"),
    "recurring-visual-style-123",
  );
  assert.equal(updateCall.headers.get("x-csrf-token"), "csrf-safe");
  // El estilo viaja entero: color, diseño y foto.
  assert.deepEqual(JSON.parse(updateCall.body ?? "{}"), {
    accent: "verde",
    designVariant: "locales",
    expectedVersion: 1,
    photo,
    theme: "promo",
  });
});

test("una regla con foto propia se lee entera y una foto rota falla cerrado", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = () =>
    Promise.resolve(
      Response.json({
        ...workspace,
        rules: [{ ...rule, accent: "verde", designVariant: "imagen", photo }],
      }),
    );
  const ready = await loadRecurringStoryWorkspace(apiBaseUrl);
  assert.equal(ready.kind, "ready");
  assert.deepEqual(ready.workspace.rules[0]?.photo, photo);
  assert.equal(ready.workspace.rules[0].designVariant, "imagen");

  globalThis.fetch = () =>
    Promise.resolve(
      Response.json({
        ...workspace,
        rules: [
          { ...rule, photo: { ...photo, dataUrl: "https://x.test/a.jpg" } },
        ],
      }),
    );
  assert.equal((await loadRecurringStoryWorkspace(apiBaseUrl)).kind, "error");
});

test("una foto demasiado pesada se explica en vez de fallar mudo", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (input): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    return Promise.resolve(
      url.pathname === "/auth/csrf"
        ? Response.json({ csrfToken: "csrf-safe" })
        : new Response(null, { status: 413 }),
    );
  };

  const result = await saveRecurringStoryVisualStyle(apiBaseUrl, {
    accent: "marca",
    designVariant: "cartel",
    expectedVersion: 1,
    idempotencyKey: "recurring-visual-style-413",
    photo,
    ruleId: "rule-1",
    theme: "promo",
  });

  assert.equal(result.kind, "error");
  assert.match(result.message, /demasiado pesada/u);
});
