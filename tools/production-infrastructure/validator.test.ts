import assert from "node:assert/strict";
import test from "node:test";

import { assertProductionComposeConfiguration } from "./validator.ts";

function validConfiguration(): unknown {
  const applicationSecurity = {
    read_only: true,
    security_opt: ["no-new-privileges:true"],
  };
  return {
    networks: {
      backend: { internal: true },
      edge: {},
    },
    services: {
      api: {
        ...applicationSecurity,
        depends_on: {
          migrate: { condition: "service_completed_successfully" },
        },
        environment: { TRUST_PROXY_HOPS: "1" },
        image: "local.invalid/api:sha",
        networks: { backend: null, edge: null },
      },
      caddy: {
        depends_on: {
          api: { condition: "service_healthy" },
          web: { condition: "service_healthy" },
        },
        image: "caddy:2.11.4",
        networks: { edge: null },
        ports: [{ published: "443", target: 443 }],
      },
      migrate: {
        image: "local.invalid/migrate:sha",
        networks: { backend: null },
      },
      postgres: {
        image: "postgres:17.9",
        networks: { backend: null },
      },
      redis: {
        image: "redis:8.2.7",
        networks: { backend: null },
      },
      web: {
        ...applicationSecurity,
        image: "local.invalid/web:sha",
        networks: { edge: null },
      },
      worker: {
        ...applicationSecurity,
        depends_on: {
          migrate: { condition: "service_completed_successfully" },
        },
        environment: {
          PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/ms-playwright/chromium/chrome",
        },
        image: "local.invalid/worker:sha",
        networks: { backend: null },
      },
    },
  };
}

test("accepts the isolated production topology", () => {
  assert.doesNotThrow(() => {
    assertProductionComposeConfiguration(validConfiguration());
  });
});

test("rejects a public database port", () => {
  const configuration = validConfiguration() as {
    services: { postgres: { ports?: unknown[] } };
  };
  configuration.services.postgres.ports = [{ published: "5432", target: 5432 }];

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /Caddy debe ser el único servicio/u);
});

test("rejects a backend network reachable from outside its Compose project", () => {
  const configuration = validConfiguration() as {
    networks: { backend: { internal: boolean } };
  };
  configuration.networks.backend.internal = false;

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /red backend debe ser interna/u);
});
