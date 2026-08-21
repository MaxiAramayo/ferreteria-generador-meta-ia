import assert from "node:assert/strict";
import test from "node:test";

import type {
  AuthenticatedActor,
  MetaConnectionRecord,
  MetaConnectionRepository,
  OrganizationRole,
} from "@aramayo/domain";
import { ForbiddenException } from "@nestjs/common";

import { PublishingReadinessService } from "./publishing-readiness.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";

function actor(
  roles: readonly OrganizationRole[] = ["publisher"],
): AuthenticatedActor {
  return Object.freeze({
    displayName: "Persona que publica",
    email: "publica@aramayo.test",
    membershipId: "40000000-0000-4000-8000-000000000004",
    organizationId,
    roles,
    sessionId: "50000000-0000-4000-8000-000000000005",
    userId: "70000000-0000-4000-8000-000000000007",
  });
}

function connection(
  overrides: Partial<MetaConnectionRecord> = {},
): MetaConnectionRecord {
  return Object.freeze({
    accountName: "Ferretería y Lubricentro Aramayo",
    assets: Object.freeze([
      Object.freeze({
        id: "asset-page",
        kind: "page" as const,
        name: "Aramayo",
        providerAssetId: "page-1",
        status: "active" as const,
      }),
      Object.freeze({
        id: "asset-ig",
        kind: "instagram_business" as const,
        name: "@ferreteria_aramayo",
        providerAssetId: "ig-1",
        status: "active" as const,
      }),
    ]),
    createdAt: "2026-08-18T12:00:00.000Z",
    grantedPermissions: Object.freeze([
      "instagram_basic",
      "instagram_content_publish",
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ]),
    health: "healthy" as const,
    id: "conexion-1",
    lastCheckedAt: "2026-08-20T09:00:00.000Z",
    organizationId,
    providerAccountId: "cuenta-1",
    updatedAt: "2026-08-20T09:00:00.000Z",
    version: 5,
    ...overrides,
  });
}

function serviceFor(
  connections: readonly MetaConnectionRecord[],
): PublishingReadinessService {
  return new PublishingReadinessService({
    list: () => Promise.resolve(connections),
  } as unknown as MetaConnectionRepository);
}

test("una conexión sana declara la cuenta y sus destinos", async () => {
  const readiness = await serviceFor([connection()]).read(actor());

  assert.equal(readiness.canPublish, true);
  assert.equal(readiness.accountName, "Ferretería y Lubricentro Aramayo");
  assert.deepEqual(
    [...readiness.targets],
    ["instagram_feed", "instagram_story", "facebook_page"],
  );
});

test("sin conexión sana no se puede publicar y no se nombra ninguna cuenta", async () => {
  const readiness = await serviceFor([
    connection({ health: "permission_revoked" }),
  ]).read(actor());

  assert.equal(readiness.canPublish, false);
  assert.equal(readiness.accountName, undefined);
  assert.deepEqual([...readiness.targets], []);
});

test("los destinos salen de los activos activos", async () => {
  const readiness = await serviceFor([
    connection({
      assets: Object.freeze([
        Object.freeze({
          id: "asset-page",
          kind: "page" as const,
          name: "Aramayo",
          providerAssetId: "page-1",
          status: "active" as const,
        }),
        // Instagram removido: la conexión sigue sana para Facebook pero no
        // puede ofrecer Instagram.
        Object.freeze({
          id: "asset-ig",
          kind: "instagram_business" as const,
          name: "@ferreteria_aramayo",
          providerAssetId: "ig-1",
          status: "removed" as const,
        }),
      ]),
    }),
  ]).read(actor());

  // Sin activo de Instagram la conexión deja de estar habilitada del todo, y
  // eso es lo que la regla del dominio dice: publicar exige los dos.
  assert.equal(readiness.canPublish, false);
});

test("la respuesta no filtra nada de la conexión más allá del nombre", async () => {
  const readiness = await serviceFor([connection()]).read(actor());

  // Administrar conexiones es de otro rol: acá sólo viaja lo que hace falta
  // para decidir sobre una pieza.
  assert.deepEqual(Object.keys(readiness).toSorted(), [
    "accountName",
    "canPublish",
    "targets",
  ]);
});

test("sin el permiso de publicar la disponibilidad no se lee", async () => {
  for (const roles of [["editor"], ["approver"], ["admin"]] as const) {
    await assert.rejects(
      serviceFor([connection()]).read(actor(roles)),
      ForbiddenException,
    );
  }
});
