import type { ReactElement } from "react";

import { Icon } from "../primitives/icon.tsx";
import { Logo } from "../primitives/logo.tsx";
import { Photo } from "../primitives/photo.tsx";
import { hasCircularSafeArea } from "../formats/formats.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING, STROKES } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { mediaAt, type LayoutProps } from "./layout-context.ts";

/**
 * Piezas de marca: banner de portada y portada de destacadas.
 *
 * La portada destacada centra su símbolo dentro del círculo seguro que declara
 * el formato, en lugar de repetir el diámetro en el layout.
 */

export function BannerMarca(props: LayoutProps): ReactElement {
  const { content, context, document, format } = props;
  const photos = [mediaAt(document, 0), mediaAt(document, 1)];
  const contentWidth = 1080;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          inset: 0,
          position: "absolute",
        }}
      >
        {photos.map((asset, index) =>
          asset === undefined ? (
            <div
              key={index === 0 ? "central" : "sucursal"}
              style={{
                backgroundColor: index === 0 ? COLORS.ink : COLORS.humo,
              }}
            />
          ) : (
            <Photo
              asset={asset}
              assetBaseUrl={context.assetBaseUrl}
              key={index === 0 ? "central" : "sucursal"}
              radius={0}
              style={{ height: "100%", width: "100%" }}
            />
          ),
        )}
      </div>
      <div
        style={{
          background: `linear-gradient(90deg, ${withAlpha(COLORS.graphiteDeep, 0.92)}, ${withAlpha(COLORS.graphiteDeep, 0.72)} 50%, ${withAlpha(COLORS.graphiteDeep, 0.82)})`,
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
      <div
        style={{
          color: COLORS.paper,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          margin: "0 auto",
          paddingBottom: format.safeArea.bottom,
          paddingTop: format.safeArea.top,
          position: "relative",
          width: contentWidth,
          zIndex: 10,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: SPACING.xl,
            justifyContent: "space-between",
          }}
        >
          <Logo size={68} tone="dark" variant="familia" />
          <div
            style={{
              border: `1px solid ${withAlpha(COLORS.white, 0.2)}`,
              borderRadius: RADII.pill,
              color: withAlpha(COLORS.paper, 0.88),
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 19,
              fontWeight: FONT_WEIGHTS.extrabold,
              letterSpacing: "0.08em",
              padding: `${String(SPACING.xxs + 8)}px ${String(SPACING.lg - 4)}px`,
              textTransform: "uppercase",
            }}
          >
            Ferretería + Lubricentro
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <h1
            style={{
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: 76,
              fontWeight: FONT_WEIGHTS.black,
              letterSpacing: "-0.01em",
              lineHeight: 0.82,
              margin: 0,
              maxWidth: 1000,
              textTransform: "uppercase",
              whiteSpace: "pre-line",
            }}
          >
            {content.title}
          </h1>
          {content.subtitle === undefined ? null : (
            <p
              style={{
                color: withAlpha(COLORS.paper, 0.78),
                fontFamily: TYPOGRAPHY.body.cssStack,
                fontSize: 28,
                fontWeight: FONT_WEIGHTS.semibold,
                lineHeight: 1.15,
                margin: `${String(SPACING.sm)}px 0 0`,
                maxWidth: 930,
              }}
            >
              {content.subtitle}
            </p>
          )}
        </div>

        <div
          style={{
            alignItems: "stretch",
            display: "flex",
            gap: 14,
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "grid",
              flex: 1,
              gap: 12,
              gridTemplateColumns: "repeat(2, 1fr)",
              minWidth: 0,
            }}
          >
            {[
              {
                accent: COLORS.safety,
                address: context.brand.central,
                detail: "Ferretería + Lubricentro",
                label: "Casa Central",
              },
              {
                accent: COLORS.rust,
                address: context.brand.branch,
                detail: "Ferretería",
                label: "Sucursal",
              },
            ].map((place) => (
              <div
                key={place.label}
                style={{
                  backgroundColor: withAlpha("#000000", 0.48),
                  border: `1px solid ${withAlpha(COLORS.white, 0.16)}`,
                  borderRadius: 18,
                  padding: "16px 22px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    color: place.accent,
                    display: "flex",
                    fontFamily: TYPOGRAPHY.body.cssStack,
                    fontSize: 16,
                    fontWeight: FONT_WEIGHTS.extrabold,
                    gap: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  <Icon
                    color={place.accent}
                    name="ubicacion"
                    size={22}
                    strokeWidth={2.8}
                  />
                  {place.label}
                </div>
                <div
                  style={{
                    fontFamily: TYPOGRAPHY.body.cssStack,
                    fontSize: 22,
                    fontWeight: FONT_WEIGHTS.extrabold,
                    lineHeight: 1,
                    marginTop: 5,
                  }}
                >
                  {place.address}
                </div>
                <div
                  style={{
                    color: withAlpha(COLORS.paper, 0.66),
                    fontFamily: TYPOGRAPHY.body.cssStack,
                    fontSize: 15,
                    fontWeight: FONT_WEIGHTS.bold,
                    marginTop: 5,
                  }}
                >
                  {place.detail}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              alignItems: "center",
              backgroundColor: COLORS.rustDeep,
              borderRadius: 18,
              color: COLORS.white,
              display: "flex",
              flexShrink: 0,
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 27,
              fontWeight: FONT_WEIGHTS.extrabold,
              gap: 13,
              justifyContent: "center",
              padding: `0 ${String(SPACING.md)}px`,
              width: 300,
            }}
          >
            <Icon
              color={COLORS.white}
              name="telefono"
              size={31}
              strokeWidth={2.8}
            />
            {content.phone ?? context.brand.phone}
          </div>
        </div>
      </div>
    </>
  );
}

export function DestacadaCover(props: LayoutProps): ReactElement {
  const { content, format, theme } = props;
  const isLubricentro = theme.brand === "lubricentro";
  const accent = isLubricentro ? COLORS.safety : COLORS.rust;
  const symbolColor = isLubricentro ? COLORS.graphite : COLORS.white;
  const circleDiameter = hasCircularSafeArea(format)
    ? format.safeArea.circleDiameter
    : Math.min(format.width, format.height);
  const ringDiameter = Math.round(circleDiameter * 0.72);
  const symbolDiameter = Math.round(circleDiameter * 0.547);

  return (
    <>
      <div
        style={{
          background: `radial-gradient(circle at 50% 46%, ${withAlpha(accent, isLubricentro ? 0.16 : 0.2)}, transparent 48%), ${theme.colors.background}`,
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
        }}
      />
      <div
        style={{
          backgroundColor: withAlpha(accent, 0.08),
          border: `3px solid ${withAlpha(accent, 0.28)}`,
          borderRadius: Math.round(ringDiameter * 0.213),
          display: "grid",
          height: ringDiameter,
          left: "50%",
          placeItems: "center",
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: ringDiameter,
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: accent,
            borderRadius: Math.round(symbolDiameter * 0.204),
            color: symbolColor,
            display: "grid",
            height: symbolDiameter,
            placeItems: "center",
            width: symbolDiameter,
          }}
        >
          <Icon
            color={symbolColor}
            name={content.icon ?? "productos"}
            size={Math.round(symbolDiameter * 0.527)}
            strokeWidth={STROKES.iconBadge}
          />
        </div>
      </div>
      <h1
        style={{
          clipPath: "inset(50%)",
          height: 1,
          margin: -1,
          overflow: "hidden",
          position: "absolute",
          whiteSpace: "nowrap",
          width: 1,
        }}
      >
        {content.title}
      </h1>
    </>
  );
}
