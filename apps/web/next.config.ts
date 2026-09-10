import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cada `<Image>` del panel ya se declara `unoptimized`: las piezas se sirven
  // tal como se aprobaron y no admiten recorte ni recompresión. Declararlo
  // globalmente además apaga `/_next/image`, un endpoint que no se usa y que no
  // tiene por qué quedar expuesto en el ingreso público.
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // El motor de diseño se resuelve desde node_modules en lugar de empaquetarse:
  // así conserva la ruta real de sus activos al servirlos.
  serverExternalPackages: ["@aramayo/design-engine"],
};

export default nextConfig;
