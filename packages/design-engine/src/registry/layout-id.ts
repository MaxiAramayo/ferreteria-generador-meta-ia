/**
 * Identificadores de layout de la línea base congelada en `P1-T01`.
 *
 * Los identificadores se conservan en español porque nombran piezas reales del
 * sistema visual vigente: renombrarlos rompería la trazabilidad con los
 * fixtures y las referencias PNG aprobadas.
 *
 * El catálogo propio agrega piezas que el generador no tenía; su estado y su
 * objetivo comercial están en `docs/architecture/PIECE-CATALOG.md`.
 */

export type PublicationLayoutId =
  | "producto-destacado"
  | "producto-precio"
  | "combo-kit"
  | "problema-solucion"
  | "promo-producto"
  | "lubricentro-servicio"
  | "tip-oficio"
  | "epp-seguridad"
  | "presentacion-marca"
  | "sucursales"
  | "producto-mosaico";

export type CarouselLayoutId =
  | "carrusel-bienvenida-portada"
  | "carrusel-bienvenida-locales"
  | "carrusel-bienvenida-datos"
  | "carrusel-productos-portada"
  | "carrusel-productos-ferreteria"
  | "carrusel-productos-mas"
  | "carrusel-lubricentro-portada"
  | "carrusel-lubricentro-servicios"
  | "carrusel-lubricentro-turno";

export type StoryLayoutId =
  | "historia-producto"
  | "historia-precio-dia"
  | "historia-turno-lubricentro"
  | "historia-tip"
  | "historia-promo"
  | "historia-apertura"
  | "historia-locales"
  | "historia-informativa"
  | "historia-lubricentro-diaria"
  | "historia-producto-del-dia"
  | "historia-tip-diario"
  | "historia-reposicion"
  | "historia-encuesta"
  | "historia-preguntas"
  | "historia-recordatorio-lubricentro"
  | "historia-resena"
  | "historia-oferta-diaria";

export type BannerLayoutId = "banner-marca";

export type HighlightLayoutId = "destacada-cover";

export type LayoutId =
  | BannerLayoutId
  | CarouselLayoutId
  | HighlightLayoutId
  | PublicationLayoutId
  | StoryLayoutId;
