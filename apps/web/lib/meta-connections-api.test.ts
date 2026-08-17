import assert from "node:assert/strict";
import test from "node:test";

import {
  loadMetaConnections,
  revokeMetaConnection,
  startMetaOAuth,
} from "./meta-connections-api.ts";

const apiBaseUrl = "http://localhost:3001";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const connection = Object.freeze({
  accountName: "Administrador Meta",
  assets: Object.freeze([
    Object.freeze({
      id: "asset-id",
      kind: "page",
      name: "Aramayo",
      providerAssetId: "page-id",
      status: "active",
    }),
  ]),
  canPublish: false,
  createdAt: "2026-08-17T12:00:00.000Z",
  grantedPermissions: Object.freeze(["pages_show_list"]),
  health: "permission_revoked",
  id: "connection-id",
  lastCheckedAt: "2026-08-17T12:00:00.000Z",
  missingPermissions: Object.freeze(["instagram_basic"]),
  provider: "meta",
  updatedAt: "2026-08-17T12:00:00.000Z",
  version: 1,
});

test("lista conexiones válidas y rechaza cualquier forma que pudiera filtrar token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(json([connection]));
  try {
    const result = await loadMetaConnections(apiBaseUrl);
    assert.equal(result.kind, "ready");

    globalThis.fetch = () =>
      Promise.resolve(json([{ ...connection, accessToken: "secret" }]));
    const polluted = await loadMetaConnections(apiBaseUrl);
    assert.equal(polluted.kind, "ready");
    assert.equal(JSON.stringify(polluted).includes("secret"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OAuth y revocación envían CSRF y usan rutas separadas", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Readonly<{
    method: string;
    path: string;
    csrf: string | null;
  }>[] = [];
  globalThis.fetch = (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname === "/auth/csrf") {
      return Promise.resolve(json({ csrfToken: "csrf-safe" }));
    }
    calls.push({
      csrf: new Headers(init?.headers).get("x-csrf-token"),
      method: init?.method ?? "GET",
      path: url.pathname,
    });
    return url.pathname.endsWith("/oauth")
      ? Promise.resolve(
          json({
            authorizationUrl: "https://www.facebook.com/dialog/oauth",
            expiresAt: "2026-08-17T12:10:00.000Z",
            provider: "meta",
          }),
        )
      : Promise.resolve(json({ ...connection, health: "revoked" }));
  };
  try {
    assert.equal(
      (await startMetaOAuth(apiBaseUrl)).kind,
      "authorization-required",
    );
    assert.equal(
      (await revokeMetaConnection(apiBaseUrl, "connection-id")).kind,
      "updated",
    );
    assert.deepEqual(calls, [
      {
        csrf: "csrf-safe",
        method: "POST",
        path: "/connections/meta/oauth",
      },
      {
        csrf: "csrf-safe",
        method: "DELETE",
        path: "/connections/meta/connection-id",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
