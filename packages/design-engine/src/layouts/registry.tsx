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
} from "./composed-pieces.tsx";
import {
  ComboKit,
  HistoriaLocales,
  HistoriaPrecioDia,
  HistoriaTip,
  HistoriaTurnoLubricentro,
  ProblemaSolucion,
  ProductoPrecio,
} from "./catalog-pieces.tsx";
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
    "combo-kit": ComboKit,
    "composicion-banda-superior": ComposicionBandaSuperior,
    "composicion-circulo-central": ComposicionCirculoCentral,
    "composicion-tercio-inferior": ComposicionTercioInferior,
    "destacada-cover": DestacadaCover,
    "epp-seguridad": EppSeguridad,
    "historia-locales": HistoriaLocales,
    "historia-precio-dia": HistoriaPrecioDia,
    "historia-producto": HistoriaProducto,
    "historia-tip": HistoriaTip,
    "historia-turno-lubricentro": HistoriaTurnoLubricentro,
    "lubricentro-servicio": LubricentroServicio,
    "presentacion-marca": PresentacionMarca,
    "problema-solucion": ProblemaSolucion,
    "producto-destacado": ProductoDestacado,
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
  items: 60,
  subtitle: 150,
  title: 90,
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
  const withoutBackdrop: ReadonlySet<string> = new Set([
    "banner-marca",
    "destacada-cover",
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
