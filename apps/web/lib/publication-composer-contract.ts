export const publicationComposerVariants = [
  "template",
  "ai-creative",
  "recurring-story",
  "product-promotion",
] as const;

export type PublicationComposerVariant =
  (typeof publicationComposerVariants)[number];

export type PublicationComposerAction =
  "edit-caption" | "edit-title" | "save-draft";

export interface PublicationComposerState {
  readonly caption: string;
  readonly notice?: string;
  readonly status: "editing" | "error" | "saved" | "saving";
  readonly title: string;
  readonly variant: PublicationComposerVariant;
}

export interface PublicationComposerActions {
  readonly chooseVariant: (variant: PublicationComposerVariant) => void;
  readonly saveTemplateDraft: () => void;
  readonly updateCaption: (caption: string) => void;
  readonly updateTitle: (title: string) => void;
}

export interface PublicationComposerMeta {
  readonly allowedActions: ReadonlySet<PublicationComposerAction>;
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
  "ai-creative": new Set<PublicationComposerAction>(),
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
