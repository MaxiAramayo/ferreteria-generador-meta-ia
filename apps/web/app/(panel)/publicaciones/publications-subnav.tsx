"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { createPiecePath } from "../../../lib/publication-composer-contract.ts";

/**
 * Las dos caras de Publicaciones: lo que ya existe y crear algo nuevo. «Crear
 * pieza» aparece sólo para quien puede editar o programar.
 */
export function PublicationsSubnav({
  canCreate,
}: Readonly<{ canCreate: boolean }>) {
  const creating = usePathname().startsWith(createPiecePath);
  return (
    <nav aria-label="Publicaciones" className="publications-subnav">
      <Link aria-current={creating ? undefined : "page"} href="/publicaciones">
        Listado
      </Link>
      {canCreate ? (
        <Link
          aria-current={creating ? "page" : undefined}
          href={createPiecePath}
        >
          Crear pieza
        </Link>
      ) : null}
    </nav>
  );
}
