import type { CSSProperties, ReactElement } from "react";

import { Logo } from "../primitives/logo.tsx";
import { Text } from "../primitives/text.tsx";
import { composedPanelColors } from "../themes/theme-colors.ts";
import { SPACING } from "../tokens/space.ts";
import {
  composedPanelRect,
  composedPanelShowsDescriptor,
  composedPanelShowsSubtitle,
  composedTitleToken,
  type ComposedPanelRect,
  type ComposedRegion,
} from "./composed-geometry.ts";
import {
  BrandPanel,
  Cta,
  Eyebrow,
  PhotoScrim,
  PriceBlock,
  ProductImage,
} from "./kit.tsx";
import { mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Piezas de composición: base generada más capa de marca.
 *
 * Son la mitad determinista de `ADR-004`. La imagen que produce el modelo es el
 * fondo; el logo, el título, el precio, la vigencia y el llamado a la acción se
 * dibujan encima con tipografía y color de marca, sobre un panel opaco ubicado
 * en el mismo rectángulo que el prompt le pidió al modelo dejar tranquilo.
 *
 * Dos reglas gobiernan estas piezas:
 *
 * 1. **Todo lo determinista vive dentro del panel.** Nada de la capa de marca
 *    se apoya en píxeles que decidió un modelo, ni siquiera el logo. Es lo que
 *    permite afirmar un umbral de contraste en lugar de suponerlo: el color de
 *    fondo del texto lo elegimos nosotros.
 * 2. **El panel es exactamente el rectángulo reservado.** No crece para que
 *    entre el contenido; el contenido se elige para que entre en él, y cada
 *    región declara en `LAYOUT_SPECS` qué campos sabe sostener.
 */

/**
 * Un logo de 64 le come al titular la mitad de una banda en formato cuadrado.
 * 48 es el mínimo que la propia primitiva admite —por debajo el isotipo deja de
 * ser legible y la composición falla—, así que es el valor exacto.
 */
const panelLogoSize = 48;

/**
 * Fondo de la pieza.
 *
 * Sin base generada no se dibuja el marcador punteado de `PhotoFallback`: eso
 * señala «acá falta una foto» y sirve en el panel, pero una pieza que sale por
 * el camino determinista —porque el brief pidió plantilla, porque la generación
 * está apagada o porque no hay foto aprobada— no es una pieza incompleta, es la
 * pieza que corresponde. Se queda con el fondo de marca del lienzo, que ya
 * pinta el tema, y el panel encima.
 */
function Base(props: LayoutProps): ReactElement | null {
  const { content, context, document, theme } = props;
  const asset = mediaAt(document, 0);

  if (asset === undefined) {
    return null;
  }

  return (
    <div style={{ inset: 0, position: "absolute" }}>
      <ProductImage
        asset={asset}
        context={context}
        fallbackIcon={content.icon ?? "productos"}
        radius={0}
        style={{ height: "100%", width: "100%" }}
        theme={theme}
      />
      {/*
        El velo no sostiene el contraste del texto —de eso se encarga el panel—
        sino la unidad de la pieza: sin él, una base muy clara y una muy oscura
        producirían dos piezas que no parecen de la misma marca.
      */}
      <PhotoScrim />
    </div>
  );
}

function panelStyle(rect: ComposedPanelRect): CSSProperties {
  return {
    height: rect.height,
    left: rect.x,
    padding: SPACING.lg,
    position: "absolute",
    top: rect.y,
    width: rect.width,
  };
}

function rectFor(
  props: LayoutProps,
  region: ComposedRegion,
): ComposedPanelRect {
  return composedPanelRect(region, props.format);
}

/**
 * Encabezado del panel: identidad y etiqueta, en la misma fila.
 *
 * Repite la intención de `Header` con un logo más chico, porque acá la fila
 * compite por altura con el titular dentro de una caja de tamaño fijo.
 */
function PanelHeader({
  badge,
  rect,
  theme,
}: {
  readonly badge: string | undefined;
  readonly rect: ComposedPanelRect;
  readonly theme: LayoutProps["theme"];
}): ReactElement {
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        gap: SPACING.md,
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <Logo
        showDescriptor={composedPanelShowsDescriptor(rect)}
        size={panelLogoSize}
        tone={theme.tone}
        variant={theme.brand}
      />
      {badge === undefined ? null : <Eyebrow theme={theme}>{badge}</Eyebrow>}
    </div>
  );
}

