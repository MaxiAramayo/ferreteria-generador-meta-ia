import type { ReactElement } from "react";

import { COLORS, withAlpha } from "../tokens/colors.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { mediaAt, type LayoutProps } from "./layout-context.ts";
import {
  Bandera,
  Chapa,
  ContactButton,
  Letrero,
  Medidas,
  ProductDescription,
  ProductName,
  ProductPrice,
  productFrameMetrics,
  productPalette,
  showsPrice,
  showsTitle,
  TramaHexagonal,
  Vigencia,
  type ButtonColors,
} from "./product-photo-kit.tsx";
import { OpeningPhoto } from "./story-frame-kit.tsx";

/**
 * Piezas de producto con foto propia (`ADR-033`).
 *
 * Quien publica sube la foto, elige el marco según dónde quedó el producto y
 * decide qué se ve: nombre, descripción, precio —importe, invitación a
 * consultarlo o nada—, etiqueta, medidas, vigencia y botón. Lo que no se pide
 * no deja hueco: el resto del marco se acomoda.
 *
 * Todos llevan el mismo cartel del frente y se componen igual en post (4:5) e
 * historia (9:16). En la historia, lo que se lee queda dentro de la zona
 * segura; la foto y la chapa pueden llegar al borde.
 */

const onGraphite = (props: LayoutProps): ButtonColors => {
  const palette = productPalette(props.theme.brand);
  return {
    background: palette.surface,
    muted: palette.surfaceMuted,
    text: palette.surfaceText,
  };
};

const graphiteButton: ButtonColors = {
  background: COLORS.graphite,
  muted: COLORS.cream,
  text: COLORS.white,
};

function FullPhoto({ context, document, theme }: LayoutProps): ReactElement {
  return (
    <OpeningPhoto
      context={context}
      photo={mediaAt(document, 0)}
      radius={0}
      style={{ inset: 0, position: "absolute" }}
      theme={theme}
    />
  );
}

/**
 * Cartel: el letrero del frente cruza arriba y una placa grafito abajo lleva el
 * nombre, el precio y el botón. Conviene con el producto al medio.
 */
