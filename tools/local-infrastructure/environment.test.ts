import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalInfrastructureEnvironment,
  parseEnvironmentContent,
} from "./environment.ts";

const validEnvironmentContent = `
POSTGRES_USER=aramayo
POSTGRES_PASSWORD="local password"
POSTGRES_DB=aramayo_content
POSTGRES_PORT=55432
REDIS_PASSWORD='redis password'
REDIS_PORT=56379
`;

test("parses a complete local environment without exposing secrets", () => {
  const environment = buildLocalInfrastructureEnvironment(
    parseEnvironmentContent(validEnvironmentContent),
  );

  assert.equal(environment.postgresDatabase, "aramayo_content");
  assert.equal(environment.postgresPort, 55_432);
  assert.equal(environment.redisPort, 56_379);
});

test("rejects a missing password by variable name", () => {
  const environmentEntries = parseEnvironmentContent(
    validEnvironmentContent.replace('POSTGRES_PASSWORD="local password"', ""),
  );

  assert.throws(
    () => buildLocalInfrastructureEnvironment(environmentEntries),
    /POSTGRES_PASSWORD/u,
  );
});

test("rejects duplicate variables", () => {
  assert.throws(
    () =>
      parseEnvironmentContent(`${validEnvironmentContent}\nREDIS_PORT=56380\n`),
    /REDIS_PORT más de una vez/u,
  );
});

test("rejects invalid ports", () => {
  const environmentEntries = parseEnvironmentContent(
    validEnvironmentContent.replace("REDIS_PORT=56379", "REDIS_PORT=70000"),
  );

  assert.throws(
    () => buildLocalInfrastructureEnvironment(environmentEntries),
    /REDIS_PORT debe estar entre/u,
  );
});
