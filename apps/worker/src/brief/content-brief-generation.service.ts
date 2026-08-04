/**
 * Caso de uso del brief estructurado.
 *
 * Orquesta tres cosas que ya existen y no se mezclan: la recuperación
 * documental con citas, las herramientas comerciales auditadas y el gateway de
 * generación. Su responsabilidad propia es construir el ledger de evidencia,
 * validar la salida contra ese ledger y dejar la ejecución registrada.
 *
 * Un rechazo nunca devuelve brief. La única forma de obtener uno es que todo
 * haya cerrado: evidencia existente, del tipo correcto y vigente.
 */

import {
  ContentBriefRequestError,
  ContentBriefValidationError,
  contentBriefLimits,
  CommercialToolExecutionError,
  GenerationGatewayError,
  parseContentBriefJson,
  validateContentBrief,
  type CommercialObservation,
  type ContentBriefEvidenceEntry,
  type ContentBriefGenerationResult,
  type ContentBriefRunCompletion,
  type ContentBriefRunEvidence,
  type ContentBriefRunRepository,
  type ContentBriefRunToolInvocation,
  type FactualClaimKind,
  type GenerationTokenUsage,
  type KnowledgeRetrievalResult,
  type StructuredGenerationPort,
} from "@aramayo/domain";

import type {
  CommercialToolExecutionPort,
  CommercialToolExecutionSession,
} from "../catalog/commercial-tool-execution.service.ts";
import type { RetrieveKnowledgeCommand } from "../knowledge/knowledge-retrieval.service.ts";
import {
  buildContentBriefInput,
  contentBriefInstructions,
  contentBriefPromptHash,
  contentBriefPromptVersion,
} from "./content-brief-prompt.ts";
import { contentBriefSchema } from "./content-brief-schema.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const contentBriefGenerationLimits = Object.freeze({
  maximumToolIterations: 4,
});

/**
 * Un documento aprobado puede sustentar hechos estables. Nunca precio ni stock
 * —que exigen lectura vigente del sistema comercial— ni promoción, que exige
 * autorización humana versionada por pieza.
 */
const documentClaimKinds: readonly FactualClaimKind[] = Object.freeze([
  "business_hours",
  "location",
  "product_attribute",
  "service",
]);

const emptyUsage: GenerationTokenUsage = Object.freeze({
  cacheWriteInputTokens: 0,
  cachedInputTokens: 0,
  estimatedCostUsd: null,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
});

/**
 * Lo único que el brief necesita de la capa documental. Mantenerlo como puerto
 * evita acoplar el caso de uso a la construcción del servicio de recuperación.
 */
export interface KnowledgeRetrievalPort {
  retrieve(
    command: RetrieveKnowledgeCommand,
  ): Promise<KnowledgeRetrievalResult>;
}

export interface GenerateContentBriefCommand {
  readonly actorMembershipId: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly organizationId: string;
  readonly request: string;
  readonly requestedAt: string;
  /** Ejecución ya reservada por la API; el worker sólo la resuelve. */
  readonly runId: string;
}

interface GenerationDependencies {
  readonly clock?: () => Date;
}

/**
 * Qué puede sustentar realmente cada observación.
 *
 * Un precio ausente no sustenta un precio, un stock no informado no sustenta
 * stock y una recepción confirmada no prueba disponibilidad. La observación se
 * conserva igual para trazabilidad: existe, pero no habilita afirmar.
 */
function commercialClaimKinds(
  observation: CommercialObservation,
): readonly FactualClaimKind[] {
  switch (observation.kind) {
    case "price":
      return observation.resolution === "priced"
        ? Object.freeze(["price" as const])
        : Object.freeze([]);
    case "stock":
      return observation.resolution === "known"
        ? Object.freeze(["stock" as const])
        : Object.freeze([]);
    case "product":
      return observation.resolution === "active" ||
        observation.resolution === "discontinued"
        ? Object.freeze(["product_attribute" as const])
        : Object.freeze([]);
    case "receipt":
      return Object.freeze([]);
  }
}

/**
 * Anota el resultado con los identificadores citables sin volver a parsearlo:
 * `output` ya es un documento JSON válido producido por el ejecutor.
 */
function annotatedToolOutput(
  output: string,
  entries: readonly ContentBriefEvidenceEntry[],
): string {
  const evidence = JSON.stringify(
    entries.map((entry) => ({
      citation_id: entry.citationId,
      external_product_id: entry.externalProductId,
      observed_at: entry.observedAt,
      supports: [...entry.supportedClaims],
    })),
  );
  return `{"evidence":${evidence},"tool_result":${output}}`;
}

function runEvidence(
  entries: readonly ContentBriefEvidenceEntry[],
): readonly ContentBriefRunEvidence[] {
  return Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        citationId: entry.citationId,
        kind: entry.kind,
        observedAt: entry.observedAt,
        reference: entry.reference,
      }),
    ),
  );
}

