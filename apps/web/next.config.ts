import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // El motor de diseño se resuelve desde node_modules en lugar de empaquetarse:
  // así conserva la ruta real de sus activos al servirlos.
  serverExternalPackages: ["@aramayo/design-engine"],
};

export default nextConfig;
