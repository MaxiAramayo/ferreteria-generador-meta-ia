import {
  organizationRoles,
  type AuthenticatedActor,
  type OrganizationRole,
} from "@aramayo/domain";

export type LoginResult =
  | Readonly<{ kind: "authenticated" }>
  | Readonly<{ kind: "invalid-credentials" }>
  | Readonly<{ kind: "rate-limited"; message: string }>
  | Readonly<{ kind: "error"; message: string }>;

export type SessionLoadResult =
  | Readonly<{ actor: AuthenticatedActor; kind: "authenticated" }>
  | Readonly<{ kind: "unauthenticated" }>
  | Readonly<{ kind: "error"; message: string }>;

export type LogoutResult =
  | Readonly<{ kind: "signed-out" }>
  | Readonly<{ kind: "error"; message: string }>;

const logoutFailure: LogoutResult = Object.freeze({
  kind: "error",
  message: "No se pudo cerrar la sesión. Reintentá en unos segundos.",
});

function objectRecord(
  input: unknown,
): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return Object.fromEntries(Object.entries(input));
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isAuthenticatedSession(input: unknown): boolean {
  const session = objectRecord(input);
  const actor = objectRecord(session?.["actor"]);
  return (
    session !== null &&
    actor !== null &&
    typeof actor["organizationId"] === "string" &&
    typeof actor["userId"] === "string" &&
    Array.isArray(actor["roles"]) &&
    actor["roles"].every((role) => typeof role === "string") &&
    typeof session["expiresAt"] === "string"
  );
}

const knownRoles: ReadonlySet<string> = new Set(organizationRoles);

/**
 * La sesión de `auth/session`, validada antes de decidir permisos con ella.
 *
 * Un rol que el panel no conoce invalida la sesión entera: repartir secciones
 * con un rol desconocido sería adivinar.
 */
export function parseSessionActor(value: unknown): AuthenticatedActor | null {
  const session = objectRecord(value);
  const actor = objectRecord(session?.["actor"]);
  const actorRoles = actor?.["roles"];
  return actor !== null &&
    typeof actor["displayName"] === "string" &&
    typeof actor["email"] === "string" &&
    typeof actor["membershipId"] === "string" &&
    typeof actor["organizationId"] === "string" &&
    Array.isArray(actorRoles) &&
    actorRoles.every(
      (role): role is OrganizationRole =>
        typeof role === "string" && knownRoles.has(role),
    ) &&
    typeof actor["sessionId"] === "string" &&
    typeof actor["userId"] === "string"
    ? {
        displayName: actor["displayName"],
        email: actor["email"],
        membershipId: actor["membershipId"],
        organizationId: actor["organizationId"],
        roles: actorRoles,
        sessionId: actor["sessionId"],
        userId: actor["userId"],
      }
    : null;
}

export async function login(
  apiBaseUrl: string,
  credentials: Readonly<{ email: string; password: string }>,
): Promise<LoginResult> {
  try {
    const response = await fetch(new URL("auth/login", apiBaseUrl), {
      body: JSON.stringify(credentials),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = await responsePayload(response);
    if (response.status === 401 || response.status === 400) {
      return { kind: "invalid-credentials" };
    }
    if (response.status === 429) {
      return {
        kind: "rate-limited",
        message:
          "Demasiados intentos. Esperá unos minutos antes de reintentar.",
      };
    }
    if (!response.ok || !isAuthenticatedSession(payload)) {
      return {
        kind: "error",
        message: "No se pudo iniciar sesión. Revisá la conexión y reintentá.",
      };
    }
    return { kind: "authenticated" };
  } catch {
    return {
      kind: "error",
      message: "No se pudo conectar con la API. Reintentá en unos minutos.",
    };
  }
}

/**
 * Quién está usando el panel. Distingue «no hay sesión», que lleva al login,
 * de «la API no respondió», que no debe mandar a nadie a loguearse de nuevo.
 */
export async function loadSession(
  apiBaseUrl: string,
): Promise<SessionLoadResult> {
  try {
    const response = await fetch(new URL("auth/session", apiBaseUrl), {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "unauthenticated" };
    }
    const actor = parseSessionActor(await responsePayload(response));
    return response.ok && actor !== null
      ? { actor, kind: "authenticated" }
      : {
          kind: "error",
          message: "La API devolvió una sesión que el panel no puede usar.",
        };
  } catch {
    return {
      kind: "error",
      message:
        "No se pudo conectar con la API. Revisá la conexión y reintentá.",
    };
  }
}

/** Cierra sólo esta sesión. Una sesión que ya no existe cuenta como cerrada. */
export async function logout(apiBaseUrl: string): Promise<LogoutResult> {
  try {
    const csrfResponse = await fetch(new URL("auth/csrf", apiBaseUrl), {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    if (csrfResponse.status === 401) return { kind: "signed-out" };
    const csrfToken = objectRecord(await responsePayload(csrfResponse))?.[
      "csrfToken"
    ];
    if (!csrfResponse.ok || typeof csrfToken !== "string") return logoutFailure;
    const response = await fetch(new URL("auth/logout", apiBaseUrl), {
      credentials: "include",
      headers: { accept: "application/json", "x-csrf-token": csrfToken },
      method: "POST",
    });
    return response.ok || response.status === 401
      ? { kind: "signed-out" }
      : logoutFailure;
  } catch {
    return logoutFailure;
  }
}
