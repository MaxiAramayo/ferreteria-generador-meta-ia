import type { ReactElement, ReactNode } from "react";

import { Text } from "../primitives/text.tsx";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import {
  Cta,
  Disclaimer,
  Eyebrow,
  Footer,
  LocalHeader,
  PriceBlock,
  ProductImage,
} from "./kit.tsx";
import { footerBranch, mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Marco compartido de las tres historias comerciales.
 *
 * Las variantes siguen siendo componentes explícitos: este marco sólo aplica
 * la zona segura y no conoce si la pieza vende un producto, una solución o un
 * surtido. Así no aparecen combinaciones de props booleanas imposibles.
 */
function CommercialStoryFrame({
  children,
  props,
}: {
  readonly children: ReactNode;
  readonly props: LayoutProps;
}): ReactElement {
  const { format } = props;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        paddingBottom: format.safeArea.bottom,
        paddingLeft: format.safeArea.left,
        paddingRight: format.safeArea.right,
        paddingTop: format.safeArea.top,
        position: "relative",
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}

function StoryFooter(props: LayoutProps): ReactElement {
  const { content, context, theme } = props;

  return (
    <div style={{ marginTop: SPACING.md }}>
      <Footer
        branch={footerBranch(content, context, theme)}
        context={context}
        theme={theme}
      />
    </div>
  );
}

function StoryDisclaimer(props: LayoutProps): ReactElement | null {
  const { content, theme } = props;

  if (content.disclaimer === undefined) {
    return null;
  }

  return (
    <div style={{ marginTop: SPACING.xs }}>
      <Disclaimer color={theme.colors.muted}>{content.disclaimer}</Disclaimer>
    </div>
  );
}

/** Producto genérico o exacto cuyo precio tiene la mayor jerarquía. */
export function HistoriaProductoPrecio(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <CommercialStoryFrame props={props}>
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
        style={{ height: 520, marginTop: SPACING.lg, width: "100%" }}
        theme={theme}
      />
      <div style={{ marginTop: SPACING.lg }}>
        <Text as="h1" style={{ maxWidth: 900 }} token="h2">
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Text
            as="p"
            color={theme.colors.muted}
            style={{ marginTop: SPACING.sm, maxWidth: 850 }}
            token="body"
          >
            {content.subtitle}
          </Text>
        )}
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: SPACING.lg,
        }}
      >
        <PriceBlock
          color={theme.colors.primary}
          compact
          mutedColor={theme.colors.muted}
          price={content.price}
          validity={content.validity}
        />
        <Cta compact theme={theme}>
          {content.callToAction ?? "Consultá por WhatsApp"}
        </Cta>
      </div>
      <StoryDisclaimer {...props} />
      <StoryFooter {...props} />
    </CommercialStoryFrame>
  );
}

/** Historia que abre con el problema y luego muestra la categoría que ayuda. */
export function HistoriaProblemaSolucion(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;
  const [firstStep, secondStep] = content.items ?? [];

  return (
    <CommercialStoryFrame props={props}>
      <LocalHeader context={context} theme={theme} />
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>
          {content.badge ?? content.category ?? "Problema y solución"}
        </Eyebrow>
        <Text
          as="h1"
          style={{ marginTop: SPACING.md, maxWidth: 920 }}
          token="h2"
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
          display: "grid",
          gap: SPACING.lg,
          gridTemplateColumns: "0.92fr 1.08fr",
          marginTop: SPACING.lg,
          padding: SPACING.lg,
        }}
      >
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon={content.icon ?? "productos"}
          style={{ height: 340, width: "100%" }}
          theme={theme}
        />
        <div>
          <Text as="p" token="body">
            {content.subtitle}
          </Text>
          {[firstStep, secondStep].map((step) =>
            step === undefined ? null : (
              <div
                key={step}
                style={{
                  borderTop: `1px solid ${theme.colors.border}`,
                  color: theme.colors.muted,
                  fontFamily: TYPOGRAPHY.body.cssStack,
                  fontSize: 24,
                  fontWeight: FONT_WEIGHTS.bold,
                  marginTop: SPACING.md,
                  paddingTop: SPACING.sm,
                }}
              >
                {step}
              </div>
            ),
          )}
        </div>
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: SPACING.lg,
        }}
      >
        <PriceBlock
          color={theme.colors.primary}
          compact
          mutedColor={theme.colors.muted}
          price={content.price}
          validity={content.validity}
        />
        <Cta compact theme={theme}>
          {content.callToAction ?? "Traé la medida"}
        </Cta>
      </div>
      <StoryDisclaimer {...props} />
      <StoryFooter {...props} />
    </CommercialStoryFrame>
  );
}

/** Foto real de góndola o depósito con categoría, precio guía y consulta. */
export function HistoriaSurtidoReal(props: LayoutProps): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <CommercialStoryFrame props={props}>
      <LocalHeader context={context} theme={theme} />
      <div style={{ marginTop: SPACING.lg }}>
        <Eyebrow theme={theme}>
          {content.badge ?? content.category ?? "Surtido real"}
        </Eyebrow>
      </div>
      <ProductImage
        asset={mediaAt(document, 0)}
        context={context}
        fallbackIcon="productos"
        style={{ height: 560, marginTop: SPACING.lg, width: "100%" }}
        theme={theme}
      />
      <div style={{ marginTop: SPACING.lg }}>
        <Text as="h1" style={{ maxWidth: 900 }} token="h2">
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Text
            as="p"
            color={theme.colors.muted}
            style={{ marginTop: SPACING.sm, maxWidth: 850 }}
            token="body"
          >
            {content.subtitle}
          </Text>
        )}
      </div>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.xl,
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: SPACING.lg,
        }}
      >
        <PriceBlock
          color={theme.colors.primary}
          compact
          mutedColor={theme.colors.muted}
          price={content.price}
          validity={content.validity}
        />
        <Cta compact theme={theme}>
          {content.callToAction ?? "Mandanos foto o medida"}
        </Cta>
      </div>
      <StoryDisclaimer {...props} />
      <StoryFooter {...props} />
    </CommercialStoryFrame>
  );
}
