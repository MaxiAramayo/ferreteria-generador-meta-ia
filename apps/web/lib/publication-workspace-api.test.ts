import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  loadPublicationWorkspace,
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
    requestedPaths.push(url.pathname);
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
  assert.deepEqual(requestedPaths.sort(), ["/auth/session", "/publications"]);
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
