"use client";

import Link from "next/link";
import { useState, type SyntheticEvent } from "react";

import { changePassword } from "../../lib/account-api";

type PasswordState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "submitting" }>
  | Readonly<{ kind: "changed" }>
  | Readonly<{ kind: "session-expired" }>
  | Readonly<{ kind: "error"; message: string }>;

export function PasswordForm({ apiBaseUrl }: { readonly apiBaseUrl: string }) {
  const [state, setState] = useState<PasswordState>({ kind: "idle" });

  async function submitPassword(form: HTMLFormElement): Promise<void> {
    if (state.kind === "submitting") return;

    const fields = new FormData(form);
    const currentPassword = fields.get("currentPassword");
    const newPassword = fields.get("newPassword");
    const confirmation = fields.get("confirmation");
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      typeof confirmation !== "string"
    ) {
      setState({
        kind: "error",
        message: "Completá los tres campos para continuar.",
      });
      return;
    }
    if (newPassword !== confirmation) {
      setState({
        kind: "error",
        message: "La contraseña nueva y su repetición no coinciden.",
      });
      return;
    }

    setState({ kind: "submitting" });
    const result = await changePassword(apiBaseUrl, {
      currentPassword,
      newPassword,
    });
    switch (result.kind) {
      case "changed":
        form.reset();
        setState({ kind: "changed" });
        return;
      case "session-expired":
        setState({ kind: "session-expired" });
        return;
      case "rejected":
      case "rate-limited":
      case "error":
        setState({ kind: "error", message: result.message });
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitPassword(event.currentTarget);
  }

  if (state.kind === "changed") {
    return (
      <div className="login-form" role="status">
        <p>Listo: la contraseña cambió y se cerraron todas tus sesiones.</p>
        <Link href="/iniciar-sesion">Entrar con la contraseña nueva</Link>
      </div>
    );
  }
  if (state.kind === "session-expired") {
    return (
      <div className="login-form" role="alert">
        <p>Tu sesión no está activa. Iniciá sesión y volvé a esta pantalla.</p>
        <Link href="/iniciar-sesion">Iniciar sesión</Link>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="password-current">Contraseña actual</label>
      <input
        autoComplete="current-password"
        id="password-current"
        maxLength={256}
        minLength={12}
        name="currentPassword"
        required
        type="password"
      />

      <label htmlFor="password-new">Contraseña nueva</label>
      <input
        aria-describedby="password-hint"
        autoComplete="new-password"
        id="password-new"
        maxLength={256}
        minLength={12}
        name="newPassword"
        required
        type="password"
      />
      <p className="login-intro" id="password-hint">
        Al menos 12 caracteres. Una frase de varias palabras es fácil de
        recordar y segura.
      </p>

      <label htmlFor="password-confirmation">Repetí la contraseña nueva</label>
      <input
        autoComplete="new-password"
        id="password-confirmation"
        maxLength={256}
        minLength={12}
        name="confirmation"
        required
        type="password"
      />

      {state.kind === "error" ? (
        <p aria-live="polite" className="login-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button disabled={submitting} type="submit">
        {submitting ? "Guardando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}
