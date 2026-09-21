import type { ReactElement } from "react";

import { SafeArea } from "../primitives/canvas.tsx";
import type { Theme } from "../themes/theme-colors.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { consultPriceLabel } from "./kit.tsx";
import {
  mediaAt,
  type LayoutContext,
  type LayoutProps,
} from "./layout-context.ts";
import {
  BottomCard,
  contentWidth,
  CornerCard,
  FrameBorder,
  Headline,
  InlineContact,
  OpeningHeader,
  openingAccentColors,
  openingPalette,
  OpeningPhoto,
  OpeningTexture,
  PracticalInfo,
  Subline,
  TopVeil,
  Watermark,
  type AccentColors,
  type FrameBlockProps,
  type OpeningPalette,
} from "./story-frame-kit.tsx";

/**
 * Historias de producto con foto propia (`ADR-031`).
 *
 * El producto manda: su foto ocupa el lienzo y los datos se apoyan en una
 * tarjeta que no la tapa. Son los mismos marcos que usan las historias
 * recurrentes —tarjeta abajo, tarjeta a la derecha, foto enmarcada— con el
 * contenido de una pieza de producto: nombre, precio, medidas y contacto.
 *
 * El precio lo escribe quien publica y se dibuja en la pieza; sin precio, la
 * historia invita a consultarlo en lugar de callarse el tema. El caption no
 * repite el importe: un precio en el texto exige evidencia vigente y este
 * camino no la tiene.
 */

