import type { CSSProperties, ReactElement, ReactNode } from "react";

import type { DesignFeature, MediaAsset } from "../contracts/document.ts";
import { SafeArea } from "../primitives/canvas.tsx";
import { Icon } from "../primitives/icon.tsx";
import { AramayoMark } from "../primitives/logo.tsx";
import { Photo } from "../primitives/photo.tsx";
import type { AccentName } from "../registry/accents.ts";
import type { IconName } from "../registry/icons.ts";
import type { Theme } from "../themes/theme-colors.ts";
import { COLORS, withAlpha } from "../tokens/colors.ts";
import { RADII, SPACING } from "../tokens/space.ts";
import { FONT_WEIGHTS, TYPOGRAPHY } from "../tokens/typography.ts";
import { Cartel, liftShadow } from "./frame-kit.tsx";
import { CARTEL_HEIGHT, VEIL_DENSE_OPACITY } from "./frame-geometry.ts";
import {
  mediaAt,
  type LayoutContext,
  type LayoutProps,
} from "./layout-context.ts";

/**
 * Historias recurrentes del local (`ADR-030`).
 *
 * La apertura es una sola plantilla estable, con una jerarquía que no compite
 * consigo misma: «¡Ya abrimos!» y la foto mandan; después los rubros, que son lo
 * que hace acordar a alguien de lo que necesita; abajo y en chico, los
 * argumentos secundarios, las sucursales, el horario y el botón de contacto.
 * Todo con el mismo peso termina pareciendo un folleto.
 *
 * El lubricentro usa la misma jerarquía en su propio marco: la foto a sangre, el
 * cartel del frente arriba y una placa grafito abajo con franja de seguridad.
 *
 * Todo dato se apoya en una franja de color conocido y nunca sobre la foto: el
 * blanco sobre el rojo de marca mide 4,19:1 y sobre el rojo profundo, 6,31:1.
 * La foto no dibuja datos, así que una imagen cualquiera no puede contradecir el
 * horario. `imagen` es la excepción deliberada: publica tal cual la imagen de
 * quien opera, y por eso su borrador siempre pide aprobación.
 */

const brandLockupMarkSize = 84;

interface OpeningPalette {
  /** Filete que enmarca la foto a sangre. */
  readonly frame: string;
  readonly grain: string;
  readonly greetingBackground: string;
  readonly greetingText: string;
  readonly halftone: string;
  readonly icon: string;
  /** Franja de datos: rubros, sucursales, horario y contacto. */
  readonly plate: string;
  readonly plateText: string;
  readonly rowBackground: string;
  readonly rowBorder: string;
  readonly text: string;
  readonly title: string;
  /** Fondo de marca detrás del encabezado y el titular. */
  readonly top: string;
  /** Velo que protege la cabecera cuando la foto va a sangre. */
  readonly veil: string;
  readonly watermark: string;
}

function openingPalette(theme: Theme): OpeningPalette {
  if (theme.brand === "lubricentro") {
    return Object.freeze({
      frame: COLORS.safety,
      grain: withAlpha(COLORS.white, 0.03),
      greetingBackground: COLORS.safety,
      greetingText: COLORS.graphite,
      halftone: withAlpha(COLORS.safety, 0.24),
      icon: COLORS.safety,
      plate: withAlpha(COLORS.graphite, 0.97),
      plateText: COLORS.paper,
      rowBackground: withAlpha(COLORS.white, 0.06),
      rowBorder: withAlpha(COLORS.safety, 0.34),
      text: COLORS.paper,
      title: COLORS.safety,
      top: COLORS.graphite,
      veil: COLORS.graphiteDeep,
      watermark: withAlpha(COLORS.safety, 0.06),
    });
  }

  if (theme.tone === "light") {
    return Object.freeze({
      frame: COLORS.rustDeep,
      grain: withAlpha(COLORS.ink, 0.035),
      greetingBackground: COLORS.rustDeep,
      greetingText: COLORS.white,
      halftone: withAlpha(COLORS.rust, 0.2),
      icon: COLORS.rustDeep,
      plate: COLORS.cream,
      plateText: COLORS.ink,
      rowBackground: COLORS.paper,
      rowBorder: withAlpha(COLORS.ink, 0.1),
      text: COLORS.ink,
      title: COLORS.ink,
      top: COLORS.paper,
      veil: COLORS.paper,
      watermark: withAlpha(COLORS.ink, 0.05),
    });
  }

  if (theme.id === "promo") {
    return Object.freeze({
      frame: COLORS.white,
      grain: withAlpha(COLORS.white, 0.045),
      greetingBackground: COLORS.white,
      greetingText: COLORS.rustDeep,
      halftone: withAlpha(COLORS.white, 0.2),
      icon: COLORS.white,
      plate: COLORS.rustDeep,
      plateText: COLORS.white,
      rowBackground: withAlpha(COLORS.white, 0.1),
      rowBorder: withAlpha(COLORS.white, 0.22),
      text: COLORS.white,
      title: COLORS.white,
      top: COLORS.rust,
      veil: COLORS.rustDeep,
      watermark: withAlpha(COLORS.white, 0.07),
    });
  }

  return Object.freeze({
    frame: COLORS.rust,
    grain: withAlpha(COLORS.white, 0.03),
    greetingBackground: COLORS.rustDeep,
    greetingText: COLORS.white,
    halftone: withAlpha(COLORS.rust, 0.34),
    icon: COLORS.safety,
    plate: COLORS.humo,
    plateText: COLORS.paper,
    rowBackground: withAlpha(COLORS.white, 0.06),
    rowBorder: withAlpha(COLORS.white, 0.14),
    text: COLORS.paper,
    title: COLORS.paper,
    top: COLORS.ink,
    veil: COLORS.graphiteDeep,
    watermark: withAlpha(COLORS.white, 0.05),
  });
}

