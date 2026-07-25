import assert from "node:assert/strict";
import { test } from "node:test";

import { findForbiddenValues } from "./secret-scan.ts";

const forbiddenValues = ["clave-super-secreta", "otro-secreto"];

test("no informa hallazgos cuando el contenido está limpio", () => {
  assert.deepEqual(
    findForbiddenValues(
      "bundle.js",
      'const apiBaseUrl = "http://localhost:3001";',
      forbiddenValues,
    ),
    [],
  );
});

test("detecta un valor prohibido incrustado en el contenido", () => {
  const findings = findForbiddenValues(
    "bundle.js",
    'const token = "clave-super-secreta";',
    forbiddenValues,
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.location, "bundle.js");
});

test("el hallazgo no reproduce el secreto completo", () => {
  const findings = findForbiddenValues(
    "bundle.js",
    "clave-super-secreta",
    forbiddenValues,
  );

  assert.equal(findings[0]?.forbiddenValue, "clave-…");
  assert.ok(!findings[0]?.forbiddenValue.includes("super-secreta"));
});

test("informa cada valor prohibido presente", () => {
  const findings = findForbiddenValues(
    "bundle.js",
    "clave-super-secreta y otro-secreto",
    forbiddenValues,
  );

  assert.equal(findings.length, 2);
});
