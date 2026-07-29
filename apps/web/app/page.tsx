import { parseWebPublicEnvironment } from "@aramayo/configuration/web";

import { readApiStatus, type ApiStatus } from "../lib/api-status";

/**
 * El estado inicial se resuelve por solicitud: el panel informa infraestructura
 * real, no un resultado congelado en el build.
 */
export const dynamic = "force-dynamic";

type StatusPresentation = {
  readonly description: string;
  readonly label: string;
  readonly tone: "error" | "ok" | "warning";
};

function presentApiStatus(status: ApiStatus): StatusPresentation {
  switch (status.kind) {
    case "ready":
      return {
        description:
          "La API responde y sus dependencias de infraestructura están disponibles.",
        label: "Disponible",
        tone: "ok",
      };
    case "not_ready":
      return {
        description:
          "La API responde, pero al menos una dependencia no está disponible.",
        label: "Sin readiness",
        tone: "warning",
      };
    case "unreachable":
      return {
        description:
          "El panel no obtuvo respuesta de la API dentro del tiempo permitido.",
        label: "Inalcanzable",
        tone: "error",
      };
  }
}

export default async function HomePage() {
  const configuration = parseWebPublicEnvironment(process.env);
  const apiStatus = await readApiStatus(configuration.apiBaseUrl);
  const presentation = presentApiStatus(apiStatus);

  return (
    <main>
      <h1>Aramayo Content Platform</h1>
      <p className="lead">
        Panel interno de creación, revisión y publicación de contenido. Esta
        pantalla corresponde al bootstrap de la plataforma: todavía no existen
        publicaciones, borradores ni conexiones configuradas.
      </p>

      <section aria-labelledby="entorno" className="panel">
        <h2 id="entorno">Entorno del panel</h2>
        <dl className="definitions">
          <dt>Ambiente</dt>
          <dd>{configuration.environment}</dd>
          <dt>Zona horaria</dt>
          <dd>{configuration.timeZone}</dd>
          <dt>API</dt>
          <dd>
            <code>{configuration.apiBaseUrl}</code>
          </dd>
        </dl>
        <p className="hint">
          El navegador sólo recibe el contrato público de configuración. Las
          credenciales de OpenAI, Meta y Cloudinary pertenecen a la API y al
          worker.
        </p>
      </section>

      <section aria-labelledby="estado-api" className="panel">
        <h2 id="estado-api">Estado de la API</h2>
        <p>
          <span className="state" data-tone={presentation.tone}>
            {presentation.label}
          </span>
          {": "}
          {presentation.description}
        </p>

        {apiStatus.kind === "unreachable" ? (
          <p className="hint">
            Iniciar la API con <code>pnpm --filter @aramayo/api dev</code> y la
            infraestructura local con <code>pnpm infra:up</code>.
          </p>
        ) : (
          <ul className="dependencies">
            {apiStatus.readiness.dependencies.map((dependency) => (
              <li key={dependency.dependency}>
                <span>{dependency.dependency}</span>
                <span
                  className="state"
                  data-tone={dependency.status === "up" ? "ok" : "error"}
                >
                  {dependency.status === "up" ? "disponible" : "no disponible"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="contenido" className="panel">
        <h2 id="contenido">Contenido</h2>
        <p>
          No hay publicaciones ni borradores para mostrar. La creación, revisión
          y aprobación se habilitan en la Fase 2 del plan.
        </p>
        <p className="hint">
          La mesa autenticada de borradores está disponible en{" "}
          <a href="/publicaciones">publicaciones</a>.
        </p>
        <p className="hint">
          El sistema visual migrado puede revisarse en{" "}
          <a href="/diseno/primitivas">primitivas del motor de diseño</a>.
        </p>
        <p className="hint">
          La identidad comercial y las sucursales se administran desde{" "}
          <a href="/configuracion">configuración operativa</a>.
        </p>
      </section>
    </main>
  );
}
