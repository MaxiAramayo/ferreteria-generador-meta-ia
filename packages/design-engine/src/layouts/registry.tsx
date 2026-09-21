import type { ReactElement } from "react";

import type { DesignDocument } from "../contracts/document.ts";
import { DesignEngineError } from "../contracts/errors.ts";
import { formatFor } from "../formats/formats.ts";
import { Canvas } from "../primitives/canvas.tsx";
import type { LayoutId } from "../registry/layout-id.ts";
import { themeFor } from "../themes/theme-colors.ts";
import type { DesignIssue } from "../validation/issues.ts";
import { BannerMarca, DestacadaCover } from "./brand-pieces.tsx";
import {
  ComposicionBandaSuperior,
  ComposicionCirculoCentral,
  ComposicionTercioInferior,
  ProductoEditorial,
} from "./composed-pieces.tsx";
import {
  MarcoColumnaDerecha,
  MarcoColumnaIzquierda,
  MarcoEtiqueta,
  MarcoFirma,
  MarcoSello,
  MarcoVeloInferior,
  MarcoVeloSuperior,
  MarcoVitrina,
  MarcoZocalo,
} from "./frame-pieces.tsx";
import {
  HistoriaProblemaSolucion,
  HistoriaProductoPrecio,
  HistoriaSurtidoReal,
} from "./commercial-stories.tsx";
import {
  FichaVariantes,
  GuiaAplicacion,
  HistoriaFichaVariantes,
  HistoriaGuiaAplicacion,
} from "./technical-product-cards.tsx";
import {
  ComboKit,
  HistoriaLocales,
  HistoriaPrecioDia,
  HistoriaTip,
  HistoriaTurnoLubricentro,
  ProblemaSolucion,
  ProductoPrecio,
} from "./catalog-pieces.tsx";
import {
  HistoriaAperturaCartel,
  HistoriaAperturaHorario,
  HistoriaAperturaImagen,
  HistoriaAperturaLocales,
  HistoriaMarcoEsquina,
  HistoriaMarcoPlaca,
  HistoriaMarcoVentana,
} from "./opening-stories.tsx";
import {
  HistoriaProductoEtiqueta,
  HistoriaProductoPrecioAbajo,
  HistoriaProductoTarjeta,
  HistoriaProductoVentana,
} from "./product-stories.tsx";
import type { LayoutContext, LayoutProps } from "./layout-context.ts";
import {
  EppSeguridad,
  HistoriaProducto,
  LubricentroServicio,
  PresentacionMarca,
  ProductoDestacado,
  ProductoMosaico,
  PromoProducto,
  Sucursales,
  TipOficio,
} from "./publications.tsx";

/**
 * Registro de componentes de layout.
 *
 * Un identificador registrado en `LAYOUT_SPECS` pero todavía sin componente
 * produce un fallo de etapa `layout` con razón `not-registered`: la migración
 * avanza por familias y nunca compone una pieza a medias.
 */

export type LayoutComponent = (props: LayoutProps) => ReactElement;

const LAYOUT_COMPONENTS: Readonly<Partial<Record<LayoutId, LayoutComponent>>> =
  Object.freeze({
    "banner-marca": BannerMarca,
    "historia-apertura-cartel": HistoriaAperturaCartel,
    "historia-apertura-horario": HistoriaAperturaHorario,
    "historia-apertura-imagen": HistoriaAperturaImagen,
    "historia-apertura-locales": HistoriaAperturaLocales,
    "historia-apertura-esquina": HistoriaMarcoEsquina,
    "historia-apertura-placa": HistoriaMarcoPlaca,
    "historia-producto-etiqueta": HistoriaProductoEtiqueta,
    "historia-producto-precio-abajo": HistoriaProductoPrecioAbajo,
    "historia-producto-tarjeta": HistoriaProductoTarjeta,
    "historia-producto-ventana": HistoriaProductoVentana,
    "historia-lubricentro-esquina": HistoriaMarcoEsquina,
    "historia-lubricentro-imagen": HistoriaAperturaImagen,
    "historia-lubricentro-placa": HistoriaMarcoPlaca,
    "historia-lubricentro-ventana": HistoriaMarcoVentana,
    "combo-kit": ComboKit,
    "composicion-banda-superior": ComposicionBandaSuperior,
    "composicion-circulo-central": ComposicionCirculoCentral,
    "composicion-tercio-inferior": ComposicionTercioInferior,
    "destacada-cover": DestacadaCover,
    "epp-seguridad": EppSeguridad,
    "ficha-variantes": FichaVariantes,
    "guia-aplicacion": GuiaAplicacion,
    "historia-ficha-variantes": HistoriaFichaVariantes,
    "historia-guia-aplicacion": HistoriaGuiaAplicacion,
    "historia-locales": HistoriaLocales,
    "historia-problema-solucion": HistoriaProblemaSolucion,
    "historia-precio-dia": HistoriaPrecioDia,
    "historia-producto": HistoriaProducto,
    "historia-producto-precio": HistoriaProductoPrecio,
    "historia-surtido-real": HistoriaSurtidoReal,
    "historia-tip": HistoriaTip,
    "historia-turno-lubricentro": HistoriaTurnoLubricentro,
    "lubricentro-servicio": LubricentroServicio,
    "marco-columna-derecha": MarcoColumnaDerecha,
    "marco-columna-izquierda": MarcoColumnaIzquierda,
    "marco-etiqueta": MarcoEtiqueta,
    "marco-firma": MarcoFirma,
    "marco-sello": MarcoSello,
    "marco-velo-inferior": MarcoVeloInferior,
    "marco-velo-superior": MarcoVeloSuperior,
    "marco-vitrina": MarcoVitrina,
    "marco-zocalo": MarcoZocalo,
    "presentacion-marca": PresentacionMarca,
    "problema-solucion": ProblemaSolucion,
    "producto-destacado": ProductoDestacado,
    "producto-editorial": ProductoEditorial,
    "producto-mosaico": ProductoMosaico,
    "producto-precio": ProductoPrecio,
    "promo-producto": PromoProducto,
    sucursales: Sucursales,
    "tip-oficio": TipOficio,
  });

