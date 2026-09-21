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
  | "ficha-variantes"
  | "guia-aplicacion"
  | "producto-destacado"
  | "producto-editorial"
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
  | "historia-apertura-cartel"
  | "historia-apertura-esquina"
  | "historia-apertura-horario"
  | "historia-apertura-imagen"
  | "historia-apertura-locales"
  | "historia-apertura-placa"
  | "historia-lubricentro-esquina"
  | "historia-lubricentro-imagen"
  | "historia-lubricentro-placa"
  | "historia-lubricentro-ventana"
  | "historia-ficha-variantes"
  | "historia-guia-aplicacion"
  | "historia-producto-precio"
  | "historia-producto-etiqueta"
  | "historia-producto-precio-abajo"
  | "historia-producto-tarjeta"
  | "historia-producto-ventana"
  | "historia-problema-solucion"
  | "historia-surtido-real"
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

/**
 * Piezas de composición: base generada por IA más capa de marca (`P4-T05`).
 *
 * No vienen de la línea base congelada, así que su nombre describe la región
 * que la capa determinista ocupa. Esa región es la misma que el prompt visual
 * le pide al modelo dejar tranquila, y es lo que distingue a estas piezas de
 * las del catálogo: acá el fondo lo produce un modelo y la composición tiene
 * que caer exactamente donde se lo reservó.
 */
export type ComposedLayoutId =
  | "composicion-tercio-inferior"
  | "composicion-banda-superior"
  | "composicion-circulo-central";

/**
 * Marcos de marca sobre la base generada (`ADR-029`).
 *
 * También componen una base generada, pero no dependen de la región que el
 * prompt reservó: su nombre describe la forma del marco, y quien revisa la
 * variante elige el que no tapa el producto. La región del perfil sólo decide
 * cuál se usa por defecto.
 */
export type FrameLayoutId =
  | "marco-firma"
  | "marco-etiqueta"
  | "marco-sello"
  | "marco-velo-superior"
  | "marco-velo-inferior"
  | "marco-columna-izquierda"
  | "marco-columna-derecha"
  | "marco-zocalo"
  | "marco-vitrina";

export type BannerLayoutId = "banner-marca";

export type HighlightLayoutId = "destacada-cover";

export type LayoutId =
  | BannerLayoutId
  | CarouselLayoutId
  | ComposedLayoutId
  | FrameLayoutId
  | HighlightLayoutId
  | PublicationLayoutId
  | StoryLayoutId;
