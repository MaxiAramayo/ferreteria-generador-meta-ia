import type { Metadata, Viewport } from "next";
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

/**
 * El panel se usa en el celular: la barra de abajo respeta el borde del iPhone
 * (`viewport-fit=cover`) y el color del navegador acompaña al papel de marca.
 */
export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#f6f1ea",
  viewportFit: "cover",
  width: "device-width",
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
