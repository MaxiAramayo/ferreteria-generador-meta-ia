import type { ReactElement } from "react";

import { SafeArea } from "../primitives/canvas.tsx";
import type { Theme } from "../themes/theme-colors.ts";
import { Cartel } from "./frame-kit.tsx";
import { CARTEL_HEIGHT } from "./frame-geometry.ts";
import {
  mediaAt,
  type LayoutContext,
  type LayoutProps,
} from "./layout-context.ts";
import {
  BottomCard,
  ContactBar,
  contentWidth,
  CornerCard,
  FeatureGrid,
  FeatureList,
  FrameBorder,
  Headline,
  Highlights,
  InlineContact,
  OpeningHeader,
  openingAccentColors,
  openingPalette,
  OpeningPhoto,
  OpeningTexture,
  Plate,
  PracticalInfo,
  Subline,
  TopVeil,
  Watermark,
  type FrameBlockProps,
} from "./story-frame-kit.tsx";

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

function defaultGreeting(context: LayoutContext): string {
  const [city] = context.brand.city.split(",");
  return `En ${(city ?? context.brand.city).trim()}`;
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
function FrameDetails({
  compact = false,
  content,
  palette,
}: FrameBlockProps & { readonly compact?: boolean | undefined }): ReactElement {
  const features = content.features ?? [];
  const highlights = content.highlights ?? [];

  return (
    <>
      {features.length === 0 ? null : compact ? (
        <FeatureList features={features} palette={palette} />
      ) : (
        <FeatureGrid features={features} palette={palette} />
      )}
      {highlights.length === 0 ? null : (
        <Highlights
          color={palette.plateText}
          compact={compact}
          highlights={highlights}
        />
      )}
      <PracticalInfo
        compact={compact}
        items={content.items ?? []}
        palette={palette}
        validity={content.validity}
      />
    </>
  );
}

/**
 * Marco «placa»: la foto a sangre con la cabecera arriba y los datos en una
 * tarjeta apoyada abajo del todo. Sirve cuando lo importante de la foto está
 * arriba o al medio, y deja ver lo que pasa por debajo de la tarjeta.
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
        <BottomCard palette={palette} theme={theme}>
          <FrameDetails compact content={content} palette={palette} />
          <InlineContact
            accent={accent}
            callToAction={content.callToAction}
            phone={context.brand.phone}
          />
        </BottomCard>
      </SafeArea>
    </>
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
