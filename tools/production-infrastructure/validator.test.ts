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
      egress: {},
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
        networks: { backend: null, egress: null },
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

test("rejects a worker that cannot reach its providers", () => {
  const configuration = validConfiguration() as {
    services: { worker: { networks: Record<string, null> } };
  };
  configuration.services.worker.networks = { backend: null };

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /services\.worker debe pertenecer a la red egress/u);
});

test("rejects a topology without an egress network", () => {
  const configuration = validConfiguration() as {
    networks: { egress?: unknown };
  };
  delete configuration.networks.egress;

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /Falta la red egress/u);
});

test("rejects an egress network without a route outside", () => {
  const configuration = validConfiguration() as {
    networks: { egress: { internal?: boolean } };
  };
  configuration.networks.egress.internal = true;

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /red egress no puede ser interna/u);
});

test("keeps the data stores off the egress network", () => {
  const configuration = validConfiguration() as {
    services: { postgres: { networks: Record<string, null> } };
  };
  configuration.services.postgres.networks = { backend: null, egress: null };

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /services\.postgres no debe pertenecer a la red egress/u);
});

test("keeps the worker unreachable from the ingress network", () => {
  const configuration = validConfiguration() as {
    services: { worker: { networks: Record<string, null> } };
  };
  configuration.services.worker.networks = {
    backend: null,
    edge: null,
    egress: null,
  };

  assert.throws(() => {
    assertProductionComposeConfiguration(configuration);
  }, /services\.worker no debe pertenecer a la red edge/u);
});
