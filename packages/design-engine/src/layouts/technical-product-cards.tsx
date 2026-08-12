import type { ReactElement, ReactNode } from "react";

import { Text } from "../primitives/text.tsx";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { SPACING } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { Cta, Disclaimer, Footer, LocalHeader, ProductImage } from "./kit.tsx";
import { footerBranch, mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Piezas técnicas con una imagen editorial completa y una capa de información
 * determinista. La foto aporta producto y ambiente; las medidas, instrucciones,
 * localidad y llamados a la acción siempre se componen en el motor.
 */

function TechnicalFrame({
  children,
  props,
}: {
  readonly children: ReactNode;
  readonly props: LayoutProps;
}): ReactElement {
  const { safeArea } = props.format;

  return (
    <div
      style={{
        height: "100%",
        paddingBottom: safeArea.bottom,
        paddingLeft: safeArea.left,
        paddingRight: safeArea.right,
        paddingTop: safeArea.top,
        position: "relative",
        zIndex: 10,
      }}
    >
      {children}
    </div>
  );
}

function TechnicalLabel({
  children,
  theme,
}: {
  readonly children: ReactNode;
  readonly theme: LayoutProps["theme"];
}): ReactElement {
  return (
    <div
      style={{
        alignItems: "center",
        color: theme.colors.text,
        display: "flex",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 20,
        fontWeight: FONT_WEIGHTS.extrabold,
        gap: SPACING.sm,
        letterSpacing: 1.8,
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          backgroundColor: theme.colors.primary,
          height: 5,
          width: 46,
        }}
      />
      {children}
    </div>
  );
}

function TechnicalTitle({
  props,
}: {
  readonly props: LayoutProps;
}): ReactElement {
  const { content, theme } = props;

  return (
    <div style={{ marginTop: SPACING.xl, maxWidth: 800 }}>
      <TechnicalLabel theme={theme}>
        {content.badge ?? "Ficha técnica"}
      </TechnicalLabel>
      <Text
        as="h1"
        style={{
          fontSize: props.format.id === "historia" ? 64 : 58,
          lineHeight: 0.96,
          marginTop: SPACING.sm,
          maxWidth: 800,
          textShadow: `0 4px 20px ${withAlpha(COLORS.ink, 0.9)}`,
        }}
        token="h2"
      >
        {content.title}
      </Text>
      {content.subtitle === undefined ? null : (
        <Text
          as="p"
          color={theme.colors.text}
          style={{
            fontSize: props.format.id === "historia" ? 29 : 26,
            lineHeight: 1.12,
            marginTop: SPACING.sm,
            maxWidth: 690,
            textShadow: `0 2px 14px ${COLORS.ink}`,
          }}
          token="body"
        >
          {content.subtitle}
        </Text>
      )}
    </div>
  );
}

function MeasurementRail({
  props,
}: {
  readonly props: LayoutProps;
}): ReactElement {
  const { content, theme } = props;
  const labels = (content.items ?? []).slice(0, 3);

  return (
    <div
      data-measurement-rail=""
      style={{
        backgroundColor: withAlpha(COLORS.graphiteDeep, 0.9),
        borderBottom: `1px solid ${theme.colors.border}`,
        borderTop: `3px solid ${theme.colors.primary}`,
        display: "grid",
        gridTemplateColumns: `repeat(${String(labels.length)}, minmax(0, 1fr))`,
        width: "100%",
      }}
    >
      {labels.map((label, index) => (
        <div
          key={`${label}-${String(index)}`}
          style={{
            borderLeft:
              index === 0 ? undefined : `1px solid ${theme.colors.border}`,
            minWidth: 0,
            padding: `${String(SPACING.sm)}px ${String(SPACING.xs)}px`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: theme.colors.muted,
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 14,
              fontWeight: FONT_WEIGHTS.bold,
              letterSpacing: 1.6,
              textTransform: "uppercase",
            }}
          >
            Medida
          </div>
          <div
            style={{
              color: theme.colors.primary,
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: props.format.id === "historia" ? 54 : 48,
              fontWeight: FONT_WEIGHTS.black,
              lineHeight: 0.95,
              marginTop: SPACING.xs,
            }}
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApplicationSteps({
  props,
}: {
  readonly props: LayoutProps;
}): ReactElement {
  const { content, theme } = props;
  const steps = (content.items ?? []).slice(0, 3);

  return (
    <ol
      data-application-steps=""
      style={{
        display: "grid",
        gap: SPACING.xs,
        listStyle: "none",
        margin: `${String(SPACING.xl)}px 0 0`,
        maxWidth: props.format.id === "historia" ? 600 : 560,
        padding: 0,
      }}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          style={{
            alignItems: "center",
            backgroundColor: withAlpha(COLORS.graphiteDeep, 0.88),
            borderLeft: `5px solid ${theme.colors.primary}`,
            display: "flex",
            gap: SPACING.md,
            minHeight: props.format.id === "historia" ? 68 : 62,
            padding: `${String(SPACING.xs)}px ${String(SPACING.md)}px`,
          }}
        >
          <span
            style={{
              color: theme.colors.primary,
              flexShrink: 0,
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: 29,
              fontWeight: FONT_WEIGHTS.black,
              lineHeight: 1,
            }}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            style={{
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: props.format.id === "historia" ? 25 : 23,
              fontWeight: FONT_WEIGHTS.bold,
              lineHeight: 1.08,
            }}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TechnicalFooter({
  props,
}: {
  readonly props: LayoutProps;
}): ReactElement {
  const { content, context, theme } = props;

  return (
    <div style={{ paddingTop: SPACING.md }}>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          gap: SPACING.md,
          justifyContent: "space-between",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {content.disclaimer === undefined ? null : (
            <Disclaimer color={theme.colors.muted}>
              {content.disclaimer}
            </Disclaimer>
          )}
        </div>
        <Cta compact theme={theme}>
          {content.callToAction ?? "Consultá por WhatsApp"}
        </Cta>
      </div>
      <div style={{ marginTop: SPACING.sm }}>
        <Footer
          branch={footerBranch(content, context, theme)}
          context={context}
          theme={theme}
        />
      </div>
    </div>
  );
}

function TechnicalPoster({
  kind,
  props,
}: {
  readonly kind: "application" | "variants";
  readonly props: LayoutProps;
}): ReactElement {
  const { content, context, document, theme } = props;

  return (
    <TechnicalFrame props={props}>
      <div
        data-technical-poster=""
        data-variant-board={kind === "variants" ? "" : undefined}
        style={{
          backgroundColor: COLORS.graphiteDeep,
          height: "100%",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <ProductImage
          asset={mediaAt(document, 0)}
          context={context}
          fallbackIcon={content.icon ?? "productos"}
          radius={0}
          style={{
            height: "100%",
            inset: 0,
            position: "absolute",
            width: "100%",
          }}
          theme={theme}
        />
        <div
          aria-hidden="true"
          style={{
            background: `linear-gradient(180deg, ${withAlpha(COLORS.graphiteDeep, 0.98)} 0%, ${withAlpha(COLORS.graphiteDeep, 0.72)} 25%, transparent 52%), linear-gradient(0deg, ${withAlpha(COLORS.graphiteDeep, 0.98)} 0%, ${withAlpha(COLORS.graphiteDeep, 0.76)} 19%, transparent 48%)`,
            inset: 0,
            pointerEvents: "none",
            position: "absolute",
            zIndex: 1,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: `${String(SPACING.lg)}px ${String(SPACING.xl)}px ${String(SPACING.md)}px`,
            position: "relative",
            zIndex: 3,
          }}
        >
          <LocalHeader context={context} theme={theme} />
          <TechnicalTitle props={props} />
          {kind === "application" ? <ApplicationSteps props={props} /> : null}
          <div style={{ marginTop: "auto" }}>
            {kind === "variants" ? <MeasurementRail props={props} /> : null}
            <TechnicalFooter props={props} />
          </div>
        </div>
      </div>
    </TechnicalFrame>
  );
}

/** Comparador editorial de tres medidas, con producto y rótulos legibles. */
export function FichaVariantes(props: LayoutProps): ReactElement {
  return <TechnicalPoster kind="variants" props={props} />;
}

/** Versión vertical del comparador, dentro de la zona segura de historias. */
export function HistoriaFichaVariantes(props: LayoutProps): ReactElement {
  return <TechnicalPoster kind="variants" props={props} />;
}

/** Guía visual de preencastre que evita fingir una instalación terminada. */
export function GuiaAplicacion(props: LayoutProps): ReactElement {
  return <TechnicalPoster kind="application" props={props} />;
}

/** Historia de preencastre con el mismo lenguaje y jerarquía. */
export function HistoriaGuiaAplicacion(props: LayoutProps): ReactElement {
  return <TechnicalPoster kind="application" props={props} />;
}