export class ContentBriefGenerationService {
  readonly #clock: () => Date;
  readonly #commercial: CommercialToolExecutionPort;
  readonly #generation: StructuredGenerationPort;
  readonly #knowledge: KnowledgeRetrievalPort;
  readonly #runs: ContentBriefRunRepository;

  constructor(
    knowledge: KnowledgeRetrievalPort,
    commercial: CommercialToolExecutionPort,
    generation: StructuredGenerationPort,
    runs: ContentBriefRunRepository,
    dependencies: GenerationDependencies = {},
  ) {
    this.#clock = dependencies.clock ?? ((): Date => new Date());
    this.#commercial = commercial;
    this.#generation = generation;
    this.#knowledge = knowledge;
    this.#runs = runs;
  }

  async generate(
    command: GenerateContentBriefCommand,
  ): Promise<ContentBriefGenerationResult> {
    const request = command.request.replaceAll(/\s+/gu, " ").trim();
    this.#validate(command, request);

    const runId = command.runId;
    const evidence: ContentBriefEvidenceEntry[] = [];
    const toolInvocations: ContentBriefRunToolInvocation[] = [];
    const context = {
      command,
      evidence,
      request,
      runId,
      toolInvocations,
    };

    if (this.#commercial.definitions.length === 0) {
      return this.#reject(
        context,
        "commercial-unavailable",
        "El catálogo comercial no está disponible para sustentar el brief.",
        "unavailable",
      );
    }

