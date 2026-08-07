import type { ReactElement } from "react";

import { Icon } from "../primitives/icon.tsx";
import { Photo } from "../primitives/photo.tsx";
import { Text } from "../primitives/text.tsx";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING, STROKES } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  Cta,
  Disclaimer,
  Eyebrow,
  Footer,
  Header,
  IconBadge,
  LocalHeader,
  PhotoScrim,
  PriceBlock,
  ProductImage,
} from "./kit.tsx";
import { footerBranch, mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Piezas del catálogo propio.
 *
 * No vienen del generador: nacen de un objetivo comercial declarado en
 * `docs/architecture/PIECE-CATALOG.md`. Cada una responde qué gana quien la ve
 * y qué acción habilita.
 *
 * El precio es opcional por decisión del negocio: la misma pieza funciona
 * mostrando el número o invitando a consultarlo, sin dejar un hueco.
 */

function safeAreaStyle(props: LayoutProps): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    paddingBottom: props.format.safeArea.bottom,
    paddingLeft: props.format.safeArea.left,
    paddingRight: props.format.safeArea.right,
    paddingTop: props.format.safeArea.top,
    position: "relative",
    zIndex: 10,
  };
}

/**
 * Producto con precio: responde "cuánto sale" antes de que haya que preguntar.
 */
export function ProductoPrecio(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <div style={safeAreaStyle(props)}>
      <LocalHeader context={context} theme={theme} />
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>
          {content.badge ?? content.category ?? "Producto y precio"}
        </Eyebrow>
      </div>
      <ProductImage
        asset={mediaAt(document, 0)}
        context={context}
        fallbackIcon="productos"
        style={{ height: 500, marginTop: SPACING.lg, width: "100%" }}
        theme={theme}
      />
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: SPACING.xl,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text as="h1" style={{ maxWidth: 640 }} token="h2">
            {content.title}
          </Text>
          {content.subtitle === undefined ? null : (
            <Text
              as="p"
              color={theme.colors.muted}
              style={{ marginTop: SPACING.sm, maxWidth: 620 }}
              token="body"
            >
              {content.subtitle}
            </Text>
          )}
        </div>
        <PriceBlock
          color={theme.colors.primary}
          mutedColor={theme.colors.muted}
          price={content.price}
          validity={content.validity}
        />
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: SPACING.xl,
        }}
      >
        <div>
          <Cta theme={theme}>
            {content.callToAction ??
              (content.price === undefined
                ? "Consultá precio por WhatsApp"
                : "Reservá por WhatsApp")}
          </Cta>
          {content.disclaimer === undefined ? null : (
            <div style={{ marginTop: SPACING.sm }}>
              <Disclaimer color={theme.colors.muted}>
                {content.disclaimer}
              </Disclaimer>
            </div>
          )}
        </div>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

/**
 * Combo o kit: vende el conjunto que se compra junto.
 */
