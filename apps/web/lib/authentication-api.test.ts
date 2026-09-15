import assert from "node:assert/strict";
import test from "node:test";

import { login, loadSession, logout } from "./authentication-api.ts";

const apiBaseUrl = "https://api.example.invalid/";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const sessionBody = {
  actor: {
    displayName: "Editora de prueba",
    email: "editora@aramayo.invalid",
    membershipId: "membership-id",
    organizationId: "organization-id",
    roles: ["editor"],
    sessionId: "session-id",
    userId: "user-id",
  },
  expiresAt: "2026-09-16T12:00:00.000Z",
};

test("login crea una sesión mediante cookie y valida el contrato público", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest: Readonly<{
    body: string | null;
    credentials: RequestCredentials | undefined;
    method: string | undefined;
    url: string;
  }> | null = null;
  globalThis.fetch = (input, init) => {
    capturedRequest = {
      body: typeof init?.body === "string" ? init.body : null,
      credentials: init?.credentials,
      method: init?.method,
      url: input instanceof Request ? input.url : input.toString(),
    };
    return Promise.resolve(
      json(
        {
          actor: {
            organizationId: "organization-id",
            roles: ["admin"],
            userId: "user-id",
          },
          csrfToken: "not-persisted-by-the-client",
          expiresAt: "2026-08-18T12:00:00.000Z",
        },
        201,
      ),
    );
  };
  try {
    const result = await login(apiBaseUrl, {
      email: "admin@example.com",
      password: "a-secure-password",
    });
    assert.deepEqual(result, { kind: "authenticated" });
    assert.deepEqual(capturedRequest, {
      body: JSON.stringify({
        email: "admin@example.com",
        password: "a-secure-password",
      }),
      credentials: "include",
      method: "POST",
      url: "https://api.example.invalid/auth/login",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login representa credenciales inválidas, límite y fallos sin filtrar detalles", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.resolve(json({ message: "detalle" }, 401));
    assert.deepEqual(
      await login(apiBaseUrl, { email: "x@y.z", password: "invalid-value" }),
      { kind: "invalid-credentials" },
    );

    globalThis.fetch = () => Promise.resolve(json({ message: "detalle" }, 429));
    assert.equal(
      (await login(apiBaseUrl, { email: "x@y.z", password: "invalid-value" }))
        .kind,
      "rate-limited",
    );

    globalThis.fetch = () => Promise.resolve(json({ actor: {} }, 201));
    assert.equal(
      (await login(apiBaseUrl, { email: "x@y.z", password: "invalid-value" }))
        .kind,
      "error",
    );

    globalThis.fetch = () => Promise.reject(new Error("network detail"));
    const unavailable = await login(apiBaseUrl, {
      email: "x@y.z",
      password: "invalid-value",
    });
    assert.equal(unavailable.kind, "error");
    assert.equal(JSON.stringify(unavailable).includes("network detail"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("la sesión distingue quién entra, quién no tiene sesión y una API caída", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let url = "";
    globalThis.fetch = (input) => {
      url = input instanceof Request ? input.url : input.toString();
      return Promise.resolve(json(sessionBody));
    };
    const authenticated = await loadSession(apiBaseUrl);
    assert.equal(url, "https://api.example.invalid/auth/session");
    assert.ok(authenticated.kind === "authenticated");
    assert.deepEqual(authenticated.actor.roles, ["editor"]);

    globalThis.fetch = () => Promise.resolve(json({ message: "no" }, 401));
    assert.deepEqual(await loadSession(apiBaseUrl), {
      kind: "unauthenticated",
    });

    // Un rol que el panel no conoce no puede repartir secciones.
    globalThis.fetch = () =>
      Promise.resolve(
        json({ ...sessionBody, actor: { ...sessionBody.actor, roles: ["x"] } }),
      );
    assert.equal((await loadSession(apiBaseUrl)).kind, "error");

    // Sin respuesta no se manda a nadie al login: la sesión puede estar bien.
    globalThis.fetch = () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5"));
    const unreachable = await loadSession(apiBaseUrl);
    assert.equal(unreachable.kind, "error");
    assert.equal(JSON.stringify(unreachable).includes("10.0.0.5"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cerrar sesión manda el token CSRF y tolera una sesión ya cerrada", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const requests: Request[] = [];
    globalThis.fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      return Promise.resolve(
        request.url.endsWith("auth/csrf")
          ? json({ csrfToken: "csrf-de-prueba" })
          : new Response(null, { status: 201 }),
      );
    };
    assert.deepEqual(await logout(apiBaseUrl), { kind: "signed-out" });
    const logoutRequest = requests[1];
    assert.ok(logoutRequest !== undefined);
    assert.equal(logoutRequest.url, "https://api.example.invalid/auth/logout");
    assert.equal(logoutRequest.method, "POST");
    assert.equal(logoutRequest.headers.get("x-csrf-token"), "csrf-de-prueba");

    requests.length = 0;
    globalThis.fetch = (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(json({ message: "no" }, 401));
    };
    assert.deepEqual(await logout(apiBaseUrl), { kind: "signed-out" });
    assert.equal(requests.length, 1, "Sin sesión no hay nada que cerrar.");

    globalThis.fetch = (input) =>
      Promise.resolve(
        (input instanceof Request ? input.url : input.toString()).endsWith(
          "auth/csrf",
        )
          ? json({ csrfToken: "csrf-de-prueba" })
          : json({ message: "falló" }, 500),
      );
    assert.equal((await logout(apiBaseUrl)).kind, "error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
