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
