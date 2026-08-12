import type { ReactElement } from "react";

import { describeReference } from "../assets/asset-resolver.ts";
import { Icon } from "../primitives/icon.tsx";
import { Photo } from "../primitives/photo.tsx";
import { Text } from "../primitives/text.tsx";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING, STROKES } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  BulletList,
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
  Subtitle,
  Title,
} from "./kit.tsx";
import { footerBranch, mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Layouts de publicación: feed, cuadrado y banner.
 *
 * Reproducen la composición del generador congelado usando tokens, formatos y
 * primitivas. Ninguno lee archivos ni resuelve rutas: las fotos llegan como
 * activos ya validados y el pie usa el perfil comercial recibido.
 */

const columnGap = 48;

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

export function ProductoDestacado(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <div style={safeAreaStyle(props)}>
      <Header
        eyebrow={content.badge ?? content.category ?? "Producto"}
        theme={theme}
      />
      <div
        style={{
          display: "grid",
          flex: 1,
          gap: columnGap,
          gridTemplateRows: "620px 1fr",
          marginTop: columnGap,
          minHeight: 0,
        }}
      >
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon={content.icon ?? "productos"}
          style={{ height: "100%", width: "100%" }}
          theme={theme}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <Title maxWidth={900}>{content.title}</Title>
            {content.subtitle === undefined ? null : (
              <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
            )}
          </div>
          <div
            style={{
              alignItems: "flex-end",
              display: "flex",
              gap: SPACING.xl,
              justifyContent: "space-between",
            }}
          >
            <Cta theme={theme}>
              {content.callToAction ?? "Consultanos por WhatsApp"}
            </Cta>
            <Footer
              branch={footerBranch(content, context, theme)}
              context={context}
              theme={theme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function mosaicColumns(count: number): number {
  if (count <= 2) {
    return Math.max(count, 1);
  }
  if (count === 4) {
    return 2;
  }
  return 3;
}

export function ProductoMosaico(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const photos = document.media;
  const columns = mosaicColumns(photos.length);
  const rows = Math.max(Math.ceil(photos.length / columns), 1);

  return (
    <div style={safeAreaStyle(props)}>
      <LocalHeader context={context} theme={theme} />
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>
          {content.badge ?? content.category ?? "Surtido real"}
        </Eyebrow>
      </div>
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: `repeat(${String(columns)}, 1fr)`,
          gridTemplateRows: `repeat(${String(rows)}, 1fr)`,
          height: 560,
          marginTop: SPACING.lg,
        }}
      >
        {photos.length === 0 ? (
          <div
            style={{
              backgroundColor: withAlpha(COLORS.white, 0.06),
              borderRadius: RADII.icon,
              color: theme.colors.primary,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon
              color={theme.colors.primary}
              name={content.icon ?? "productos"}
              size={96}
            />
          </div>
        ) : (
          photos.map((asset, position) => (
            <Photo
              asset={asset}
              assetBaseUrl={context.assetBaseUrl}
              // La ranura identifica a la foto. La referencia no sirve: un
              // activo embebido lleva la imagen entera y dos ranuras pueden
              // repetir el mismo activo sin que eso sea un error.
              key={`${describeReference(asset.reference)}-${String(position)}`}
              radius={RADII.icon}
              style={{ height: "100%", width: "100%" }}
            />
          ))
        )}
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "space-between",
          marginTop: SPACING.xl,
        }}
      >
        <div>
          <Title maxWidth={920}>{content.title}</Title>
          {content.subtitle === undefined ? null : (
            <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
          )}
        </div>
        <div
          style={{
            alignItems: "flex-end",
            display: "flex",
            gap: SPACING.xl,
            justifyContent: "space-between",
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
            {content.callToAction ?? "Consultanos por WhatsApp"}
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
    </div>
  );
}

export function PromoProducto(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const isPromoTheme = theme.id === "promo";
  const panelBackground = isPromoTheme
    ? COLORS.paper
    : withAlpha(COLORS.white, 0.08);
  const panelText = isPromoTheme ? COLORS.ink : theme.colors.text;
  const accentText = isPromoTheme ? COLORS.rust : theme.colors.accent;
  const mutedText = isPromoTheme
    ? withAlpha(COLORS.ink, 0.68)
    : theme.colors.muted;

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Promo"} theme={theme} />
      <div
        style={{
          display: "grid",
          flex: 1,
          gap: SPACING.xxl,
          gridTemplateColumns: "0.92fr 1.08fr",
          marginTop: SPACING.xxl,
          minHeight: 0,
        }}
      >
        <div
          style={{
            backgroundColor: panelBackground,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: RADII.card,
            color: panelText,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: SPACING.xxl,
          }}
        >
          <div>
            <Text color={accentText} token="label">
              {content.category ?? "Oferta de ferretería"}
            </Text>
            <Text as="h1" style={{ marginTop: SPACING.md }} token="h1">
              {content.title}
            </Text>
            {content.subtitle === undefined ? null : (
              <Text
                as="p"
                color={mutedText}
                style={{ marginTop: SPACING.lg }}
                token="body"
              >
                {content.subtitle}
              </Text>
            )}
          </div>
          <div>
            {content.previousPrice === undefined ? null : (
              <div
                style={{
                  color: isPromoTheme
                    ? withAlpha(COLORS.ink, 0.44)
                    : withAlpha(COLORS.white, 0.52),
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 44,
                  fontWeight: FONT_WEIGHTS.bold,
                  textDecoration: "line-through",
                }}
              >
                {content.previousPrice}
              </div>
            )}
            {content.price === undefined ? null : (
              <Text
                as="div"
                color={isPromoTheme ? COLORS.rust : theme.colors.primary}
                token="hero"
              >
                {content.price}
              </Text>
            )}
            {content.validity === undefined ? null : (
              <div
                style={{
                  color: mutedText,
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 26,
                  fontWeight: FONT_WEIGHTS.semibold,
                  marginTop: SPACING.xxs,
                }}
              >
                {content.validity}
              </div>
            )}
          </div>
          <Cta theme={theme}>
            {content.callToAction ?? "Reservá por WhatsApp"}
          </Cta>
        </div>
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon={content.icon ?? "promo"}
          style={{ height: "100%", minHeight: 0, width: "100%" }}
          theme={theme}
        />
      </div>
    </div>
  );
}

export function LubricentroServicio(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Lubricentro"} theme={theme} />
      <div
        style={{
          alignItems: "center",
          display: "grid",
          flex: 1,
          gap: SPACING.xxl,
          gridTemplateColumns: "0.9fr 1.1fr",
          minHeight: 0,
        }}
      >
        <div>
          <IconBadge
            icon={content.icon ?? "lubricentro"}
            iconSize={74}
            size={132}
            theme={theme}
          />
          <Text as="h1" style={{ marginTop: SPACING.xl }} token="h1">
            {content.title}
          </Text>
          {content.subtitle === undefined ? null : (
            <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
          )}
          <div style={{ marginTop: SPACING.xxl }}>
            <Cta theme={theme}>
              {content.callToAction ?? "Sacá tu consulta"}
            </Cta>
          </div>
        </div>
        <div>
          <ProductImage
            asset={mediaAt(document, 0)}
            context={context}
            fallbackIcon="lubricentro"
            style={{ height: 650, width: "100%" }}
            theme={theme}
          />
          <div
            style={{
              backgroundColor: withAlpha(COLORS.white, 0.08),
              border: `1px solid ${theme.colors.border}`,
              borderRadius: RADII.icon,
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 34,
              fontWeight: FONT_WEIGHTS.bold,
              lineHeight: 1.1,
              marginTop: SPACING.xl,
              padding: SPACING.xl,
            }}
          >
            Casa Central · {context.brand.central}
          </div>
        </div>
      </div>
      <Footer
        branch={footerBranch(content, context, theme)}
        context={context}
        theme={theme}
      />
    </div>
  );
}

export function TipOficio(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const photo = mediaAt(document, 0);
  const items = content.items ?? [];

  return (
    <div style={safeAreaStyle(props)}>
      <Header
        eyebrow={content.badge ?? content.category ?? "Tip"}
        theme={theme}
      />
      {photo === undefined ? (
        <div style={{ marginTop: SPACING.xl }}>
          <IconBadge
            icon={content.icon ?? "herramienta"}
            iconSize={60}
            size={104}
            theme={theme}
          />
          <Text
            as="h1"
            style={{ marginTop: SPACING.md, maxWidth: 880 }}
            token="h2"
          >
            {content.title}
          </Text>
          {content.subtitle === undefined ? null : (
            <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
          )}
        </div>
      ) : (
        <div style={{ marginTop: SPACING.xl }}>
          <ProductImage
            asset={photo}
            context={context}
            style={{ height: 260, width: "100%" }}
            theme={theme}
          />
          <Text
            as="h1"
            style={{ marginTop: SPACING.lg, maxWidth: 880 }}
            token="h2"
          >
            {content.title}
          </Text>
        </div>
      )}
      <div style={{ marginTop: SPACING.md, minHeight: 0 }}>
        <BulletList items={items} theme={theme} />
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
        }}
      >
        <Cta theme={theme}>
          {content.callToAction ?? "Guardalo para la próxima compra"}
        </Cta>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

export function EppSeguridad(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const items = (content.items ?? []).slice(0, 3);

  return (
    <div
      style={{
        ...safeAreaStyle(props),
        display: "grid",
        gap: SPACING.xl,
        gridTemplateRows: "auto 1fr auto",
      }}
    >
      <Header eyebrow={content.badge ?? "Seguridad"} theme={theme} />
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: SPACING.xxl,
          gridTemplateColumns: "0.88fr 1.12fr",
          minHeight: 0,
        }}
      >
        <div style={{ minHeight: 0 }}>
          <Eyebrow theme={theme}>{content.category ?? "EPP"}</Eyebrow>
          <Text as="h1" style={{ marginTop: SPACING.lg }} token="h2">
            {content.title}
          </Text>
          {content.subtitle === undefined ? null : (
            <Text
              as="p"
              color={theme.colors.muted}
              style={{
                fontSize: 34,
                lineHeight: 1.16,
                marginTop: SPACING.lg,
              }}
              token="sub"
            >
              {content.subtitle}
            </Text>
          )}
          <ul
            style={{
              display: "grid",
              gap: SPACING.sm,
              listStyle: "none",
              margin: `${String(SPACING.xl)}px 0 0`,
              padding: 0,
            }}
          >
            {items.map((item) => (
              <li
                key={item}
                style={{
                  alignItems: "center",
                  backgroundColor: withAlpha(COLORS.white, 0.08),
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 18,
                  display: "flex",
                  gap: SPACING.md,
                  padding: `${String(SPACING.sm)}px ${String(SPACING.lg)}px`,
                }}
              >
                <span
                  style={{
                    backgroundColor: COLORS.rust,
                    borderRadius: RADII.pill,
                    color: COLORS.white,
                    display: "grid",
                    flexShrink: 0,
                    height: 40,
                    placeItems: "center",
                    width: 40,
                  }}
                >
                  <Icon
                    color={COLORS.white}
                    name="tag"
                    size={22}
                    strokeWidth={STROKES.emphasis}
                  />
                </span>
                <span
                  style={{
                    fontFamily: TYPOGRAPHY.body.cssStack,
                    fontSize: 29,
                    fontWeight: FONT_WEIGHTS.bold,
                    lineHeight: 1.1,
                  }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon="epp"
          style={{ height: 610, width: "100%" }}
          theme={theme}
        />
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xxl,
          justifyContent: "space-between",
        }}
      >
        <Cta theme={theme}>
          {content.callToAction ?? "Consultá modelos y talles"}
        </Cta>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

export function PresentacionMarca(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const categories = (content.items ?? []).slice(0, 8);

  return (
    <div style={safeAreaStyle(props)}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 10,
        }}
      >
        <Header theme={theme} />
        {content.badge === undefined ? null : (
          <Eyebrow theme={theme}>{content.badge}</Eyebrow>
        )}
      </div>
      <ProductImage
        asset={mediaAt(document, 0)}
        context={context}
        fallbackIcon="tienda"
        style={{ height: 430, marginTop: SPACING.xl, width: "100%" }}
        theme={theme}
      />
      <div style={{ marginTop: SPACING.xl }}>
        <Text as="h1" style={{ maxWidth: 920 }} token="h2">
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gap: SPACING.sm,
          gridTemplateColumns: "repeat(2, 1fr)",
          marginTop: SPACING.xl,
        }}
      >
        {categories.map((category) => (
          <div
            key={category}
            style={{
              alignItems: "center",
              backgroundColor: withAlpha(COLORS.white, 0.08),
              border: `1px solid ${theme.colors.border}`,
              borderRadius: RADII.chip,
              display: "flex",
              gap: SPACING.sm,
              padding: `${String(SPACING.xs + 4)}px ${String(SPACING.md)}px`,
            }}
          >
            <span
              style={{
                backgroundColor: COLORS.rust,
                borderRadius: RADII.pill,
                color: COLORS.white,
                display: "grid",
                flexShrink: 0,
                height: 36,
                placeItems: "center",
                width: 36,
              }}
            >
              <Icon
                color={COLORS.white}
                name="tag"
                size={20}
                strokeWidth={STROKES.emphasis}
              />
            </span>
            <span
              style={{
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 27,
                fontWeight: FONT_WEIGHTS.bold,
                lineHeight: 1.1,
              }}
            >
              {category}
            </span>
          </div>
        ))}
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
        <Cta theme={theme}>
          {content.callToAction ?? "Consultanos por WhatsApp"}
        </Cta>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

export function Sucursales(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const branches = [
    {
      asset: mediaAt(document, 0),
      address: context.brand.central,
      detail: "Ferretería completa + Lubricentro",
      icon: "lubricentro" as const,
      label: "Casa Central",
    },
    {
      asset: mediaAt(document, 1),
      address: context.brand.branch,
      detail: "Ferretería completa",
      icon: "tienda" as const,
      label: "Sucursal",
    },
  ];

  return (
    <div style={safeAreaStyle(props)}>
      <Header eyebrow={content.badge ?? "Dónde estamos"} theme={theme} />
      <div style={{ marginTop: SPACING.xxl }}>
        <Text as="h1" style={{ maxWidth: 920 }} token="h2">
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Subtitle color={theme.colors.muted}>{content.subtitle}</Subtitle>
        )}
      </div>
      <div
        style={{
          display: "grid",
          flex: 1,
          gap: SPACING.xl,
          gridTemplateColumns: "repeat(2, 1fr)",
          marginTop: SPACING.xxl,
          minHeight: 0,
        }}
      >
        {branches.map((branch) => (
          <div
            key={branch.address}
            style={{
              backgroundColor: COLORS.paper,
              borderRadius: RADII.card,
              color: COLORS.ink,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <ProductImage
              asset={branch.asset}
              context={context}
              fallbackIcon={branch.icon}
              radius={0}
              style={{ height: 400, width: "100%" }}
              theme={theme}
            />
            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                padding: SPACING.xl,
              }}
            >
              <Text color={COLORS.rust} token="label">
                {branch.label}
              </Text>
              <div
                style={{
                  fontFamily: TYPOGRAPHY.display.cssStack,
                  fontSize: 44,
                  fontWeight: FONT_WEIGHTS.extrabold,
                  lineHeight: 0.92,
                  marginTop: SPACING.xxs + 8,
                  textTransform: "uppercase",
                }}
              >
                {branch.address}
              </div>
              <div
                style={{
                  color: withAlpha(COLORS.ink, 0.64),
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 26,
                  fontWeight: FONT_WEIGHTS.bold,
                  lineHeight: 1.1,
                  marginTop: SPACING.sm,
                }}
              >
                {branch.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: SPACING.xl,
        }}
      >
        <Cta theme={theme}>
          {content.callToAction ?? "Consultanos por WhatsApp"}
        </Cta>
        <div
          style={{
            color: theme.colors.muted,
            flexShrink: 0,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 25,
            fontWeight: FONT_WEIGHTS.semibold,
            lineHeight: 1.35,
            textAlign: "right",
          }}
        >
          <div>Lun a sáb</div>
          <div>08:30 a 13:00 · 16:30 a 20:30</div>
          <div>{context.brand.phone}</div>
        </div>
      </div>
    </div>
  );
}

export function HistoriaProducto(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;

  return (
    <>
      <div style={{ inset: 0, position: "absolute" }}>
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon={content.icon ?? "productos"}
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
        <Header
          eyebrow={content.badge ?? content.category ?? "Disponible"}
          theme={theme}
        />
        <div>
          <Title color={COLORS.paper} maxWidth={860}>
            {content.title}
          </Title>
          {content.subtitle === undefined ? null : (
            <Text
              as="p"
              color={withAlpha(COLORS.paper, 0.78)}
              style={{
                fontSize: 40,
                lineHeight: 1.1,
                marginTop: SPACING.lg,
                maxWidth: 760,
              }}
              token="sub"
            >
              {content.subtitle}
            </Text>
          )}
          <div style={{ marginTop: SPACING.xxl }}>
            <Cta theme={theme}>
              {content.callToAction ?? "Pedilo por WhatsApp"}
            </Cta>
          </div>
        </div>
      </div>
    </>
  );
}
