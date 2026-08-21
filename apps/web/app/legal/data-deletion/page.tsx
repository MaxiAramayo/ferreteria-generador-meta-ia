import { parseWebPublicEnvironment } from "@aramayo/configuration/web";
import type { MetaDataDeletionStatusResponse } from "@aramayo/contracts";
import type { Metadata } from "next";

import { LegalDocument } from "../legal-document";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description:
    "Instrucciones y estado de eliminación de datos de la integración Meta de Aramayo.",
  title: "Eliminación de datos · Aramayo Content Platform",
};

type DeletionPageProps = Readonly<{
  searchParams: Promise<Readonly<{ code?: string | readonly string[] }>>;
}>;

function isDeletionStatus(
  payload: unknown,
): payload is MetaDataDeletionStatusResponse {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("status" in payload)
  ) {
    return false;
  }
  const status: unknown = payload.status;
  if (status === "not-found") return true;
  return (
    status === "completed" &&
    "completedAt" in payload &&
    typeof payload.completedAt === "string"
  );
}

async function readDeletionStatus(
  confirmationCode: string,
): Promise<MetaDataDeletionStatusResponse | null> {
  const configuration = parseWebPublicEnvironment(process.env);
  const url = new URL(
    "integrations/meta/data-deletion/status",
    configuration.apiBaseUrl + "/",
  );
  url.searchParams.set("code", confirmationCode);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isDeletionStatus(payload) ? payload : null;
  } catch {
    return null;
  }
}

function completedAtLabel(completedAt: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Cordoba",
  }).format(new Date(completedAt));
}

export default async function DataDeletionPage({
  searchParams,
}: DeletionPageProps) {
  const rawCode = (await searchParams).code;
  const confirmationCode = typeof rawCode === "string" ? rawCode : undefined;
  const status =
    confirmationCode === undefined
      ? undefined
      : await readDeletionStatus(confirmationCode);

  return (
    <LegalDocument
      description="Cómo desconectar Meta, qué información se elimina y cómo verificar una solicitud."
      eyebrow="Privacidad y control"
      title="Eliminación de datos"
      updatedAt="21 de agosto de 2026"
    >
      {status?.status === "completed" ? (
        <section aria-live="polite" className="legal-status" data-tone="ok">
          <p className="legal-status-label">Solicitud completada</p>
          <h2>Los datos aportados por Meta fueron eliminados</h2>
          <p>
            La plataforma eliminó las credenciales y sustituyó los
            identificadores de cuenta y activos. Finalización:{" "}
            <time dateTime={status.completedAt}>
              {completedAtLabel(status.completedAt)}
            </time>
            .
          </p>
        </section>
      ) : confirmationCode === undefined ? null : (
        <section
          aria-live="polite"
          className="legal-status"
          data-tone="warning"
        >
          <p className="legal-status-label">Estado no verificable</p>
          <h2>No encontramos una confirmación válida</h2>
          <p>
            Revisá que la dirección esté completa. Si el problema continúa,
            contactá al negocio con el canal indicado debajo.
          </p>
        </section>
      )}

      <section>
        <h2>Opción 1 · Desde Aramayo Content Platform</h2>
        <ol>
          <li>Ingresá al panel con un rol administrador.</li>
          <li>Abrí Configuración y buscá la conexión de Meta.</li>
          <li>Elegí «Revocar conexión» y confirmá la acción.</li>
        </ol>
        <p>
          La revocación corta de inmediato la capacidad local de publicar y
          elimina criptográficamente los tokens, incluso si Meta no responde al
          pedido remoto.
        </p>
      </section>

      <section>
        <h2>Opción 2 · Desde Meta</h2>
        <ol>
          <li>Abrí la configuración de integraciones comerciales de Meta.</li>
          <li>Seleccioná Aramayo Content Platform.</li>
          <li>Quitá o eliminá la integración.</li>
        </ol>
        <p>
          Meta envía una solicitud firmada al callback de desautorización o
          eliminación. La plataforma verifica la firma antes de realizar
          cambios; una solicitud sin firma válida no puede afectar una conexión.
        </p>
      </section>

      <section>
        <h2>Qué se elimina</h2>
        <ul>
          <li>Tokens OAuth de la cuenta y de la Page.</li>
          <li>
            Identificador y nombre de la cuenta que autorizó la integración.
          </li>
          <li>
            Identificadores, nombres y usuario de Page e Instagram aportados por
            Meta.
          </li>
          <li>Permisos concedidos y capacidad de publicar en el futuro.</li>
        </ul>
      </section>

      <section>
        <h2>Qué puede conservarse</h2>
        <p>
          Se conserva evidencia mínima, sin tokens ni identificadores externos,
          de que ocurrió una revocación o eliminación. Las publicaciones ya
          realizadas y su trazabilidad comercial no se borran automáticamente de
          Meta. Para retirar una publicación existente debe actuar una persona
          autorizada directamente sobre el destino correspondiente.
        </p>
      </section>

      <section>
        <h2>Ayuda</h2>
        <p>
          Si no podés entrar al panel o completar el procedimiento, contactá a
          Aramayo al 3854 403534 o acercate a República de Siria 365 o Rivadavia
          673, Frías, Santiago del Estero. Podremos pedir datos adicionales para
          verificar que sos la persona o administrás el activo involucrado.
        </p>
      </section>
    </LegalDocument>
  );
}
