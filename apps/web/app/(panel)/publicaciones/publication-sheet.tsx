"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Hoja que se abre sobre la pieza que se tocó (`P2-T11`).
 *
 * Antes, ver, aprobar, publicar o eliminar se dibujaban al pie del listado,
 * lejos de la pieza y fuera de la pantalla del celular. Ahora se abren encima:
 * desde abajo en el celular y al centro en la computadora. Es un `<dialog>`
 * nativo, así que atrapa el foco, cierra con Escape y deja inerte el resto.
 */
export function PublicationSheet({
  children,
  onClose,
  title,
  wide = false,
}: Readonly<{
  children: ReactNode;
  onClose: () => void;
  title: string;
  /** Más ancha en la computadora: la imagen y las opciones, lado a lado. */
  wide?: boolean;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => {
      element?.close();
    };
  }, []);

  return (
    <dialog
      aria-labelledby={titleId}
      className="publication-sheet"
      data-wide={String(wide)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Tocar afuera de la hoja la cierra, como en cualquier app.
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialog}
    >
      <div className="publication-sheet-body">
        <header className="publication-sheet-header">
          <h2 id={titleId}>{title}</h2>
          <button aria-label="Cerrar" onClick={onClose} type="button">
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