interface AccentColors {
  readonly ctaBackground: string;
  readonly ctaText: string;
  readonly dot: string;
  /** Separa la etiqueta del fondo cuando el tono de ambos se parece. */
  readonly outline: string | undefined;
  readonly pillBackground: string;
  readonly pillText: string;
}

/**
 * Color de la etiqueta de estado y del botón.
 *
 * Cada par se mide contra el umbral de texto normal (4,5:1) porque en el
 * teléfono la historia se ve a un tercio de su tamaño: 30 px del lienzo son
 * 11 px en pantalla.
 */
export function openingAccentColors(
  theme: Theme,
  accent: AccentName = "marca",
): AccentColors {
  const onRed = theme.id === "promo";

  switch (accent) {
    case "senal":
      return Object.freeze({
        ctaBackground: COLORS.safety,
        ctaText: COLORS.ink,
        dot: COLORS.ink,
        outline: undefined,
        pillBackground: COLORS.safety,
        pillText: COLORS.ink,
      });
    case "verde":
      return Object.freeze({
        ctaBackground: COLORS.verde,
        ctaText: COLORS.white,
        dot: COLORS.white,
        // Verde y rojo tienen casi la misma luminancia (1,23:1): sin borde,
        // quien no distingue esos tonos pierde la etiqueta.
        outline: onRed ? COLORS.white : undefined,
        pillBackground: COLORS.verde,
        pillText: COLORS.white,
      });
    case "marca":
      if (theme.brand === "lubricentro") {
        return Object.freeze({
          ctaBackground: COLORS.safety,
          ctaText: COLORS.graphite,
          dot: COLORS.graphite,
          outline: undefined,
          pillBackground: COLORS.safety,
          pillText: COLORS.graphite,
        });
      }
      return onRed
        ? Object.freeze({
            ctaBackground: COLORS.white,
            ctaText: COLORS.rustDeep,
            dot: COLORS.safety,
            outline: undefined,
            pillBackground: COLORS.ink,
            pillText: COLORS.white,
          })
        : Object.freeze({
            ctaBackground: COLORS.rustDeep,
            ctaText: COLORS.white,
            dot: theme.tone === "light" ? COLORS.white : COLORS.safety,
            outline: undefined,
            pillBackground: COLORS.rustDeep,
            pillText: COLORS.white,
          });
  }
}

/** «Frías, Santiago del Estero» → «Frías · Santiago del Estero». */
function localityLine(context: LayoutContext): string {
  return context.brand.city
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" · ");
}

function defaultGreeting(context: LayoutContext): string {
  const [city] = context.brand.city.split(",");
  return `En ${(city ?? context.brand.city).trim()}`;
}

/**
 * Avance de Saira Condensed Black en mayúscula, en em, medido en Chromium con
 * el `letter-spacing` del titular. Un carácter sin medir cuenta como ancho.
 */
const displayAdvance: ReadonlyMap<string, number> = new Map(
  Object.entries({
    " ": 0.171,
    "!": 0.285,
    '"': 0.43,
    "&": 0.548,
    "'": 0.238,
    "(": 0.304,
    ")": 0.304,
    "+": 0.463,
    ",": 0.267,
    "-": 0.292,
    ".": 0.267,
    "/": 0.343,
    "0": 0.473,
    "1": 0.316,
    "2": 0.452,
    "3": 0.44,
    "4": 0.47,
    "5": 0.457,
    "6": 0.471,
    "7": 0.424,
    "8": 0.484,
    "9": 0.471,
    ":": 0.267,
    ";": 0.267,
    "?": 0.4,
    A: 0.507,
    B: 0.482,
    C: 0.393,
    D: 0.49,
    E: 0.416,
    F: 0.387,
    G: 0.484,
    H: 0.51,
    I: 0.25,
    J: 0.316,
    K: 0.499,
    L: 0.375,
    M: 0.713,
    N: 0.516,
    O: 0.499,
    P: 0.473,
    Q: 0.499,
    R: 0.491,
    S: 0.439,
    T: 0.423,
    U: 0.496,
    V: 0.489,
    W: 0.771,
    X: 0.511,
    Y: 0.48,
    Z: 0.443,
    "¡": 0.278,
    "¿": 0.371,
    "·": 0.267,
    "–": 0.444,
  }),
);
const unmeasuredAdvance = 0.78;

