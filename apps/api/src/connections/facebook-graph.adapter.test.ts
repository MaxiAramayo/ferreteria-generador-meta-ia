import assert from "node:assert/strict";
import test from "node:test";

import { SecretValue, type MetaCredentials } from "@aramayo/configuration";

import { FacebookGraphAdapter } from "./facebook-graph.adapter.ts";
import {
  MetaAssetUnavailableError,
  MetaGraphError,
  MetaGraphUnavailableError,
} from "./meta-graph.port.ts";

const credentials: MetaCredentials = Object.freeze({
  appId: "123456789",
  appSecret: new SecretValue("meta-app-secret-value"),
  graphApiVersion: "v26.0",
  pageId: "1098765432109876",
  redirectUri: "https://api.content.example.com/oauth/meta/callback",
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("la autorización fija versión, redirect, state y sólo los permisos aprobados", () => {
  const adapter = new FacebookGraphAdapter(credentials, () =>
    Promise.reject(new Error("no usado")),
  );
  const url = new URL(adapter.authorizationUrl("state-safe"));
  assert.equal(url.origin, "https://www.facebook.com");
  assert.equal(url.pathname, "/v26.0/dialog/oauth");
  assert.equal(url.searchParams.get("redirect_uri"), credentials.redirectUri);
  assert.equal(url.searchParams.get("state"), "state-safe");
  assert.equal(
    url.searchParams.get("scope"),
    "instagram_basic,instagram_content_publish,pages_manage_posts,pages_read_engagement,pages_show_list",
  );
});

test("descubre cuenta, Page e Instagram Business con llamadas GET versionadas", async () => {
  const paths: string[] = [];
  const adapter = new FacebookGraphAdapter(credentials, (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    paths.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname.endsWith("/me/permissions")) {
      return Promise.resolve(
        json({
          data: [
            { permission: "pages_show_list", status: "granted" },
            { permission: "ads_read", status: "declined" },
          ],
        }),
      );
    }
    if (url.pathname.endsWith(`/${credentials.pageId}`)) {
      return Promise.resolve(
        json({
          access_token: "page-token",
          id: credentials.pageId,
          instagram_business_account: {
            id: "ig-id",
            username: "ferreteria_aramayo",
          },
          name: "Aramayo",
        }),
      );
    }
    return Promise.resolve(json({ id: "account-id", name: "Administrador" }));
  });

  const discovery = await adapter.discover("user-token");
  assert.equal(discovery.providerAccountId, "account-id");
  assert.deepEqual(discovery.grantedPermissions, ["pages_show_list"]);
  assert.deepEqual(
    discovery.assets.map((asset) => asset.kind),
    ["page", "instagram_business"],
  );
  assert.equal(discovery.assets[0]?.providerAssetId, credentials.pageId);
  assert.deepEqual(paths.sort(), [
    `GET /v26.0/${credentials.pageId}`,
    "GET /v26.0/me",
    "GET /v26.0/me/permissions",
  ]);
});

test("una Page que Meta no expone deja cero activos sin romper el descubrimiento", async () => {
  const adapter = new FacebookGraphAdapter(credentials, (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname.endsWith(`/${credentials.pageId}`)) {
      return Promise.resolve(
        json(
          { error: { code: 100, message: "Unsupported get request." } },
          400,
        ),
      );
    }
    if (url.pathname.endsWith("/me/permissions")) {
      return Promise.resolve(
        json({ data: [{ permission: "pages_show_list", status: "granted" }] }),
      );
    }
    return Promise.resolve(json({ id: "account-id", name: "Administrador" }));
  });

  const discovery = await adapter.discover("user-token");
  assert.deepEqual(discovery.assets, []);
  assert.deepEqual(discovery.grantedPermissions, ["pages_show_list"]);
});

test("una falla de Meta no se confunde con un activo removido", async () => {
  const adapter = new FacebookGraphAdapter(credentials, (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.pathname.endsWith(`/${credentials.pageId}`)) {
      return Promise.resolve(json({ error: { code: 2 } }, 500));
    }
    if (url.pathname.endsWith("/me/permissions")) {
      return Promise.resolve(json({ data: [] }));
    }
    return Promise.resolve(json({ id: "account-id", name: "Administrador" }));
  });

  await assert.rejects(
    () => adapter.discover("user-token"),
    (cause: unknown) =>
      cause instanceof MetaGraphUnavailableError &&
      !(cause instanceof MetaAssetUnavailableError),
  );
});

test("un error 190 se tipa como token vencido sin reproducir credenciales", async () => {
  const adapter = new FacebookGraphAdapter(credentials, () =>
    Promise.resolve(
      json(
        {
          error: {
            code: 190,
            message: "Invalid OAuth access token: user-secret-token",
          },
        },
        400,
      ),
    ),
  );
  await assert.rejects(
    () => adapter.discover("user-secret-token"),
    (cause: unknown) =>
      cause instanceof MetaGraphError &&
      cause.health === "token_expired" &&
      !cause.message.includes("user-secret-token"),
  );
});
