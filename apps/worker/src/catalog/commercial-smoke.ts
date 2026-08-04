import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { parseWorkerEnvironment } from "@aramayo/configuration/worker";
import {
  createDatabaseClient,
  PrismaCommercialToolAuditRepository,
} from "@aramayo/database";

import { CommercialToolExecutionService } from "./commercial-tool-execution.service.ts";
import { OdooCommercialCatalogAdapter } from "./odoo-commercial-catalog.adapter.ts";

type UnknownRecord = Readonly<Record<string, unknown>>;

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} no cumple el contrato esperado.`);
  }
  return value as UnknownRecord;
}

function successfulData(output: string): UnknownRecord {
  const envelope = record(JSON.parse(output), "tool output");
  if (envelope["status"] !== "ok") {
    throw new Error("La herramienta comercial no devolvió éxito.");
  }
  return record(envelope["data"], "tool data");
}

async function smoke(): Promise<void> {
  const configuration = parseWorkerEnvironment(process.env);
  if (configuration.environment !== "staging") {
    throw new Error(
      "El smoke comercial sólo puede ejecutarse con NODE_ENV=staging.",
    );
  }
  if (!configuration.commercialCatalog.enabled) {
    throw new Error("La API comercial no está configurada para el worker.");
  }
  const database = createDatabaseClient(configuration.databaseUrl.reveal());
  const runId = randomUUID();
  try {
    const membership = await database.organizationMembership.findFirstOrThrow({
      orderBy: { id: "asc" },
      where: {
        organizationId:
          configuration.commercialCatalog.credentials.organizationId,
        status: "active",
      },
    });
    const location =
      configuration.commercialCatalog.credentials.locationMappings[0];
    if (location === undefined) {
      throw new Error("El smoke requiere al menos una sucursal configurada.");
    }
    const executor = new CommercialToolExecutionService(
      new OdooCommercialCatalogAdapter(
        configuration.commercialCatalog.credentials,
        configuration.commercialCatalog.policy,
      ),
      new PrismaCommercialToolAuditRepository(database),
      configuration.commercialCatalog.credentials,
      configuration.commercialCatalog.policy,
    ).createSession({
      actorMembershipId: membership.id,
      locationId: location.platformLocationId,
      organizationId: membership.organizationId,
      runId,
    });

    const search = await executor.execute({
      arguments: JSON.stringify({ limit: 1, query: "amoladora" }),
      callId: "call_commercial_smoke_search",
      name: "search_products",
    });
    assert.equal(search.outcome, "success");
    const searchData = successfulData(search.output);
    const matches = searchData["matches"];
    if (!Array.isArray(matches) || matches.length < 1) {
      throw new Error("La búsqueda comercial de smoke no encontró evidencia.");
    }
    const firstProduct = record(matches[0], "search match");
    const externalProductId = firstProduct["externalId"];
    if (typeof externalProductId !== "string") {
      throw new Error("La búsqueda no devolvió un identificador opaco.");
    }

    const product = await executor.execute({
      arguments: JSON.stringify({ externalProductId }),
      callId: "call_commercial_smoke_product",
      name: "get_product",
    });
    const price = await executor.execute({
      arguments: JSON.stringify({ externalProductId }),
      callId: "call_commercial_smoke_price",
      name: "get_current_price",
    });
    const stock = await executor.execute({
      arguments: JSON.stringify({ externalProductId }),
      callId: "call_commercial_smoke_stock",
      name: "get_stock_by_location",
    });
    assert.equal(product.outcome, "success");
    assert.equal(price.outcome, "success");
    assert.equal(stock.outcome, "success");
    const priceData = successfulData(price.output);
    const stockData = successfulData(stock.output);

    const audits = await database.auditEvent.count({
      where: {
        entityId: runId,
        entityType: "commercial-tool-run",
        organizationId: membership.organizationId,
      },
    });
    assert.equal(audits, 4);
    process.stdout.write(
      [
        "API comercial verificada.",
        "method=GET-only",
        "tools=4",
        `price=${String(priceData["kind"])}`,
        `stock=${String(stockData["kind"])}`,
        `audits=${String(audits)}`,
      ].join(" "),
    );
    process.stdout.write("\n");
  } finally {
    await database.$disconnect();
  }
}

try {
  await smoke();
} catch (cause: unknown) {
  process.stderr.write(
    cause instanceof Error
      ? `Smoke comercial falló: ${cause.message}\n`
      : "Smoke comercial falló con una causa desconocida.\n",
  );
  process.exitCode = 1;
}
