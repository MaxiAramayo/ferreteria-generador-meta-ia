import {
  BRAND_ASSETS,
  COLORS,
  designEngineStylesheet,
  FORMATS,
  ICON_NAMES,
  RADII,
  SPACING,
  THEME_IDS,
  TYPE_SCALE,
  TYPOGRAPHY,
  themeFor,
  type IconName,
  type MediaAsset,
  type ThemeId,
  type TypeStyleToken,
} from "@aramayo/design-engine";
import {
  AramayoMark,
  Canvas,
  Icon,
  Logo,
  Photo,
  SafeArea,
  Text,
} from "@aramayo/design-engine/react";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * Harness de primitivas.
 *
 * Muestra cada token y cada primitiva en los cuatro temas aprobados, a escala
 * reducida pero con las medidas reales del motor. Es la superficie que se revisa
 * antes de migrar layouts y la que audita `P1-T06` para accesibilidad.
 */

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Primitivas del motor de diseño",
};

const assetBaseUrl = "/media";
const previewScale = 0.24;
const samplePhotoId = "stock-herramientas-electricas";
const typeTokens: readonly TypeStyleToken[] = [
  "hero",
  "h1",
  "h2",
  "sub",
  "body",
  "label",
];

function photoAsset(): MediaAsset {
  const asset = BRAND_ASSETS.find((entry) => entry.assetId === samplePhotoId);

  if (asset === undefined) {
    throw new Error(
      "El activo de ejemplo del harness no está en la biblioteca aprobada.",
    );
  }

  return {
    alt: "Herramientas eléctricas sobre un banco de trabajo",
    fit: "cover",
    focus: { x: 50, y: 50 },
    reference: { assetId: asset.assetId, source: "brand-library" },
    zoom: 1,
  };
}

function ThemePreview({ themeId }: { readonly themeId: ThemeId }) {
  const theme = themeFor(themeId);
  const format = FORMATS.feed;

  return (
    <figure className="preview">
      <figcaption>
        <strong>{themeId}</strong> · {theme.brand} · {theme.tone}
      </figcaption>
      <div
        aria-label={`Vista previa del tema ${themeId}`}
        className="preview-frame"
        role="img"
        style={{
          height: format.height * previewScale,
          width: format.width * previewScale,
        }}
      >
        <div
          style={{
            transform: `scale(${String(previewScale)})`,
            transformOrigin: "top left",
          }}
        >
          <Canvas format={format} theme={theme}>
            <SafeArea format={format} style={{ gap: SPACING.xl }}>
              <Logo tone={theme.tone} variant={theme.brand} />
              <Text as="div" token="h2">
                Herramientas para resolver en el día
              </Text>
              <Text token="sub" style={{ color: theme.colors.muted }}>
                Consultá stock y precios por WhatsApp.
              </Text>
              <Photo
                asset={photoAsset()}
                assetBaseUrl={assetBaseUrl}
                style={{ height: 420, width: "100%" }}
              />
              <div
                style={{ display: "flex", gap: SPACING.sm, marginTop: "auto" }}
              >
                <span
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.colors.action,
                    borderRadius: RADII.pill,
                    color: theme.colors.actionText,
                    display: "inline-flex",
                    fontFamily: TYPOGRAPHY.display.cssStack,
                    fontSize: 42,
                    fontWeight: 800,
                    padding: "28px 48px",
                    textTransform: "uppercase",
                  }}
                >
                  Consultá stock
                </span>
                <span
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.colors.primary,
                    borderRadius: RADII.icon,
                    color: theme.colors.actionText,
                    display: "grid",
                    height: 98,
                    placeItems: "center",
                    width: 98,
                  }}
                >
                  <Icon name="herramienta" size={54} />
                </span>
              </div>
            </SafeArea>
          </Canvas>
        </div>
      </div>
    </figure>
  );
}

export default function PrimitivesHarnessPage() {
  return (
    <main>
      <style>{designEngineStylesheet()}</style>

      <nav aria-label="Revisión de diseño" className="harness-nav">
        <Link href="/">Panel</Link>
        <Link href="/diseno/primitivas">Primitivas</Link>
        <Link href="/diseno/layouts">Layouts</Link>
      </nav>

      <h1>Primitivas del motor de diseño</h1>
      <p className="lead">
        Tokens, temas y primitivas migrados en <code>P1-T03</code>. Las piezas
        se componen con las medidas reales del formato y se muestran reducidas
        al {Math.round(previewScale * 100)} % para revisarlas juntas.
      </p>

      <section aria-labelledby="temas" className="panel">
        <h2 id="temas">Temas</h2>
        <div className="previews">
          {THEME_IDS.map((themeId) => (
            <ThemePreview key={themeId} themeId={themeId} />
          ))}
        </div>
      </section>

      <section aria-labelledby="color" className="panel">
        <h2 id="color">Color</h2>
        <ul className="swatches">
          {Object.entries(COLORS).map(([token, value]) => (
            <li key={token}>
              <span className="swatch" style={{ backgroundColor: value }} />
              <span>{token}</span>
              <code>{value}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tipografia" className="panel">
        <h2 id="tipografia">Tipografía</h2>
        <dl className="definitions">
          {Object.entries(TYPOGRAPHY).map(([role, family]) => (
            <div key={role} className="definition-row">
              <dt>{role}</dt>
              <dd>
                {family.family} · pesos {family.weights.join(", ")} ·{" "}
                {family.license}
              </dd>
            </div>
          ))}
        </dl>
        <ul className="type-scale">
          {typeTokens.map((token) => (
            <li key={token}>
              <span className="type-name">
                {token} · {TYPE_SCALE[token].fontSize} px
              </span>
              <span
                style={{
                  display: "block",
                  fontFamily: TYPOGRAPHY[TYPE_SCALE[token].role].cssStack,
                  fontSize: TYPE_SCALE[token].fontSize * 0.32,
                  fontWeight: TYPE_SCALE[token].fontWeight,
                  lineHeight: TYPE_SCALE[token].lineHeight,
                  textTransform: TYPE_SCALE[token].textTransform,
                }}
              >
                Ferretería y Lubricentro Aramayo
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="marca" className="panel">
        <h2 id="marca">Marca</h2>
        <div className="logos">
          <div style={{ color: COLORS.ink }}>
            <AramayoMark size={96} />
          </div>
          <Logo variant="ferreteria" />
          <Logo variant="lubricentro" />
          <Logo variant="familia" />
        </div>
      </section>

      <section aria-labelledby="iconos" className="panel">
        <h2 id="iconos">Iconos</h2>
        <ul className="icons">
          {ICON_NAMES.map((name: IconName) => (
            <li key={name}>
              <span style={{ color: COLORS.rust }}>
                <Icon name={name} size={32} />
              </span>
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="activos" className="panel">
        <h2 id="activos">Activos aprobados</h2>
        <p>
          {BRAND_ASSETS.length} activos migrados con propiedad confirmada. Se
          sirven desde el paquete del motor, no desde una copia en el panel.
        </p>
      </section>
    </main>
  );
}
