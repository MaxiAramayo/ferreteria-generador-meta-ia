/**
 * Arnés de evaluación.
 *
 * Sustituye únicamente las fuentes —conocimiento documental y catálogo
 * comercial— por el guion del caso. Todo lo demás es el sistema real: el mismo
 * prompt versionado, el mismo esquema estricto, el mismo ciclo de herramientas
 * y la misma validación contra el ledger de evidencia.
 *
 * Esa frontera es deliberada: si la evaluación reemplazara la validación,
 * mediría el arnés en lugar del sistema.
 */

import { randomUUID } from "node:crypto";

import { SecretValue } from "@aramayo/configuration";

import {
  CommercialCatalogError,
  scoreBriefEvaluationCase,
  summarizeBriefEvaluation,
  type BriefEvaluationCaseResult,
  type BriefEvaluationReport,
  type CommercialCatalogPort,
  type CommercialToolAuditEvent,
  type CommercialToolAuditPort,
  type GetPriceQuery,
  type GetProductQuery,
  type GetReceiptStatusQuery,
  type GetStockQuery,
  type KnowledgeRetrievalResult,
  type PriceLookupResult,
  type ProductLookupResult,
  type ReceiptStatusResult,
  type SearchProductsQuery,
  type SearchProductsResult,
  type StockLookupResult,
  type StructuredGenerationPort,
} from "@aramayo/domain";

import { CommercialToolExecutionService } from "../catalog/commercial-tool-execution.service.ts";
import { InMemoryContentBriefRunRepository } from "../brief/in-memory-content-brief-runs.ts";
import {
  ContentBriefGenerationService,
  type KnowledgeRetrievalPort,
} from "../brief/content-brief-generation.service.ts";
import {
  contentBriefPromptHash,
  contentBriefPromptVersion,
} from "../brief/content-brief-prompt.ts";
import { contentBriefSchema } from "../brief/content-brief-schema.ts";
import {
  briefEvaluationDataset,
  briefEvaluationDatasetVersion,
  type BriefEvaluationCatalogScript,
  type BriefEvaluationDatasetEntry,
} from "./brief-evaluation-dataset.ts";

/** Muestra para revisión humana; nunca entra a la línea base congelada. */
export interface BriefEvaluationSample {
  readonly caseId: string;
  readonly caption: string | null;
  readonly missingInformation: readonly string[];
  readonly rejection: string | null;
  readonly title: string | null;
}

export interface BriefEvaluationRun {
  readonly report: BriefEvaluationReport;
  readonly samples: readonly BriefEvaluationSample[];
}

class ScriptedKnowledge implements KnowledgeRetrievalPort {
  readonly #result: KnowledgeRetrievalResult;

  constructor(result: KnowledgeRetrievalResult) {
    this.#result = result;
  }

  retrieve(): Promise<KnowledgeRetrievalResult> {
    return Promise.resolve(this.#result);
  }
}

class ScriptedCatalog implements CommercialCatalogPort {
  readonly #script: BriefEvaluationCatalogScript;

  constructor(script: BriefEvaluationCatalogScript) {
    this.#script = script;
  }

  searchProducts(query: SearchProductsQuery): Promise<SearchProductsResult> {
    void query;
    return Promise.resolve(this.#script.search);
  }

  getProduct(query: GetProductQuery): Promise<ProductLookupResult> {
    const found = this.#script.productsById[query.externalProductId];
    return Promise.resolve(
      found ?? { evidence: this.#script.search.evidence, kind: "not-found" },
    );
  }

  getPrice(query: GetPriceQuery): Promise<PriceLookupResult> {
    void query;
    return Promise.resolve(this.#script.price);
  }

  getStock(query: GetStockQuery): Promise<StockLookupResult> {
    void query;
    return Promise.resolve(this.#script.stock);
  }

  getReceiptStatus(query: GetReceiptStatusQuery): Promise<ReceiptStatusResult> {
    void query;
    return Promise.reject(
      new CommercialCatalogError(
        "unavailable",
        "La evaluación no cubre recepciones.",
        false,
      ),
    );
  }
}

class DiscardedAudit implements CommercialToolAuditPort {
  record(event: CommercialToolAuditEvent): Promise<void> {
    void event;
    return Promise.resolve();
  }
}

export interface BriefEvaluationScope {
  readonly actorMembershipId: string;
  readonly locationId: string;
  readonly organizationId: string;
}

export class BriefEvaluationService {
  readonly #dataset: readonly BriefEvaluationDatasetEntry[];
  readonly #generation: StructuredGenerationPort;
  readonly #scope: BriefEvaluationScope;

  constructor(
    generation: StructuredGenerationPort,
    scope: BriefEvaluationScope,
    dataset: readonly BriefEvaluationDatasetEntry[] = briefEvaluationDataset,
  ) {
    this.#dataset = dataset;
    this.#generation = generation;
    this.#scope = scope;
  }

  async run(model: string): Promise<BriefEvaluationRun> {
    const results: BriefEvaluationCaseResult[] = [];
    const samples: BriefEvaluationSample[] = [];

    for (const entry of this.#dataset) {
      const runs = new InMemoryContentBriefRunRepository();
      const runId = randomUUID();
      await runs.reserve({
        actorMembershipId: this.#scope.actorMembershipId,
        id: runId,
        locationId: this.#scope.locationId,
        organizationId: this.#scope.organizationId,
        request: entry.request,
        requestHash: "0".repeat(64),
        requestedAt: new Date().toISOString(),
      });
      const service = new ContentBriefGenerationService(
        new ScriptedKnowledge(entry.knowledge),
        new CommercialToolExecutionService(
          new ScriptedCatalog(entry.catalog),
          new DiscardedAudit(),
          {
            baseUrl: "https://evaluation.invalid",
            locationMappings: [
              {
                externalLocationId: "casa-central",
                platformLocationId: this.#scope.locationId,
              },
            ],
            organizationId: this.#scope.organizationId,
            token: new SecretValue("evaluation"),
          },
          { maximumCallsPerRun: 8, requestTimeoutMilliseconds: 15_000 },
        ),
        this.#generation,
        runs,
      );

      const result = await service.generate({
        actorMembershipId: this.#scope.actorMembershipId,
        locationId: this.#scope.locationId,
        locationName: "Casa Central",
        organizationId: this.#scope.organizationId,
        request: entry.request,
        requestedAt: new Date().toISOString(),
        runId,
      });

      results.push(scoreBriefEvaluationCase(entry.evaluationCase, result));
      samples.push(
        result.status === "generated"
          ? {
              caption: result.brief.caption,
              caseId: entry.evaluationCase.id,
              missingInformation: result.brief.missingInformation.map(
                (missing) => missing.subject,
              ),
              rejection: null,
              title: result.brief.title,
            }
          : {
              caption: null,
              caseId: entry.evaluationCase.id,
              missingInformation: [],
              rejection:
                result.status === "rejected" ? result.code : "run-discarded",
              title: null,
            },
      );
    }

    return {
      report: {
        cases: results,
        datasetVersion: briefEvaluationDatasetVersion,
        generatedAt: new Date().toISOString(),
        metrics: summarizeBriefEvaluation(results),
        model,
        promptHash: contentBriefPromptHash,
        promptVersion: contentBriefPromptVersion,
        schemaVersion: contentBriefSchema.version,
      },
      samples,
    };
  }
}

export function evaluationScope(): BriefEvaluationScope {
  return {
    actorMembershipId: randomUUID(),
    locationId: randomUUID(),
    organizationId: randomUUID(),
  };
}
