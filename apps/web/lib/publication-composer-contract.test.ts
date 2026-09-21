import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  allowedComposerActions,
  composerVariantFromSlug,
  composerVariantHref,
  defaultComposerVariant,
  publicationComposerVariants,
} from "./publication-composer-contract.ts";
import { usePublicationComposerState } from "../app/(panel)/publicaciones/publication-composer-context.ts";

test("cada variante expone únicamente sus acciones válidas", () => {
  assert.deepEqual(
    [...allowedComposerActions("template")],
    ["edit-caption", "edit-title", "save-draft"],
  );
  // Pedir un brief y aceptarlo son acciones separadas, y ninguna publica.
  assert.deepEqual(
    [...allowedComposerActions("ai-creative")],
    ["accept-brief", "request-brief"],
  );
  // La historia de producto guarda su propio borrador, con foto y marco.
  assert.deepEqual(
    [...allowedComposerActions("product-story")],
    ["save-draft"],
  );
  // Las variantes que todavía no tienen dominio detrás no simulan acciones.
  const implemented = new Set(["ai-creative", "product-story", "template"]);
  for (const variant of publicationComposerVariants) {
    if (!implemented.has(variant)) {
      assert.equal(allowedComposerActions(variant).size, 0);
    }
  }
});

test("cada flujo tiene su dirección y la URL decide cuál se abre", () => {
  for (const variant of publicationComposerVariants) {
    const href = new URL(composerVariantHref(variant), "https://panel.invalid");
    assert.equal(href.pathname, "/publicaciones/nueva");
    assert.equal(
      composerVariantFromSlug(href.searchParams.get("flujo")),
      variant,
    );
  }
  assert.equal(
    composerVariantHref("ai-creative"),
    "/publicaciones/nueva?flujo=creatividad-ia",
  );
  assert.equal(composerVariantFromSlug("ai-creative"), null);
  assert.equal(composerVariantFromSlug(null), null);
  assert.equal(composerVariantFromSlug(undefined), null);
});

test("sin flujo en la URL, quien sólo programa empieza por lo que puede hacer", () => {
  assert.equal(
    defaultComposerVariant({ canEdit: true, canSchedule: true }),
    "template",
  );
  assert.equal(
    defaultComposerVariant({ canEdit: false, canSchedule: true }),
    "recurring-story",
  );
  assert.equal(
    defaultComposerVariant({ canEdit: false, canSchedule: false }),
    "template",
  );
});

test("un consumidor fuera del provider falla de forma explícita", () => {
  function InvalidConsumer() {
    usePublicationComposerState();
    return createElement("span", null, "unreachable");
  }
  assert.throws(
    () => renderToStaticMarkup(createElement(InvalidConsumer)),
    /require their provider/u,
  );
});