function displayWidthEm(text: string): number {
  let width = 0;
  for (const character of text.toLocaleUpperCase("es-AR")) {
    // «Á» avanza como «A» y «Ñ» como «N».
    const base = character.normalize("NFD").charAt(0);
    width += displayAdvance.get(base) ?? unmeasuredAdvance;
  }
  return width;
}

/**
 * Tamaño del titular: el más grande que entra en el ancho en `lines` líneas.
 *
 * Se parte el título por palabras de la forma más pareja posible y se mide la
 * línea más ancha. «¡Ya abrimos!» ocupa así el ancho de la zona segura, y un
 * título más largo baja de tamaño antes de salirse o partir una palabra.
 */
function headlineSize(
  title: string,
  width: number,
  lines: number,
  maximum = 190,
): number {
  const words = title.trim().split(/\s+/u);
  let widest = displayWidthEm(title);

  if (lines > 1 && words.length > 1) {
    for (let split = 1; split < words.length; split += 1) {
      widest = Math.min(
        widest,
        Math.max(
          displayWidthEm(words.slice(0, split).join(" ")),
          displayWidthEm(words.slice(split).join(" ")),
        ),
      );
    }
  }

  const fitted = Math.floor((width / Math.max(widest, 1)) * 0.98);
  return Math.max(72, Math.min(fitted, maximum));
}

/** «Casa Central · República de Siria 365» → nombre y detalle. */
function splitDetail(entry: string): readonly [string, string | undefined] {
  const separator = entry.indexOf(" · ");
  return separator < 0
    ? [entry, undefined]
    : [entry.slice(0, separator), entry.slice(separator + 3)];
}

function contentWidth(format: LayoutProps["format"]): number {
  return format.width - format.safeArea.left - format.safeArea.right;
}

function OpeningTexture({
  palette,
}: {
  readonly palette: OpeningPalette;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-opening-texture=""
      style={{ inset: 0, pointerEvents: "none", position: "absolute" }}
    >
      <div
        style={{
          backgroundImage: `repeating-linear-gradient(135deg, ${palette.grain} 0 2px, transparent 2px 11px)`,
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          backgroundImage: `radial-gradient(circle, ${palette.halftone} 0 3.5px, transparent 4px)`,
          backgroundSize: "26px 26px",
          height: 620,
          maskImage:
            "radial-gradient(circle at 100% 0%, #000 0 22%, transparent 68%)",
          position: "absolute",
          right: 0,
          top: 0,
          width: 620,
        }}
      />
    </div>
  );
}

function Watermark({
  color,
  style,
}: {
  readonly color: string;
  readonly style: CSSProperties;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-opening-watermark=""
      style={{
        color,
        pointerEvents: "none",
        position: "absolute",
        transform: "rotate(-8deg)",
        ...style,
      }}
    >
      <AramayoMark size={560} />
    </div>
  );
}