export function ComboKit(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const parts = (content.items ?? []).slice(0, 3);
  const photos = document.media.slice(0, 3);

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Combo"} theme={theme} />
      <Text as="h1" style={{ marginTop: SPACING.xl, maxWidth: 900 }} token="h2">
        {content.title}
      </Text>
      {content.subtitle === undefined ? null : (
        <Text
          as="p"
          color={theme.colors.muted}
          style={{ marginTop: SPACING.sm, maxWidth: 860 }}
          token="body"
        >
          {content.subtitle}
        </Text>
      )}
      <div
        style={{
          display: "grid",
          gap: SPACING.sm,
          gridTemplateColumns: `repeat(${String(Math.max(parts.length, 1))}, 1fr)`,
          marginTop: SPACING.xl,
        }}
      >
        {parts.map((part, index) => {
          const asset = photos[index];

          return (
            <div
              key={part}
              style={{
                backgroundColor: withAlpha(COLORS.white, 0.08),
                border: `1px solid ${theme.colors.border}`,
                borderRadius: RADII.card,
                display: "flex",
                flexDirection: "column",
                gap: SPACING.sm,
                overflow: "hidden",
                padding: SPACING.sm,
              }}
            >
              {asset === undefined ? (
                <div
                  style={{
                    alignItems: "center",
                    backgroundColor: withAlpha(COLORS.white, 0.06),
                    borderRadius: RADII.icon,
                    color: theme.colors.primary,
                    display: "grid",
                    height: 300,
                    placeItems: "center",
                  }}
                >
                  <Icon
                    color={theme.colors.primary}
                    name="productos"
                    size={96}
                  />
                </div>
              ) : (
                <Photo
                  asset={asset}
                  assetBaseUrl={context.assetBaseUrl}
                  radius={RADII.icon}
                  style={{ height: 300, width: "100%" }}
                />
              )}
              <span
                style={{
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 30,
                  fontWeight: FONT_WEIGHTS.bold,
                  lineHeight: 1.1,
                }}
              >
                {part}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: SPACING.xl,
        }}
      >
        <div>
          <PriceBlock
            color={theme.colors.primary}
            mutedColor={theme.colors.muted}
            price={content.price}
            validity={content.validity}
          />
          <div style={{ marginTop: SPACING.sm }}>
            <Cta compact theme={theme}>
              {content.callToAction ?? "Consultá el combo"}
            </Cta>
          </div>
        </div>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

/**
 * Problema y solución: arranca por lo que le pasa al cliente, no por el
 * producto.
 */
export function ProblemaSolucion(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const steps = (content.items ?? []).slice(0, 3);

  return (
    <div style={safeAreaStyle(props)}>
      <LocalHeader context={context} theme={theme} />
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>
          {content.badge ?? content.category ?? "Problema y solución"}
        </Eyebrow>
      </div>
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>El problema</Eyebrow>
        <Text
          as="h1"
          style={{ marginTop: SPACING.sm, maxWidth: 900 }}
          token="h1"
        >
          {content.title}
        </Text>
      </div>
      <div
        style={{
          alignItems: "center",
          backgroundColor: withAlpha(COLORS.white, 0.08),
          border: `1px solid ${theme.colors.border}`,
          borderRadius: RADII.card,
          display: "flex",
          gap: SPACING.md,
          marginTop: SPACING.lg,
          padding: SPACING.lg,
        }}
      >
        <IconBadge icon={content.icon ?? "herramienta"} theme={theme} />
        <Text as="p" style={{ maxWidth: 720 }} token="sub">
          {content.subtitle}
        </Text>
      </div>
      <ProductImage
        asset={mediaAt(document, 0)}
        context={context}
        fallbackIcon={content.icon ?? "productos"}
        style={{
          flex: 1,
          marginTop: SPACING.lg,
          minHeight: 260,
          width: "100%",
        }}
        theme={theme}
      />
      {steps.length === 0 ? null : (
        <ul
          style={{
            display: "flex",
            gap: SPACING.sm,
            listStyle: "none",
            margin: `${String(SPACING.md)}px 0 0`,
            padding: 0,
          }}
        >
          {steps.map((step) => (
            <li
              key={step}
              style={{
                alignItems: "center",
                border: `1px solid ${theme.colors.border}`,
                borderRadius: RADII.pill,
                display: "flex",
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 26,
                fontWeight: FONT_WEIGHTS.semibold,
                gap: SPACING.xs,
                padding: `${String(SPACING.xs)}px ${String(SPACING.md)}px`,
              }}
            >
              <Icon
                color={theme.colors.primary}
                name="tag"
                size={20}
                strokeWidth={STROKES.emphasis}
              />
              {step}
            </li>
          ))}
        </ul>
      )}
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: SPACING.xl,
        }}
      >
        <div>
          <PriceBlock
            color={theme.colors.primary}
            compact
            mutedColor={theme.colors.muted}
            price={content.price}
            validity={content.validity}
          />
          {content.disclaimer === undefined ? null : (
            <div style={{ marginTop: SPACING.xs }}>
              <Disclaimer color={theme.colors.muted}>
                {content.disclaimer}
              </Disclaimer>
            </div>
          )}
        </div>
        <Cta compact theme={theme}>
          {content.callToAction ?? "Consultá cómo resolverlo"}
        </Cta>
      </div>
      <div style={{ marginTop: SPACING.md }}>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

/**
 * Precio del día: urgencia con vigencia real, a pantalla completa.
 */
export function HistoriaPrecioDia(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;

  return (
    <>
      <div style={{ inset: 0, position: "absolute" }}>
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon="promo"
          radius={0}
          style={{ height: "100%", width: "100%" }}
          theme={theme}
        />
        <PhotoScrim />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          paddingBottom: format.safeArea.bottom,
          paddingLeft: format.safeArea.left,
          paddingRight: format.safeArea.right,
          paddingTop: format.safeArea.top,
          position: "relative",
          zIndex: 10,
        }}
      >
        <Header eyebrow={content.badge ?? "Precio del día"} theme={theme} />
        <div>
          {content.category === undefined ? null : (
            <Text color={withAlpha(COLORS.paper, 0.82)} token="label">
              {content.category}
            </Text>
          )}
          <Text
            as="h1"
            color={COLORS.paper}
            style={{ marginTop: SPACING.sm, maxWidth: 860 }}
            token="h2"
          >
            {content.title}
          </Text>
          <div style={{ marginTop: SPACING.lg }}>
            <PriceBlock
              color={COLORS.paper}
              mutedColor={withAlpha(COLORS.paper, 0.76)}
              price={content.price}
              previousPrice={content.previousPrice}
              validity={content.validity}
            />
          </div>
          <div style={{ marginTop: SPACING.xl }}>
            <Cta theme={theme}>
              {content.callToAction ??
                (content.price === undefined
                  ? "Consultá precio por WhatsApp"
                  : "Reservalo hoy por WhatsApp")}
            </Cta>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Turno de lubricentro: convierte una historia en un turno concreto.
 */
export function HistoriaTurnoLubricentro(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const services = (content.items ?? []).slice(0, 4);

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Lubricentro"} theme={theme} />
      <div style={{ marginTop: SPACING.xl }}>
        <IconBadge
          icon={content.icon ?? "lubricentro"}
          iconSize={74}
          size={132}
          theme={theme}
        />
        <Text
          as="h1"
          style={{ marginTop: SPACING.xl, maxWidth: 900 }}
          token="h1"
        >
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Text
            as="p"
            color={theme.colors.muted}
            style={{ marginTop: SPACING.md, maxWidth: 860 }}
            token="sub"
          >
            {content.subtitle}
          </Text>
        )}
      </div>
      {services.length === 0 ? null : (
        <ul
          style={{
            display: "grid",
            gap: SPACING.sm,
            listStyle: "none",
            margin: `${String(SPACING.xl)}px 0 0`,
            padding: 0,
          }}
        >
          {services.map((service) => (
            <li
              key={service}
              style={{
                alignItems: "center",
                borderBottom: `1px solid ${theme.colors.border}`,
                display: "flex",
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 36,
                fontWeight: FONT_WEIGHTS.semibold,
                gap: SPACING.sm,
                paddingBottom: SPACING.sm,
              }}
            >
              <Icon
                color={theme.colors.primary}
                name="tag"
                size={26}
                strokeWidth={STROKES.emphasis}
              />
              {service}
            </li>
          ))}
        </ul>
      )}
      <ProductImage
        asset={mediaAt(document, 0)}
        context={context}
        fallbackIcon="lubricentro"
        style={{ flex: 1, marginTop: SPACING.xl, minHeight: 0, width: "100%" }}
        theme={theme}
      />
      <div style={{ marginTop: SPACING.xl }}>
        <Cta theme={theme}>
          {content.callToAction ?? "Pedí tu turno por WhatsApp"}
        </Cta>
        <div
          style={{
            color: theme.colors.muted,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 28,
            fontWeight: FONT_WEIGHTS.semibold,
            marginTop: SPACING.md,
          }}
        >
          O pasá por {content.branch ?? context.brand.central} ·{" "}
          {content.phone ?? context.brand.phone}
        </div>
      </div>
    </div>
  );
}

