import assert from "node:assert/strict";
import test from "node:test";

import {
  SecretValue,
  type CommercialCatalogCredentials,
  type CommercialCatalogPolicy,
  type OpenAICredentials,
  type OpenAIRuntimePolicy,
} from "@aramayo/configuration";

import { OdooCommercialCatalogAdapter } from "../catalog/odoo-commercial-catalog.adapter.ts";
import { OfficialOpenAIResponsesTransport } from "../generation/openai-transport.ts";
import { FacebookGraphPublishingAdapter } from "../publishing/facebook-graph.adapter.ts";
import { HttpPublicMediaProbe } from "../publishing/instagram-graph.adapter.ts";

/**
 * Interrumpir una dependencia tiene que verse (`P7-T03`).
 *
 * Cada proveedor se corta acá con su propio doble —una conexión rechazada, un
 * timeout— y lo que se comprueba es que el corte deje observación con su
 * dependencia, su operación y una causa corta. Sin esta prueba, un adaptador
 * podría perder su instrumentación en un refactor y nadie lo notaría hasta que
 * hiciera falta en un incidente.
 *
 * PostgreSQL y Redis se cortan en el smoke, que además comprueba que `/ready`
 * responda 503. La carga y el borrado en Cloudinary se ejercitan contra el
 * proveedor real en `pnpm media:smoke:cloudinary`; acá se corta la lectura
 * pública, que es la que decide si Meta puede alcanzar la pieza.
 */

interface Observation {
  readonly dependency: string;
  readonly durationMs: number;
  readonly failureCode: string;
  readonly operation: string;
  readonly outcome: string;
}

/**
 * El emisor del proceso escribe en `stdout`; interceptarlo evita agregarle a
 * cada adaptador un parámetro que sólo existiría para la prueba.
 */
async function observationsOf(
  run: () => Promise<unknown>,
): Promise<readonly Observation[]> {
  const original = process.stdout.write.bind(process.stdout);
  const lines: string[] = [];
  process.stdout.write = (chunk: unknown): boolean => {
    if (typeof chunk === "string") lines.push(chunk);
    return true;
  };
  try {
    await run();
  } catch {
    // El fallo del proveedor es el objeto de la prueba; lo que importa es lo
    // que quedó registrado.
  } finally {
    process.stdout.write = original;
  }
  const observations: Observation[] = [];
  for (const line of lines.join("").split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    const parsed: unknown = JSON.parse(line);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { event?: unknown }).event !== "dependency.call"
    ) {
      continue;
    }
    const record = parsed as {
      detail?: Record<string, unknown>;
      durationMs?: unknown;
      outcome?: unknown;
    };
    observations.push({
      dependency: String(record.detail?.["dependency"]),
      durationMs:
        typeof record.durationMs === "number" ? record.durationMs : -1,
      failureCode: String(record.detail?.["failureCode"]),
      operation: String(record.detail?.["operation"]),
      outcome: String(record.outcome),
    });
  }
  return observations;
}

function assertInterrupted(
  observations: readonly Observation[],
  dependency: string,
  operation: string,
): void {
  const observation = observations.find(
    (entry) => entry.dependency === dependency && entry.operation === operation,
  );
  assert.ok(
    observation,
    `Cortar ${dependency} tiene que dejar observación de ${operation}.`,
  );
  assert.equal(observation.outcome, "failure");
  assert.ok(observation.durationMs >= 0);
  assert.notEqual(observation.failureCode, "undefined");
  assert.match(observation.failureCode, /^[a-z0-9._-]{1,60}$/iu);
}

function refused(): Promise<Response> {
  return Promise.reject(
    Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
      code: "ECONNREFUSED",
    }),
  );
}

test("cortar Meta deja observación con su causa y sin la URL del proveedor", async () => {
  const observations = await observationsOf(async () =>
    new FacebookGraphPublishingAdapter("v26.0", () =>
      Promise.reject(
        Object.assign(new Error("The operation was aborted"), {
          name: "TimeoutError",
        }),
      ),
    ).readPermalink("1784500000000000", "token-de-prueba"),
  );

  assertInterrupted(observations, "meta", "graph.request");
  assert.equal(
    observations.find((entry) => entry.dependency === "meta")?.failureCode,
    "TimeoutError",
  );
});

test("cortar la lectura pública del medio deja observación de Cloudinary", async () => {
  const observations = await observationsOf(async () =>
    new HttpPublicMediaProbe(refused).probe(
      "https://res.cloudinary.com/m73l9k4c/image/upload/v3/pieza.png",
    ),
  );

  assertInterrupted(observations, "cloudinary", "media.probe");
});

test("cortar el sistema comercial deja observación con su causa", async () => {
  const credentials: CommercialCatalogCredentials = Object.freeze({
    baseUrl: "https://ferreteriaaramayo.com.ar/api/content/v1/",
    locationMappings: Object.freeze([]),
    organizationId: "10000000-0000-4000-8000-000000000001",
    token: new SecretValue("content-api-test-token-value-secure"),
  });
  const policy: CommercialCatalogPolicy = Object.freeze({
    maximumCallsPerRun: 4,
    requestTimeoutMilliseconds: 100,
  });

  const observations = await observationsOf(async () =>
    new OdooCommercialCatalogAdapter(
      credentials,
      policy,
      refused,
    ).searchProducts({
      limit: 1,
      organizationId: credentials.organizationId,
      query: "amoladora",
    }),
  );

  assertInterrupted(observations, "commercial", "catalog.request");
});

test("cortar OpenAI deja observación de la llamada, no del contenido", async () => {
  const previousBaseUrl = process.env["OPENAI_BASE_URL"];
  // Puerto reservado sin servicio: la conexión se rechaza sin salir a la red.
  process.env["OPENAI_BASE_URL"] = "http://127.0.0.1:1/v1";
  const credentials: OpenAICredentials = Object.freeze({
    apiKey: new SecretValue("sk-clave-de-prueba-que-no-viaja"),
    projectId: "proj_prueba",
  });
  const policy: OpenAIRuntimePolicy = Object.freeze({
    maximumInputCharacters: 4_000,
    maximumOutputTokens: 256,
    maximumRetries: 0,
    models: Object.freeze({
      brief: "gpt-5",
      complex: "gpt-5",
      routine: "gpt-5",
    }),
    requestTimeoutMilliseconds: 2_000,
    retryBaseDelayMilliseconds: 10,
  });

  const observations = await observationsOf(async () =>
    new OfficialOpenAIResponsesTransport(credentials, policy).createResponse({
      input: "Interrupción de dependencia.",
      maximumOutputTokens: 128,
      model: "gpt-5",
      reasoningEffort: "none",
    }),
  );

  if (previousBaseUrl === undefined) {
    delete process.env["OPENAI_BASE_URL"];
  } else {
    process.env["OPENAI_BASE_URL"] = previousBaseUrl;
  }

  assertInterrupted(observations, "openai", "responses.create");
  // La clave nunca aparece en el registro, aunque el SDK la lleve en el error.
  assert.ok(
    !JSON.stringify(observations).includes("sk-clave-de-prueba-que-no-viaja"),
  );
});
