import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  approvePublication,
  loadPublicationPreview,
  loadPublicationWorkspace,
  requestPublicationRender,
  saveTemplatePublicationDraft,
} from "./publication-workspace-api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) {
    return input;
  }
  return new URL(typeof input === "string" ? input : input.url);
}

function unknownRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

test("carga sesión y publicaciones en paralelo y representa el vacío", async () => {
  const requestedPaths: string[] = [];
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    requestedPaths.push(
      url.pathname +
        (url.searchParams.has("stage")
          ? `?stage=${url.searchParams.get("stage") ?? ""}&limit=${url.searchParams.get("limit") ?? ""}`
          : ""),
    );
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Editora",
              email: "editora@example.invalid",
              membershipId: "membership-1",
              organizationId: "organization-1",
              roles: ["editor"],
              sessionId: "session-1",
              userId: "user-1",
            },
            expiresAt: "2030-01-01T00:00:00.000Z",
          })
        : jsonResponse({ items: [], limit: 20, page: 1, total: 0 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");

  assert.equal(result.kind, "empty");
  // Lo que falta sacar llega entero; de lo que salió, las últimas veinte.
  assert.deepEqual(requestedPaths.sort(), [
    "/auth/session",
    "/publications?stage=done&limit=20",
    "/publications?stage=upcoming&limit=100",
  ]);
  assert.equal(result.canEdit, true);
});

test("una sesión rechazada produce forbidden sin disfrazar el estado", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({ message: "Unauthorized" }, 401)
        : jsonResponse({ items: [], limit: 20, page: 1, total: 0 }),
    );
  };

  assert.deepEqual(await loadPublicationWorkspace("http://api.example.test/"), {
    kind: "forbidden",
  });
});

test("admin no recibe edición de contenido sin el rol editor", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Administradora",
              email: "admin@example.invalid",
              membershipId: "membership-2",
              organizationId: "organization-1",
              roles: ["admin"],
              sessionId: "session-2",
              userId: "user-2",
            },
          })
        : jsonResponse({ items: [], limit: 20, page: 1, total: 0 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");
  assert.equal(result.kind, "empty");
  assert.equal(result.canEdit, false);
  assert.equal(result.canApprove, false);
});

test("approver obtiene aprobación sin edición de contenido", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Aprobadora",
              email: "approver@example.invalid",
              membershipId: "membership-3",
              organizationId: "organization-1",
              roles: ["approver"],
              sessionId: "session-3",
              userId: "user-3",
            },
          })
        : jsonResponse({ items: [], limit: 20, page: 1, total: 0 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");
  assert.equal(result.kind, "empty");
  assert.equal(result.canEdit, false);
  assert.equal(result.canApprove, true);
});

test("un contrato de listado inválido se representa como error explícito", async () => {
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Editora",
              email: "editora@example.invalid",
              membershipId: "membership-1",
              organizationId: "organization-1",
              roles: ["editor"],
              sessionId: "session-1",
              userId: "user-1",
            },
          })
        : jsonResponse({ items: "invalid", total: 1 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");
  assert.equal(result.kind, "error");
});

test("el listado conserva el vínculo con la ejecución que generó la pieza", async () => {
  const publication = {
    createdAt: "2026-07-31T12:00:00.000Z",
    id: "publication-1",
    latestContentBriefRunId: "run-1",
    latestContentHash: "a".repeat(64),
    latestRevisionId: "revision-1",
    latestRevisionNumber: 1,
    status: "draft",
    title: "Amoladora angular para tu taller",
    updatedAt: "2026-07-31T12:00:00.000Z",
    version: 1,
  };
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Editora",
              email: "editora@example.invalid",
              membershipId: "membership-1",
              organizationId: "organization-1",
              roles: ["editor"],
              sessionId: "session-1",
              userId: "user-1",
            },
          })
        : url.searchParams.get("stage") === "upcoming"
          ? jsonResponse({
              items: [publication],
              limit: 100,
              page: 1,
              total: 1,
            })
          : jsonResponse({ items: [], limit: 20, page: 1, total: 0 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");

  assert.ok(result.kind === "ready");
  assert.equal(result.publications.items.length, 1);
  // Sin este dato, llegar desde la pieza hasta su evidencia obligaría a
  // recomponer el vínculo en la UI.
  assert.equal(result.publications.items[0]?.latestContentBriefRunId, "run-1");
});

