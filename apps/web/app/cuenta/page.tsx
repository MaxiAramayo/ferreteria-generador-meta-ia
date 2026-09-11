import { parseWebPublicEnvironment } from "@aramayo/configuration/web";
import Link from "next/link";

import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return (
    <main className="login-shell">
      <section aria-labelledby="password-title" className="login-card">
        <p className="login-eyebrow">Panel interno · Aramayo</p>
        <h1 id="password-title">Cambiar contraseña</h1>
        <p className="login-intro">
          Al cambiarla se cierran todas tus sesiones, también ésta: volvés a
          entrar con la nueva.
        </p>
        <PasswordForm apiBaseUrl={configuration.apiBaseUrl} />
        <p className="login-back">
          <Link href="/configuracion">Volver a Configuración</Link>
        </p>
      </section>
    </main>
  );
}