/** Etiqueta corta sobre la foto: «Oferta», «Recién llegado». */
function ProductBadge({
  accent,
  label,
}: {
  readonly accent: AccentColors;
  readonly label: string;
}): ReactElement {
  return (
    <span
      data-badge=""
      data-role="etiqueta"
      style={{
        alignSelf: "flex-start",
        backgroundColor: accent.pillBackground,
        borderRadius: 12,
        color: accent.pillText,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 26,
        fontWeight: FONT_WEIGHTS.extrabold,
        letterSpacing: 1.6,
        lineHeight: 1,
        padding: "14px 22px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

/**
 * Importe del producto.
 *
 * Sin importe no queda un hueco: la pieza invita a consultarlo, que es la
 * decisión registrada en `PIECE-CATALOG.md`. El precio anterior sólo aparece
 * junto a uno nuevo, tachado, para que la comparación sea la que se ve.
 */
function ProductPrice({
  palette,
  previousPrice,
  price,
  size = 92,
}: {
  readonly palette: OpeningPalette;
  readonly previousPrice: string | undefined;
  readonly price: string | undefined;
  readonly size?: number | undefined;
}): ReactElement {
  if (price === undefined) {
    return (
      <span
        data-price=""
        data-role="precio"
        style={{
          color: palette.plateText,
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: Math.round(size * 0.42),
          fontWeight: FONT_WEIGHTS.bold,
          lineHeight: 1.1,
        }}
      >
        {consultPriceLabel}
      </span>
    );
  }

  return (
    <span
      data-price=""
      data-role="precio"
      style={{
        alignItems: "baseline",
        color: palette.plateText,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <span
        style={{
          fontFamily: TYPOGRAPHY.display.cssStack,
          fontSize: size,
          fontWeight: FONT_WEIGHTS.black,
          lineHeight: 0.88,
          whiteSpace: "nowrap",
        }}
      >
        {price}
      </span>
      {previousPrice === undefined ? null : (
        <span
          data-previous-price=""
          style={{
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: Math.round(size * 0.36),
            fontWeight: FONT_WEIGHTS.semibold,
            lineHeight: 1,
            opacity: 0.82,
            textDecoration: "line-through",
            whiteSpace: "nowrap",
          }}
        >
          {previousPrice}
        </span>
      )}
    </span>
  );
}

/** Medidas, colores o presentaciones, y hasta cuándo vale el precio. */
function ProductDetails({
  compact = false,
  items,
  palette,
  validity,
}: {
  readonly compact?: boolean | undefined;
  readonly items: readonly string[];
  readonly palette: OpeningPalette;
  readonly validity: string | undefined;
}): ReactElement {
  return (
    <PracticalInfo
      compact={compact}
      // Medidas y presentaciones no son direcciones: llevan etiqueta.
      icon="tag"
      items={items}
      palette={palette}
      validity={validity}
    />
  );
}

/** Marca, etiqueta, nombre del producto y su línea chica. */
function ProductHeader({
  content,
  context,
  format,
  palette,
  theme,
}: FrameBlockProps & {
  readonly context: LayoutContext;
  readonly format: LayoutProps["format"];
  readonly theme: Theme;
}): ReactElement {
  const accent = openingAccentColors(theme, content.accent);

  return (
    <>
      <OpeningHeader
        context={context}
        greeting={content.category ?? "Ferretería y lubricentro"}
        palette={palette}
      />
      {content.badge === undefined ? null : (
        <div style={{ display: "flex", marginTop: 20 }}>
          <ProductBadge accent={accent} label={content.badge} />
        </div>
      )}
      <div style={{ marginTop: content.badge === undefined ? 16 : 14 }}>
        <Headline
          color={palette.title}
          lines={2}
          maximum={128}
          title={content.title}
          width={contentWidth(format)}
        />
      </div>
      {content.subtitle === undefined ? null : (
        <Subline color={palette.text} style={{ marginTop: 16 }}>
          {content.subtitle}
        </Subline>
      )}
    </>
  );
}

/**
 * Marco «precio abajo»: la foto del producto a sangre y, en una tarjeta al pie,
 * el importe con sus medidas y el contacto.
 */
export function HistoriaProductoPrecioAbajo(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);

  return (
    <>
      <OpeningPhoto
        context={context}
        photo={mediaAt(document, 0)}
        radius={0}
        style={{ inset: 0, position: "absolute" }}
        theme={theme}
      />
      <TopVeil palette={palette} theme={theme} />
      <FrameBorder palette={palette} />
      <SafeArea format={format}>
        <ProductHeader
          content={content}
          context={context}
          format={format}
          palette={palette}
          theme={theme}
        />
        <BottomCard palette={palette} theme={theme}>
          <ProductPrice
            palette={palette}
            previousPrice={content.previousPrice}
            price={content.price}
          />
          <ProductDetails
            compact
            items={content.items ?? []}
            palette={palette}
            validity={content.validity}
          />
          <InlineContact
            accent={accent}
            callToAction={content.callToAction}
            phone={content.phone ?? context.brand.phone}
          />
        </BottomCard>
      </SafeArea>
    </>
  );
}

/**
 * Marco «etiqueta»: el importe como la etiqueta colgada de la góndola, sobre la
 * foto, y al pie sólo el nombre y el contacto.
 */
export function HistoriaProductoEtiqueta(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);

  return (
    <>
      <OpeningPhoto
        context={context}
        photo={mediaAt(document, 0)}
        radius={0}
        style={{ inset: 0, position: "absolute" }}
        theme={theme}
      />
      <TopVeil palette={palette} theme={theme} />
      <FrameBorder palette={palette} />
      <SafeArea format={format}>
        <ProductHeader
          content={content}
          context={context}
          format={format}
          palette={palette}
          theme={theme}
        />
        <aside
          data-frame-card="etiqueta"
          data-panel=""
          style={{
            alignSelf: "flex-end",
            backgroundColor: accent.ctaBackground,
            borderRadius: 22,
            color: accent.ctaText,
            display: "grid",
            gap: 10,
            justifyItems: "end",
            marginTop: 40,
            padding: "22px 26px 24px",
            textAlign: "right",
            // La etiqueta cuelga de la esquina: la foto sigue libre debajo.
            transform: "rotate(-2deg)",
          }}
        >
          <ProductPrice
            palette={{ ...palette, plateText: accent.ctaText }}
            previousPrice={content.previousPrice}
            price={content.price}
            size={104}
          />
          {content.validity === undefined ? null : (
            <span
              style={{
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 24,
                fontWeight: FONT_WEIGHTS.semibold,
                lineHeight: 1.1,
              }}
            >
              {content.validity}
            </span>
          )}
        </aside>
        <BottomCard palette={palette} theme={theme}>
          {/* La vigencia ya cuelga de la etiqueta: repetirla sería ruido. */}
          <ProductDetails
            compact
            items={content.items ?? []}
            palette={palette}
            validity={undefined}
          />
          <InlineContact
            accent={accent}
            callToAction={content.callToAction}
            phone={content.phone ?? context.brand.phone}
          />
        </BottomCard>
      </SafeArea>
    </>
  );
}

/**
 * Marco «tarjeta a la derecha»: los datos en una columna angosta y el producto
 * libre a la izquierda y abajo.
 */
export function HistoriaProductoTarjeta(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);

  return (
    <>
      <OpeningPhoto
        context={context}
        photo={mediaAt(document, 0)}
        radius={0}
        style={{ inset: 0, position: "absolute" }}
        theme={theme}
      />
      <TopVeil palette={palette} theme={theme} />
      <FrameBorder palette={palette} />
      <SafeArea format={format}>
        <ProductHeader
          content={content}
          context={context}
          format={format}
          palette={palette}
          theme={theme}
        />
        <CornerCard
          accent={accent}
          content={content}
          context={context}
          palette={palette}
          theme={theme}
        >
          <ProductPrice
            palette={palette}
            previousPrice={content.previousPrice}
            price={content.price}
            size={62}
          />
          <ProductDetails
            items={content.items ?? []}
            palette={palette}
            validity={content.validity}
          />
        </CornerCard>
      </SafeArea>
    </>
  );
}

/**
 * Marco «foto enmarcada»: el producto dentro de un recuadro sobre el fondo de
 * marca, con el precio y los datos abajo. Nada se apoya sobre la foto.
 */
export function HistoriaProductoVentana(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);

  return (
    <>
      <OpeningTexture palette={palette} />
      <Watermark
        color={palette.watermark}
        style={{ bottom: -250, right: -150 }}
      />
      <SafeArea format={format}>
        <ProductHeader
          content={content}
          context={context}
          format={format}
          palette={palette}
          theme={theme}
        />
        <div
          data-frame-window=""
          style={{
            border: `8px solid ${palette.frame}`,
            borderRadius: 30,
            flex: "1 1 auto",
            marginTop: 26,
            minHeight: 300,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <OpeningPhoto
            context={context}
            photo={mediaAt(document, 0)}
            radius={0}
            style={{ inset: 0, position: "absolute" }}
            theme={theme}
          />
        </div>
        <div
          data-opening-plate=""
          style={{ display: "grid", gap: 14, marginTop: 24 }}
        >
          <ProductPrice
            palette={palette}
            previousPrice={content.previousPrice}
            price={content.price}
          />
          <ProductDetails
            items={content.items ?? []}
            palette={palette}
            validity={content.validity}
          />
          <InlineContact
            accent={accent}
            callToAction={content.callToAction}
            phone={content.phone ?? context.brand.phone}
          />
        </div>
      </SafeArea>
    </>
  );
}
