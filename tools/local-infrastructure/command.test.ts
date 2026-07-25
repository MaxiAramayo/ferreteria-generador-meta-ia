import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCleanupConfirmation,
  buildComposeArguments,
  localComposeProjectName,
  parseInfrastructureCommand,
} from "./command.ts";

test("builds every Compose call with a fixed project scope", () => {
  assert.deepEqual(
    buildComposeArguments(
      "/workspace/.env",
      "/workspace/infrastructure/local/compose.yaml",
      ["up", "--detach"],
    ),
    [
      "compose",
      "--project-name",
      localComposeProjectName,
      "--env-file",
      "/workspace/.env",
      "--file",
      "/workspace/infrastructure/local/compose.yaml",
      "up",
      "--detach",
    ],
  );
});

test("requires the exact project name before cleanup", () => {
  assert.doesNotThrow(() => {
    assertCleanupConfirmation(["--confirm", localComposeProjectName]);
  });
  assert.throws(() => {
    assertCleanupConfirmation(["--confirm", "another-project"]);
  }, /aramayo-content-platform-local/u);
});

test("rejects unknown commands", () => {
  assert.equal(parseInfrastructureCommand("health"), "health");
  assert.throws(
    () => parseInfrastructureCommand("destroy"),
    /Comando inválido/u,
  );
});
