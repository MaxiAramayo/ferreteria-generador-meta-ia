import {
  authorizeActor,
  type AuthenticatedActor,
  type OrganizationPermission,
  type OrganizationRole,
} from "@aramayo/domain";

/**
 * Qué secciones ve cada sesión en la barra del panel.
 *
 * Una sección aparece sólo si la API le deja a la sesión leer lo que muestra:
 * un enlace que termina en «necesitás permiso» confunde más que no tenerlo.
 * La regla vive en el dominio (`authorizeActor`); acá sólo se elige qué
 * permiso abre cada pantalla.
 */
export type PanelSectionId =
  "configuracion" | "inicio" | "operacion" | "programacion" | "publicaciones";

export interface PanelNavigationItem {
  readonly href: string;
  readonly id: PanelSectionId;
  readonly label: string;
}

const panelSections: readonly Readonly<
  PanelNavigationItem & { permission: OrganizationPermission }
>[] = [
  { href: "/", id: "inicio", label: "Inicio", permission: "content:read" },
  {
    href: "/publicaciones",
    id: "publicaciones",
    label: "Publicaciones",
    permission: "content:read",
  },
  {
    href: "/programacion",
    id: "programacion",
    label: "Programación",
    permission: "content:read",
  },
  {
    href: "/operacion",
    id: "operacion",
    label: "Operación",
    // Alertas y salud operativa se leen con el permiso de publicar.
    permission: "publishing:execute",
  },
  {
    href: "/configuracion",
    id: "configuracion",
    label: "Configuración",
    permission: "content:read",
  },
];

const roleLabels: Readonly<Record<OrganizationRole, string>> = {
  admin: "Administración",
  approver: "Aprobación",
  editor: "Edición",
  publisher: "Publicación",
  viewer: "Lectura",
};

const loginPath = "/iniciar-sesion";

/** Si la sesión tiene un permiso en su propia organización. */
export function actorCan(
  actor: AuthenticatedActor,
  permission: OrganizationPermission,
): boolean {
  return authorizeActor(actor, permission, actor.organizationId).allowed;
}

export function panelNavigationFor(
  actor: AuthenticatedActor,
): readonly PanelNavigationItem[] {
  return panelSections
    .filter((section) => actorCan(actor, section.permission))
    .map(({ href, id, label }) => ({ href, id, label }));
}

/**
 * La sección a marcar como actual. Compara segmentos enteros: `/publicaciones`
 * cubre `/publicaciones/nueva`, pero no una ruta que sólo empiece igual.
 */
export function activePanelSection(
  pathname: string,
): PanelSectionId | "cuenta" | null {
  const [first] = pathname.split("/").filter((segment) => segment !== "");
  if (first === undefined) return "inicio";
  if (first === "cuenta") return "cuenta";
  const section = panelSections.find((item) => item.href === `/${first}`);
  return section?.id ?? null;
}

export function rolesLabel(roles: readonly OrganizationRole[]): string {
  return roles.length === 0
    ? "Sin rol asignado"
    : roles.map((role) => roleLabels[role]).join(" · ");
}

/**
 * A dónde volver después de iniciar sesión.
 *
 * Sólo se acepta una ruta de este mismo panel. `//otro.sitio`, `/\otro.sitio`
 * o una ruta con tabulaciones el navegador los resuelve contra otro origen, así
 * que se resuelve igual que él y se compara el origen en vez de mirar el texto.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (value === null || value === undefined || !value.startsWith("/")) {
    return "/";
  }
  const base = "https://panel.invalid";
  let resolved: URL;
  try {
    resolved = new URL(value, base);
  } catch {
    return "/";
  }
  if (
    resolved.origin !== base ||
    resolved.pathname === loginPath ||
    resolved.pathname.startsWith(`${loginPath}/`)
  ) {
    return "/";
  }
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/** El inicio de sesión que devuelve a la pantalla donde estaba la persona. */
export function loginPathFor(pathname: string, search: string): string {
  const returnPath = safeReturnPath(`${pathname}${search}`);
  return returnPath === "/"
    ? loginPath
    : `${loginPath}?volver=${encodeURIComponent(returnPath)}`;
}

/** Ancla de una pieza dentro del listado de Publicaciones. */
export function publicationAnchorId(publicationId: string): string {
  return `publicacion-${publicationId}`;
}

/** Lleva a una pieza puntual del listado, desde una alerta o un turno. */
export function publicationHref(publicationId: string): string {
  return `/publicaciones#${publicationAnchorId(publicationId)}`;
}

/** Abre Programación con una pieza aprobada ya elegida para programar. */
export function schedulePublicationHref(publicationId: string): string {
  return `/programacion?publicacion=${encodeURIComponent(publicationId)}`;
}