function OpeningHeader({
  context,
  greeting,
  palette,
}: {
  readonly context: LayoutContext;
  readonly greeting: string;
  readonly palette: OpeningPalette;
}): ReactElement {
  return (
    <div
      data-locality=""
      data-role="localidad"
      style={{
        alignItems: "center",
        display: "flex",
        gap: SPACING.lg,
        justifyContent: "space-between",
        position: "relative",
      }}
    >
      <div
        data-logo=""
        data-role="logo"
        style={{
          alignItems: "center",
          color: palette.text,
          display: "flex",
          gap: 18,
          minWidth: 0,
        }}
      >
        <span style={{ display: "grid", flexShrink: 0 }}>
          <AramayoMark size={brandLockupMarkSize} />
        </span>
        <span style={{ display: "grid", gap: 7 }}>
          <span
            style={{
              fontFamily: TYPOGRAPHY.display.cssStack,
              fontSize: 46,
              fontWeight: FONT_WEIGHTS.black,
              lineHeight: 0.84,
              textTransform: "uppercase",
            }}
          >
            Ferretería
            <br />
            {context.brand.shortName}
          </span>
          <span
            style={{
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 15,
              fontWeight: FONT_WEIGHTS.bold,
              letterSpacing: 1.1,
              lineHeight: 1,
              opacity: 0.86,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {localityLine(context)}
          </span>
        </span>
      </div>
      <span
        data-greeting=""
        data-locality-label=""
        style={{
          backgroundColor: palette.greetingBackground,
          borderRadius: RADII.pill,
          color: palette.greetingText,
          flexShrink: 0,
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: 27,
          fontWeight: FONT_WEIGHTS.extrabold,
          letterSpacing: 2.4,
          lineHeight: 1,
          padding: "18px 30px",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {greeting}
      </span>
    </div>
  );
}

function Headline({
  color,
  lines,
  maximum,
  title,
  width,
}: {
  readonly color: string;
  readonly lines: number;
  readonly maximum?: number | undefined;
  readonly title: string;
  readonly width: number;
}): ReactElement {
  return (
    <h1
      data-opening-headline=""
      style={{
        color,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: headlineSize(title, width, lines, maximum),
        fontWeight: FONT_WEIGHTS.black,
        letterSpacing: -1,
        // El «¡» baja de la línea: con dos líneas pisaría la siguiente.
        lineHeight: lines > 1 ? 0.96 : 0.86,
        margin: 0,
        maxWidth: width,
        textTransform: "uppercase",
      }}
    >
      {title}
    </h1>
  );
}

/** La línea chica que acompaña al titular. */
function Subline({
  children,
  color,
  style,
}: {
  readonly children: string;
  readonly color: string;
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  return (
    <p
      data-opening-subline=""
      style={{
        color,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 34,
        fontWeight: FONT_WEIGHTS.bold,
        lineHeight: 1.2,
        margin: "8px 0 0",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function OpeningPhoto({
  context,
  photo,
  radius,
  style,
  theme,
}: {
  readonly context: LayoutContext;
  readonly photo: MediaAsset | undefined;
  readonly radius: number;
  readonly style: CSSProperties;
  readonly theme: Theme;
}): ReactElement {
  if (photo !== undefined) {
    return (
      <Photo
        asset={photo}
        assetBaseUrl={context.assetBaseUrl}
        className="opening-photo"
        radius={radius}
        style={style}
      />
    );
  }

  // Sin foto declarada no se inventa una: la marca ocupa su lugar.
  return (
    <div
      data-photo-fallback=""
      style={{
        alignItems: "center",
        backgroundColor: theme.tone === "light" ? COLORS.cream : COLORS.ink,
        borderRadius: radius,
        color: theme.tone === "light" ? COLORS.rust : COLORS.paper,
        display: "grid",
        justifyItems: "center",
        overflow: "hidden",
        ...style,
      }}
    >
      <AramayoMark size={180} />
    </div>
  );
}

/** Rubros o servicios: se leen de un vistazo y no compiten con el titular. */
function FeatureGrid({
  features,
  palette,
}: {
  readonly features: readonly DesignFeature[];
  readonly palette: OpeningPalette;
}): ReactElement {
  return (
    <div
      data-opening-features=""
      style={{
        display: "grid",
        gap: 8,
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      }}
    >
      {features.slice(0, 6).map((feature) => (
        <div
          data-opening-feature=""
          key={feature.label}
          style={{
            alignItems: "center",
            backgroundColor: palette.rowBackground,
            border: `2px solid ${palette.rowBorder}`,
            borderRadius: 16,
            color: palette.plateText,
            display: "flex",
            gap: 12,
            minHeight: 60,
            padding: "6px 14px",
          }}
        >
          <span style={{ display: "grid", flexShrink: 0 }}>
            <Icon
              color={palette.icon}
              name={feature.icon}
              size={36}
              strokeWidth={2.4}
            />
          </span>
          <span
            style={{
              fontFamily: TYPOGRAPHY.body.cssStack,
              fontSize: 25,
              fontWeight: FONT_WEIGHTS.extrabold,
              lineHeight: 1.06,
              minWidth: 0,
            }}
          >
            {feature.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Tilde dibujada: el glifo ✓ no está en las fuentes de la marca. */
function CheckMark({ color }: { readonly color: string }): ReactElement {
  return (
    <svg aria-hidden="true" height={20} viewBox="0 0 24 24" width={20}>
      <path
        d="M4 12.5l5 5L20 6.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3.2}
      />
    </svg>
  );
}

/** Argumentos secundarios: una línea chica, sin recuadro. */
function Highlights({
  color,
  highlights,
}: {
  readonly color: string;
  readonly highlights: readonly string[];
}): ReactElement {
  return (
    <p
      data-opening-highlights=""
      style={{
        alignItems: "center",
        color,
        columnGap: 16,
        display: "flex",
        flexWrap: "wrap",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 23,
        fontWeight: FONT_WEIGHTS.semibold,
        lineHeight: 1.2,
        margin: 0,
        rowGap: 6,
      }}
    >
      {highlights.map((highlight) => (
        <span
          key={highlight}
          style={{
            alignItems: "center",
            display: "inline-flex",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <CheckMark color={color} />
          {highlight}
        </span>
      ))}
    </p>
  );
}

function DetailRow({
  entry,
  icon,
  palette,
}: {
  readonly entry: string;
  readonly icon: IconName;
  readonly palette: OpeningPalette;
}): ReactElement {
  const [name, detail] = splitDetail(entry);

  return (
    <div
      data-opening-detail=""
      style={{
        alignItems: "center",
        color: palette.plateText,
        display: "flex",
        gap: 16,
      }}
    >
      <span style={{ display: "grid", flexShrink: 0 }}>
        <Icon color={palette.icon} name={icon} size={32} strokeWidth={2.6} />
      </span>
      <span
        style={{
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: 27,
          fontWeight: FONT_WEIGHTS.semibold,
          lineHeight: 1.16,
          minWidth: 0,
        }}
      >
        {detail === undefined ? (
          entry
        ) : (
          <>
            <strong style={{ fontWeight: FONT_WEIGHTS.extrabold }}>
              {name}
            </strong>
            {` · ${detail}`}
          </>
        )}
      </span>
    </div>
  );
}

/** Sucursales y horario: la información práctica, en chico. */
function PracticalInfo({
  items,
  palette,
  validity,
}: {
  readonly items: readonly string[];
  readonly palette: OpeningPalette;
  readonly validity: string | undefined;
}): ReactElement {
  return (
    <div data-opening-info="" style={{ display: "grid", gap: 6 }}>
      {items.slice(0, 3).map((entry) => (
        <DetailRow
          entry={entry}
          icon={validity === undefined ? "reloj" : "ubicacion"}
          key={entry}
          palette={palette}
        />
      ))}
      {validity === undefined ? null : (
        <DetailRow entry={validity} icon="reloj" palette={palette} />
      )}
    </div>
  );
}

/**
 * Botón de contacto en dos líneas: la pregunta que trae el cliente y el número
 * al que escribir.
 */
function ContactBar({
  accent,
  callToAction,
  phone,
}: {
  readonly accent: AccentColors;
  readonly callToAction: string | undefined;
  readonly phone: string;
}): ReactElement {
  return (
    <div
      data-cta=""
      data-role="cta"
      style={{
        backgroundColor: accent.ctaBackground,
        borderRadius: 20,
        color: accent.ctaText,
        display: "grid",
        fontFamily: TYPOGRAPHY.display.cssStack,
        gap: 6,
        padding: "12px 32px 14px",
        textTransform: "uppercase",
      }}
    >
      {callToAction === undefined ? null : (
        <span
          style={{
            fontSize: 42,
            fontWeight: FONT_WEIGHTS.extrabold,
            lineHeight: 0.95,
          }}
        >
          {callToAction}
        </span>
      )}
      {phone.length === 0 ? null : (
        <span
          data-opening-phone=""
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 68,
            fontWeight: FONT_WEIGHTS.black,
            gap: 16,
            lineHeight: 0.9,
            whiteSpace: "nowrap",
          }}
        >
          <Icon
            color={accent.ctaText}
            name="telefono"
            size={50}
            strokeWidth={2.8}
          />
          {phone}
        </span>
      )}
    </div>
  );
}

/** Franja de datos que llega hasta el borde inferior del lienzo. */
function Plate({
  children,
  format,
  palette,
  style,
}: {
  readonly children: ReactNode;
  readonly format: LayoutProps["format"];
  readonly palette: OpeningPalette;
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  const { bottom, left, right } = format.safeArea;

  return (
    <div
      data-opening-plate=""
      data-panel=""
      style={{
        backgroundColor: palette.plate,
        color: palette.plateText,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        margin: `0 -${String(right)}px -${String(bottom)}px -${String(left)}px`,
        padding: `22px ${String(right)}px ${String(bottom)}px ${String(left)}px`,
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * «Ya abrimos»: la plantilla estable de la apertura.
 *
 * Arriba la marca, el saludo, el titular y una línea chica; al medio la foto de
 * lado a lado con el borde ondulado del cartel; abajo, sobre la franja
 * profunda, los rubros, los argumentos secundarios, las sucursales con el
 * horario y el botón de contacto.
 */
export function HistoriaAperturaCartel(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);
  const { left, right } = format.safeArea;
  const features = content.features ?? [];
  const highlights = content.highlights ?? [];

  return (
    <>
      <OpeningTexture palette={palette} />
      <SafeArea format={format}>
        <OpeningHeader
          context={context}
          greeting={content.greeting ?? defaultGreeting(context)}
          palette={palette}
        />
        <div style={{ marginTop: 12 }}>
          <Headline
            color={palette.title}
            lines={1}
            title={content.title}
            width={contentWidth(format)}
          />
        </div>
        {content.subtitle === undefined ? null : (
          // El «¡» del titular baja de la línea: la bajada le deja lugar.
          <Subline color={palette.text} style={{ marginTop: 20 }}>
            {content.subtitle}
          </Subline>
        )}
        <div
          data-opening-photo-band=""
          style={{
            flex: "1 1 auto",
            margin: `20px -${String(right)}px 0 -${String(left)}px`,
            minHeight: 260,
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
          <svg
            aria-hidden="true"
            height={40}
            preserveAspectRatio="none"
            style={{ left: 0, position: "absolute", top: -1 }}
            viewBox="0 0 1080 40"
            width={format.width}
          >
            <path
              d="M0 0H1080V14C918 37 742 7 548 19C352 31 190 39 0 17Z"
              fill={palette.top}
            />
          </svg>
        </div>
        <Plate format={format} palette={palette} style={{ gap: 12 }}>
          <Watermark
            color={palette.watermark}
            style={{ bottom: -250, right: -150 }}
          />
          {features.length === 0 ? null : (
            <FeatureGrid features={features} palette={palette} />
          )}
          {highlights.length === 0 ? null : (
            <Highlights color={palette.plateText} highlights={highlights} />
          )}
          <PracticalInfo
            items={content.items ?? []}
            palette={palette}
            validity={content.validity}
          />
          <ContactBar
            accent={accent}
            callToAction={content.callToAction}
            phone={context.brand.phone}
          />
        </Plate>
      </SafeArea>
    </>
  );
}

/**
 * Las composiciones «horario» y «locales» se unificaron en la plantilla estable
 * (`ADR-030`). Sus identificadores siguen registrados para que un borrador que
 * nació con ellos se siga componiendo, ahora con la jerarquía nueva.
 */
export const HistoriaAperturaHorario = HistoriaAperturaCartel;
export const HistoriaAperturaLocales = HistoriaAperturaCartel;

/**
 * Imagen propia publicada tal cual.
 *
 * Quien opera la armó afuera y la subió: el motor no le agrega marca, texto ni
 * marco, y el borrador que la usa siempre pasa por aprobación humana porque el
 * sistema no puede leer lo que la imagen afirma.
 */
export function HistoriaAperturaImagen(props: LayoutProps): ReactElement {
  const { context, document, theme } = props;

  return (
    <div data-opening-own-image="" style={{ inset: 0, position: "absolute" }}>
      <OpeningPhoto
        context={context}
        photo={mediaAt(document, 0)}
        radius={0}
        style={{ height: "100%", width: "100%" }}
        theme={theme}
      />
    </div>
  );
}

/** Franja de seguridad: la del borde de la fosa, en amarillo y grafito. */
function SafetyStripe({
  style,
}: {
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-safety-stripe=""
      style={{
        background: `repeating-linear-gradient(135deg, ${COLORS.safety} 0 26px, ${COLORS.graphite} 26px 52px)`,
        height: 18,
        left: 0,
        position: "absolute",
        right: 0,
        top: -18,
        ...style,
      }}
    />
  );
}

/** Borde ondulado del cartel, ahora como remate de la placa de datos. */
function PlateWave({ color }: { readonly color: string }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      data-plate-wave=""
      height={40}
      preserveAspectRatio="none"
      style={{ left: 0, position: "absolute", top: -39 }}
      viewBox="0 0 1080 40"
      width="100%"
    >
      <path
        d="M0 40V21C190 2 352 10 548 22C742 34 918 3 1080 19V40Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * El remate de la placa según la marca: la franja de la fosa en el lubricentro
 * y la onda del cartel en la ferretería.
 */
function PlateEdge({
  palette,
  theme,
}: {
  readonly palette: OpeningPalette;
  readonly theme: Theme;
}): ReactElement {
  return theme.brand === "lubricentro" ? (
    <SafetyStripe />
  ) : (
    <PlateWave color={palette.plate} />
  );
}

/**
 * Hasta dónde llega el tramo denso del velo: un poco más abajo que la bajada de
 * cada cabecera. Después se desvanece en `frameVeilFade`, para oscurecer lo
 * mínimo de la foto.
 */
const frameVeilDense = Object.freeze({ lubricentro: 556, store: 586 });
const frameVeilFade = 130;

function TopVeil({
  palette,
  theme,
}: {
  readonly palette: OpeningPalette;
  readonly theme: Theme;
}): ReactElement {
  const dense =
    theme.brand === "lubricentro"
      ? frameVeilDense.lubricentro
      : frameVeilDense.store;
  const ink = palette.veil;

  return (
    <div
      aria-hidden="true"
      data-frame-veil=""
      style={{
        background: `linear-gradient(180deg, ${withAlpha(ink, 0.94)} 0, ${withAlpha(ink, VEIL_DENSE_OPACITY)} ${String(dense)}px, ${withAlpha(ink, 0)} ${String(dense + frameVeilFade)}px)`,
        height: dense + frameVeilFade,
        left: 0,
        pointerEvents: "none",
        position: "absolute",
        right: 0,
        top: 0,
      }}
    />
  );
}

/** El filete de color, adelante de la foto a sangre. */
function FrameBorder({
  palette,
}: {
  readonly palette: OpeningPalette;
}): ReactElement {
  return (
    <div
      aria-hidden="true"
      data-frame-border=""
      style={{
        border: `8px solid ${palette.frame}`,
        borderRadius: 28,
        inset: 26,
        pointerEvents: "none",
        position: "absolute",
      }}
    />
  );
}

interface FrameBlockProps {
  readonly content: LayoutProps["content"];
  readonly palette: OpeningPalette;
}

/**
 * Cabecera de todos los marcos: el cartel del frente en el lubricentro, y la
 * marca con el saludo en la ferretería; debajo, el titular y la bajada.
 */
function FrameHeader({
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
  const lubricentro = theme.brand === "lubricentro";

  return (
    <>
      {lubricentro ? (
        <div style={{ height: CARTEL_HEIGHT, position: "relative" }}>
          <Cartel context={context} style={{ left: 0, top: 0 }} theme={theme} />
        </div>
      ) : (
        <OpeningHeader
          context={context}
          greeting={content.greeting ?? defaultGreeting(context)}
          palette={palette}
        />
      )}
      <div style={{ marginTop: lubricentro ? 26 : 12 }}>
        <Headline
          color={palette.title}
          lines={1}
          maximum={lubricentro ? 150 : undefined}
          title={content.title}
          width={contentWidth(format)}
        />
      </div>
      {content.subtitle === undefined ? null : (
        // El «¡» o el «¿» del titular bajan de la línea: la bajada les deja lugar.
        <Subline color={palette.text} style={{ marginTop: 20 }}>
          {content.subtitle}
        </Subline>
      )}
    </>
  );
}

/** Rubros o servicios, argumentos y datos prácticos, a lo ancho. */
function FrameDetails({ content, palette }: FrameBlockProps): ReactElement {
  const features = content.features ?? [];
  const highlights = content.highlights ?? [];

  return (
    <>
      {features.length === 0 ? null : (
        <FeatureGrid features={features} palette={palette} />
      )}
      {highlights.length === 0 ? null : (
        <Highlights color={palette.plateText} highlights={highlights} />
      )}
      <PracticalInfo
        items={content.items ?? []}
        palette={palette}
        validity={content.validity}
      />
    </>
  );
}

/**
 * Marco «placa»: la foto a sangre con la cabecera arriba y los datos en una
 * placa abajo. Sirve cuando lo importante de la foto está arriba o al medio.
 */
export function HistoriaMarcoPlaca(props: LayoutProps): ReactElement {
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
        <FrameHeader
          content={content}
          context={context}
          format={format}
          palette={palette}
          theme={theme}
        />
        <div style={{ flex: "1 1 auto", minHeight: 160 }} />
        <Plate
          format={format}
          palette={palette}
          style={{ gap: 12, paddingTop: 30 }}
        >
          <PlateEdge palette={palette} theme={theme} />
          <FrameDetails content={content} palette={palette} />
          <ContactBar
            accent={accent}
            callToAction={content.callToAction}
            phone={context.brand.phone}
          />
        </Plate>
      </SafeArea>
    </>
  );
}

/** «Lun a sáb · 08:30 a 13:00 / 16:30 a 20:30» en renglones cortos. */
function HoursLines({
  palette,
  validity,
}: {
  readonly palette: OpeningPalette;
  readonly validity: string;
}): ReactElement {
  const [days, ranges] = splitDetail(validity);

  return (
    <div
      data-opening-detail=""
      style={{ alignItems: "flex-start", display: "flex", gap: 12 }}
    >
      <span style={{ display: "grid", flexShrink: 0, paddingTop: 2 }}>
        <Icon color={palette.icon} name="reloj" size={30} strokeWidth={2.6} />
      </span>
      <span
        style={{
          display: "grid",
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: 24,
          fontWeight: FONT_WEIGHTS.semibold,
          lineHeight: 1.18,
          minWidth: 0,
        }}
      >
        {ranges === undefined ? (
          validity
        ) : (
          <>
            <strong style={{ fontWeight: FONT_WEIGHTS.extrabold }}>
              {days}
            </strong>
            {ranges.split(" / ").map((range) => (
              <span key={range}>{range}</span>
            ))}
          </>
        )}
      </span>
    </div>
  );
}

/** Sucursal en dos renglones: el nombre y, debajo, la calle. */
function PlaceLines({
  entry,
  palette,
}: {
  readonly entry: string;
  readonly palette: OpeningPalette;
}): ReactElement {
  const [name, detail] = splitDetail(entry);

  return (
    <div
      data-opening-detail=""
      style={{ alignItems: "flex-start", display: "flex", gap: 12 }}
    >
      <span style={{ display: "grid", flexShrink: 0, paddingTop: 2 }}>
        <Icon
          color={palette.icon}
          name="ubicacion"
          size={30}
          strokeWidth={2.6}
        />
      </span>
      <span
        style={{
          display: "grid",
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: 24,
          fontWeight: FONT_WEIGHTS.semibold,
          lineHeight: 1.18,
          minWidth: 0,
        }}
      >
        {detail === undefined ? (
          entry
        ) : (
          <>
            <strong style={{ fontWeight: FONT_WEIGHTS.extrabold }}>
              {name}
            </strong>
            <span>{detail}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Botón angosto: la acción arriba y el número abajo, sin ícono. */
function StackedContact({
  accent,
  callToAction,
  phone,
}: {
  readonly accent: AccentColors;
  readonly callToAction: string | undefined;
  readonly phone: string;
}): ReactElement {
  return (
    <div
      data-cta=""
      data-role="cta"
      style={{
        backgroundColor: accent.ctaBackground,
        color: accent.ctaText,
        display: "grid",
        fontFamily: TYPOGRAPHY.display.cssStack,
        gap: 4,
        padding: "16px 20px 18px",
        textTransform: "uppercase",
      }}
    >
      {callToAction === undefined ? null : (
        <span
          style={{
            fontSize: 34,
            fontWeight: FONT_WEIGHTS.extrabold,
            lineHeight: 0.95,
          }}
        >
          {callToAction}
        </span>
      )}
      {phone.length === 0 ? null : (
        <span
          data-opening-phone=""
          style={{
            fontSize: 46,
            fontWeight: FONT_WEIGHTS.black,
            lineHeight: 0.9,
            whiteSpace: "nowrap",
          }}
        >
          {phone}
        </span>
      )}
    </div>
  );
}

/**
 * Ancho de la tarjeta de la esquina. Con pocos servicios alcanza una columna
 * angosta; los seis rubros de la ferretería necesitan una más ancha para no
 * partir sus nombres.
 */
function cornerCardWidth(content: LayoutProps["content"]): number {
  return (content.features?.length ?? 0) > 3 ? 400 : 272;
}

/** Tarjeta con todos los datos, colgada debajo de la cabecera. */
function CornerCard({
  accent,
  content,
  context,
  palette,
  theme,
}: FrameBlockProps & {
  readonly accent: AccentColors;
  readonly context: LayoutContext;
  readonly theme: Theme;
}): ReactElement {
  const features = content.features ?? [];
  const highlights = content.highlights ?? [];
  const lubricentro = theme.brand === "lubricentro";

  return (
    <aside
      data-frame-card=""
      data-panel=""
      style={{
        alignSelf: "flex-end",
        backgroundColor: palette.plate,
        borderRadius: 22,
        boxShadow: liftShadow,
        color: palette.plateText,
        display: "flex",
        flexDirection: "column",
        marginTop: 24,
        overflow: "hidden",
        position: "relative",
        width: cornerCardWidth(content),
      }}
    >
      {lubricentro ? <SafetyStripe style={{ top: 0 }} /> : null}
      <div
        style={{
          display: "grid",
          gap: 16,
          padding: `${lubricentro ? "34px" : "24px"} 20px 20px`,
        }}
      >
        {features.length === 0 ? null : (
          <div data-opening-features="" style={{ display: "grid", gap: 10 }}>
            {features.map((feature) => (
              <div
                data-opening-feature=""
                key={feature.label}
                style={{ alignItems: "center", display: "flex", gap: 12 }}
              >
                <span style={{ display: "grid", flexShrink: 0 }}>
                  <Icon
                    color={palette.icon}
                    name={feature.icon}
                    size={32}
                    strokeWidth={2.4}
                  />
                </span>
                <span
                  style={{
                    fontFamily: TYPOGRAPHY.body.cssStack,
                    fontSize: 25,
                    fontWeight: FONT_WEIGHTS.extrabold,
                    lineHeight: 1.06,
                    minWidth: 0,
                  }}
                >
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        )}
        {highlights.length === 0 ? null : (
          <Highlights color={palette.plateText} highlights={highlights} />
        )}
        {(content.items ?? []).slice(0, 3).map((entry) => (
          <PlaceLines entry={entry} key={entry} palette={palette} />
        ))}
        {content.validity === undefined ? null : (
          <HoursLines palette={palette} validity={content.validity} />
        )}
      </div>
      <StackedContact
        accent={accent}
        callToAction={content.callToAction}
        phone={context.brand.phone}
      />
    </aside>
  );
}

/**
 * Marco «esquina»: la foto a sangre, la cabecera arriba y todos los datos en
 * una tarjeta arriba a la derecha. Deja libres la mitad izquierda y el pie,
 * para una foto con lo importante abajo a la izquierda.
 */
export function HistoriaMarcoEsquina(props: LayoutProps): ReactElement {
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
        <FrameHeader
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
        />
      </SafeArea>
    </>
  );
}

/**
 * Marco «ventana»: la foto enmarcada sobre el fondo de marca, con la cabecera
 * arriba y los datos abajo. Nada se apoya sobre la foto, así que sirve para
 * cualquier imagen.
 */
export function HistoriaMarcoVentana(props: LayoutProps): ReactElement {
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
        <FrameHeader
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
            marginTop: 28,
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
          style={{ display: "grid", gap: 12, marginTop: 24 }}
        >
          <FrameDetails content={content} palette={palette} />
          <ContactBar
            accent={accent}
            callToAction={content.callToAction}
            phone={context.brand.phone}
          />
        </div>
      </SafeArea>
    </>
  );
}
