import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Panel interno de creación, revisión y publicación de contenido de Ferretería y Lubricentro Aramayo.",
  robots: { follow: false, index: false },
  title: "Aramayo Content Platform",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
