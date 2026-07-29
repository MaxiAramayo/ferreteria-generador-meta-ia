import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionComposeArguments,
  parseProductionInfrastructureCommand,
  productionComposeProjectName,
} from "./command.ts";

test("scopes validation to a fixed project and explicit environment file", () => {
  assert.deepEqual(
    buildProductionComposeArguments(
      "/workspace/infrastructure/production/.env.example",
      [
        "/workspace/infrastructure/production/compose.yaml",
        "/workspace/infrastructure/production/compose.build.yaml",
      ],
      ["config", "--format", "json"],
    ),
    [
      "compose",
      "--project-name",
      productionComposeProjectName,
      "--env-file",
      "/workspace/infrastructure/production/.env.example",
      "--file",
      "/workspace/infrastructure/production/compose.yaml",
      "--file",
      "/workspace/infrastructure/production/compose.build.yaml",
      "config",
      "--format",
      "json",
    ],
  );
});

test("exposes preparation commands but no remote deploy command", () => {
  assert.equal(parseProductionInfrastructureCommand("verify"), "verify");
  assert.equal(parseProductionInfrastructureCommand("build"), "build");
  assert.equal(parseProductionInfrastructureCommand("smoke"), "smoke");
  assert.throws(
    () => parseProductionInfrastructureCommand("deploy"),
    /Comando inválido/u,
  );
  assert.throws(
    () => parseProductionInfrastructureCommand("down"),
    /Comando inválido/u,
  );
});
