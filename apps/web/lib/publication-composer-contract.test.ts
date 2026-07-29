import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  allowedComposerActions,
  publicationComposerVariants,
} from "./publication-composer-contract.ts";
import { usePublicationComposerState } from "../app/publicaciones/publication-composer-context.ts";

test("cada variante expone únicamente sus acciones válidas", () => {
  assert.deepEqual(
    [...allowedComposerActions("template")],
    ["edit-caption", "edit-title", "save-draft"],
  );
  for (const variant of publicationComposerVariants) {
    if (variant !== "template") {
      assert.equal(allowedComposerActions(variant).size, 0);
    }
  }
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
