// Crea o actualiza una cuenta de producción.
// La contraseña llega por la entrada estándar y nunca por argumentos ni entorno.
// Sin ROLES la cuenta tiene todos los roles, como la de quien administra. Con
// ROLES=editor,approver,publisher,viewer crea y publica pero no administra.
import { readFileSync } from "node:fs";

import { createDatabaseClient } from "@aramayo/database";

import { Argon2idPasswordHasher } from "/app/dist/identity/password-hasher.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const allRoles = ["admin", "editor", "approver", "publisher", "viewer"];
const requestedRoles = process.env.ROLES;
const roles =
  requestedRoles === undefined
    ? allRoles
    : [
        ...new Set(
          requestedRoles
            .split(",")
            .map((role) => role.trim())
            .filter((role) => role !== ""),
        ),
      ];

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const displayName = (process.env.ADMIN_NAME ?? "").trim();
const password = readFileSync(0, "utf8").replace(/\r?\n$/u, "");

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
  console.error("El email no es válido.");
  process.exit(1);
}
if (displayName.length < 1 || displayName.length > 120) {
  console.error("El nombre tiene que tener entre 1 y 120 caracteres.");
  process.exit(1);
}
if (roles.length === 0 || roles.some((role) => !allRoles.includes(role))) {
  console.error(`ROLES admite sólo: ${allRoles.join(", ")}.`);
  process.exit(1);
}
if (password.length < 6 || password.length > 256) {
  console.error("La contraseña tiene que tener entre 6 y 256 caracteres.");
  process.exit(1);
}

const database = createDatabaseClient(process.env.DATABASE_URL);
try {
  const passwordHash = await new Argon2idPasswordHasher().hash(password);
  const now = new Date();
  const user = await database.user.upsert({
    create: {
      displayName,
      email,
      passwordChangedAt: now,
      passwordHash,
      passwordHashVersion: 1,
    },
    update: {
      displayName,
      passwordChangedAt: now,
      passwordHash,
      passwordHashVersion: 1,
      status: "active",
    },
    where: { email },
  });
  await database.organizationMembership.upsert({
    create: { organizationId, roles, userId: user.id },
    update: { roles, status: "active" },
    where: {
      organizationId_userId: { organizationId, userId: user.id },
    },
  });
  console.log(`Listo: ${email} puede entrar con: ${roles.join(", ")}.`);
} finally {
  await database.$disconnect();
}
