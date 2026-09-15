import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedActor, OrganizationRole } from "@aramayo/domain";

import {
  activePanelSection,
  loginPathFor,
  panelNavigationFor,
  publicationHref,
  rolesLabel,
  safeReturnPath,
  schedulePublicationHref,
} from "./panel-navigation.ts";

function actor(roles: readonly OrganizationRole[]): AuthenticatedActor {
  return {
    displayName: "Persona de prueba",
    email: "persona@aramayo.invalid",
    membershipId: "membership-1",
    organizationId: "organization-1",
    roles,
    sessionId: "session-1",
    userId: "user-1",
  };
}

function labels(roles: readonly OrganizationRole[]): readonly string[] {
  return panelNavigationFor(actor(roles)).map((item) => item.label);
}

test("cada rol ve sólo las secciones que la API le deja leer", () => {
  assert.deepEqual(labels(["editor"]), [
    "Inicio",
    "Publicaciones",
    "Programación",
    "Configuración",
  ]);
  assert.deepEqual(labels(["publisher"]), [
    "Inicio",
    "Publicaciones",
    "Programación",
    "Operación",
    "Configuración",
  ]);
  // Administrar conexiones no incluye leer alertas de publicación.
  assert.equal(labels(["admin"]).includes("Operación"), false);
  assert.deepEqual(labels([]), []);
});

test("la sección actual compara segmentos enteros", () => {
  assert.equal(activePanelSection("/"), "inicio");
  assert.equal(activePanelSection("/publicaciones"), "publicaciones");
  assert.equal(activePanelSection("/publicaciones/nueva"), "publicaciones");
  assert.equal(activePanelSection("/programacion/"), "programacion");
  assert.equal(activePanelSection("/cuenta"), "cuenta");
  assert.equal(activePanelSection("/publicacionesx"), null);
  assert.equal(activePanelSection("/iniciar-sesion"), null);
});

test("volver después del login sólo acepta rutas del propio panel", () => {
  assert.equal(
    safeReturnPath("/programacion?mes=2026-09#turno"),
    "/programacion?mes=2026-09#turno",
  );
  assert.equal(safeReturnPath(null), "/");
  assert.equal(safeReturnPath(undefined), "/");
  assert.equal(safeReturnPath("publicaciones"), "/");
  assert.equal(safeReturnPath("https://otro.example/robar"), "/");
  assert.equal(safeReturnPath("//otro.example/robar"), "/");
  assert.equal(safeReturnPath("/\\otro.example/robar"), "/");
  assert.equal(safeReturnPath("/\t/otro.example/robar"), "/");
  // Volver al login después del login sería un bucle.
  assert.equal(safeReturnPath("/iniciar-sesion?volver=%2F"), "/");
});

test("el login recuerda la pantalla de origen salvo que sea el inicio", () => {
  assert.equal(
    loginPathFor("/programacion", "?mes=2026-09"),
    "/iniciar-sesion?volver=%2Fprogramacion%3Fmes%3D2026-09",
  );
  assert.equal(loginPathFor("/", ""), "/iniciar-sesion");
});

test("los roles se nombran por lo que hace la persona", () => {
  assert.equal(rolesLabel(["editor"]), "Edición");
  assert.equal(
    rolesLabel(["approver", "publisher"]),
    "Aprobación · Publicación",
  );
  assert.equal(rolesLabel([]), "Sin rol asignado");
});

test("los enlaces entre secciones llevan a la pieza puntual", () => {
  assert.equal(
    publicationHref("pieza-1"),
    "/publicaciones#publicacion-pieza-1",
  );
  assert.equal(
    schedulePublicationHref("pieza 1"),
    "/programacion?publicacion=pieza%201",
  );
});
