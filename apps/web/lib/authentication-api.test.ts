import assert from "node:assert/strict";
import test from "node:test";

import { login } from "./authentication-api.ts";

const apiBaseUrl = "https://api.example.invalid/";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

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