export function layoutComponentFor(layoutId: LayoutId): LayoutComponent {
  const component = LAYOUT_COMPONENTS[layoutId];

  if (component === undefined) {
    throw new DesignEngineError(
      { layout: layoutId, reason: "not-registered", stage: "layout" },
      "El layout todavía no tiene componente migrado.",
    );
  }

  return component;
}

export function isLayoutMigrated(layoutId: LayoutId): boolean {
  return LAYOUT_COMPONENTS[layoutId] !== undefined;
}

/**
 * Presupuesto de texto por campo.
 *
 * El generador dejaba que un título largo empujara subtítulo y CTA fuera de la
 * pieza, sin diagnóstico: la línea base lo registra como defecto en
 * `borde-texto-largo`. La regla aprobada de la migración es explícita: el texto
 * que no entra se rechaza con la ruta del campo, y quien edita decide.
 */
export const TEXT_BUDGET = Object.freeze({
  feature: 28,
  greeting: 26,
  highlight: 32,
  items: 60,
  subtitle: 150,
  title: 90,
  validity: 90,
});

export function assertTextFits(document: DesignDocument): void {
  const issues: DesignIssue[] = [];
  const { content } = document;

  if (content.title.length > TEXT_BUDGET.title) {
    issues.push({ code: "too-long", path: "content.title" });
  }

  if (
    content.subtitle !== undefined &&
    content.subtitle.length > TEXT_BUDGET.subtitle
  ) {
    issues.push({ code: "too-long", path: "content.subtitle" });
  }

  if (
    content.greeting !== undefined &&
    content.greeting.length > TEXT_BUDGET.greeting
  ) {
    issues.push({ code: "too-long", path: "content.greeting" });
  }

  if (
    content.validity !== undefined &&
    content.validity.length > TEXT_BUDGET.validity
  ) {
    issues.push({ code: "too-long", path: "content.validity" });
  }

  for (const [index, feature] of (content.features ?? []).entries()) {
    if (feature.label.length > TEXT_BUDGET.feature) {
      issues.push({
        code: "too-long",
        path: `content.features[${String(index)}].label`,
      });
    }
  }

  for (const [index, highlight] of (content.highlights ?? []).entries()) {
    if (highlight.length > TEXT_BUDGET.highlight) {
      issues.push({
        code: "too-long",
        path: `content.highlights[${String(index)}]`,
      });
    }
  }

  for (const [index, item] of (content.items ?? []).entries()) {
    if (item.length > TEXT_BUDGET.items) {
      issues.push({
        code: "too-long",
        path: `content.items[${String(index)}]`,
      });
    }
  }

  if (issues.length > 0) {
    throw new DesignEngineError(
      { issues, stage: "content" },
      "El texto excede el presupuesto del formato.",
    );
  }
}

export interface RenderOptions {
  readonly context: LayoutContext;
  readonly document: DesignDocument;
}

/**
 * Compone la pieza completa: lienzo exportable más el layout registrado.
 */
export function DesignPiece({
  context,
  document,
}: RenderOptions): ReactElement {
  assertTextFits(document);

  const format = formatFor(document.format);
  const theme = themeFor(document.theme);
  const Layout = layoutComponentFor(document.layout);
  // Las aperturas dibujan su propia trama de cartel (`ADR-030`).
  const withoutBackdrop: ReadonlySet<string> = new Set([
    "banner-marca",
    "destacada-cover",
    "historia-apertura-cartel",
    "historia-apertura-esquina",
    "historia-apertura-horario",
    "historia-apertura-imagen",
    "historia-apertura-locales",
    "historia-apertura-placa",
    "historia-producto-etiqueta",
    "historia-producto-precio-abajo",
    "historia-producto-tarjeta",
    "historia-producto-ventana",
    "historia-lubricentro-esquina",
    "historia-lubricentro-imagen",
    "historia-lubricentro-placa",
    "historia-lubricentro-ventana",
  ]);
  const backdrop = !withoutBackdrop.has(document.layout);

  return (
    <Canvas backdrop={backdrop} format={format} theme={theme}>
      <Layout
        content={document.content}
        context={context}
        document={document}
        format={format}
        theme={theme}
      />
    </Canvas>
  );
}
