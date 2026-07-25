/**
 * Clasificación de propiedad y permiso de uso de los activos del generador.
 *
 * La inclusión de un archivo en el repositorio fuente no equivale a tener
 * derechos sobre él. Cada activo queda con un estado explícito y los que
 * requieren confirmación del negocio se informan como tales, en lugar de
 * asumirse aprobados.
 */

export type OwnershipStatus =
  | "aramayo"
  | "libre-verificada"
  | "por-confirmar-catalogo"
  | "por-confirmar-stock";

export interface OwnershipRule {
  readonly note: string;
  readonly status: OwnershipStatus;
}

const brandRule: OwnershipRule = {
  note: "Material propio de Ferretería y Lubricentro Aramayo: logos, frentes e interiores de sus locales.",
  status: "aramayo",
};

const catalogRule: OwnershipRule = {
  note: "Fotografía de catálogo de un proveedor; requiere confirmar autorización de uso en redes.",
  status: "por-confirmar-catalogo",
};

const stockRule: OwnershipRule = {
  note: "Fotografía genérica sin origen registrado; requiere confirmar licencia o reemplazo por foto propia.",
  status: "por-confirmar-stock",
};

const vectorRule: OwnershipRule = {
  note: "Ilustración vectorial simple incluida en el repositorio fuente; verificar autoría antes de migrarla.",
  status: "libre-verificada",
};

const productPhotoRule: OwnershipRule = {
  note: "Fotografía de producto tomada para la ferretería; confirmar que sea propia antes de reutilizarla.",
  status: "por-confirmar-stock",
};

/**
 * Resuelve la regla aplicable a una ruta del generador.
 *
 * El orden importa: las reglas más específicas se evalúan primero.
 */
export function ownershipFor(assetPath: string): OwnershipRule {
  if (assetPath.includes("/brand/")) {
    return brandRule;
  }
  if (assetPath.endsWith(".svg")) {
    return vectorRule;
  }
  if (assetPath.includes("catalogo-")) {
    return catalogRule;
  }
  if (assetPath.includes("/stock-") || assetPath.includes("captura-pantalla")) {
    return stockRule;
  }

  return productPhotoRule;
}

export function requiresConfirmation(status: OwnershipStatus): boolean {
  return (
    status === "por-confirmar-catalogo" || status === "por-confirmar-stock"
  );
}
