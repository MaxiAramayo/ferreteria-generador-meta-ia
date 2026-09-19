import type { CSSProperties, ReactElement, ReactNode } from "react";

import type { MediaAsset } from "../contracts/document.ts";
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
import {
  mediaAt,
  type LayoutContext,
  type LayoutProps,
} from "./layout-context.ts";

/**
 * Historias de apertura (`ADR-030`).
 *
 * Las tres composiciones comparten la voz del cartel del local: fondo de marca,
 * titular condensado enorme, una foto real y una franja de datos con horario,
 * sucursales y contacto. Cambia dónde vive la foto y qué dato manda:
 *
 * - `cartel`: la foto cruza la historia de lado a lado, como en la vidriera;
 * - `horario`: la foto es la esfera de un reloj y el horario, el protagonista;
 * - `locales`: la foto va pegada como una copia impresa y cada sucursal tiene
 *   su chapa.
 *
 * Todo texto con datos se apoya en la franja profunda del tema y nunca sobre la
 * foto: el blanco sobre el rojo de marca mide 4,19:1 y sobre el rojo profundo,
 * 6,31:1. La foto no dibuja ningún dato, así que una imagen cualquiera no puede
 * contradecir el horario.
 *
 * `imagen` es la excepción deliberada: publica tal cual la imagen que subió
 * quien opera. No compone texto; por eso su borrador siempre pide aprobación.
 */

const brandLockupMarkSize = 84;
const photoFrameTicks = 12;

interface OpeningPalette {
  readonly grain: string;
  readonly greetingBackground: string;
  readonly greetingText: string;
  readonly halftone: string;
  readonly icon: string;
  /** Franja de datos: horario, sucursales y contacto. */
  readonly plate: string;
  readonly plateText: string;
  readonly plateTextSoft: string;
  readonly rowBackground: string;
  readonly rowBorder: string;
  readonly text: string;
  /** Fondo de marca detrás del encabezado y el titular. */
  readonly top: string;
  readonly watermark: string;
}