export function FotoProductoCartel(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const metrics = productFrameMetrics(format);
  const inner =
    metrics.width - 2 * (metrics.side - 16) - (metrics.story ? 96 : 80);
  const button = onGraphite(props);
  const hasPlate =
    showsTitle(content) ||
    showsPrice(content) ||
    content.callToAction !== undefined ||
    content.subtitle !== undefined ||
    content.items !== undefined ||
    content.badge !== undefined ||
    content.validity !== undefined;

  return (
    <>
      <FullPhoto {...props} />
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="full"
        style={{ top: metrics.story ? metrics.top : 56 }}
      />
      {hasPlate ? (
        <div
          data-product-plate=""
          style={{
            backgroundColor: withAlpha(COLORS.graphite, 0.97),
            borderTop: `10px solid ${productPalette(theme.brand).accent}`,
            bottom: metrics.story ? metrics.bottom - 44 : 48,
            display: "flex",
            flexDirection: "column",
            gap: metrics.story ? 18 : 14,
            left: metrics.side - 16,
            padding: metrics.story ? "40px 48px 44px" : "30px 40px 36px",
            position: "absolute",
            right: metrics.side - 16,
          }}
        >
          {content.badge === undefined ? null : (
            <Bandera
              background={button.background}
              label={content.badge}
              text={button.text}
            />
          )}
          {showsTitle(content) ? (
            <ProductName
              color={COLORS.white}
              maximum={metrics.story ? 112 : 84}
              title={content.title}
              width={inner}
            />
          ) : null}
          {content.subtitle === undefined ? null : (
            <ProductDescription
              color={COLORS.cream}
              size={metrics.story ? 36 : 32}
            >
              {content.subtitle}
            </ProductDescription>
          )}
          <Medidas
            border={COLORS.cream}
            color={COLORS.white}
            items={content.items}
          />
          {metrics.story ? (
            <>
              <div
                style={{
                  alignItems: "flex-end",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 24,
                  justifyContent: "space-between",
                }}
              >
                <ProductPrice
                  color={COLORS.white}
                  content={content}
                  maximum={150}
                  muted={COLORS.cream}
                  width={inner}
                />
                <Vigencia color={COLORS.cream} validity={content.validity} />
              </div>
              <ContactButton
                colors={button}
                content={content}
                context={context}
                width="100%"
              />
            </>
          ) : (
            <>
              <Vigencia color={COLORS.cream} validity={content.validity} />
              <div
                style={{
                  alignItems: "flex-end",
                  display: "flex",
                  gap: 24,
                  justifyContent: "space-between",
                }}
              >
                <ProductPrice
                  color={COLORS.white}
                  content={content}
                  maximum={120}
                  muted={COLORS.cream}
                  width={
                    content.callToAction === undefined ? inner : inner - 420
                  }
                />
                <ContactButton
                  colors={button}
                  content={content}
                  context={context}
                  scale={0.78}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

/**
 * Vidriera: la fachada del local. La chapa y el cartel arriba, la foto como el
 * vidrio entre las columnas y el zócalo abajo con los datos. No tapa nada de la
 * foto.
 */
export function FotoProductoVidriera(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const metrics = productFrameMetrics(format);
  const palette = productPalette(theme.brand);
  const roof = metrics.story ? metrics.top : 56;
  const inner = metrics.width - 2 * metrics.side;

  // Columna: la vidriera se queda con el alto que dejan los datos, así un
  // nombre largo achica la foto en vez de empujar el botón fuera de la pieza.
  return (
    <div
      style={{
        backgroundColor: palette.surface,
        display: "flex",
        flexDirection: "column",
        inset: 0,
        position: "absolute",
      }}
    >
      <div style={{ flexShrink: 0, height: roof, position: "relative" }}>
        <Chapa height={roof} />
      </div>
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="full"
        style={{ flexShrink: 0, position: "relative" }}
      />
      <div
        data-frame-window=""
        style={{
          border: `10px solid ${COLORS.graphite}`,
          boxShadow: `inset 0 0 0 3px ${COLORS.humo}`,
          flex: "1 1 auto",
          margin: "26px 44px 0",
          minHeight: metrics.story ? 560 : 360,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <FullPhoto {...props} />
      </div>
      <div
        data-product-plate=""
        style={{
          color: palette.surfaceText,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          gap: metrics.story ? 18 : 12,
          padding: `${String(metrics.story ? 34 : 24)}px ${String(metrics.side)}px ${String(metrics.bottom)}px`,
        }}
      >
        {content.badge === undefined ? null : (
          <Bandera
            background={COLORS.graphite}
            label={content.badge}
            text={theme.brand === "lubricentro" ? COLORS.safety : COLORS.white}
          />
        )}
        {showsTitle(content) ? (
          <ProductName
            color={palette.surfaceText}
            maximum={metrics.story ? 108 : 80}
            title={content.title}
            width={inner}
          />
        ) : null}
        {content.subtitle === undefined ? null : (
          <ProductDescription
            color={palette.surfaceMuted}
            size={metrics.story ? 36 : 32}
          >
            {content.subtitle}
          </ProductDescription>
        )}
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            gap: 24,
            justifyContent: "space-between",
          }}
        >
          <ProductPrice
            color={palette.surfaceText}
            content={content}
            maximum={metrics.story ? 150 : 112}
            muted={palette.surfaceMuted}
            width={content.callToAction === undefined ? inner : inner - 440}
          />
          <ContactButton
            colors={graphiteButton}
            content={content}
            context={context}
            scale={metrics.story ? 0.86 : 0.76}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Etiqueta de góndola: el precio en la etiqueta blanca del estante, apoyada en
 * el riel, del lado que deje libre el producto.
 */
function FotoProductoGondola(
  props: LayoutProps & { readonly side: "derecha" | "izquierda" },
): ReactElement {
  const { content, context, format, side, theme } = props;
  const metrics = productFrameMetrics(format);
  const palette = productPalette(theme.brand);
  const rail = metrics.story ? 1420 : 1100;
  const labelWidth = metrics.story ? 600 : 520;
  const inner = labelWidth - 56;
  const anchor =
    side === "derecha" ? { right: metrics.side } : { left: metrics.side };
  const hasLabel =
    showsTitle(content) ||
    showsPrice(content) ||
    content.items !== undefined ||
    content.validity !== undefined;

  return (
    <>
      <FullPhoto {...props} />
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="compact"
        style={{ left: metrics.side, top: metrics.top }}
      />
      {hasLabel ? (
        <>
          <div
            aria-hidden="true"
            data-gondola-rail=""
            style={{
              background: `linear-gradient(${palette.accent}, ${palette.surface})`,
              boxShadow: `0 8px 22px ${withAlpha(COLORS.graphiteDeep, 0.4)}`,
              height: 26,
              left: 0,
              position: "absolute",
              right: 0,
              top: rail,
            }}
          />
          <div
            data-product-plate=""
            style={{
              backgroundColor: COLORS.white,
              borderBottom: `6px solid ${COLORS.graphite}`,
              bottom: metrics.height - rail - 20,
              boxShadow: `0 18px 40px ${withAlpha(COLORS.graphiteDeep, 0.4)}`,
              position: "absolute",
              width: labelWidth,
              ...anchor,
            }}
          >
            <div
              data-role="etiqueta"
              style={{
                backgroundColor: palette.surface,
                color: palette.surfaceText,
                fontFamily: TYPOGRAPHY.display.cssStack,
                fontSize: 34,
                fontWeight: FONT_WEIGHTS.extrabold,
                letterSpacing: 3,
                lineHeight: 1,
                padding: "14px 28px",
                textTransform: "uppercase",
              }}
            >
              {content.badge ?? "Precio"}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                padding: "24px 28px 28px",
              }}
            >
              <ProductPrice
                color={COLORS.graphite}
                content={content}
                maximum={metrics.story ? 150 : 128}
                muted={COLORS.steel}
                width={inner}
              />
              {showsTitle(content) ? (
                <ProductName
                  color={COLORS.graphite}
                  lines={2}
                  maximum={metrics.story ? 64 : 56}
                  minimum={40}
                  title={content.title}
                  width={inner}
                />
              ) : null}
              <Medidas
                border={COLORS.graphite}
                color={COLORS.graphite}
                items={content.items}
                size={30}
              />
              <Vigencia
                color={COLORS.steel}
                size={28}
                validity={content.validity}
              />
            </div>
          </div>
        </>
      ) : null}
      <div
        style={{
          position: "absolute",
          top: hasLabel ? rail + 56 : undefined,
          ...(hasLabel ? {} : { bottom: metrics.bottom }),
          ...anchor,
        }}
      >
        <ContactButton
          colors={graphiteButton}
          content={content}
          context={context}
          scale={metrics.story ? 0.9 : 0.8}
        />
      </div>
    </>
  );
}

export function FotoProductoGondolaIzquierda(props: LayoutProps): ReactElement {
  return <FotoProductoGondola {...props} side="izquierda" />;
}

export function FotoProductoGondolaDerecha(props: LayoutProps): ReactElement {
  return <FotoProductoGondola {...props} side="derecha" />;
}

/**
 * Solo la foto: el cartel chico y, si se pide, el nombre, el precio y el botón
 * apilados como rótulos en la esquina de abajo.
 */
export function FotoProductoLibre(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const metrics = productFrameMetrics(format);
  const palette = productPalette(theme.brand);
  const inner = metrics.width - 2 * metrics.side - 52;

  return (
    <>
      <FullPhoto {...props} />
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="compact"
        style={{ left: metrics.side, top: metrics.top }}
      />
      <div
        data-product-plate=""
        style={{
          alignItems: "flex-start",
          bottom: metrics.bottom,
          display: "flex",
          flexDirection: "column",
          left: metrics.side,
          position: "absolute",
          right: metrics.side,
        }}
      >
        {showsTitle(content) ? (
          <div
            style={{
              backgroundColor: COLORS.graphite,
              boxShadow: `0 12px 30px ${withAlpha(COLORS.graphiteDeep, 0.35)}`,
              maxWidth: "100%",
              padding: "18px 26px 14px",
            }}
          >
            <ProductName
              color={COLORS.white}
              maximum={metrics.story ? 72 : 64}
              minimum={44}
              title={content.title}
              width={inner}
            />
          </div>
        ) : null}
        {showsPrice(content) ? (
          <div
            style={{
              backgroundColor: palette.surface,
              padding: "18px 26px 16px",
            }}
          >
            <ProductPrice
              color={palette.surfaceText}
              content={content}
              maximum={metrics.story ? 104 : 92}
              muted={palette.surfaceMuted}
              width={inner}
            />
          </div>
        ) : null}
        <ContactButton
          colors={{
            background: COLORS.paper,
            muted: COLORS.inkSoft,
            text: COLORS.graphite,
          }}
          content={content}
          context={context}
          scale={metrics.story ? 0.84 : 0.76}
        />
      </div>
    </>
  );
}

/**
 * Ficha: el papel de marca con la trama del isotipo, la foto recuadrada y los
 * datos ordenados debajo. Para fotos de catálogo y productos que se explican.
 */
export function FotoProductoFicha(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const metrics = productFrameMetrics(format);
  const palette = productPalette(theme.brand);
  const signTop = metrics.story ? metrics.top : 56;
  const inner = metrics.width - 2 * metrics.side;

  // Columna, como la vidriera: la foto recuadrada cede alto a los datos.
  return (
    <div
      style={{
        backgroundColor: COLORS.paper,
        display: "flex",
        flexDirection: "column",
        inset: 0,
        position: "absolute",
      }}
    >
      <TramaHexagonal />
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="full"
        style={{ flexShrink: 0, marginTop: signTop, position: "relative" }}
      />
      <div
        data-frame-window=""
        style={{
          backgroundColor: COLORS.white,
          border: `6px solid ${COLORS.graphite}`,
          boxShadow: `12px 12px 0 ${palette.accent}`,
          flex: "1 1 auto",
          margin: `36px ${String(metrics.side)}px 0`,
          minHeight: metrics.story ? 520 : 400,
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
        data-product-plate=""
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          gap: metrics.story ? 20 : 12,
          padding: `${String(metrics.story ? 44 : 34)}px ${String(metrics.side)}px ${String(metrics.bottom)}px`,
          position: "relative",
        }}
      >
        {content.badge === undefined ? null : (
          <Bandera
            background={palette.surface}
            label={content.badge}
            scale={metrics.story ? 1 : 0.9}
            text={palette.surfaceText}
          />
        )}
        {showsTitle(content) ? (
          <ProductName
            color={COLORS.graphite}
            maximum={metrics.story ? 100 : 76}
            title={content.title}
            width={inner}
          />
        ) : null}
        {content.subtitle === undefined ? null : (
          <ProductDescription
            color={COLORS.inkSoft}
            size={metrics.story ? 36 : 32}
          >
            {content.subtitle}
          </ProductDescription>
        )}
        <Medidas
          border={palette.accent}
          color={COLORS.graphite}
          items={content.items}
          size={metrics.story ? 32 : 30}
        />
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            justifyContent: "space-between",
          }}
        >
          <ProductPrice
            color={
              theme.brand === "lubricentro" ? COLORS.graphite : COLORS.rustDeep
            }
            content={content}
            maximum={metrics.story ? 140 : 104}
            muted={COLORS.steel}
            width={
              metrics.story || content.callToAction === undefined
                ? inner
                : inner - 420
            }
          />
          {metrics.story ? (
            <Vigencia color={COLORS.steel} validity={content.validity} />
          ) : (
            <ContactButton
              colors={graphiteButton}
              content={content}
              context={context}
              scale={0.76}
            />
          )}
        </div>
        {metrics.story ? (
          <ContactButton
            colors={graphiteButton}
            content={content}
            context={context}
            scale={0.92}
            width="100%"
          />
        ) : (
          <Vigencia
            color={COLORS.steel}
            size={28}
            validity={content.validity}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Precio grande: la foto arriba y, sobre el color del cartel con su filete, el
 * importe como protagonista. Para ofertas. Si se calla el precio, el nombre
 * pasa a mandar.
 */
export function FotoProductoPrecioGrande(props: LayoutProps): ReactElement {
  const { content, context, format, theme } = props;
  const metrics = productFrameMetrics(format);
  const palette = productPalette(theme.brand);
  const inner = metrics.width - 2 * metrics.side;
  // Sin importe, el nombre pasa a mandar: la invitación a consultar no es
  // una cifra que pueda sostener sola la pieza.
  const priceLeads = content.price !== undefined;

  // Columna: la foto se queda con lo que deja el bloque de precio.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        inset: 0,
        position: "absolute",
      }}
    >
      <div
        style={{
          flex: "1 1 auto",
          minHeight: metrics.story ? 700 : 480,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <FullPhoto {...props} />
      </div>
      <Letrero
        brand={theme.brand}
        context={context}
        metrics={metrics}
        size="compact"
        style={{ left: metrics.side, top: metrics.top }}
      />
      <div
        data-product-plate=""
        style={{
          backgroundColor: palette.surface,
          color: palette.surfaceText,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          gap: metrics.story ? 18 : 14,
          padding: `${String(metrics.story ? 48 : 38)}px ${String(metrics.side)}px ${String(metrics.bottom)}px`,
          position: "relative",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            border: `4px solid ${palette.rule}`,
            borderRadius: 2,
            inset: 18,
            pointerEvents: "none",
            position: "absolute",
          }}
        />
        {content.badge === undefined &&
        content.validity === undefined ? null : (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 20,
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            {content.badge === undefined ? (
              <span />
            ) : (
              <Bandera
                background={COLORS.graphite}
                label={content.badge}
                text={
                  theme.brand === "lubricentro" ? COLORS.safety : COLORS.white
                }
              />
            )}
            <Vigencia
              color={palette.surfaceText}
              size={metrics.story ? 32 : 28}
              validity={content.validity}
            />
          </div>
        )}
        <ProductPrice
          color={palette.surfaceText}
          content={content}
          maximum={metrics.story ? 250 : 190}
          muted={palette.surfaceMuted}
          width={inner}
        />
        {showsTitle(content) ? (
          <ProductName
            color={palette.surfaceText}
            maximum={
              priceLeads ? (metrics.story ? 88 : 72) : metrics.story ? 130 : 104
            }
            title={content.title}
            width={inner}
          />
        ) : null}
        <Medidas
          border={palette.surfaceText}
          color={palette.surfaceText}
          items={content.items}
        />
        <ContactButton
          colors={graphiteButton}
          content={content}
          context={context}
          scale={metrics.story ? 0.9 : 0.76}
          width="100%"
        />
      </div>
    </div>
  );
}
