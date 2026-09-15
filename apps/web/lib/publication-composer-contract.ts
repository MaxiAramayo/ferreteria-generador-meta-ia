export const publicationComposerVariants = [
  "template",
  "ai-creative",
  "recurring-story",
  "product-promotion",
] as const;

export type PublicationComposerVariant =
  (typeof publicationComposerVariants)[number];

export type PublicationComposerAction =
  | "accept-brief"
  | "edit-caption"
  | "edit-title"
  | "request-brief"
  | "save-draft";

export interface PublicationComposerState {
  readonly caption: string;
  readonly format: "historia";
  readonly layout: "historia-tip";
  readonly mediaMode: "none";
  readonly notice?: string;
  readonly status: "editing" | "error" | "saved" | "saving";
  readonly title: string;
  readonly variant: PublicationComposerVariant;
}

export interface PublicationComposerActions {
  readonly chooseVariant: (variant: PublicationComposerVariant) => void;
  readonly saveTemplateDraft: () => void;
  readonly updateCaption: (caption: string) => void;
  readonly updateFormat: (format: "historia") => void;
  readonly updateLayout: (layout: "historia-tip") => void;
  readonly updateMediaMode: (mediaMode: "none") => void;
  readonly updateTitle: (title: string) => void;
}

export interface PublicationComposerMeta {
  readonly allowedActions: ReadonlySet<PublicationComposerAction>;
  readonly apiBaseUrl: string;
  readonly canEdit: boolean;
  readonly canSchedule: boolean;
  readonly formId: string;
}

export interface PublicationComposerContextValue {
  readonly actions: PublicationComposerActions;
  readonly meta: PublicationComposerMeta;
  readonly state: PublicationComposerState;
}

const actionsByVariant: Readonly<
  Record<PublicationComposerVariant, ReadonlySet<PublicationComposerAction>>
> = Object.freeze({
  // Pedir un brief y aceptarlo son acciones distintas: la primera encola una
  // generación, la segunda crea una revisión. Ninguna publica.
  "ai-creative": new Set<PublicationComposerAction>([
    "accept-brief",
    "request-brief",
  ]),
  "product-promotion": new Set<PublicationComposerAction>(),
  "recurring-story": new Set<PublicationComposerAction>(),
  template: new Set<PublicationComposerAction>([
    "edit-caption",
    "edit-title",
    "save-draft",
  ]),
});

export function allowedComposerActions(
  variant: PublicationComposerVariant,
): ReadonlySet<PublicationComposerAction> {
  return actionsByVariant[variant];
}

export function requirePublicationComposerValue<Value>(
  value: Value | null,
): Value {
  if (value === null) {
    throw new Error("Publication composer components require their provider.");
  }
  return value;
}

/** Dirección de «Crear pieza». */
export const createPiecePath = "/publicaciones/nueva";

/**
 * Cómo se nombra cada flujo en la dirección de «Crear pieza». Van en castellano
 * porque la dirección se lee y se comparte.
 */
const variantSlugs: Readonly<Record<PublicationComposerVariant, string>> =
  Object.freeze({
    "ai-creative": "creatividad-ia",
    "product-promotion": "promocion",
    "recurring-story": "historia-recurrente",
    template: "plantilla",
  });

export function composerVariantHref(
  variant: PublicationComposerVariant,
): string {
  return `${createPiecePath}?flujo=${variantSlugs[variant]}`;
}

/** El flujo que nombra la URL, o `null` si no nombra uno conocido. */
export function composerVariantFromSlug(
  slug: string | null | undefined,
): PublicationComposerVariant | null {
  return (
    publicationComposerVariants.find(
      (variant) => variantSlugs[variant] === slug,
    ) ?? null
  );
}

/**
 * El flujo con el que abre «Crear pieza» si la URL no elige uno. Quien programa
 * pero no edita no puede usar la plantilla, así que empieza por la historia
 * recurrente, que sí puede activar.
 */
export function defaultComposerVariant(
  permissions: Readonly<{ canEdit: boolean; canSchedule: boolean }>,
): PublicationComposerVariant {
  return !permissions.canEdit && permissions.canSchedule
    ? "recurring-story"
    : "template";
}
