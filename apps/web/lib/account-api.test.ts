import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { changePassword } from "./account-api.ts";

const originalFetch = globalThis.fetch;
const apiBaseUrl = "https://api.aramayo.invalid/";
const passwords = Object.freeze({
  currentPassword: "correct-password",
  newPassword: "una-frase-nueva-y-larga",
});

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

function stubPasswordResponse(
  response: () => Response,
  seen: { csrf?: string | null; body?: unknown } = {},
): void {
  globalThis.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith("/auth/csrf")) {
      return Promise.resolve(jsonResponse({ csrfToken: "csrf-token" }));
    }
    seen.csrf = new Headers(init?.headers).get("x-csrf-token");
    seen.body = JSON.parse(typeof init?.body === "string" ? init.body : "null");
    return Promise.resolve(response());
  };
}

test("cambiar la contraseña envía el CSRF de la sesión y las dos contraseñas", async () => {
  const seen: { csrf?: string | null; body?: unknown } = {};
  stubPasswordResponse(() => jsonResponse({ revokedSessions: 1 }, 201), seen);

  assert.deepEqual(await changePassword(apiBaseUrl, passwords), {
    kind: "changed",
  });
  assert.equal(seen.csrf, "csrf-token");
  assert.deepEqual(seen.body, passwords);
});

test("muestra el motivo que da la API cuando rechaza el cambio", async () => {
  stubPasswordResponse(() =>
    jsonResponse({ message: "La contraseña actual no es correcta." }, 400),
  );

  assert.deepEqual(await changePassword(apiBaseUrl, passwords), {
    kind: "rejected",
    message: "La contraseña actual no es correcta.",
  });
});

test("sin sesión activa pide volver a iniciar sesión", async () => {
  globalThis.fetch = () =>
    Promise.resolve(jsonResponse({ message: "No autenticado." }, 401));

  assert.deepEqual(await changePassword(apiBaseUrl, passwords), {
    kind: "session-expired",
  });
});

test("respeta el límite de intentos", async () => {
  stubPasswordResponse(() => jsonResponse({ message: "Demasiados." }, 429));

  const result = await changePassword(apiBaseUrl, passwords);
  assert.equal(result.kind, "rate-limited");
});
