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
 * - formatos: dimensiones y zonas seguras canónicas;
 * - temas: identificadores y metadatos de marca;
 * - registro: layouts y nombres semánticos de icono;
 * - validación: conversión de entrada desconocida en documento válido.
 *
 * Los tokens, las primitivas y los componentes de layout se incorporan en
 * `P1-T03` y `P1-T04` sobre estos mismos identificadores.
 */

export {
  contentLimits,
  DESIGN_SCHEMA_VERSION,
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
export { ICON_NAMES, isIconName, type IconName } from "./registry/icons.ts";
export type {
  BannerLayoutId,
  CarouselLayoutId,
  HighlightLayoutId,
  LayoutId,
  PublicationLayoutId,
  StoryLayoutId,
} from "./registry/layout-id.ts";
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
  describeIssues,
  issue,
  type DesignIssue,
  type DesignIssueCode,
} from "./validation/issues.ts";
export {
  parseDesignDocument,
  type DesignDocumentParseResult,
} from "./validation/parse-document.ts";