function PanelTitle({
  rect,
  region,
  theme,
  title,
}: {
  readonly rect: ComposedPanelRect;
  readonly region: ComposedRegion;
  readonly theme: LayoutProps["theme"];
  readonly title: string;
}): ReactElement {
  return (
    <Text
      as="h1"
      color={composedPanelColors(theme).text}
      token={composedTitleToken(title.length, region, rect)}
    >
      {title}
    </Text>
  );
}

/**
 * Tercio inferior: la pieza comercial completa.
 *
 * Es la región de los perfiles de producto y de obra, y la única con lugar para
 * precio y vigencia además del titular y el llamado a la acción. El precio y el
 * CTA comparten fila: apilarlos no entra en el tercio de un formato cuadrado.
 */
export function ComposicionTercioInferior(props: LayoutProps): ReactElement {
  const { content, theme } = props;
  const panel = composedPanelColors(theme);
  const rect = rectFor(props, "lower_third");

  return (
    <>
      <Base {...props} />
      <BrandPanel
        style={{ ...panelStyle(rect), justifyContent: "space-between" }}
        theme={theme}
      >
        <PanelHeader badge={content.badge} rect={rect} theme={theme} />
        <PanelTitle
          rect={rect}
          region="lower_third"
          theme={theme}
          title={content.title}
        />
        {content.subtitle === undefined ||
        !composedPanelShowsSubtitle(rect) ? null : (
          <Text as="p" color={panel.muted} token="body">
            {content.subtitle}
          </Text>
        )}
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            gap: SPACING.md,
            justifyContent: "space-between",
          }}
        >
          <PriceBlock
            color={panel.text}
            compact
            mutedColor={panel.muted}
            price={content.price}
            previousPrice={content.previousPrice}
            validity={content.validity}
          />
          <Cta compact theme={theme}>
            {content.callToAction ?? "Consultá por WhatsApp"}
          </Cta>
        </div>
      </BrandPanel>
    </>
  );
}

/**
 * Banda superior: contexto de taller o de servicio.
 *
 * Es ancha y baja, así que sostiene identidad, etiqueta, titular y llamado a la
 * acción, y no precio: un número grande dentro de esta caja obligaría a achicar
 * el titular hasta que deje de ser un titular.
 */
export function ComposicionBandaSuperior(props: LayoutProps): ReactElement {
  const { content, theme } = props;
  const rect = rectFor(props, "upper_band");

  return (
    <>
      <Base {...props} />
      <BrandPanel
        style={{ ...panelStyle(rect), justifyContent: "space-between" }}
        theme={theme}
      >
        <PanelHeader badge={content.badge} rect={rect} theme={theme} />
        <PanelTitle
          rect={rect}
          region="upper_band"
          theme={theme}
          title={content.title}
        />
        <Cta compact theme={theme}>
          {content.callToAction ?? "Consultá por WhatsApp"}
        </Cta>
      </BrandPanel>
    </>
  );
}

/**
 * Sello central: la promoción con vigencia.
 *
 * El rectángulo reservado es cuadrado, así que el panel lo llena entero: el
 * prompt le pide al modelo un rectángulo en coordenadas exactas, no una figura,
 * y componer dentro de un círculo inscripto desperdiciaría casi la mitad del
 * espacio que el modelo dejó libre.
 */
export function ComposicionCirculoCentral(props: LayoutProps): ReactElement {
  const { content, theme } = props;
  const panel = composedPanelColors(theme);
  const rect = rectFor(props, "center_circle");

  return (
    <>
      <Base {...props} />
      <BrandPanel
        style={{
          ...panelStyle(rect),
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "center",
        }}
        theme={theme}
      >
        <PanelHeader badge={content.badge} rect={rect} theme={theme} />
        <PanelTitle
          rect={rect}
          region="center_circle"
          theme={theme}
          title={content.title}
        />
        <PriceBlock
          color={panel.text}
          compact
          mutedColor={panel.muted}
          price={content.price}
          previousPrice={content.previousPrice}
          validity={content.validity}
        />
        <Cta compact theme={theme}>
          {content.callToAction ?? "Aprovechala por WhatsApp"}
        </Cta>
      </BrandPanel>
    </>
  );
}
