import type { MetadataRoute } from "next";

/**
 * Permite agregar el panel a la pantalla de inicio del celular: abre a
 * pantalla completa, con el nombre y el isotipo de Aramayo. No instala nada ni
 * funciona sin conexión; el panel sigue necesitando la API.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f6f1ea",
    description:
      "Crear y publicar las piezas de Ferretería y Lubricentro Aramayo.",
    display: "standalone",
    icons: [
      { sizes: "192x192", src: "/icon/192", type: "image/png" },
      { sizes: "512x512", src: "/icon/512", type: "image/png" },
    ],
    lang: "es-AR",
    name: "Aramayo · Contenido",
    short_name: "Aramayo",
    start_url: "/",
    theme_color: "#f6f1ea",
  };
}
