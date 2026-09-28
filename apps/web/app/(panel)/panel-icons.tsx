import type { ReactElement } from "react";

/**
 * Íconos de la barra del panel.
 *
 * Son los trazos de Lucide (ISC) que el motor ya usa para las piezas, copiados
 * para cinco dibujos: no vale sumar una dependencia al panel por esto. Siempre
 * acompañan a un texto, así que se ocultan a los lectores de pantalla.
 */

export type PanelIconName = "calendar" | "home" | "list" | "menu" | "plus";

const paths: Readonly<Record<PanelIconName, readonly string[]>> = {
  calendar: [
    "M8 2v4",
    "M16 2v4",
    "M3 10h18",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  ],
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  list: [
    "M3 5h.01",
    "M3 12h.01",
    "M3 19h.01",
    "M8 5h13",
    "M8 12h13",
    "M8 19h13",
  ],
  menu: ["M4 5h16", "M4 12h16", "M4 19h16"],
  plus: ["M5 12h14", "M12 5v14"],
};

export function PanelIcon({
  name,
  size = 22,
}: Readonly<{ name: PanelIconName; size?: number }>): ReactElement {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
