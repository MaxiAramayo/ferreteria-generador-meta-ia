import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return (
    <main className="workspace-shell account-shell">
      <section aria-labelledby="password-title" className="login-card">
        <p className="workspace-eyebrow">Tu cuenta</p>
        <h1 id="password-title">Cambiar contraseña</h1>
        <p className="login-intro">
          Al cambiarla se cierran todas tus sesiones, también ésta: volvés a
          entrar con la nueva.
        </p>
        <PasswordForm apiBaseUrl={configuration.apiBaseUrl} />
      </section>
    </main>
  );
}
