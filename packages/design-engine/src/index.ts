/**
 * API pública del motor de diseño.
 *
 * El paquete no tiene dependencias de ejecución: no importa React, Playwright,
 * NestJS, Next.js ni acceso a disco o red. Las capas que sí los necesitan
 * consumen estos contratos.
 *
 * Superficie por responsabilidad:
 *
 * - contratos: documento, activos, errores y resultado de render;
 * - tokens: color, tipografía, espaciado, radios y escala;
 * - formatos: dimensiones y zonas seguras canónicas;
 * - temas: identidad, colores resueltos y bindings CSS derivados;
 * - registro: layouts y nombres semánticos de icono;
 * - activos: biblioteca aprobada y resolución a URL;
 * - validación: conversión de entrada desconocida en documento válido.
 *
 * Las primitivas React se publican aparte, en
 * `@aramayo/design-engine/react`; los componentes de layout llegan en `P1-T04`.
 */

export {
  contentLimits,
  DESIGN_SCHEMA_VERSION,
  inlineAssetLimits,
  mediaDefaults,
  mediaLimits,
  type AssetReference,
  type DesignContent,
  type DesignDocument,
  type DesignSchemaVersion,
  type MediaAsset,
  type MediaFit,
  type MediaFocus,
} from "./contracts/document.ts";
export {
  DesignEngineError,
  isDesignEngineError,
  type AssetFailure,
  type ContentFailure,
  type DesignFailure,
  type DesignFailureStage,
  type ExportFailure,
  type LayoutFailure,
  type RenderFailure,
} from "./contracts/errors.ts";
export type {
  DesignRenderer,
  RenderedImage,
  RenderRejected,
  RenderRequest,
  RenderResult,
  RenderSuccess,
} from "./contracts/render.ts";
export {
  FORMAT_IDS,
  FORMATS,
  formatFor,
  hasCircularSafeArea,
  isFormatId,
  type CircularSafeArea,
  type DesignFormat,
  type FormatId,
  type SafeArea,
} from "./formats/formats.ts";
export {
  CATALOG_STATUS,
  catalogStatusFor,
  isPublishable,
  type CatalogStatus,
} from "./registry/catalog.ts";
export { ICON_NAMES, isIconName, type IconName } from "./registry/icons.ts";
export type {
  BannerLayoutId,
  CarouselLayoutId,
  ComposedLayoutId,
  HighlightLayoutId,
  LayoutId,
  PublicationLayoutId,
  StoryLayoutId,
} from "./registry/layout-id.ts";
export {
  COMPOSED_TITLE_BUDGET,
  composedDescriptorMinimumHeight,
  composedPanelRect,
  composedPanelShowsDescriptor,
  composedPanelShowsSubtitle,
  composedSubtitleMinimumHeight,
  composedTitleToken,
  type ComposedPanelRect,
  type ComposedRegion,
} from "./layouts/composed-geometry.ts";
export type {
  ContentFieldKey,
  LayoutFamily,
  LayoutSpec,
  MediaCapacity,
} from "./registry/layout-spec.ts";
export {
  defaultFormatFor,
  isLayoutId,
  LAYOUT_IDS,
  LAYOUT_SPECS,
  layoutSpecFor,
  supportsFormat,
} from "./registry/layouts.ts";
export { BRAND_ASSETS, type BrandAsset } from "./assets/asset-library.ts";
export {
  assetFileUrl,
  designEngineAssetsUrl,
} from "./assets/asset-location.ts";
export {
  describeReference,
  findBrandAsset,
  resolveAssetUrl,
  type AssetResolutionOptions,
} from "./assets/asset-resolver.ts";
export {
  composedPanelColors,
  THEME_COLOR_ROLES,
  THEMES,
  themeFor,
  type ComposedPanelColors,
  type Theme,
  type ThemeColors,
} from "./themes/theme-colors.ts";
export {
  colorVariableName,
  designEngineStylesheet,
  fontVariableName,
  themeCssVariables,
} from "./themes/theme-css.ts";
export {
  DEFAULT_THEME_ID,
  isThemeId,
  THEME_DESCRIPTORS,
  THEME_IDS,
  themeDescriptorFor,
  type BrandBranch,
  type ThemeDescriptor,
  type ThemeId,
  type ThemeTone,
} from "./themes/themes.ts";
export {
  COLORS,
  CONTRAST_THRESHOLDS,
  contrastRatio,
  flatten,
  FONT_ROLES,
  meetsContrast,
  parseColor,
  relativeLuminance,
  FONT_WEIGHTS,
  isFontRole,
  RADII,
  rgbChannels,
  SPACING,
  STROKES,
  TYPE_SCALE,
  TYPOGRAPHY,
  withAlpha,
  type ColorChannels,
  type ColorToken,
  type FontFamilyToken,
  type FontRole,
  type FontWeightToken,
  type RadiusToken,
  type SpacingToken,
  type StrokeToken,
  type TypeStyle,
  type TypeStyleToken,
} from "./tokens/index.ts";
export {
  describeIssues,
  issue,
  type DesignIssue,
  type DesignIssueCode,
} from "./validation/issues.ts";
export {
  parseDesignDocument,
  type DesignDocumentParseResult,
} from "./validation/parse-document.ts";
