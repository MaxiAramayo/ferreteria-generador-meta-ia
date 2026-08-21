import type { Metadata } from "next";
import Link from "next/link";

import { PublicationTargetResult } from "../../publicaciones/publication-target-result.tsx";

/**
 * Harness de los estados de publicación.
 *
 * Existe porque los estados que importan casi nunca se pueden mirar. Un destino
 * que quedó en duda o uno que se detuvo esperando a una persona aparecen
 * después de una publicación real que salió mal, y para entonces nadie está
 * revisando tipografía ni contraste. Acá están los cuatro desenlaces juntos y
 * quietos, que es la única forma de auditarlos antes y no después.
 *
 * `pnpm design:review --harness http://localhost:3000` audita esta página junto
 * con las de primitivas y layouts.
 */

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Estados de publicación",
};

export default function PublicationStatesHarnessPage(): React.JSX.Element {
  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <Link className="workspace-brand" href="/">
            Aramayo
          </Link>
          <span>Harness de publicación</span>
        </div>
        <nav aria-label="Navegación del harness">
          <Link href="/diseno/primitivas">Primitivas</Link>
          <Link href="/diseno/layouts">Layouts</Link>
        </nav>
      </header>

      <section aria-labelledby="harness-titulo" className="workspace-intro">
        <div>
          <p className="workspace-eyebrow">Revisión</p>
          <h1 id="harness-titulo">Estados de publicación</h1>
        </div>
        <p>
          Cada destino de una orden puede terminar de cuatro maneras, y tres de
          ellas piden una decisión distinta. Nada de esto hace pedidos: son
          estados fijos para poder revisarlos.
        </p>
      </section>

      <section
        aria-labelledby="desenlaces"
        className="publication-order-history"
      >
        <article className="publication-order">
          <header>
            <h2 id="desenlaces">Los cuatro desenlaces</h2>
            <p>
              El color agrupa, pero la etiqueta es la que informa: leer el
              estado no puede depender de distinguir rojo de verde.
            </p>
          </header>
          <ul className="publication-order-targets">
            <PublicationTargetResult
              actions={[]}
              outcome="published"
              permalink="https://www.instagram.com/p/ejemplo/"
              target="instagram_feed"
            />
            <PublicationTargetResult
              actions={[]}
              outcome="in-flight"
              target="instagram_story"
            />
            <PublicationTargetResult
              actions={[]}
              failureCode="media-invalid"
              failureDetail="La proporción queda fuera de lo que admite el feed."
              outcome="failed"
              target="facebook_page"
            />
            <PublicationTargetResult
              actions={[]}
              outcome="unknown"
              target="facebook_page"
            />
          </ul>
        </article>

        <article className="publication-order">
          <header>
            <h2>Detenidos esperando una decisión</h2>
            <p>
              Un desenlace en duda no ofrece reintentar: puede haber salido, y
              forzar otro intento publicaría dos veces.
            </p>
          </header>
          <ul className="publication-order-targets">
            <PublicationTargetResult
              actions={["retry", "abandon"]}
              attempts={5}
              failureCode="provider-error"
              outcome="failed"
              reason="attempts-exhausted"
              target="instagram_feed"
            />
            <PublicationTargetResult
              actions={["reconcile", "abandon"]}
              attempts={3}
              outcome="unknown"
              reason="outcome-unresolved"
              target="facebook_page"
            />
            <PublicationTargetResult
              actions={["retry", "abandon"]}
              attempts={1}
              busyAction="retry"
              disabled
              failureCode="token-expired"
              outcome="failed"
              reason="permanent-failure"
              target="instagram_story"
            />
          </ul>
        </article>
      </section>
    </main>
  );
}
