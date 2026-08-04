/**
 * Smoke controlado del brief estructurado contra staging.
 *
 * Ejercita el camino que los tests con dobles no pueden probar: salida
 * estructurada con esquema estricto y ciclo real de function calling contra la
 * Responses API, con el catálogo comercial autorizado detrás.
 *
 * No escribe en la plataforma: el historial de ejecución usa un repositorio en
 * memoria y no se persiste nada. Sí realiza lecturas reales facturables en
 * OpenAI y lecturas de solo lectura en la API comercial.
 */

import { createHash, randomUUID } from "node:crypto";

import { SecretValue } from "@aramayo/configuration";
import { parseWorkerEnvironment } from "@aramayo/configuration/worker";
import { createDatabaseClient } from "@aramayo/database";
import type {
  CommercialCatalogPort,
  CommercialEvidence,
  CommercialToolAuditEvent,
  CommercialToolAuditPort,
  GetPriceQuery,
  GetProductQuery,
  GetReceiptStatusQuery,
  GetStockQuery,
  KnowledgeRetrievalResult,
  PriceLookupResult,
  ProductLookupResult,
  ReceiptStatusResult,
  SearchProductsQuery,
  SearchProductsResult,
  StockLookupResult,
} from "@aramayo/domain";

import { CommercialToolExecutionService } from "../catalog/commercial-tool-execution.service.ts";
import { FixtureCommercialCatalogAdapter } from "../catalog/fixture-commercial-catalog.ts";
import { OdooCommercialCatalogAdapter } from "../catalog/odoo-commercial-catalog.adapter.ts";
import { OpenAITextGenerationGateway } from "../generation/openai-text-generation.gateway.ts";
import { OfficialOpenAIResponsesTransport } from "../generation/openai-transport.ts";
import type { RetrieveKnowledgeCommand } from "../knowledge/knowledge-retrieval.service.ts";
import {
  ContentBriefGenerationService,
  type KnowledgeRetrievalPort,
} from "./content-brief-generation.service.ts";
import { InMemoryContentBriefRunRepository } from "./in-memory-content-brief-runs.ts";

/**
 * El smoke no consulta File Search: `P3-T04` ya lo verificó por su cuenta y acá
 * interesa aislar la generación estructurada con herramientas.
 */
class EmptyKnowledge implements KnowledgeRetrievalPort {
  retrieve(
    command: RetrieveKnowledgeCommand,
  ): Promise<KnowledgeRetrievalResult> {
    return Promise.resolve(
      Object.freeze({
        context: "",
        contextCharacters: 0,
        evidence: Object.freeze([]),
        missingInformation: Object.freeze(["no-relevant-evidence" as const]),
        question: command.question,
        status: "missing_information",
      }),
    );
  }
}

/**
 * Adapta los fixtures de `P3-T05` al alcance autenticado del smoke.
 *
 * Hace dos traducciones y ninguna toca la lógica que se quiere verificar:
 * lleva la organización real al tenant sintético de los fixtures, y refresca el
 * instante de lectura, que en los fixtures está congelado para ser determinista
 * y de otro modo llegaría siempre vencido. La política de frescura sigue
 * intacta y sus dos lados están cubiertos por los tests de dominio.
 */
class ScopedFixtureCatalog implements CommercialCatalogPort {
  readonly #inner = new FixtureCommercialCatalogAdapter();
  static readonly organizationId = "organization-aramayo";

  async searchProducts(
    query: SearchProductsQuery,
  ): Promise<SearchProductsResult> {
    const result = await this.#inner.searchProducts(this.#scoped(query));
    return {
      ...result,
      evidence: this.#fresh(result.evidence),
      matches: result.matches.map((product) => ({
        ...product,
        evidence: this.#fresh(product.evidence),
      })),
    };
  }