    let documentContext = "";
    let knowledgeStatus: string;
    try {
      const retrieval = await this.#knowledge.retrieve({
        locationId: command.locationId,
        organizationId: command.organizationId,
        question: request,
        requestedAt: command.requestedAt,
      });
      knowledgeStatus = retrieval.status;
      if (retrieval.status === "grounded") {
        documentContext = retrieval.context;
        for (const citation of retrieval.evidence) {
          evidence.push(
            Object.freeze({
              citationId: citation.citationId,
              externalProductId: null,
              kind: "document",
              observedAt: null,
              reference: `${citation.sourceKey}@${String(citation.version)}`,
              supportedClaims: documentClaimKinds,
            }),
          );
        }
      } else {
        knowledgeStatus = `missing_information:${retrieval.missingInformation.join("|")}`;
      }
    } catch (cause: unknown) {
      return this.#reject(
        context,
        "knowledge-unavailable",
        "La recuperación documental no pudo completarse.",
        "unavailable",
        cause,
      );
    }

    let session: CommercialToolExecutionSession;
    try {
      session = this.#commercial.createSession({
        actorMembershipId: command.actorMembershipId,
        locationId: command.locationId,
        organizationId: command.organizationId,
        runId,
      });
    } catch (cause: unknown) {
      return this.#reject(
        context,
        "commercial-unavailable",
        "El catálogo comercial rechazó el alcance de la sesión.",
        knowledgeStatus,
        cause,
      );
    }

    try {
      const generation = await this.#generation.generateStructured({
        executeTool: async (invocation) => {
          const result = await session.execute({
            arguments: invocation.arguments,
            callId: invocation.callId,
            name: invocation.name,
          });
          toolInvocations.push(
            Object.freeze({
              callId: result.callId,
              outcome: result.outcome,
              toolName: result.toolName ?? "rejected",
            }),
          );
          const added = result.observations.map((observation) =>
            this.#appendCommercialEvidence(evidence, observation),
          );
          return {
            callId: result.callId,
            output: annotatedToolOutput(result.output, added),
          };
        },
        input: buildContentBriefInput({
          documentContext,
          evidence,
          locationName: command.locationName,
          request,
          requestedAt: command.requestedAt,
        }),
        instructions: contentBriefInstructions,
        maximumToolIterations:
          contentBriefGenerationLimits.maximumToolIterations,
        schema: contentBriefSchema,
        tools: this.#commercial.definitions.map((definition) => ({
          description: definition.description,
          name: definition.name,
          parameters: definition.parameters,
        })),
        workload: "brief",
      });

      const brief = validateContentBrief({
        candidate: parseContentBriefJson(generation.outputText),
        evidence,
        validatedAt: this.#clock().toISOString(),
      });

      const outcome = await this.#runs.complete(
        {
          attempts: generation.execution.attempts,
          brief,
          estimatedCostUsd: generation.usage.estimatedCostUsd,
          evidence: runEvidence(evidence),
          id: runId,
          knowledgeStatus,
          latencyMilliseconds: generation.execution.latencyMilliseconds,
          model: generation.execution.model,
          organizationId: command.organizationId,
          promptHash: contentBriefPromptHash,
          promptVersion: contentBriefPromptVersion,
          rejection: null,
          requestId: generation.execution.requestId,
          responseId: generation.execution.responseId,
          schemaVersion: contentBriefSchema.version,
          status: "generated",
          toolInvocations: Object.freeze([...toolInvocations]),
          toolNames: this.#toolNames(),
          usage: generation.usage,
        },
        this.#clock().toISOString(),
      );

      // El editor pudo cancelar mientras el modelo trabajaba. Un resultado
      // tardío no puede quedar vigente ni volver como brief utilizable.
      if (outcome.status !== "completed") {
        return Object.freeze({ runId, status: "discarded" });
      }

      return Object.freeze({ brief, runId, status: "generated" });
    } catch (cause: unknown) {
      return this.#reject(
        context,
        rejectionCode(cause),
        rejectionMessage(cause),
        knowledgeStatus,
        cause,
      );
    }
  }

  #appendCommercialEvidence(
    evidence: ContentBriefEvidenceEntry[],
    observation: CommercialObservation,
  ): ContentBriefEvidenceEntry {
    const commercialCount = evidence.filter(
      (entry) => entry.kind === "commercial",
    ).length;
    const entry: ContentBriefEvidenceEntry = Object.freeze({
      citationId: `C${String(commercialCount + 1)}`,
      externalProductId: observation.externalProductId,
      kind: "commercial",
      observedAt: observation.observedAt,
      reference: observation.evidenceReference,
      supportedClaims: commercialClaimKinds(observation),
    });
    evidence.push(entry);
    return entry;
  }

  async #reject(
    context: {
      readonly command: GenerateContentBriefCommand;
      readonly evidence: readonly ContentBriefEvidenceEntry[];
      readonly request: string;
      readonly runId: string;
      readonly toolInvocations: readonly ContentBriefRunToolInvocation[];
    },
    code: string,
    message: string,
    knowledgeStatus: string,
    cause?: unknown,
  ): Promise<ContentBriefGenerationResult> {
    const execution =
      cause instanceof GenerationGatewayError
        ? {
            attempts: cause.attempts,
            latencyMilliseconds: cause.latencyMilliseconds,
            model: cause.model ?? "unselected",
            requestId: cause.requestId ?? null,
          }
        : {
            attempts: 0,
            latencyMilliseconds: 0,
            model: "unselected",
            requestId: null,
          };

    const completion: ContentBriefRunCompletion = {
      attempts: execution.attempts,
      brief: null,
      estimatedCostUsd: null,
      evidence: runEvidence(context.evidence),
      id: context.runId,
      knowledgeStatus,
      latencyMilliseconds: execution.latencyMilliseconds,
      model: execution.model,
      organizationId: context.command.organizationId,
      promptHash: contentBriefPromptHash,
      promptVersion: contentBriefPromptVersion,
      rejection: { code, message },
      requestId: execution.requestId,
      responseId: null,
      schemaVersion: contentBriefSchema.version,
      status: "rejected",
      toolInvocations: Object.freeze([...context.toolInvocations]),
      toolNames: this.#toolNames(),
      usage: emptyUsage,
    };
    const outcome = await this.#runs.complete(
      completion,
      this.#clock().toISOString(),
    );
    if (outcome.status !== "completed") {
      return Object.freeze({ runId: context.runId, status: "discarded" });
    }

    return Object.freeze({
      code,
      message,
      runId: context.runId,
      status: "rejected",
    });
  }

  #toolNames(): readonly string[] {
    return Object.freeze(
      this.#commercial.definitions.map((definition) => definition.name),
    );
  }

  #validate(command: GenerateContentBriefCommand, request: string): void {
    if (!UUID.test(command.organizationId)) {
      throw new ContentBriefRequestError(
        "invalid-organization",
        "La organización del pedido no es válida.",
      );
    }
    if (!UUID.test(command.actorMembershipId)) {
      throw new ContentBriefRequestError(
        "invalid-actor",
        "La membresía autora del pedido no es válida.",
      );
    }
    if (command.locationId !== null && !UUID.test(command.locationId)) {
      throw new ContentBriefRequestError(
        "invalid-location",
        "La sucursal del pedido no es válida.",
      );
    }
    if (
      request.length < contentBriefLimits.requestMinimum ||
      request.length > contentBriefLimits.requestMaximum
    ) {
      throw new ContentBriefRequestError(
        "invalid-request",
        "El pedido debe tener entre 8 y 600 caracteres.",
      );
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T/u.test(command.requestedAt) ||
      !Number.isFinite(Date.parse(command.requestedAt))
    ) {
      throw new ContentBriefRequestError(
        "invalid-timestamp",
        "El pedido requiere un timestamp ISO válido.",
      );
    }
  }
}

function rejectionCode(cause: unknown): string {
  if (cause instanceof ContentBriefValidationError) {
    return cause.code;
  }
  if (cause instanceof GenerationGatewayError) {
    return cause.code;
  }
  if (cause instanceof CommercialToolExecutionError) {
    return `commercial-${cause.code}`;
  }
  return "unexpected-error";
}

function rejectionMessage(cause: unknown): string {
  if (cause instanceof ContentBriefValidationError) {
    return `${cause.message} (${cause.field})`;
  }
  if (
    cause instanceof GenerationGatewayError ||
    cause instanceof CommercialToolExecutionError
  ) {
    return cause.message;
  }
  return "La generación del brief no pudo completarse.";
}
