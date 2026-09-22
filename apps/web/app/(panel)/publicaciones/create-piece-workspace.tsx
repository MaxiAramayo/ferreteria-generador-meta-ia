"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { actorCan } from "../../../lib/panel-navigation.ts";
import {
  defaultComposerVariant,
  type PublicationComposerVariant,
} from "../../../lib/publication-composer-contract.ts";
import { usePanelActor } from "../panel-shell.tsx";
import { PublicationComposer } from "./publication-composer";
import { PublicationsSubnav } from "./publications-subnav";

/**
 * «Crear pieza»: los cuatro flujos, cada uno en su dirección.
 *
 * Crear termina en un borrador o en una regla; revisar, aprobar y publicar
 * siguen en el listado, así que al guardar se ofrece volver ahí.
 */
export function CreatePieceWorkspace({
  apiBaseUrl,
  requestedVariant,
}: Readonly<{
  apiBaseUrl: string;
  requestedVariant: PublicationComposerVariant | null;
}>) {
  const actor = usePanelActor();
  const canEdit = actorCan(actor, "content:edit");
  const canSchedule = actorCan(actor, "content:schedule");
  const router = useRouter();
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const variant =
    requestedVariant ?? defaultComposerVariant({ canEdit, canSchedule });

  return (
    <main className="workspace-shell">
      <section aria-labelledby="crear-pieza" className="workspace-intro">
        <div>
          <p className="workspace-eyebrow">Nueva pieza</p>
          <h1 id="crear-pieza">Elegí cómo nace la pieza.</h1>
        </div>
        <p>
          Cada flujo tiene su dirección. Al guardar te llevamos a la pieza, con
          su imagen final, para aprobarla o seguir editándola.
        </p>
      </section>

      <PublicationsSubnav canCreate={canEdit || canSchedule} />

      {canEdit || canSchedule ? null : (
        <p className="schedule-boundary" role="status">
          Podés ver los flujos, pero tu rol no permite crear piezas ni reglas.
        </p>
      )}

      <PublicationComposer.Provider
        apiBaseUrl={apiBaseUrl}
        canEdit={canEdit}
        canSchedule={canSchedule}
        onDraftSaved={(publication) => {
          // Guardar termina en la pieza, no en un aviso: el listado la abre,
          // le pide el PNG y la muestra para aprobarla.
          setSavedTitle(publication.title);
          router.push(
            `/publicaciones?revisar=${publication.id}#publicacion-${publication.id}`,
          );
        }}
        variant={variant}
      >
        <section className="composer-section">
          <PublicationComposer.VariantNavigation />
          <PublicationComposer.Active />
          <PublicationComposer.Notice />
        </section>
      </PublicationComposer.Provider>

      {savedTitle === null ? null : (
        <p aria-live="polite" className="publication-command-notice">
          «{savedTitle}» quedó como borrador. Te llevamos a verlo.
        </p>
      )}
    </main>
  );
}