function openingPalette(theme: Theme): OpeningPalette {
  if (theme.tone === "light") {
    return Object.freeze({
      grain: withAlpha(COLORS.ink, 0.035),
      greetingBackground: COLORS.rustDeep,
      greetingText: COLORS.white,
      halftone: withAlpha(COLORS.rust, 0.2),
      icon: COLORS.rustDeep,
      plate: COLORS.cream,
      plateText: COLORS.ink,
      plateTextSoft: withAlpha(COLORS.ink, 0.8),
      rowBackground: COLORS.paper,
      rowBorder: withAlpha(COLORS.ink, 0.1),
      text: COLORS.ink,
      top: COLORS.paper,
      watermark: withAlpha(COLORS.ink, 0.05),
    });
  }

  if (theme.id === "promo") {
    return Object.freeze({
      grain: withAlpha(COLORS.white, 0.045),
      greetingBackground: COLORS.white,
      greetingText: COLORS.rustDeep,
      halftone: withAlpha(COLORS.white, 0.2),
      icon: COLORS.white,
      plate: COLORS.rustDeep,
      plateText: COLORS.white,
      plateTextSoft: withAlpha(COLORS.white, 0.9),
      rowBackground: withAlpha(COLORS.white, 0.1),
      rowBorder: withAlpha(COLORS.white, 0.22),
      text: COLORS.white,
      top: COLORS.rust,
      watermark: withAlpha(COLORS.white, 0.07),
    });
  }

  return Object.freeze({
    grain: withAlpha(COLORS.white, 0.03),
    greetingBackground: COLORS.rustDeep,
    greetingText: COLORS.white,
    halftone: withAlpha(COLORS.rust, 0.34),
    icon: COLORS.safety,
    plate: COLORS.humo,
    plateText: COLORS.paper,
    plateTextSoft: withAlpha(COLORS.paper, 0.86),
    rowBackground: withAlpha(COLORS.white, 0.06),
    rowBorder: withAlpha(COLORS.white, 0.14),
    text: COLORS.paper,
    top: COLORS.ink,
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
function headlineSize(title: string, width: number, lines: number): number {
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
  return Math.max(72, Math.min(fitted, 190));
}

/** «Casa Central · República de Siria 365» → nombre y detalle. */
function splitDetail(entry: string): readonly [string, string | undefined] {
  const separator = entry.indexOf(" · ");
  return separator < 0
    ? [entry, undefined]
    : [entry.slice(0, separator), entry.slice(separator + 3)];
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

function StatusPill({
  accent,
  children,
  style,
}: {
  readonly accent: AccentColors;
  readonly children: ReactNode;
  readonly style?: CSSProperties | undefined;
}): ReactElement {
  return (
    <span
      data-opening-status=""
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: accent.pillBackground,
        justifySelf: "start",
        border:
          accent.outline === undefined
            ? undefined
            : `4px solid ${accent.outline}`,
        borderRadius: RADII.pill,
        color: accent.pillText,
        display: "inline-flex",
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 31,
        fontWeight: FONT_WEIGHTS.extrabold,
        gap: 16,
        letterSpacing: 3,
        lineHeight: 1,
        padding: "17px 34px 17px 28px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          backgroundColor: accent.dot,
          borderRadius: RADII.pill,
          display: "block",
          flexShrink: 0,
          height: 16,
          width: 16,
        }}
      />
      {children}
    </span>
  );
}

function Headline({
  align = "left",
  color,
  lines,
  title,
  width,
}: {
  readonly align?: "center" | "left";
  readonly color: string;
  readonly lines: number;
  readonly title: string;
  readonly width: number;
}): ReactElement {
  return (
    <h1
      data-opening-headline=""
      style={{
        color,
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: headlineSize(title, width, lines),
        fontWeight: FONT_WEIGHTS.black,
        letterSpacing: -1,
        // El «¡» baja de la línea: con dos líneas pisaría la siguiente.
        lineHeight: lines > 1 ? 0.96 : 0.86,
        margin: 0,
        maxWidth: width,
        textAlign: align,
        textTransform: "uppercase",
      }}
    >
      {title}
    </h1>
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

function DetailRow({
  boxed,
  entry,
  icon,
  palette,
}: {
  readonly boxed: boolean;
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
        backgroundColor: boxed ? palette.rowBackground : undefined,
        border: boxed ? `2px solid ${palette.rowBorder}` : undefined,
        borderRadius: 18,
        color: palette.plateText,
        display: "flex",
        gap: 20,
        minHeight: boxed ? 84 : undefined,
        padding: boxed ? "14px 28px" : "0 4px",
      }}
    >
      <span style={{ display: "grid", flexShrink: 0 }}>
        <Icon color={palette.icon} name={icon} size={40} strokeWidth={2.6} />
      </span>
      <span
        style={{
          fontFamily: TYPOGRAPHY.body.cssStack,
          fontSize: boxed ? 32 : 30,
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
        alignItems: "center",
        backgroundColor: accent.ctaBackground,
        borderRadius: 20,
        color: accent.ctaText,
        display: "flex",
        fontFamily: TYPOGRAPHY.display.cssStack,
        fontSize: 54,
        fontWeight: FONT_WEIGHTS.extrabold,
        gap: SPACING.lg,
        justifyContent:
          phone.length === 0 || callToAction === undefined
            ? "center"
            : "space-between",
        lineHeight: 0.95,
        minHeight: 108,
        padding: "16px 38px",
        textTransform: "uppercase",
      }}
    >
      {callToAction === undefined ? null : (
        <span style={{ minWidth: 0 }}>{callToAction}</span>
      )}
      {phone.length === 0 ? null : (
        <span
          data-opening-phone=""
          style={{
            alignItems: "center",
            display: "flex",
            flexShrink: 0,
            gap: 14,
            whiteSpace: "nowrap",
          }}
        >
          <Icon
            color={accent.ctaText}
            name="telefono"
            size={44}
            strokeWidth={2.8}
          />
          {phone}
        </span>
      )}
    </div>
  );
}

/** Franja profunda que llega hasta el borde inferior del lienzo. */
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
        gap: SPACING.md,
        margin: `0 -${String(right)}px -${String(bottom)}px -${String(left)}px`,
        padding: `34px ${String(right)}px ${String(bottom)}px ${String(left)}px`,
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Message({
  children,
  color,
}: {
  readonly children: string;
  readonly color: string;
}): ReactElement {
  return (
    <p
      data-opening-message=""
      style={{
        color,
        fontFamily: TYPOGRAPHY.body.cssStack,
        fontSize: 37,
        fontWeight: FONT_WEIGHTS.semibold,
        lineHeight: 1.22,
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

function contentWidth(format: LayoutProps["format"]): number {
  return format.width - format.safeArea.left - format.safeArea.right;
}

/**
 * Apertura como cartel del local: la foto atraviesa la historia entre el
 * titular y la franja de datos, con el borde superior ondulado del cartel.
 */
export function HistoriaAperturaCartel(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);
  const { left, right } = format.safeArea;

  return (
    <>
      <OpeningTexture palette={palette} />
      <SafeArea format={format}>
        <OpeningHeader
          context={context}
          greeting={content.greeting ?? defaultGreeting(context)}
          palette={palette}
        />
        <StatusPill accent={accent} style={{ marginTop: 40 }}>
          {content.badge ?? "Abierto hoy"}
        </StatusPill>
        <div style={{ marginTop: 22 }}>
          <Headline
            color={palette.text}
            lines={1}
            title={content.title}
            width={contentWidth(format)}
          />
        </div>
        <div
          data-opening-photo-band=""
          style={{
            flex: "1 1 auto",
            margin: `36px -${String(right)}px 0 -${String(left)}px`,
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
            height={84}
            preserveAspectRatio="none"
            style={{ left: 0, position: "absolute", top: -1 }}
            viewBox="0 0 1080 84"
            width={format.width}
          >
            <path
              d="M0 0H1080V30C918 78 742 14 548 40C352 66 190 82 0 36Z"
              fill={palette.top}
            />
          </svg>
        </div>
        <Plate format={format} palette={palette}>
          <Watermark
            color={palette.watermark}
            style={{ bottom: -250, right: -150 }}
          />
          {content.subtitle === undefined ? null : (
            <Message color={palette.plateText}>{content.subtitle}</Message>
          )}
          <div style={{ display: "grid", gap: 12, marginTop: 6 }}>
            {(content.items ?? []).slice(0, 3).map((entry) => (
              <DetailRow
                boxed
                entry={entry}
                icon="ubicacion"
                key={entry}
                palette={palette}
              />
            ))}
          </div>
          {content.validity === undefined ? null : (
            <DetailRow
              boxed={false}
              entry={content.validity}
              icon="reloj"
              palette={palette}
            />
          )}
          <div style={{ marginTop: 6 }}>
            <ContactBar
              accent={accent}
              callToAction={content.callToAction}
              phone={context.brand.phone}
            />
          </div>
        </Plate>
      </SafeArea>
    </>
  );
}

/**
 * Apertura con el horario como protagonista: la foto es la esfera de un reloj
 * y el horario del día ocupa una ficha grande antes de las sucursales.
 */
export function HistoriaAperturaHorario(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);
  const dial = 600;
  const photoDiameter = 500;
  const items = (content.items ?? []).slice(0, 3);
  const hours = content.validity;

  return (
    <>
      <OpeningTexture palette={palette} />
      <Watermark
        color={palette.watermark}
        style={{ bottom: -210, left: -170 }}
      />
      <SafeArea format={format}>
        <OpeningHeader
          context={context}
          greeting={content.greeting ?? defaultGreeting(context)}
          palette={palette}
        />
        <div
          data-opening-dial=""
          style={{
            alignSelf: "center",
            height: dial,
            marginTop: 30,
            position: "relative",
            width: dial,
          }}
        >
          <svg
            aria-hidden="true"
            height={dial}
            style={{ inset: 0, position: "absolute" }}
            viewBox={`0 0 ${String(dial)} ${String(dial)}`}
            width={dial}
          >
            {Array.from({ length: photoFrameTicks }, (_, index) => {
              const major = index % 3 === 0;
              return (
                <rect
                  fill={palette.text}
                  height={major ? 34 : 22}
                  key={index}
                  rx={4}
                  transform={`rotate(${String(index * 30)} ${String(dial / 2)} ${String(dial / 2)})`}
                  width={major ? 10 : 7}
                  x={dial / 2 - (major ? 5 : 3.5)}
                  y={major ? 4 : 10}
                />
              );
            })}
          </svg>
          <OpeningPhoto
            context={context}
            photo={mediaAt(document, 0)}
            radius={RADII.pill}
            style={{
              border: `10px solid ${palette.text}`,
              height: photoDiameter,
              left: (dial - photoDiameter) / 2,
              position: "absolute",
              top: (dial - photoDiameter) / 2,
              width: photoDiameter,
            }}
            theme={theme}
          />
          <StatusPill
            accent={accent}
            style={{
              bottom: 2,
              left: "50%",
              position: "absolute",
              transform: "translateX(-50%)",
            }}
          >
            {content.badge ?? "Abierto hoy"}
          </StatusPill>
        </div>
        <div style={{ marginTop: 34 }}>
          <Headline
            align="center"
            color={palette.text}
            lines={1}
            title={content.title}
            width={contentWidth(format)}
          />
        </div>
        <div
          data-opening-ticket=""
          data-panel=""
          style={{
            backgroundColor: palette.plate,
            borderRadius: RADII.card,
            color: palette.plateText,
            display: "grid",
            gap: 18,
            marginTop: "auto",
            padding: "30px 34px",
          }}
        >
          {hours === undefined ? null : (
            <div
              data-opening-hours=""
              style={{ alignItems: "center", display: "flex", gap: 24 }}
            >
              <span style={{ display: "grid", flexShrink: 0 }}>
                <Icon
                  color={palette.icon}
                  name="reloj"
                  size={76}
                  strokeWidth={2.4}
                />
              </span>
              <span
                style={{
                  fontFamily: TYPOGRAPHY.display.cssStack,
                  fontSize: hours.length <= 32 ? 62 : 50,
                  fontWeight: FONT_WEIGHTS.extrabold,
                  lineHeight: 0.98,
                  textTransform: "uppercase",
                }}
              >
                {hours}
              </span>
            </div>
          )}
          {hours === undefined || items.length === 0 ? null : (
            <div
              aria-hidden="true"
              style={{
                borderTop: `2px dashed ${palette.rowBorder}`,
                height: 0,
              }}
            />
          )}
          {items.map((entry) => (
            <DetailRow
              boxed={false}
              entry={entry}
              icon={hours === undefined ? "reloj" : "ubicacion"}
              key={entry}
              palette={palette}
            />
          ))}
        </div>
        <div style={{ marginTop: 22 }}>
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

/**
 * Apertura con las sucursales en foco: la foto va pegada como una copia impresa
 * junto al titular y cada sucursal se lee en su propia chapa.
 */
export function HistoriaAperturaLocales(props: LayoutProps): ReactElement {
  const { content, context, document, format, theme } = props;
  const palette = openingPalette(theme);
  const accent = openingAccentColors(theme, content.accent);
  const printWidth = 396;
  // La copia va girada: su esquina inferior izquierda avanza sobre el titular.
  const headlineWidth = contentWidth(format) - printWidth - 44;

  return (
    <>
      <OpeningTexture palette={palette} />
      <SafeArea format={format}>
        <OpeningHeader
          context={context}
          greeting={content.greeting ?? defaultGreeting(context)}
          palette={palette}
        />
        <div
          style={{
            alignItems: "flex-start",
            display: "flex",
            justifyContent: "space-between",
            marginTop: 40,
            minHeight: 500,
            position: "relative",
          }}
        >
          <div style={{ display: "grid", gap: 26, maxWidth: headlineWidth }}>
            <StatusPill accent={accent}>
              {content.badge ?? "Abierto hoy"}
            </StatusPill>
            <Headline
              color={palette.text}
              lines={2}
              title={content.title}
              width={headlineWidth}
            />
          </div>
          <div
            data-opening-print=""
            style={{
              backgroundColor: COLORS.white,
              borderRadius: 6,
              boxShadow: `0 26px 40px ${withAlpha(COLORS.graphiteDeep, 0.34)}`,
              flexShrink: 0,
              padding: "16px 16px 62px",
              position: "relative",
              transform: "rotate(4deg)",
              width: printWidth,
            }}
          >
            <OpeningPhoto
              context={context}
              photo={mediaAt(document, 0)}
              radius={2}
              style={{ height: 430, width: "100%" }}
              theme={theme}
            />
            <span
              aria-hidden="true"
              style={{
                backgroundColor: withAlpha(COLORS.safety, 0.74),
                height: 44,
                left: "50%",
                position: "absolute",
                top: -20,
                transform: "translateX(-50%) rotate(-3deg)",
                width: 150,
              }}
            />
          </div>
        </div>
        <Plate format={format} palette={palette} style={{ marginTop: "auto" }}>
          <Watermark
            color={palette.watermark}
            style={{ bottom: -250, right: -150 }}
          />
          {content.subtitle === undefined ? null : (
            <Message color={palette.plateText}>{content.subtitle}</Message>
          )}
          <div style={{ display: "grid", gap: 14, marginTop: 4 }}>
            {(content.items ?? []).slice(0, 3).map((entry, index) => {
              const [name, detail] = splitDetail(entry);
              return (
                <div
                  data-opening-branch=""
                  key={entry}
                  style={{
                    alignItems: "center",
                    backgroundColor: COLORS.paper,
                    borderRadius: 18,
                    color: COLORS.ink,
                    display: "grid",
                    gap: 24,
                    gridTemplateColumns: "92px minmax(0, 1fr)",
                    padding: "20px 28px 20px 20px",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      alignItems: "center",
                      backgroundColor: COLORS.rustDeep,
                      borderRadius: 14,
                      color: COLORS.white,
                      display: "flex",
                      fontFamily: TYPOGRAPHY.display.cssStack,
                      fontSize: 50,
                      fontWeight: FONT_WEIGHTS.black,
                      height: 92,
                      justifyContent: "center",
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: TYPOGRAPHY.display.cssStack,
                        fontSize: 44,
                        fontWeight: FONT_WEIGHTS.extrabold,
                        lineHeight: 0.95,
                        textTransform: "uppercase",
                      }}
                    >
                      {name}
                    </span>
                    {detail === undefined ? null : (
                      <span
                        style={{
                          color: COLORS.inkSoft,
                          fontFamily: TYPOGRAPHY.body.cssStack,
                          fontSize: 30,
                          fontWeight: FONT_WEIGHTS.semibold,
                          lineHeight: 1.12,
                        }}
                      >
                        {detail}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {content.validity === undefined ? null : (
            <DetailRow
              boxed={false}
              entry={content.validity}
              icon="reloj"
              palette={palette}
            />
          )}
          <div style={{ marginTop: 6 }}>
            <ContactBar
              accent={accent}
              callToAction={content.callToAction}
              phone={context.brand.phone}
            />
          </div>
        </Plate>
      </SafeArea>
    </>
  );
}

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
