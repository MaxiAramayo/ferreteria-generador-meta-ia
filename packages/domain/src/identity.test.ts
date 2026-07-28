import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeActor,
  organizationPermissions,
  organizationRoles,
  type AuthenticatedActor,
  type OrganizationPermission,
  type OrganizationRole,
} from "./identity.ts";

const expectedPermissions: Readonly<
  Record<OrganizationRole, readonly OrganizationPermission[]>
> = {
  admin: [
    "connections:manage",
    "content:read",
    "identity:manage",
    "organization:manage",
  ],
  approver: ["content:approve", "content:read", "content:schedule"],
  editor: ["content:edit", "content:read"],
  publisher: ["content:read", "publishing:execute"],
  viewer: ["content:read"],
};

function actorWithRoles(
  roles: readonly OrganizationRole[],
): AuthenticatedActor {
  return Object.freeze({
    displayName: "Persona de prueba",
    email: "persona@example.invalid",
    membershipId: "membership-a",
    organizationId: "organization-a",
    roles,
    sessionId: "session-a",
    userId: "user-a",
  });
}

test("la matriz rol por permiso es exhaustiva y no concede permisos implícitos", () => {
  for (const role of organizationRoles) {
    const actor = actorWithRoles([role]);
    for (const permission of organizationPermissions) {
      const decision = authorizeActor(actor, permission, "organization-a");
      assert.equal(
        decision.allowed,
        expectedPermissions[role].includes(permission),
        `${role} × ${permission}`,
      );
    }
  }
});

test("los roles se componen de forma aditiva", () => {
  const actor = actorWithRoles(["editor", "approver"]);

  assert.deepEqual(authorizeActor(actor, "content:edit", "organization-a"), {
    allowed: true,
  });
  assert.deepEqual(authorizeActor(actor, "content:approve", "organization-a"), {
    allowed: true,
  });
  assert.deepEqual(
    authorizeActor(actor, "connections:manage", "organization-a"),
    { allowed: false, reason: "missing-permission" },
  );
});

test("ningún rol atraviesa el límite de organización", () => {
  const actor = actorWithRoles([
    "admin",
    "editor",
    "approver",
    "publisher",
    "viewer",
  ]);

  for (const permission of organizationPermissions) {
    assert.deepEqual(authorizeActor(actor, permission, "organization-b"), {
      allowed: false,
      reason: "different-organization",
    });
  }
});
