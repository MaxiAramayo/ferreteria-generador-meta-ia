/**
 * Superficie React del motor.
 *
 * Se publica en una entrada separada (`@aramayo/design-engine/react`) para que
 * quien sólo necesita contratos —la API, el worker al validar, una migración de
 * datos— no arrastre React ni los iconos.
 */

export {
  Backdrop,
  Canvas,
  SafeArea,
  type BackdropProps,
  type CanvasProps,
  type SafeAreaProps,
} from "./primitives/canvas.tsx";
export { Icon, iconComponentFor, type IconProps } from "./primitives/icon.tsx";
export {
  AramayoMark,
  LOGO_SPEC,
  LOGO_VARIANTS,
  Logo,
  logoClearSpace,
  logoDescriptorFor,
  type AramayoMarkProps,
  type LogoProps,
  type LogoVariant,
} from "./primitives/logo.tsx";
export {
  fontFamilyFor,
  Photo,
  PhotoFallback,
  type PhotoFallbackProps,
  type PhotoProps,
} from "./primitives/photo.tsx";
export { Text, typeStyleFor, type TextProps } from "./primitives/text.tsx";
export {
  BrandPanel,
  BulletList,
  consultPriceLabel,
  Cta,
  Eyebrow,
  Footer,
  Header,
  IconBadge,
  PhotoScrim,
  PriceBlock,
  ProductImage,
  Subtitle,
  Title,
} from "./layouts/kit.tsx";
export {
  ComposicionBandaSuperior,
  ComposicionCirculoCentral,
  ComposicionTercioInferior,
} from "./layouts/composed-pieces.tsx";
export {
  footerBranch,
  mediaAt,
  type LayoutBrandProfile,
  type LayoutContext,
  type LayoutProps,
} from "./layouts/layout-context.ts";
export {
  assertTextFits,
  DesignPiece,
  isLayoutMigrated,
  layoutComponentFor,
  TEXT_BUDGET,
  type LayoutComponent,
  type RenderOptions,
} from "./layouts/registry.tsx";
