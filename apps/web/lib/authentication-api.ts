export type LoginResult =
  | Readonly<{ kind: "authenticated" }>
  | Readonly<{ kind: "invalid-credentials" }>
  | Readonly<{ kind: "rate-limited"; message: string }>
  | Readonly<{ kind: "error"; message: string }>;

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
