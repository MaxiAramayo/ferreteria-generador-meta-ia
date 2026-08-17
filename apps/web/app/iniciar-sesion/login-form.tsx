"use client";

import { useState, type SyntheticEvent } from "react";

import { login } from "../../lib/authentication-api";

type LoginState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "submitting" }>
  | Readonly<{ kind: "error"; message: string }>;

export function LoginForm({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const [state, setState] = useState<LoginState>({ kind: "idle" });

  async function authenticate(form: HTMLFormElement): Promise<void> {
    if (state.kind === "submitting") return;

    const fields = new FormData(form);
    const email = fields.get("email");
    const password = fields.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setState({
        kind: "error",
        message: "Completá el correo y la contraseña para continuar.",
      });
      return;
    }

    setState({ kind: "submitting" });
    const result = await login(apiBaseUrl, { email, password });
    switch (result.kind) {
      case "authenticated":
        form.reset();
        window.location.assign("/configuracion");
        return;
      case "invalid-credentials":
        setState({
          kind: "error",
          message: "El correo o la contraseña no son válidos.",
        });
        return;
      case "rate-limited":
      case "error":
        setState({ kind: "error", message: result.message });
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void authenticate(event.currentTarget);
  }

  const submitting = state.kind === "submitting";
  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="login-email">Correo</label>
      <input
        autoComplete="username"
        id="login-email"
        maxLength={254}
        name="email"
        required
        type="email"
      />

      <label htmlFor="login-password">Contraseña</label>
      <input
        autoComplete="current-password"
        id="login-password"
        maxLength={256}
        minLength={12}
        name="password"
        required
        type="password"
      />

      {state.kind === "error" ? (
        <p aria-live="polite" className="login-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button disabled={submitting} type="submit">
        {submitting ? "Ingresando…" : "Iniciar sesión"}
      </button>
    </form>
  );
}