/**
 * Tip del oficio: contenido útil que gana guardados y compartidos.
 */
export function HistoriaTip(props: LayoutProps): ReactElement {
  const { content, context, theme } = props;
  const steps = (content.items ?? []).slice(0, 3);

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Tip"} theme={theme} />
      <div style={{ marginTop: "auto", paddingBottom: SPACING.xxl }}>
        <IconBadge
          icon={content.icon ?? "herramienta"}
          iconSize={80}
          size={148}
          theme={theme}
        />
        <Text
          as="h1"
          style={{ marginTop: SPACING.xl, maxWidth: 900 }}
          token="h1"
        >
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Text
            as="p"
            color={theme.colors.muted}
            style={{ marginTop: SPACING.md, maxWidth: 860 }}
            token="sub"
          >
            {content.subtitle}
          </Text>
        )}
        {steps.length === 0 ? null : (
          <ol
            style={{
              counterReset: "paso",
              display: "grid",
              gap: SPACING.md,
              listStyle: "none",
              margin: `${String(SPACING.xl)}px 0 0`,
              padding: 0,
            }}
          >
            {steps.map((step, index) => (
              <li
                key={step}
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 34,
                  fontWeight: FONT_WEIGHTS.semibold,
                  gap: SPACING.md,
                }}
              >
                <span
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: RADII.pill,
                    color: theme.colors.actionText,
                    display: "grid",
                    flexShrink: 0,
                    fontFamily: TYPOGRAPHY.display.cssStack,
                    fontSize: 32,
                    fontWeight: FONT_WEIGHTS.extrabold,
                    height: 56,
                    placeItems: "center",
                    width: 56,
                  }}
                >
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div style={{ marginTop: "auto" }}>
        <Cta theme={theme}>{content.callToAction ?? "Guardá el tip"}</Cta>
        <div style={{ marginTop: SPACING.md }}>
          <Footer
            branch={footerBranch(content, context, theme)}
            context={context}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Dónde estamos: las dos sucursales, con horario y forma de llegar.
 *
 * Es la pieza de confianza: quien la ve tiene que poder ubicar el local sin
 * salir de la historia.
 */
export function HistoriaLocales(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const places = [
    {
      address: context.brand.central,
      asset: mediaAt(document, 0),
      detail: "Ferretería completa + Lubricentro",
      icon: "lubricentro" as const,
      label: "Casa Central",
    },
    {
      address: content.branch ?? context.brand.branch,
      asset: mediaAt(document, 1),
      detail: "Ferretería completa",
      icon: "tienda" as const,
      label: "Sucursal",
    },
  ];

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Dónde estamos"} theme={theme} />
      <Text as="h1" style={{ marginTop: SPACING.xl, maxWidth: 900 }} token="h1">
        {content.title}
      </Text>
      {content.subtitle === undefined ? null : (
        <Text
          as="p"
          color={theme.colors.muted}
          style={{ marginTop: SPACING.md, maxWidth: 860 }}
          token="sub"
        >
          {content.subtitle}
        </Text>
      )}
      <div
        style={{
          display: "grid",
          flex: 1,
          gap: SPACING.md,
          marginTop: SPACING.xl,
          minHeight: 0,
        }}
      >
        {places.map((place) => (
          <div
            key={place.label}
            style={{
              alignItems: "center",
              backgroundColor: withAlpha(COLORS.white, 0.08),
              border: `1px solid ${theme.colors.border}`,
              borderRadius: RADII.card,
              display: "flex",
              gap: SPACING.md,
              minHeight: 0,
              overflow: "hidden",
              padding: SPACING.sm,
            }}
          >
            <ProductImage
              asset={place.asset}
              context={context}
              fallbackIcon={place.icon}
              radius={RADII.icon}
              style={{ flexShrink: 0, height: 260, width: 320 }}
              theme={theme}
            />
            <div style={{ minWidth: 0 }}>
              <Text color={theme.colors.primary} token="label">
                {place.label}
              </Text>
              <Text as="div" style={{ marginTop: SPACING.xs }} token="h2">
                {place.address}
              </Text>
              <div
                style={{
                  color: theme.colors.muted,
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 28,
                  fontWeight: FONT_WEIGHTS.semibold,
                  lineHeight: 1.1,
                  marginTop: SPACING.xs,
                }}
              >
                {place.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: SPACING.xl }}>
        <Cta theme={theme}>{content.callToAction ?? "Cómo llegar"}</Cta>
        <div
          style={{
            color: theme.colors.muted,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 28,
            fontWeight: FONT_WEIGHTS.semibold,
            marginTop: SPACING.md,
          }}
        >
          Lun a sáb · 08:30 a 13:00 · 16:30 a 20:30 ·{" "}
          {content.phone ?? context.brand.phone}
        </div>
      </div>
    </div>
  );
}
