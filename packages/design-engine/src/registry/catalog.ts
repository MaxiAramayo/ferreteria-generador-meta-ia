import type { LayoutId } from "./layout-id.ts";

/**
 * Estado de cada pieza dentro del catálogo curado.
 *
 * La migración dejó de ser una copia del generador: el catálogo lo decide el
 * negocio y está documentado en `docs/architecture/PIECE-CATALOG.md`
 * (decisión registrada en `ADR-011`).
 *
 * - `current`: pieza vigente; se migra y se puede publicar.
 * - `redesign`: la idea se conserva, la composición se rehace.
 *   Una pieza cuya idea ya cubre otra del catálogo no queda en `redesign`: se
 *   retira y el reemplazo queda documentado en `PIECE-CATALOG.md`.
 * - `retired`: no se migra. Se conserva el identificador para no perder la
 *   trazabilidad con la línea base congelada, pero componerla falla.
 */

export type CatalogStatus = "current" | "redesign" | "retired";

export const CATALOG_STATUS: Readonly<Record<LayoutId, CatalogStatus>> =
  Object.freeze({
    "banner-marca": "current",
    "combo-kit": "current",
    "historia-apertura-cartel": "current",
    "historia-apertura-esquina": "current",
    "historia-apertura-horario": "current",
    "historia-apertura-imagen": "current",
    "historia-apertura-locales": "current",
    "historia-apertura-placa": "current",
    "historia-lubricentro-esquina": "current",
    "historia-lubricentro-imagen": "current",
    "historia-lubricentro-placa": "current",
    "historia-lubricentro-ventana": "current",
    "carrusel-bienvenida-datos": "retired",
    "carrusel-bienvenida-locales": "retired",
    "carrusel-bienvenida-portada": "retired",
    "carrusel-lubricentro-portada": "retired",
    "carrusel-lubricentro-servicios": "retired",
    "carrusel-lubricentro-turno": "retired",
    "carrusel-productos-ferreteria": "retired",
    "carrusel-productos-mas": "retired",
    "carrusel-productos-portada": "retired",
    "composicion-banda-superior": "current",
    "composicion-circulo-central": "current",
    "composicion-tercio-inferior": "current",
    "destacada-cover": "current",
    "epp-seguridad": "current",
    "ficha-variantes": "current",
    "historia-apertura": "retired",
    "historia-encuesta": "retired",
    "historia-ficha-variantes": "current",
    "historia-guia-aplicacion": "current",
    "historia-informativa": "retired",
    "historia-locales": "current",
    "historia-lubricentro-diaria": "retired",
    "historia-oferta-diaria": "retired",
    "historia-problema-solucion": "current",
    "historia-precio-dia": "current",
    "historia-producto-precio": "current",
    "historia-producto-etiqueta": "current",
    "historia-producto-precio-abajo": "current",
    "historia-producto-tarjeta": "current",
    "historia-producto-ventana": "current",
    "historia-preguntas": "retired",
    "historia-producto": "current",
    "historia-producto-del-dia": "retired",
    "historia-promo": "retired",
    "historia-recordatorio-lubricentro": "retired",
    "historia-reposicion": "retired",
    "historia-resena": "retired",
    "historia-surtido-real": "current",
    "historia-tip": "current",
    "historia-turno-lubricentro": "current",
    "historia-tip-diario": "retired",
    "guia-aplicacion": "current",
    "lubricentro-servicio": "current",
    "marco-columna-derecha": "current",
    "marco-columna-izquierda": "current",
    "marco-etiqueta": "current",
    "marco-firma": "current",
    "marco-sello": "current",
    "marco-velo-inferior": "current",
    "marco-velo-superior": "current",
    "marco-vitrina": "current",
    "marco-zocalo": "current",
    "presentacion-marca": "current",
    "problema-solucion": "current",
    "producto-destacado": "current",
    "producto-editorial": "current",
    "producto-mosaico": "current",
    "producto-precio": "current",
    "promo-producto": "current",
    sucursales: "current",
    "tip-oficio": "current",
  });

export function catalogStatusFor(layoutId: LayoutId): CatalogStatus {
  return CATALOG_STATUS[layoutId];
}

export function isPublishable(layoutId: LayoutId): boolean {
  return CATALOG_STATUS[layoutId] === "current";
}
