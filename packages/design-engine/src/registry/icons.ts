/**
 * Nombres semánticos de icono admitidos.
 *
 * El documento nunca referencia un SVG ni un archivo: nombra una intención. El
 * adaptador de iconos (`P1-T03`) traduce cada nombre a su icono de Lucide.
 *
 * La lista proviene del inventario congelado en `P1-T01`.
 */

export type IconName =
  | "aceite"
  | "automotor"
  | "bateria"
  | "brocha"
  | "buloneria"
  | "destacado"
  | "electricidad"
  | "epp"
  | "herramienta"
  | "herramientas"
  | "hogar"
  | "lubricentro"
  | "pagos"
  | "pileta"
  | "pintura"
  | "productos"
  | "promo"
  | "reloj"
  | "repuestos"
  | "rubros"
  | "seguridad"
  | "sucursales"
  | "tag"
  | "telefono"
  | "tienda"
  | "ubicacion";

export const ICON_NAMES: readonly IconName[] = Object.freeze([
  "aceite",
  "bateria",
  "buloneria",
  "brocha",
  "destacado",
  "hogar",
  "electricidad",
  "epp",
  "herramienta",
  "herramientas",
  "lubricentro",
  "automotor",
  "pintura",
  "productos",
  "repuestos",
  "rubros",
  "promo",
  "pagos",
  "reloj",
  "seguridad",
  "tienda",
  "sucursales",
  "pileta",
  "ubicacion",
  "telefono",
  "tag",
]);

const iconNames: ReadonlySet<string> = new Set(ICON_NAMES);

export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && iconNames.has(value);
}
