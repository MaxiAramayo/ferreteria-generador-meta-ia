import { parseWebPublicEnvironment } from "@aramayo/configuration/web";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configuration = parseWebPublicEnvironment(process.env);
  return (
    <main className="login-shell">
      <section aria-labelledby="login-title" className="login-card">
        <p className="login-eyebrow">Panel interno · Aramayo</p>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="login-intro">
          Accedé con la cuenta autorizada para administrar contenido y
          conexiones.
        </p>
        <LoginForm apiBaseUrl={configuration.apiBaseUrl} />
        <p className="login-back">
          <Link href="/">Volver al estado del sistema</Link>
        </p>
      </section>
    </main>
  );
}
