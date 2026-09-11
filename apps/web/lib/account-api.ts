export type ChangePasswordResult =
  | Readonly<{ kind: "changed" }>
  | Readonly<{ kind: "rejected"; message: string }>
  | Readonly<{ kind: "rate-limited"; message: string }>
  | Readonly<{ kind: "session-expired" }>
  | Readonly<{ kind: "error"; message: string }>;

function record(input: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  return Object.fromEntries(Object.entries(input));
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

/**
 * Cambia la contraseña de quien tiene la sesión. Si sale bien, la API cierra
 * todas sus sesiones: hay que volver a entrar con la nueva.
 */
export async function changePassword(
  apiBaseUrl: string,
  input: Readonly<{ currentPassword: string; newPassword: string }>,
): Promise<ChangePasswordResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "session-expired" };
    }
    const response = await fetch(new URL("auth/password", apiBaseUrl), {
      body: JSON.stringify(input),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": csrf,
      },
      method: "POST",
    });
    if (response.ok) {
      return { kind: "changed" };
    }
    if (response.status === 401) {
      return { kind: "session-expired" };
    }
    if (response.status === 429) {
      return {
        kind: "rate-limited",
        message:
          "Demasiados intentos. Esperá unos minutos antes de reintentar.",
      };
    }
    if (response.status === 400) {
      const message = record(await payload(response))?.["message"];
      return {
        kind: "rejected",
        message:
          typeof message === "string"
            ? message
            : "Revisá las contraseñas: la nueva necesita al menos 12 caracteres.",
      };
    }
    return {
      kind: "error",
      message: "No se pudo cambiar la contraseña. Reintentá en unos minutos.",
    };
  } catch {
    return {
      kind: "error",
      message: "No se pudo conectar con la API. Reintentá en unos minutos.",
    };
  }
}
