/**
 * Perfil comercial aprobado de Aramayo.
 *
 * Son datos operativos —teléfono, direcciones, horario— que cambian con el
 * negocio, no identidad visual. Por eso viven acá y no en el motor de diseño:
 * el motor recibe el perfil como entrada y nunca lo escribe dentro de un
 * layout.
 *
 * Cambiar un valor requiere confirmación del negocio, igual que un activo.
 * Origen: `src/brand.ts` del generador congelado en `P1-T01`.
 */

export interface BrandProfile {
  /** Sucursal secundaria. */
  readonly branch: string;
  /** Casa central. */
  readonly central: string;
  readonly city: string;
  readonly claim: string;
  readonly handle: string;
  readonly name: string;
  readonly opening: string;
  readonly phone: string;
  readonly shortName: string;
}

export const ARAMAYO_BRAND_PROFILE: BrandProfile = Object.freeze({
  branch: "Rivadavia 673",
  central: "República de Siria 365",
  city: "Frías, Santiago del Estero",
  claim: "Ferretería, hogar y automotor liviano",
  handle: "@LubricentroAramayo",
  name: "Ferretería y Lubricentro Aramayo",
  opening: "Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30",
  phone: "3854 403534",
  shortName: "Aramayo",
});
