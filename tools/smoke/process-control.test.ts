import assert from "node:assert/strict";
import { test } from "node:test";

import { runProcess } from "./process-control.ts";

function activeTimeoutCount(): number {
  return process
    .getActiveResourcesInfo()
    .filter((resource) => resource === "Timeout").length;
}

test("un proceso que termina cancela el timeout de supervisión", async () => {
  const timeoutCountBefore = activeTimeoutCount();

  const completed = await runProcess(
    {
      arguments: ["--eval", "process.exit(0)"],
      environment: Object.freeze({
        PATH: process.env["PATH"] ?? "",
      }),
      workingDirectory: process.cwd(),
    },
    300_000,
  );

  assert.equal(completed.exitCode, 0);
  assert.equal(activeTimeoutCount(), timeoutCountBefore);
});
