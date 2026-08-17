import assert from "node:assert/strict";
import test from "node:test";

import {
  metaConnectionCanPublish,
  metaRequiredPermissions,
  missingMetaPermissions,
  type MetaConnectionRecord,
} from "./meta-connection.ts";

const connection: MetaConnectionRecord = Object.freeze({
  accountName: "Administrador Meta",
  assets: Object.freeze([
    Object.freeze({
      id: "page-record",
      kind: "page",
      name: "Aramayo",
      providerAssetId: "page-provider",
      status: "active",
    }),
    Object.freeze({
      id: "instagram-record",
      kind: "instagram_business",
      name: "Ferretería Aramayo",
      providerAssetId: "instagram-provider",
      status: "active",
      username: "ferreteria_aramayo",
    }),
  ]),
  createdAt: "2026-08-15T12:00:00.000Z",
  grantedPermissions: metaRequiredPermissions,
  health: "healthy",
  id: "connection-id",
  lastCheckedAt: "2026-08-15T12:00:00.000Z",
  organizationId: "organization-id",
  providerAccountId: "account-id",
  updatedAt: "2026-08-15T12:00:00.000Z",
  version: 1,
});

test("una conexión sólo publica con salud, permisos y ambos activos", () => {
  assert.equal(metaConnectionCanPublish(connection), true);
  assert.equal(
    metaConnectionCanPublish({ ...connection, health: "token_expired" }),
    false,
  );
  assert.equal(
    metaConnectionCanPublish({
      ...connection,
      assets: connection.assets.filter((asset) => asset.kind === "page"),
    }),
    false,
  );
});

test("los permisos faltantes se calculan sin ampliar el alcance aprobado", () => {
  assert.deepEqual(missingMetaPermissions(["pages_show_list", "ads_read"]), [
    "instagram_basic",
    "instagram_content_publish",
    "pages_manage_posts",
    "pages_read_engagement",
  ]);
});
