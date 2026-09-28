import assert from "node:assert/strict";
import test from "node:test";

import {
  nextHalfHour,
  releasePiece,
  releaseTargetOptions,
} from "./publication-release.ts";

const apiBaseUrl = "https://api.invalid/";
const connected = {
  accountName: "@ferreteriaaramayo",
  canPublish: true,
  targets: ["instagram_feed", "instagram_story", "facebook_page"] as const,
};

test("una historia sale como historia; un post, en el feed y opcionalmente en Facebook", () => {
  const story = releaseTargetOptions("historia", connected, true);
  assert.deepEqual(
    story.map((option) => [option.target, option.checked]),
    [["instagram_story", true]],
  );

  const post = releaseTargetOptions("feed", connected, false);
  assert.deepEqual(
    post.map((option) => [
      option.target,
      option.checked,
      option.disabledReason,
    ]),
    [
      ["instagram_feed", true, null],
      ["facebook_page", false, null],
    ],
  );
});

test("Facebook sin texto y un destino sin conectar no se pueden elegir", () => {
  const withoutCaption = releaseTargetOptions("feed", connected, true);
  assert.equal(
    withoutCaption.find((option) => option.target === "facebook_page")
      ?.disabledReason,
    "Facebook necesita el texto del post.",
  );
  const disconnected = releaseTargetOptions("historia", null, true);
  assert.deepEqual(
    disconnected.map((option) => [option.checked, option.disabledReason]),
    [[false, "No está conectado."]],
  );
});

test("«Más tarde» propone la próxima media hora, nunca un horario pasado", () => {
  assert.deepEqual(nextHalfHour(new Date(2026, 8, 28, 17, 5)), {
    localDate: "2026-09-28",
    localTime: "17:30",
  });
  // A menos de diez minutos no da tiempo: salta a la siguiente.
  assert.deepEqual(nextHalfHour(new Date(2026, 8, 28, 17, 25)), {
    localDate: "2026-09-28",
    localTime: "18:00",
  });
  // Cruza la medianoche con diez minutos de margen, y con menos salta.
  assert.deepEqual(nextHalfHour(new Date(2026, 8, 28, 23, 50)), {
    localDate: "2026-09-29",
    localTime: "00:00",
  });
  assert.deepEqual(nextHalfHour(new Date(2026, 8, 28, 23, 52)), {
    localDate: "2026-09-29",
    localTime: "00:30",
  });
});

type Call = { body: unknown; path: string };

function fakeApi(responses: Readonly<Record<string, () => Response>>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (input, init): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    calls.push({
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      path: url.pathname,
    });
    if (url.pathname === "/auth/csrf") {
      return Promise.resolve(Response.json({ csrfToken: "csrf" }));
    }
    const respond = responses[url.pathname];
    return Promise.resolve(
      respond === undefined ? new Response(null, { status: 404 }) : respond(),
    );
  };
  return calls;
}

const order = {
  orderId: "0b6f1c5e-43e5-4f5d-8e0b-2f5c1d2e3a4b",
  publicationId: "p-1",
  status: "publishing",
  version: 6,
};

test("publicar ahora aprueba y publica con la versión que deja la aprobación", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const calls = fakeApi({
    "/publications/p-1/approve": () =>
      Response.json({
        publicationId: "p-1",
        snapshotId: "s",
        status: "approved",
        version: 5,
      }),
    "/publications/p-1/publish": () => Response.json(order, { status: 202 }),
  });

  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: false,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: ["instagram_story"],
    version: 4,
    when: { kind: "now" },
  });

  const commands = calls.filter((call) => call.path !== "/auth/csrf");
  assert.deepEqual(
    commands.map((call) => call.path),
    ["/publications/p-1/approve", "/publications/p-1/publish"],
  );
  assert.deepEqual(commands[0]?.body, { expectedVersion: 4 });
  assert.deepEqual(commands[1]?.body, {
    expectedVersion: 5,
    targets: ["instagram_story"],
  });
  assert.deepEqual(result, { kind: "published" });
});

test("si la aprobación falla, no se pide publicar", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const calls = fakeApi({
    "/publications/p-1/approve": () =>
      Response.json({ message: "La publicación cambió." }, { status: 409 }),
  });

  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: false,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: ["instagram_story"],
    version: 4,
    when: { kind: "now" },
  });

  assert.deepEqual(result, {
    kind: "error",
    message: "La publicación cambió.",
  });
  assert.equal(
    calls.some((call) => call.path.endsWith("/publish")),
    false,
  );
});

test("programar aprueba con el turno y no publica", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const calls = fakeApi({
    "/publications/p-1/approve": () =>
      Response.json({
        publicationId: "p-1",
        snapshotId: "s",
        status: "scheduled",
        version: 6,
      }),
  });

  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: false,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: ["instagram_feed"],
    version: 4,
    when: { kind: "later", localDate: "2026-09-29", localTime: "18:00" },
  });

  assert.deepEqual(result, { kind: "scheduled" });
  const approve = calls.find((call) => call.path.endsWith("/approve"));
  assert.deepEqual(approve?.body, {
    expectedVersion: 4,
    schedule: {
      localDate: "2026-09-29",
      localTime: "18:00",
      targets: ["instagram_feed"],
    },
  });
  assert.equal(
    calls.some((call) => call.path.endsWith("/publish")),
    false,
  );
});

test("sin destino elegido no se aprueba ni se publica nada", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const calls = fakeApi({});
  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: false,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: [],
    version: 4,
    when: { kind: "now" },
  });
  assert.deepEqual(result, { kind: "error", message: "Elegí a dónde sale." });
  assert.equal(calls.length, 0);
});

test("aprobada pero rechazada al publicar, lo dice sin perder la aprobación", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  fakeApi({
    "/publications/p-1/approve": () =>
      Response.json({
        publicationId: "p-1",
        snapshotId: "s",
        status: "approved",
        version: 5,
      }),
    "/publications/p-1/publish": () =>
      Response.json(
        { message: "La conexión con Meta venció." },
        { status: 409 },
      ),
  });

  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: false,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: ["instagram_story"],
    version: 4,
    when: { kind: "now" },
  });

  assert.equal(result.kind, "approved-not-published");
});

test("una pieza ya aprobada se publica sin volver a aprobarla", async (context) => {
  const original = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = original;
  });
  const calls = fakeApi({
    "/publications/p-1/publish": () => Response.json(order, { status: 202 }),
  });

  const result = await releasePiece(apiBaseUrl, {
    alreadyApproved: true,
    keys: { approve: "k-approve", publish: "k-publish" },
    publicationId: "p-1",
    targets: ["instagram_feed"],
    version: 7,
    when: { kind: "now" },
  });

  assert.deepEqual(result, { kind: "published" });
  assert.equal(
    calls.some((call) => call.path.endsWith("/approve")),
    false,
  );
});
