/**
 * Propiedad y permiso de uso de los activos del generador.
 *
 * La inclusión de un archivo en el repositorio fuente no equivale a tener
 * derechos sobre él. Por eso la aprobación no se deduce de la ruta: se registra
 * activo por activo, con la fecha en que el negocio confirmó su origen.
 *
 * Un activo nuevo que no figure en esta lista queda como `por-confirmar` y
 * `P1-T03` no debe migrarlo hasta que se lo revise.
 */

export type OwnershipStatus = "aramayo" | "por-confirmar";

export interface OwnershipRule {
  readonly note: string;
  readonly status: OwnershipStatus;
}

/** Fecha en que Ferretería y Lubricentro Aramayo confirmó el origen. */
export const ownershipConfirmationDate = "2026-07-25";

/**
 * Activos con origen confirmado: logos, frentes e interiores de los locales y
 * fotografías de producto tomadas por el negocio.
 */
const confirmedAssets: ReadonlySet<string> = new Set([
  "public/media/aceite.svg",
  "public/media/botas-seguridad-pvc.jpg",
  "public/media/brand/ferreteria-aramayo-logo.png",
  "public/media/brand/frente-central.jpg",
  "public/media/brand/frente-rivadavia.jpg",
  "public/media/brand/interior-herramientas.jpg",
  "public/media/brand/interior-lubricantes.jpg",
  "public/media/brand/local-aramayo-alt.jpg",
  "public/media/brand/local-aramayo.jpg",
  "public/media/brand/logo-familia-dark.png",
  "public/media/brand/logo-familia-light.png",
  "public/media/brand/logo-ferreteria-dark.png",
  "public/media/brand/logo-ferreteria-light.png",
  "public/media/brand/logo-instagram.png",
  "public/media/brand/logo-lubricentro-dark.png",
  "public/media/brand/logo-lubricentro-light.png",
  "public/media/brand/lubricentro-baterias.jpg",
  "public/media/brand/lubricentro-filtros.jpg",
  "public/media/brand/lubricentro-fosa.jpg",
  "public/media/cano-ips-bicapa.jpg",
  "public/media/captura-pantalla-promo.png",
  "public/media/catalogo-capea-italiana-feed.jpg",
  "public/media/catalogo-capea-italiana-historia.jpg",
  "public/media/conector-t-riego-goteo.jpg",
  "public/media/deposito-plomeria-surtido.jpg",
  "public/media/entrerosca-cano-ips.jpg",
  "public/media/epp.svg",
  "public/media/flexible-conexion-agua.jpg",
  "public/media/machete-hacha-biassoni.jpg",
  "public/media/manguera-azul.jpeg",
  "public/media/manguera-azul.jpg",
  "public/media/pintura.svg",
  "public/media/stock-epp.jpg",
  "public/media/stock-herramientas-electricas.jpg",
  "public/media/stock-pinturas.jpg",
  "public/media/stock-plomeria.jpg",
  "public/media/taladro.svg",
  "public/media/tapa-pvc-tuboforte.jpg",
]);

export function ownershipFor(assetPath: string): OwnershipRule {
  if (confirmedAssets.has(assetPath)) {
    return {
      note: `Material propio de Ferretería y Lubricentro Aramayo; origen confirmado por el negocio el ${ownershipConfirmationDate}.`,
      status: "aramayo",
    };
  }

  return {
    note: "Activo incorporado después del congelamiento; requiere confirmar origen y permiso de uso antes de migrarlo.",
    status: "por-confirmar",
  };
}

export function requiresConfirmation(status: OwnershipStatus): boolean {
  return status === "por-confirmar";
}
