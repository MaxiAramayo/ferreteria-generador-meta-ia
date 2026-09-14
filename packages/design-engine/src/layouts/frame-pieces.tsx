import type { ReactElement } from "react";

import type { DesignContent } from "../contracts/document.ts";
import type { DesignFormat } from "../formats/formats.ts";
import { composedPanelColors, type Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  CARTEL_GAP,
  CARTEL_HEIGHT,
  COLUMN_INNER_GUTTER,
  COLUMN_WIDTH,
  FIRMA_TITLE_MAXIMUM_WIDTH,
  frameTitleSize,
  PLINTH_MINIMUM_SHARE,
  PLINTH_PADDING_TOP,
  SEAL_CTA_OVERLAP,
  SEAL_CTA_PROTRUSION,
  SEAL_PADDING,
  sealDiameterFor,
  TAG_CORNER_CUT,
  TAG_PADDING,
  tagWidthFor,
  VEIL_FADE,
  WINDOW_RADIUS,
} from "./frame-geometry.ts";
import {
  Cartel,
  FrameBuyRow,
  FrameChip,
  frameAccent,
  FrameCta,
  frameCtaColors,
  FramePhoto,
  FramePrice,
  FrameSubtitle,
  FrameTitle,
  liftShadow,
  veilBackground,
  veilMuted,
  veilText,
  veilTextShadow,
} from "./frame-kit.tsx";
import { Disclaimer, ProductImage } from "./kit.tsx";
import { mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Familia de marcos «Letrero de Chapa» (`ADR-029`).
 *
 * Nueve marcos ordenados por cuánta imagen tapan. Todos llevan el cartel
 * arriba y todos apoyan su texto en una zona de marca —placa, velo, sello o
 * vitrina— marcada con `data-panel`, que es lo que la suite de composición
 * comprueba y mide. Cuál conviene depende de dónde quedó el producto en la
 * base: el marco ocupa siempre el espacio que la imagen dejó libre.
 */

const defaultCallToAction = "Consultá por WhatsApp";

function cartelAt(format: DesignFormat): { left: number; top: number } {
  return { left: format.safeArea.left, top: format.safeArea.top };
}

/**
 * Firma: el cartel arriba y un rótulo abajo.
 *
 * Es el marco que menos tapa. El rótulo repite la estructura del cartel
 * invertida —placa oscura con el titular y remate de color con la acción—, así
 * que la pieza se lee como dos letreros y la foto queda entera entre ellos.
 */
export function MarcoFirma(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;
  const plate = composedPanelColors(theme);
  const accent = frameAccent(theme);

  return (
    <>
      <FramePhoto {...props} />
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
      <div
        data-frame="marco-firma"
        data-panel=""
        style={{
          alignItems: "stretch",
          bottom: safeArea.bottom,
          boxShadow: liftShadow,
          display: "flex",
          left: safeArea.left,
          maxWidth: format.width - safeArea.left - safeArea.right,
          position: "absolute",
          zIndex: 20,
        }}
      >
        <div
          style={{
            backgroundColor: plate.background,
            display: "flex",
            flexDirection: "column",
            // Con un botón largo el que baja de renglón es el botón: la placa
            // conserva el ancho con que se midió el titular.
            flexShrink: 0,
            gap: 10,
            justifyContent: "center",
            maxWidth: FIRMA_TITLE_MAXIMUM_WIDTH + 52,
            paddingBottom: 20,
            paddingLeft: 26,
            paddingRight: 26,
            paddingTop: 20,
          }}
        >
          <FrameTitle
            color={plate.text}
            size={frameTitleSize("marco-firma", content.title, format)}
            title={content.title}
          />
          {content.disclaimer === undefined ? null : (
            <Disclaimer color={plate.muted}>{content.disclaimer}</Disclaimer>
          )}
        </div>
        <FrameCta
          colors={accent}
          style={{
            alignItems: "center",
            borderRadius: RADII.none,
            display: "flex",
            paddingBottom: 0,
            paddingLeft: 26,
            paddingRight: 26,
            paddingTop: 0,
          }}
        >
          {content.callToAction ?? defaultCallToAction}
        </FrameCta>
      </div>
    </>
  );
}

/**
 * Etiqueta: una tarjeta de precio de góndola en la esquina inferior izquierda.
 *
 * Tapa poco y se ve sobre cualquier foto porque es de papel. La esquina cortada
 * repite el ángulo del hexágono del isotipo.
 */
export function MarcoEtiqueta(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;
  const kicker =
    theme.brand === "lubricentro" ? COLORS.graphite : COLORS.rustDeep;
  const muted = withAlpha(COLORS.ink, 0.72);
  const cut = String(TAG_CORNER_CUT);

  return (
    <>
      <FramePhoto {...props} />
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
      <div
        style={{
          bottom: safeArea.bottom,
          filter: `drop-shadow(0 16px 30px ${withAlpha(COLORS.graphiteDeep, 0.35)})`,
          left: safeArea.left,
          position: "absolute",
          zIndex: 20,
        }}
      >
        <div
          data-frame="marco-etiqueta"
          data-panel=""
          style={{
            alignItems: "flex-start",
            backgroundColor: COLORS.paper,
            clipPath: `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, 0 100%)`,
            color: COLORS.ink,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            paddingBottom: TAG_PADDING,
            paddingLeft: TAG_PADDING,
            paddingRight: TAG_PADDING,
            paddingTop: TAG_PADDING,
            width: tagWidthFor(format),
          }}
        >
          {content.badge === undefined ? null : (
            <span
              data-role="etiqueta"
              style={{
                color: kicker,
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 26,
                fontWeight: FONT_WEIGHTS.extrabold,
                letterSpacing: 1.2,
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {content.badge}
            </span>
          )}
          <FrameTitle
            color={COLORS.ink}
            size={frameTitleSize("marco-etiqueta", content.title, format)}
            title={content.title}
          />
          <FramePrice
            color={COLORS.ink}
            invitesWhenMissing
            mutedColor={muted}
            price={content.price}
            size={92}
            validity={content.validity}
          />
          <FrameCta
            colors={frameCtaColors(theme, COLORS.paper)}
            style={{ alignSelf: "stretch", width: "auto" }}
          >
            {content.callToAction ?? defaultCallToAction}
          </FrameCta>
          {content.disclaimer === undefined ? null : (
            <Disclaimer color={muted}>{content.disclaimer}</Disclaimer>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Sello: un círculo en el centro que la escena dejó libre.
 *
 * Es la forma de la promoción. El botón se engancha al borde inferior del
 * círculo en lugar de flotar sobre la foto, así que todo el bloque ocupa un
 * solo lugar.
 */
export function MarcoSello(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;
  const plate = composedPanelColors(theme);
  const accent = frameAccent(theme);
  const diameter = sealDiameterFor(format);
  const top = safeArea.top + CARTEL_HEIGHT;
  const bottom = format.height - safeArea.bottom;
  const groupTop = Math.round(
    (top + bottom - diameter - SEAL_CTA_PROTRUSION) / 2,
  );

  return (
    <>
      <FramePhoto {...props} />
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
      <div
        data-frame="marco-sello"
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          left: Math.round((format.width - diameter) / 2),
          position: "absolute",
          top: groupTop,
          width: diameter,
          zIndex: 20,
        }}
      >
        <div
          data-panel=""
          style={{
            alignItems: "center",
            backgroundColor: plate.background,
            borderRadius: RADII.pill,
            boxShadow: `inset 0 0 0 14px ${plate.background}, inset 0 0 0 18px ${accent.background}, 0 20px 50px ${withAlpha(COLORS.graphiteDeep, 0.4)}`,
            color: plate.text,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            height: diameter,
            justifyContent: "center",
            paddingLeft: SEAL_PADDING,
            paddingRight: SEAL_PADDING,
            textAlign: "center",
            width: diameter,
          }}
        >
          <FrameTitle
            color={plate.text}
            size={frameTitleSize("marco-sello", content.title, format)}
            title={content.title}
          />
          <FramePrice
            color={plate.text}
            invitesWhenMissing
            mutedColor={plate.muted}
            price={content.price}
            size={112}
            validity={content.validity}
          />
          {content.disclaimer === undefined ? null : (
            <Disclaimer color={plate.muted}>{content.disclaimer}</Disclaimer>
          )}
        </div>
        <FrameCta
          colors={frameCtaColors(theme, plate.background)}
          panel
          style={{ boxShadow: liftShadow, marginTop: -SEAL_CTA_OVERLAP }}
        >
          {content.callToAction ?? defaultCallToAction}
        </FrameCta>
      </div>
    </>
  );
}

/**
 * Texto de los marcos de velo: etiqueta, titular, bajada y fila de compra.
 */
function VeilCopy({
  content,
  format,
  layout,
  theme,
}: {
  readonly content: DesignContent;
  readonly format: DesignFormat;
  readonly layout: "marco-velo-inferior" | "marco-velo-superior";
  readonly theme: Theme;
}): ReactElement {
  return (
    <>
      {content.badge === undefined ? null : (
        <FrameChip theme={theme}>{content.badge}</FrameChip>
      )}
      <FrameTitle
        color={veilText}
        size={frameTitleSize(layout, content.title, format)}
        title={content.title}
      />
      {content.subtitle === undefined ? null : (
        <FrameSubtitle color={veilMuted}>{content.subtitle}</FrameSubtitle>
      )}
      <FrameBuyRow spread={content.price !== undefined}>
        <FramePrice
          color={veilText}
          mutedColor={veilMuted}
          price={content.price}
          validity={content.validity}
        />
        <FrameCta colors={frameCtaColors(theme, COLORS.graphiteDeep)}>
          {content.callToAction ?? defaultCallToAction}
        </FrameCta>
      </FrameBuyRow>
      {content.disclaimer === undefined ? null : (
        <Disclaimer color={veilMuted}>{content.disclaimer}</Disclaimer>
      )}
    </>
  );
}

/**
 * Velo superior: el texto baja desde el cartel y la mitad inferior queda libre.
 *
 * Conviene cuando el producto está abajo. El velo mide lo que mide el texto más
 * el tramo en que se desvanece, así que un titular corto no oscurece de más.
 */
export function MarcoVeloSuperior(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;

  return (
    <>
      <FramePhoto {...props} />
      <div
        data-frame="marco-velo-superior"
        data-panel=""
        data-veil="top"
        style={{
          alignItems: "flex-start",
          background: veilBackground("top"),
          display: "flex",
          flexDirection: "column",
          gap: 18,
          left: 0,
          paddingBottom: VEIL_FADE,
          paddingLeft: safeArea.left,
          paddingRight: safeArea.right,
          paddingTop: safeArea.top + CARTEL_HEIGHT + CARTEL_GAP,
          position: "absolute",
          right: 0,
          textShadow: veilTextShadow,
          top: 0,
          zIndex: 10,
        }}
      >
        <VeilCopy
          content={content}
          format={format}
          layout="marco-velo-superior"
          theme={theme}
        />
      </div>
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
    </>
  );
}

/**
 * Velo inferior: el texto sube desde abajo y la mitad superior queda libre.
 *
 * Conviene cuando el producto está arriba o en el centro.
 */
export function MarcoVeloInferior(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;

  return (
    <>
      <FramePhoto {...props} />
      <div
        data-frame="marco-velo-inferior"
        data-panel=""
        data-veil="bottom"
        style={{
          alignItems: "flex-start",
          background: veilBackground("bottom"),
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          left: 0,
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.left,
          paddingRight: safeArea.right,
          paddingTop: VEIL_FADE,
          position: "absolute",
          right: 0,
          textShadow: veilTextShadow,
          zIndex: 10,
        }}
      >
        <VeilCopy
          content={content}
          format={format}
          layout="marco-velo-inferior"
          theme={theme}
        />
      </div>
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
    </>
  );
}

type ColumnSide = "derecha" | "izquierda";

/**
 * Columna maciza a un costado.
 *
 * Es de placa y no de velo: sobre una foto clara, un degradado lateral deja una
 * franja gris junto al texto que parece un error de render. La columna tiene un
 * borde nítido y el producto queda entero del otro lado.
 */
function MarcoColumna({
  props,
  side,
}: {
  readonly props: LayoutProps;
  readonly side: ColumnSide;
}): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;
  const plate = composedPanelColors(theme);
  const layout =
    side === "izquierda" ? "marco-columna-izquierda" : "marco-columna-derecha";
  const cta = frameCtaColors(theme, plate.background);

  return (
    <>
      <FramePhoto {...props} />
      <div
        data-frame={layout}
        data-panel=""
        style={{
          alignItems: "flex-start",
          backgroundColor: plate.background,
          bottom: 0,
          color: plate.text,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          justifyContent: "flex-end",
          ...(side === "izquierda" ? { left: 0 } : { right: 0 }),
          paddingBottom: safeArea.bottom,
          paddingLeft:
            side === "izquierda" ? safeArea.left : COLUMN_INNER_GUTTER,
          paddingRight:
            side === "izquierda" ? COLUMN_INNER_GUTTER : safeArea.right,
          paddingTop: safeArea.top + CARTEL_HEIGHT + CARTEL_GAP,
          position: "absolute",
          top: 0,
          width: COLUMN_WIDTH,
          zIndex: 10,
        }}
      >
        {content.badge === undefined ? null : (
          <FrameChip theme={theme}>{content.badge}</FrameChip>
        )}
        <FrameTitle
          color={plate.text}
          size={frameTitleSize(layout, content.title, format)}
          title={content.title}
        />
        {content.subtitle === undefined ? null : (
          <FrameSubtitle color={plate.muted}>{content.subtitle}</FrameSubtitle>
        )}
        <FramePrice
          color={plate.text}
          mutedColor={plate.muted}
          price={content.price}
          validity={content.validity}
        />
        <FrameCta colors={cta} style={{ alignSelf: "stretch", width: "auto" }}>
          {content.callToAction ?? defaultCallToAction}
        </FrameCta>
        {content.disclaimer === undefined ? null : (
          <Disclaimer color={plate.muted}>{content.disclaimer}</Disclaimer>
        )}
      </div>
      <Cartel
        context={context}
        style={
          side === "izquierda"
            ? { left: safeArea.left, top: safeArea.top }
            : { right: safeArea.right, top: safeArea.top }
        }
        theme={theme}
      />
    </>
  );
}

/** Columna a la izquierda: para cuando el producto quedó a la derecha. */
export function MarcoColumnaIzquierda(props: LayoutProps): ReactElement {
  return <MarcoColumna props={props} side="izquierda" />;
}

/** Columna a la derecha: para cuando el producto quedó a la izquierda. */
export function MarcoColumnaDerecha(props: LayoutProps): ReactElement {
  return <MarcoColumna props={props} side="derecha" />;
}

/**
 * Zócalo: la foto se apoya sobre una base maciza.
 *
 * La foto ocupa sólo el espacio que deja la base, así que nada de ella queda
 * tapado: el recorte cambia, pero el producto no tiene nada encima. Es el marco
 * que prioriza que precio y botón se lean sin esfuerzo.
 */
export function MarcoZocalo(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const { safeArea } = format;
  const plate = composedPanelColors(theme);

  return (
    <div
      data-frame="marco-zocalo"
      style={{
        display: "flex",
        flexDirection: "column",
        inset: 0,
        position: "absolute",
      }}
    >
      <div
        data-frame-stage=""
        style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}
      >
        <FramePhoto {...props} />
      </div>
      <div
        data-panel=""
        style={{
          alignItems: "flex-start",
          backgroundColor: plate.background,
          color: plate.text,
          display: "flex",
          flex: "none",
          flexDirection: "column",
          gap: 18,
          justifyContent: "flex-end",
          minHeight: Math.round(format.height * PLINTH_MINIMUM_SHARE),
          paddingBottom: safeArea.bottom,
          paddingLeft: safeArea.left,
          paddingRight: safeArea.right,
          paddingTop: PLINTH_PADDING_TOP,
        }}
      >
        {content.badge === undefined ? null : (
          <FrameChip theme={theme}>{content.badge}</FrameChip>
        )}
        <FrameTitle
          color={plate.text}
          size={frameTitleSize("marco-zocalo", content.title, format)}
          title={content.title}
        />
        {content.subtitle === undefined ? null : (
          <FrameSubtitle color={plate.muted}>{content.subtitle}</FrameSubtitle>
        )}
        <FrameBuyRow spread>
          <FramePrice
            color={plate.text}
            invitesWhenMissing
            mutedColor={plate.muted}
            price={content.price}
            size={124}
            validity={content.validity}
          />
          <FrameCta colors={frameCtaColors(theme, plate.background)}>
            {content.callToAction ?? defaultCallToAction}
          </FrameCta>
        </FrameBuyRow>
        {content.disclaimer === undefined ? null : (
          <Disclaimer color={plate.muted}>{content.disclaimer}</Disclaimer>
        )}
      </div>
      <Cartel context={context} style={cartelAt(format)} theme={theme} />
    </div>
  );
}

/**
 * Vitrina: la foto enmarcada, nunca tapada.
 *
 * La pieza entera es una placa y la foto se ve por una ventana, como la
 * vidriera del local. Es el marco para las bases que no admiten nada encima; a
 * cambio, la foto se ve más chica.
 */
export function MarcoVitrina(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const { safeArea } = format;
  const plate = composedPanelColors(theme);
  const asset = mediaAt(document, 0);

  return (
    <div
      data-frame="marco-vitrina"
      data-panel=""
      style={{
        backgroundColor: plate.background,
        color: plate.text,
        display: "flex",
        flexDirection: "column",
        gap: 28,
        inset: 0,
        paddingBottom: safeArea.bottom,
        paddingLeft: safeArea.left,
        paddingRight: safeArea.right,
        paddingTop: safeArea.top,
        position: "absolute",
      }}
    >
      <Cartel
        context={context}
        style={{ alignSelf: "flex-start", flex: "none", position: "relative" }}
        theme={theme}
      />
      <div
        data-frame-window=""
        style={{
          borderRadius: WINDOW_RADIUS,
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {asset === undefined ? null : (
          <ProductImage
            asset={asset}
            context={context}
            fallbackIcon={content.icon ?? "productos"}
            radius={WINDOW_RADIUS}
            style={{ height: "100%", width: "100%" }}
            theme={theme}
          />
        )}
        <div
          aria-hidden="true"
          style={{
            borderRadius: WINDOW_RADIUS,
            boxShadow: `inset 0 0 0 2px ${withAlpha(plate.text, 0.16)}`,
            inset: 0,
            pointerEvents: "none",
            position: "absolute",
          }}
        />
      </div>
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flex: "none",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {content.badge === undefined ? null : (
          <FrameChip theme={theme}>{content.badge}</FrameChip>
        )}
        <FrameTitle
          color={plate.text}
          size={frameTitleSize("marco-vitrina", content.title, format)}
          title={content.title}
        />
        <FrameBuyRow spread={content.price !== undefined}>
          <FramePrice
            color={plate.text}
            mutedColor={plate.muted}
            price={content.price}
            validity={content.validity}
          />
          <FrameCta colors={frameCtaColors(theme, plate.background)}>
            {content.callToAction ?? defaultCallToAction}
          </FrameCta>
        </FrameBuyRow>
        {content.disclaimer === undefined ? null : (
          <Disclaimer color={plate.muted}>{content.disclaimer}</Disclaimer>
        )}
      </div>
    </div>
  );
}
