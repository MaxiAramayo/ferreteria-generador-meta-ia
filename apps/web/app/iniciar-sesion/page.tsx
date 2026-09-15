import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { safeReturnPath } from "../../lib/panel-navigation.ts";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<{ volver?: string | readonly string[] }>
  >;
}) {
  const configuration = parseWebPublicEnvironment(process.env);
  const requested = (await searchParams).volver;
  // Quien llegó acá desde una pantalla del panel vuelve a ella; el resto, al
  // inicio. La ruta se valida en el servidor para no redirigir afuera.
  const returnTo = safeReturnPath(
    typeof requested === "string" ? requested : undefined,
  );
  return (
    <main className="login-shell">
      <section aria-labelledby="login-title" className="login-card">
        <p className="login-eyebrow">Panel interno · Aramayo</p>
        <h1 id="login-title">Iniciar sesión</h1>
        <p className="login-intro">
          Accedé con la cuenta autorizada para administrar contenido y
          conexiones.
        </p>
        <LoginForm apiBaseUrl={configuration.apiBaseUrl} returnTo={returnTo} />
      </section>
    </main>
  );
}