  async getProduct(query: GetProductQuery): Promise<ProductLookupResult> {
    const result = await this.#inner.getProduct(this.#scoped(query));
    return result.kind === "found"
      ? {
          ...result,
          product: {
            ...result.product,
            evidence: this.#fresh(result.product.evidence),
          },
        }
      : { ...result, evidence: this.#fresh(result.evidence) };
  }

  async getPrice(query: GetPriceQuery): Promise<PriceLookupResult> {
    const result = await this.#inner.getPrice(this.#scoped(query));
    return { ...result, evidence: this.#fresh(result.evidence) };
  }

  async getStock(query: GetStockQuery): Promise<StockLookupResult> {
    const result = await this.#inner.getStock(this.#scoped(query));
    return { ...result, evidence: this.#fresh(result.evidence) };
  }

  async getReceiptStatus(
    query: GetReceiptStatusQuery,
  ): Promise<ReceiptStatusResult> {
    const result = await this.#inner.getReceiptStatus(this.#scoped(query));
    return { ...result, evidence: this.#fresh(result.evidence) };
  }

  #fresh(evidence: CommercialEvidence): CommercialEvidence {
    return { ...evidence, observedAt: new Date().toISOString() };
  }

  #scoped<Query extends { readonly organizationId: string }>(
    query: Query,
  ): Query {
    return { ...query, organizationId: ScopedFixtureCatalog.organizationId };
  }
}

class ConsoleAudit implements CommercialToolAuditPort {
  readonly events: CommercialToolAuditEvent[] = [];

  record(event: CommercialToolAuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

async function runBriefSmoke(): Promise<void> {
  const configuration = parseWorkerEnvironment(process.env);
  if (configuration.environment !== "staging") {
    throw new Error("El smoke del brief sólo admite NODE_ENV=staging.");
  }
  if (!configuration.openAi.enabled) {
    throw new Error("El smoke requiere credenciales de OpenAI staging.");
  }
  const { openAi } = configuration;
  const database = createDatabaseClient(configuration.databaseUrl.reveal());
  const audit = new ConsoleAudit();
  const runs = new InMemoryContentBriefRunRepository();
  try {
    // Cuando el grupo comercial no está inyectado, el smoke usa el adaptador de
    // fixtures de `P3-T05`. Lo que interesa verificar acá es el camino nuevo
    // —esquema estricto y ciclo real de function calling contra la Responses
    // API—; la API comercial real ya tiene su propio smoke en `P3-T06`.
    const catalogSource = configuration.commercialCatalog.enabled
      ? "odoo"
      : "fixtures";
    const membership = await database.organizationMembership.findFirstOrThrow({
      orderBy: { id: "asc" },
      where: {
        ...(configuration.commercialCatalog.enabled
          ? {
              organizationId:
                configuration.commercialCatalog.credentials.organizationId,
            }
          : {}),
        status: "active",
      },
    });
    const location = await database.location.findFirstOrThrow({
      orderBy: { id: "asc" },
      where: { organizationId: membership.organizationId },
    });
    const credentials = configuration.commercialCatalog.enabled
      ? configuration.commercialCatalog.credentials
      : {
          baseUrl: "https://fixtures.invalid",
          locationMappings: [
            {
              externalLocationId: "casa-central" as const,
              platformLocationId: location.id,
            },
          ],
          organizationId: membership.organizationId,
          token: new SecretValue("fixtures"),
        };
    const policy = configuration.commercialCatalog.enabled
      ? configuration.commercialCatalog.policy
      : { maximumCallsPerRun: 8, requestTimeoutMilliseconds: 15_000 };
    const catalog = configuration.commercialCatalog.enabled
      ? new OdooCommercialCatalogAdapter(credentials, policy)
      : new ScopedFixtureCatalog();
    const locationId = credentials.locationMappings[0]?.platformLocationId;
    if (locationId === undefined) {
      throw new Error("El smoke requiere al menos una sucursal mapeada.");
    }

    const service = new ContentBriefGenerationService(
      new EmptyKnowledge(),
      new CommercialToolExecutionService(catalog, audit, credentials, policy),
      new OpenAITextGenerationGateway(
        openAi.policy,
        new OfficialOpenAIResponsesTransport(openAi.credentials, openAi.policy),
      ),
      runs,
    );

    const runId = randomUUID();
    const requestText =
      "Quiero una pieza para difundir una amoladora angular que tengamos disponible hoy.";
    const requestedAt = new Date().toISOString();
    await runs.reserve({
      actorMembershipId: membership.id,
      id: runId,
      locationId,
      organizationId: credentials.organizationId,
      request: requestText,
      requestHash: createHash("sha256").update(requestText).digest("hex"),
      requestedAt,
    });

    const result = await service.generate({
      actorMembershipId: membership.id,
      locationId,
      locationName: location.name,
      organizationId: credentials.organizationId,
      request: requestText,
      requestedAt,
      runId,
    });

    const record = runs.records[0];
    if (record === undefined) {
      throw new Error("El smoke no registró la ejecución.");
    }

    process.stdout.write(
      [
        "Brief staging verificado.",
        `status=${result.status}`,
        `catalog=${catalogSource}`,
        `model=${record.model}`,
        `promptVersion=${record.promptVersion}`,
        `schemaVersion=${record.schemaVersion}`,
        `toolCalls=${record.toolInvocations
          .map((invocation) => `${invocation.toolName}:${invocation.outcome}`)
          .join(",")}`,
        `auditEvents=${String(audit.events.length)}`,
        `evidence=${String(record.evidence.length)}`,
        `facts=${String(record.brief?.verifiedFacts.length ?? 0)}`,
        `missing=${record.brief?.missingInformation.map((entry) => entry.subject).join(",") ?? "-"}`,
        `approval=${String(record.brief?.requiresHumanApproval ?? false)}`,
        `tokens=${String(record.usage.totalTokens)}`,
        `estimatedCostUsd=${record.estimatedCostUsd?.toFixed(8) ?? "unavailable"}`,
        result.status === "rejected" ? `rejection=${result.code}` : "",
        result.status === "discarded" ? "rejection=run-discarded" : "",
      ]
        .filter((entry) => entry.length > 0)
        .join(" "),
    );
    process.stdout.write("\n");
  } finally {
    await database.$disconnect();
  }
}

try {
  await runBriefSmoke();
} catch (cause: unknown) {
  process.stderr.write(
    `El smoke del brief falló: ${cause instanceof Error ? cause.message : "error desconocido"}\n`,
  );
  process.exitCode = 1;
}
