import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import "reflect-metadata";

import {
  organizationPermissions,
  type OrganizationPermission,
} from "@aramayo/domain";

import {
  AUTHENTICATED_ROUTE_METADATA,
  PUBLIC_ROUTE_METADATA,
  REQUIRED_PERMISSION_METADATA,
} from "./identity.decorators.ts";

/**
 * Toda ruta declara su autorización (`P7-T01`).
 *
 * La prueba no revisa una lista escrita a mano: enumera los controladores
 * compilados y lee su metadata, así que un controlador nuevo entra solo. Existe
 * porque olvidar `RequirePermission` no rompía nada visible —la solicitud
 * llegaba igual con cualquier rol autenticado— y eso es exactamente lo que un
 * hallazgo de autorización necesita que sea imposible.
 */

const compiledRoot = fileURLToPath(new URL("../../dist", import.meta.url));

interface RouteDeclaration {
  readonly authenticated: boolean;
  readonly controller: string;
  readonly handler: string;
  readonly permission: OrganizationPermission | undefined;
  readonly publicRoute: boolean;
}

async function controllerFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await controllerFiles(full)));
    } else if (entry.name.endsWith(".controller.js")) {
      files.push(full);
    }
  }
  return files;
}

/** El decorador puede estar en el método o en la clase; el guard lee ambos. */
function metadataOf(
  key: string,
  handler: unknown,
  controller: unknown,
): unknown {
  return (
    Reflect.getMetadata(key, handler as object) ??
    Reflect.getMetadata(key, controller as object)
  );
}

function permissionOf(value: unknown): OrganizationPermission | undefined {
  return typeof value === "string"
    ? (value as OrganizationPermission)
    : undefined;
}

async function declaredRoutes(): Promise<readonly RouteDeclaration[]> {
  const routes: RouteDeclaration[] = [];
  for (const file of await controllerFiles(compiledRoot)) {
    const module: unknown = await import(file);
    for (const exported of Object.values(module as Record<string, unknown>)) {
      if (
        typeof exported !== "function" ||
        Reflect.getMetadata("path", exported) === undefined
      ) {
        continue;
      }
      const prototype: object = (exported as { prototype: object }).prototype;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === "constructor") continue;
        const handler: unknown = (prototype as Record<string, unknown>)[name];
        if (
          typeof handler !== "function" ||
          Reflect.getMetadata("method", handler) === undefined
        ) {
          continue;
        }
        routes.push({
          authenticated:
            metadataOf(AUTHENTICATED_ROUTE_METADATA, handler, exported) ===
            true,
          controller: (exported as { name: string }).name,
          handler: name,
          permission: permissionOf(
            metadataOf(REQUIRED_PERMISSION_METADATA, handler, exported),
          ),
          publicRoute:
            metadataOf(PUBLIC_ROUTE_METADATA, handler, exported) === true,
        });
      }
    }
  }
  return routes;
}

test("cada ruta declara exactamente una forma de autorización", async () => {
  const routes = await declaredRoutes();
  assert.ok(
    routes.length >= 60,
    `Se esperaban las rutas compiladas y se encontraron ${String(routes.length)}.`,
  );

  const undeclared = routes.filter(
    (route) =>
      !route.publicRoute &&
      !route.authenticated &&
      route.permission === undefined,
  );
  assert.deepEqual(
    undeclared.map((route) => `${route.controller}.${route.handler}`),
    [],
    "Una ruta sin permiso, sin sesión declarada y sin ser pública quedaría al alcance de cualquier rol.",
  );

  const ambiguous = routes.filter(
    (route) =>
      [
        route.publicRoute,
        route.authenticated,
        route.permission !== undefined,
      ].filter(Boolean).length > 1,
  );
  assert.deepEqual(
    ambiguous.map((route) => `${route.controller}.${route.handler}`),
    [],
    "Declarar dos formas de autorización deja en duda cuál manda.",
  );
});

test("los permisos declarados existen y las rutas públicas son las esperadas", async () => {
  const routes = await declaredRoutes();
  const permissions = new Set<string>(organizationPermissions);

  for (const route of routes) {
    if (route.permission !== undefined) {
      assert.ok(
        permissions.has(route.permission),
        `${route.controller}.${route.handler} declara un permiso inexistente.`,
      );
    }
  }

  // Una ruta pública se atiende sin sesión: la lista se revisa a mano y a
  // propósito, para que agregar una sea una decisión y no un descuido. Las tres
  // de cumplimiento las llama Meta y no traen sesión; se autentican con la
  // firma HMAC de su `signed_request`, comparada en tiempo constante.
  assert.deepEqual(
    routes
      .filter((route) => route.publicRoute)
      .map((route) => `${route.controller}.${route.handler}`)
      .toSorted(),
    [
      "AuthenticationController.login",
      "HealthController.readLiveness",
      "HealthController.readReadiness",
      "MetaComplianceController.deauthorize",
      "MetaComplianceController.deleteData",
      "MetaComplianceController.deletionStatus",
    ].toSorted(),
  );
});
