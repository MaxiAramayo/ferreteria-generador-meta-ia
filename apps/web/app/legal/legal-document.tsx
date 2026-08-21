import Link from "next/link";
import type { ReactNode } from "react";

interface LegalDocumentProps {
  readonly children: ReactNode;
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly updatedAt: string;
}

export function LegalDocument({
  children,
  description,
  eyebrow,
  title,
  updatedAt,
}: LegalDocumentProps) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="legal-brand" href="/">
          Aramayo
        </Link>
        <nav aria-label="Documentos legales">
          <Link href="/legal/privacy">Privacidad</Link>
          <Link href="/legal/terms">Términos</Link>
          <Link href="/legal/data-deletion">Eliminar datos</Link>
        </nav>
      </header>

      <article className="legal-document">
        <header className="legal-title">
          <p>{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <dl>
            <dt>Última actualización</dt>
            <dd>{updatedAt}</dd>
          </dl>
        </header>
        <div className="legal-content">{children}</div>
      </article>

      <footer className="legal-footer">
        <p>Ferretería y Lubricentro Aramayo · Frías, Santiago del Estero</p>
        <Link href="/iniciar-sesion">Acceso al panel</Link>
      </footer>
    </main>
  );
}
