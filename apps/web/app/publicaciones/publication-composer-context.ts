"use client";

import { createContext, createElement, use, type ReactNode } from "react";

import {
  requirePublicationComposerValue,
  type PublicationComposerActions,
  type PublicationComposerMeta,
  type PublicationComposerState,
} from "../../lib/publication-composer-contract.ts";

const PublicationComposerStateContext =
  createContext<PublicationComposerState | null>(null);
const PublicationComposerActionsContext =
  createContext<PublicationComposerActions | null>(null);
const PublicationComposerMetaContext =
  createContext<PublicationComposerMeta | null>(null);

export function usePublicationComposerState(): PublicationComposerState {
  return requirePublicationComposerValue(use(PublicationComposerStateContext));
}

export function usePublicationComposerActions(): PublicationComposerActions {
  return requirePublicationComposerValue(
    use(PublicationComposerActionsContext),
  );
}

export function usePublicationComposerMeta(): PublicationComposerMeta {
  return requirePublicationComposerValue(use(PublicationComposerMetaContext));
}

export function PublicationComposerContextProvider({
  actions,
  children,
  meta,
  state,
}: {
  readonly actions: PublicationComposerActions;
  readonly children: ReactNode;
  readonly meta: PublicationComposerMeta;
  readonly state: PublicationComposerState;
}) {
  return createElement(
    PublicationComposerActionsContext,
    { value: actions },
    createElement(
      PublicationComposerMetaContext,
      { value: meta },
      createElement(
        PublicationComposerStateContext,
        { value: state },
        children,
      ),
    ),
  );
}
