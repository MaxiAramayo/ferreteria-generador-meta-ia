import type { ReactElement } from "react";

import { SafeArea } from "../primitives/canvas.tsx";
import { Text } from "../primitives/text.tsx";
import { withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { Cta, Eyebrow, IconBadge, LocalHeader } from "./kit.tsx";
import type { LayoutProps } from "./layout-context.ts";

function OpeningItems({
  props,
}: {
  readonly props: LayoutProps;
}): ReactElement {
  const entries = (props.content.items ?? []).slice(0, 3);
  return (
    <div
      data-opening-details=""
      style={{
        display: "grid",
        gap: SPACING.sm,
      }}
    >
      {entries.map((entry) => (
        <div
          key={entry}
          style={{
            borderLeft: `8px solid ${props.theme.colors.primary}`,
            color: props.theme.colors.text,
            fontFamily: TYPOGRAPHY.body.cssStack,
            fontSize: 32,
            fontWeight: FONT_WEIGHTS.bold,
            lineHeight: 1.1,
            padding: `${String(SPACING.sm)}px 0 ${String(SPACING.sm)}px ${String(SPACING.md)}`,
          }}
        >
          {entry}
        </div>
      ))}
    </div>
  );
}

/**
 * Apertura como cartel del local: jerarquía muy directa para quien sólo quiere
 * saber si está abierto y dónde consultar.
 */
export function HistoriaAperturaCartel(props: LayoutProps): ReactElement {
  const { content, format, theme } = props;
  return (
    <SafeArea format={format}>
      <LocalHeader context={props.context} theme={theme} />
      <div style={{ marginTop: "auto", paddingBottom: SPACING.xl }}>
        <Eyebrow theme={theme}>{content.badge ?? "Estamos atendiendo"}</Eyebrow>
        <Text
          as="h1"
          style={{ marginTop: SPACING.xl, maxWidth: 820 }}
          token="hero"
        >
          {content.title}
        </Text>
        {content.subtitle === undefined ? null : (
          <Text
            color={theme.colors.muted}
            style={{ marginTop: SPACING.md }}
            token="sub"
          >
            {content.subtitle}
          </Text>
        )}
      </div>
      <div
        data-panel=""
        style={{
          backgroundColor: withAlpha(theme.colors.surface, 0.9),
          border: `1px solid ${theme.colors.border}`,
          borderRadius: RADII.card,
          padding: SPACING.xl,
        }}
      >
        <OpeningItems props={props} />
        <div style={{ marginTop: SPACING.lg }}>
          <Cta theme={theme}>{content.callToAction}</Cta>
        </div>
      </div>
    </SafeArea>
  );
}

/** Apertura centrada en el horario, con una señal de reloj visible. */
export function HistoriaAperturaHorario(props: LayoutProps): ReactElement {
  const { content, format, theme } = props;
  return (
    <SafeArea format={format}>
      <LocalHeader context={props.context} theme={theme} />
      <div
        data-panel=""
        style={{
          alignItems: "center",
          backgroundColor: withAlpha(theme.colors.background, 0.76),
          border: `2px solid ${theme.colors.primary}`,
          borderRadius: RADII.card,
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          marginTop: SPACING.xxl,
          padding: SPACING.xxl,
          textAlign: "center",
        }}
      >
        <IconBadge icon={content.icon ?? "reloj"} size={150} theme={theme} />
        <Text as="h1" style={{ marginTop: SPACING.xl }} token="h1">
          {content.title}
        </Text>
        <div
          style={{ marginTop: SPACING.xl, textAlign: "left", width: "100%" }}
        >
          <OpeningItems props={props} />
        </div>
      </div>
      <div style={{ marginTop: SPACING.xl }}>
        <Cta theme={theme}>{content.callToAction}</Cta>
      </div>
    </SafeArea>
  );
}

/** Apertura que prioriza las sucursales para los días de consulta presencial. */
export function HistoriaAperturaLocales(props: LayoutProps): ReactElement {
  const { content, format, theme } = props;
  return (
    <SafeArea format={format}>
      <LocalHeader context={props.context} theme={theme} />
      <div style={{ marginTop: SPACING.xxl }}>
        <Eyebrow theme={theme}>{content.badge ?? "Hoy abrimos"}</Eyebrow>
        <Text as="h1" style={{ marginTop: SPACING.lg }} token="h1">
          {content.title}
        </Text>
      </div>
      <div
        style={{
          display: "grid",
          flex: 1,
          gap: SPACING.md,
          marginTop: SPACING.xl,
        }}
      >
        {(content.items ?? []).slice(0, 3).map((entry) => (
          <div
            data-panel=""
            key={entry}
            style={{
              alignItems: "center",
              backgroundColor: withAlpha(theme.colors.surface, 0.86),
              border: `1px solid ${theme.colors.border}`,
              borderRadius: RADII.card,
              display: "flex",
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 34,
              fontWeight: FONT_WEIGHTS.bold,
              lineHeight: 1.08,
              padding: SPACING.xl,
            }}
          >
            {entry}
          </div>
        ))}
      </div>
      <div style={{ marginTop: SPACING.xl }}>
        <Cta theme={theme}>{content.callToAction}</Cta>
      </div>
    </SafeArea>
  );
}
