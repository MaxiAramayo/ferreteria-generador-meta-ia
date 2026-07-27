import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource/archivo/400.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/saira-condensed/500.css";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource/saira-condensed/800.css";
import "@fontsource/saira-condensed/900.css";

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