test("guardar conserva idempotencia y no confunde caption con texto visual", async () => {
  let publicationRequest: RequestInit | undefined;
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-safe" }));
    }
    publicationRequest = init;
    return Promise.resolve(
      jsonResponse(
        {
          id: "publication-1",
          latestRevision: { id: "revision-1", revisionNumber: 1 },
          title: "Consejo del taller",
        },
        201,
      ),
    );
  };

  const result = await saveTemplatePublicationDraft(
    "http://api.example.test/",
    {
      caption: "Texto de acompañamiento extenso.",
      idempotencyKey: "stable-client-key-0001",
      title: "Consejo del taller",
    },
  );

  assert.equal(result.kind, "saved");
  assert.equal(
    new Headers(publicationRequest?.headers).get("idempotency-key"),
    "stable-client-key-0001",
  );
  assert.equal(typeof publicationRequest?.body, "string");
  if (typeof publicationRequest?.body !== "string") {
    assert.fail("La creación debía enviar un body JSON.");
  }
  const requestBody: unknown = JSON.parse(publicationRequest.body);
  const requestRecord = unknownRecord(requestBody);
  const design = unknownRecord(requestRecord?.["design"]);
  const designContent = unknownRecord(design?.["content"]);
  assert.equal(designContent?.["subtitle"], undefined);
});

test("render y aprobación envían CSRF, versión e idempotencia", async () => {
  const commands: RequestInit[] = [];
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-safe" }));
    }
    if (init !== undefined) {
      commands.push(init);
    }
    return Promise.resolve(jsonResponse({ status: "ok" }));
  };

  assert.equal(
    (
      await requestPublicationRender(
        "http://api.example.test/",
        "publication-1",
        2,
        "render-idempotency-0001",
      )
    ).kind,
    "completed",
  );
  assert.equal(
    (
      await approvePublication(
        "http://api.example.test/",
        "publication-1",
        3,
        "approve-idempotency-0001",
      )
    ).kind,
    "completed",
  );
  assert.equal(commands.length, 2);
  assert.deepEqual(
    commands.map((command) => ({
      body: command.body,
      csrf: new Headers(command.headers).get("x-csrf-token"),
      idempotency: new Headers(command.headers).get("idempotency-key"),
    })),
    [
      {
        body: JSON.stringify({ expectedVersion: 2 }),
        csrf: "csrf-safe",
        idempotency: "render-idempotency-0001",
      },
      {
        body: JSON.stringify({ expectedVersion: 3 }),
        csrf: "csrf-safe",
        idempotency: "approve-idempotency-0001",
      },
    ],
  );
});

test("preview acepta sólo un PNG confirmado por el contrato", async () => {
  globalThis.fetch = () =>
    Promise.resolve(
      jsonResponse({
        latestRevision: {
          renderedMedia: {
            checksumSha256: "c".repeat(64),
            secureUrl: "https://media.example.invalid/render.png",
          },
        },
        title: "Consejo del taller",
      }),
    );

  const result = await loadPublicationPreview(
    "http://api.example.test/",
    "publication-1",
  );
  assert.equal(result.kind, "ready");
  assert.equal(result.preview.checksumSha256, "c".repeat(64));
});

test("de lo que ya salió llegan las últimas, con el total aparte", async () => {
  const published = (id: string): Readonly<Record<string, unknown>> => ({
    createdAt: "2026-09-28T12:00:00.000Z",
    id,
    latestContentHash: "a".repeat(64),
    latestRevisionId: `revision-${id}`,
    latestRevisionNumber: 1,
    status: "published",
    title: `Historia ${id}`,
    updatedAt: "2026-09-28T12:00:00.000Z",
    version: 3,
  });
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    return Promise.resolve(
      url.pathname.endsWith("/auth/session")
        ? jsonResponse({
            actor: {
              displayName: "Dueño",
              email: "duenio@example.invalid",
              membershipId: "membership-1",
              organizationId: "organization-1",
              roles: ["editor", "approver", "publisher"],
              sessionId: "session-1",
              userId: "user-1",
            },
          })
        : url.searchParams.get("stage") === "done"
          ? jsonResponse({
              items: [published("a"), published("b")],
              limit: 20,
              page: 1,
              total: 35,
            })
          : jsonResponse({ items: [], limit: 100, page: 1, total: 0 }),
    );
  };

  const result = await loadPublicationWorkspace("http://api.example.test/");

  assert.ok(result.kind === "ready");
  assert.equal(result.doneTotal, 35);
  assert.equal(result.publications.items.length, 2);
});
