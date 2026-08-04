import { createHash, randomUUID } from "node:crypto";

import type {
  CommercialCatalogCredentials,
  CommercialCatalogPolicy,
  CommercialExternalLocationId,
} from "@aramayo/configuration";
import {
  commercialToolLimits,
  commercialToolNames,
  CommercialCatalogError,
  CommercialToolExecutionError,
  type CommercialCatalogPort,
  type CommercialEvidence,
  type CommercialObservation,
  type CommercialObservationKind,
  type CommercialToolAuditPort,
  type CommercialToolCall,
  type CommercialToolExecutionResult,
  type CommercialToolExecutionScope,
  type CommercialToolName,
  type SafeJsonObject,
} from "@aramayo/domain";

import {
  commercialToolDefinitions,
  type StrictCommercialToolDefinition,
} from "./commercial-tool-definitions.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const callIdPattern = /^[A-Za-z0-9_-]{1,160}$/u;
const externalProductIdPattern = /^odoo-product-[1-9][0-9]*$/u;
const externalReceiptIdPattern = /^odoo-receipt-[1-9][0-9]*$/u;

type ParsedToolArguments =
  | Readonly<{
      externalProductId: string;
      toolName: "get_current_price" | "get_product" | "get_stock_by_location";
    }>
  | Readonly<{
      externalReceiptId: string;
      toolName: "get_receipt_status";
    }>
  | Readonly<{
      limit: number;
      query: string;
      toolName: "search_products";
    }>;

interface ExecutionDependencies {
  readonly clock?: () => number;
  readonly eventId?: () => string;
}

export interface CommercialToolExecutionSession {
  execute(call: CommercialToolCall): Promise<CommercialToolExecutionResult>;
}

export interface CommercialToolExecutionPort {
  readonly definitions: readonly StrictCommercialToolDefinition[];
  createSession(
    scope: CommercialToolExecutionScope,
  ): CommercialToolExecutionSession;
}

function isToolName(name: string): name is CommercialToolName {
  return (commercialToolNames as readonly string[]).includes(name);
}

function unknownRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CommercialCatalogError(
      "invalid-request",
      "Los argumentos de herramienta deben ser un objeto JSON.",
      false,
    );
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactArgumentKeys(
  source: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): void {
  const actual = Object.keys(source).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new CommercialCatalogError(
      "invalid-request",
      "La herramienta recibió argumentos no permitidos.",
      false,
    );
  }
}

function identifier(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new CommercialCatalogError(
      "invalid-request",
      `${field} no es válido.`,
      false,
    );
  }
  return value;
}

function parseArguments(
  toolName: CommercialToolName,
  rawArguments: string,
): ParsedToolArguments {
  if (
    rawArguments.length < 2 ||
    rawArguments.length > commercialToolLimits.argumentsCharactersMaximum
  ) {
    throw new CommercialCatalogError(
      "invalid-request",
      "Los argumentos de herramienta exceden el límite permitido.",
      false,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new CommercialCatalogError(
      "invalid-request",
      "Los argumentos de herramienta no son JSON válido.",
      false,
    );
  }
  const source = unknownRecord(parsed);
  switch (toolName) {
    case "search_products": {
      exactArgumentKeys(source, ["limit", "query"]);
      if (
        typeof source["query"] !== "string" ||
        typeof source["limit"] !== "number"
      ) {
        throw new CommercialCatalogError(
          "invalid-request",
          "La búsqueda comercial no respeta el esquema.",
          false,
        );
      }
      const query = source["query"].trim().replaceAll(/\s+/gu, " ");
      if (
        query.length < 2 ||
        query.length > 120 ||
        !Number.isSafeInteger(source["limit"]) ||
        source["limit"] < 1 ||
        source["limit"] > commercialToolLimits.searchResultsMaximum
      ) {
        throw new CommercialCatalogError(
          "invalid-request",
          "La búsqueda comercial no respeta sus límites.",
          false,
        );
      }
      return Object.freeze({
        limit: source["limit"],
        query,
        toolName,
      });
    }
    case "get_product":
    case "get_current_price":
    case "get_stock_by_location":
      exactArgumentKeys(source, ["externalProductId"]);
      return Object.freeze({
        externalProductId: identifier(
          source["externalProductId"],
          externalProductIdPattern,
          "externalProductId",
        ),
        toolName,
      });
    case "get_receipt_status":
      exactArgumentKeys(source, ["externalReceiptId"]);
      return Object.freeze({
        externalReceiptId: identifier(
          source["externalReceiptId"],
          externalReceiptIdPattern,
          "externalReceiptId",
        ),
        toolName,
      });
  }
}

function safeArgumentMetadata(
  call: CommercialToolCall,
  parsed: ParsedToolArguments | null,
): SafeJsonObject {
  if (parsed === null) {
    let argumentNames: readonly string[] = Object.freeze([]);
    try {
      argumentNames = Object.freeze(
        Object.keys(unknownRecord(JSON.parse(call.arguments))),
      );
    } catch {
      // La metadata conserva únicamente el tamaño cuando el JSON es inválido.
    }
    return Object.freeze({
      argumentCharacters: call.arguments.length,
      argumentNames,
    });
  }
  switch (parsed.toolName) {
    case "search_products":
      return Object.freeze({
        argumentNames: Object.freeze(["limit", "query"]),
        limit: parsed.limit,
        queryCharacters: parsed.query.length,
      });
    case "get_product":
    case "get_current_price":
    case "get_stock_by_location":
      return Object.freeze({
        argumentNames: Object.freeze(["externalProductId"]),
        identifierHash: createHash("sha256")
          .update(parsed.externalProductId)
          .digest("hex"),
      });
    case "get_receipt_status":
      return Object.freeze({
        argumentNames: Object.freeze(["externalReceiptId"]),
        identifierHash: createHash("sha256")
          .update(parsed.externalReceiptId)
          .digest("hex"),
      });
  }
}

interface ExecutedTool {
  readonly observations: readonly CommercialObservation[];
  readonly value: unknown;
}

/** Un intento fallido o rechazado no observa nada y no puede sustentar nada. */
const noObservations: readonly CommercialObservation[] = Object.freeze([]);

function observation(
  kind: CommercialObservationKind,
  evidence: CommercialEvidence,
  externalProductId: string | null,
  resolution: string,
): CommercialObservation {
  return Object.freeze({
    evidenceReference: evidence.reference,
    externalProductId,
    kind,
    observedAt: evidence.observedAt,
    resolution,
    sourceKind: evidence.sourceKind,
  });
}

function failureOutput(
  code:
    | "invalid-arguments"
    | "provider-disabled"
    | "rate-limit"
    | "timeout"
    | "unavailable",
  retryable: boolean,
): string {
  return JSON.stringify({
    error: { code, retryable },
    status: "error",
  });
}

function resultKind(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "success";
  }
  const kind = (value as Readonly<Record<string, unknown>>)["kind"];
  return typeof kind === "string" && /^[a-z][a-z-]{0,39}$/u.test(kind)
    ? kind
    : "success";
}

class EnabledCommercialToolExecutionSession implements CommercialToolExecutionSession {
  readonly #allowedOrganizationId: string;
  readonly #audit: CommercialToolAuditPort;
  readonly #catalog: CommercialCatalogPort;
  readonly #clock: () => number;
  readonly #eventId: () => string;
  readonly #locationMappings: ReadonlyMap<string, CommercialExternalLocationId>;
  readonly #maximumCalls: number;
  readonly #scope: CommercialToolExecutionScope;
  #calls = 0;

  constructor(
    scope: CommercialToolExecutionScope,
    catalog: CommercialCatalogPort,
    audit: CommercialToolAuditPort,
    credentials: CommercialCatalogCredentials,
    policy: CommercialCatalogPolicy,
    dependencies: ExecutionDependencies,
  ) {
    this.#allowedOrganizationId = credentials.organizationId;
    this.#audit = audit;
    this.#catalog = catalog;
    this.#clock = dependencies.clock ?? Date.now;
    this.#eventId = dependencies.eventId ?? randomUUID;
    this.#locationMappings = new Map(
      credentials.locationMappings.map((mapping) => [
        mapping.platformLocationId,
        mapping.externalLocationId,
      ]),
    );
    this.#maximumCalls = policy.maximumCallsPerRun;
    this.#scope = scope;
  }

  async execute(
    call: CommercialToolCall,
  ): Promise<CommercialToolExecutionResult> {
    const startedAt = this.#clock();
    const safeCallId = callIdPattern.test(call.callId)
      ? call.callId
      : "invalid-call";
    const toolName = isToolName(call.name) ? call.name : null;
    let parsed: ParsedToolArguments | null = null;
    this.#calls += 1;

    try {
      this.#validateScope();
      if (this.#calls > this.#maximumCalls) {
        const output = failureOutput("rate-limit", false);
        await this.#record(
          safeCallId,
          toolName,
          startedAt,
          "failure",
          "rate-limit",
          safeArgumentMetadata(call, null),
        );
        return Object.freeze({
          callId: safeCallId,
          observations: noObservations,
          outcome: "failure",
          output,
          toolName,
        });
      }
      if (toolName === null || safeCallId === "invalid-call") {
        throw new CommercialCatalogError(
          "invalid-request",
          "La llamada no corresponde a una herramienta permitida.",
          false,
        );
      }
      parsed = parseArguments(toolName, call.arguments);
      const executed = await this.#executeParsed(parsed);
      const output = JSON.stringify({ data: executed.value, status: "ok" });
      if (output.length > commercialToolLimits.outputCharactersMaximum) {
        throw new CommercialCatalogError(
          "unavailable",
          "El resultado comercial supera el límite permitido.",
          false,
        );
      }
      await this.#record(
        safeCallId,
        toolName,
        startedAt,
        "success",
        resultKind(executed.value),
        safeArgumentMetadata(call, parsed),
      );
      return Object.freeze({
        callId: safeCallId,
        observations: Object.freeze([...executed.observations]),
        outcome: "success",
        output,
        toolName,
      });
    } catch (cause: unknown) {
      const failure =
        cause instanceof CommercialCatalogError
          ? cause
          : cause instanceof CommercialToolExecutionError
            ? cause
            : new CommercialCatalogError(
                "unavailable",
                "La herramienta comercial no pudo completarse.",
                false,
              );
      const code =
        failure instanceof CommercialToolExecutionError
          ? "unavailable"
          : failure.code === "invalid-request"
            ? "invalid-arguments"
            : failure.code;
      await this.#record(
        safeCallId,
        toolName,
        startedAt,
        "failure",
        code,
        safeArgumentMetadata(call, parsed),
      );
      if (failure instanceof CommercialToolExecutionError) {
        throw failure;
      }
      return Object.freeze({
        callId: safeCallId,
        observations: noObservations,
        outcome: "failure",
        output: failureOutput(code, failure.retryable),
        toolName,
      });
    }
  }

  async #executeParsed(parsed: ParsedToolArguments): Promise<ExecutedTool> {
    switch (parsed.toolName) {
      case "search_products": {
        const result = await this.#catalog.searchProducts({
          limit: parsed.limit,
          organizationId: this.#scope.organizationId,
          query: parsed.query,
        });
        return {
          observations: result.matches.map((product) =>
            observation(
              "product",
              product.evidence,
              product.externalId,
              product.status,
            ),
          ),
          value: result,
        };
      }
      case "get_product": {
        const result = await this.#catalog.getProduct({
          externalProductId: parsed.externalProductId,
          organizationId: this.#scope.organizationId,
        });
        return {
          observations: [
            result.kind === "found"
              ? observation(
                  "product",
                  result.product.evidence,
                  result.product.externalId,
                  result.product.status,
                )
              : observation(
                  "product",
                  result.evidence,
                  parsed.externalProductId,
                  result.kind,
                ),
          ],
          value: result,
        };
      }
      case "get_current_price": {
        const result = await this.#catalog.getPrice({
          externalProductId: parsed.externalProductId,
          locationId: this.#requiredExternalLocation(),
          organizationId: this.#scope.organizationId,
        });
        return {
          observations: [
            observation(
              "price",
              result.evidence,
              parsed.externalProductId,
              result.kind,
            ),
          ],
          value: result,
        };
      }
      case "get_stock_by_location": {
        const result = await this.#catalog.getStock({
          externalProductId: parsed.externalProductId,
          locationId: this.#requiredExternalLocation(),
          organizationId: this.#scope.organizationId,
        });
        return {
          observations: [
            observation(
              "stock",
              result.evidence,
              parsed.externalProductId,
              result.kind,
            ),
          ],
          value: result,
        };
      }
      case "get_receipt_status": {
        const result = await this.#catalog.getReceiptStatus({
          externalReceiptId: parsed.externalReceiptId,
          organizationId: this.#scope.organizationId,
        });
        return {
          observations: [
            observation("receipt", result.evidence, null, result.kind),
          ],
          value: result,
        };
      }
    }
  }

  async #record(
    callId: string,
    toolName: CommercialToolName | null,
    startedAt: number,
    outcome: "failure" | "success",
    kind: string,
    safeParameters: SafeJsonObject,
  ): Promise<void> {
    const finishedAt = this.#clock();
    try {
      await this.#audit.record({
        actorMembershipId: this.#scope.actorMembershipId,
        callId,
        durationMilliseconds: Math.max(0, Math.round(finishedAt - startedAt)),
        eventId: this.#eventId(),
        occurredAt: new Date(finishedAt).toISOString(),
        organizationId: this.#scope.organizationId,
        outcome,
        resultKind: kind,
        runId: this.#scope.runId,
        safeParameters,
        toolName,
      });
    } catch {
      throw new CommercialToolExecutionError(
        "audit-failed",
        "La invocación comercial no pudo auditarse.",
      );
    }
  }

  #requiredExternalLocation(): CommercialExternalLocationId {
    const externalLocation =
      this.#scope.locationId === null
        ? undefined
        : this.#locationMappings.get(this.#scope.locationId);
    if (externalLocation === undefined) {
      throw new CommercialToolExecutionError(
        "invalid-scope",
        "La sucursal autenticada no tiene mapping comercial.",
      );
    }
    return externalLocation;
  }

  #validateScope(): void {
    if (
      !uuidPattern.test(this.#scope.organizationId) ||
      !uuidPattern.test(this.#scope.actorMembershipId) ||
      !uuidPattern.test(this.#scope.runId) ||
      (this.#scope.locationId !== null &&
        !uuidPattern.test(this.#scope.locationId)) ||
      this.#scope.organizationId !== this.#allowedOrganizationId
    ) {
      throw new CommercialToolExecutionError(
        "invalid-scope",
        "El contexto autenticado no habilita el catálogo comercial.",
      );
    }
  }
}

export class CommercialToolExecutionService implements CommercialToolExecutionPort {
  readonly definitions = commercialToolDefinitions;
  readonly #audit: CommercialToolAuditPort;
  readonly #catalog: CommercialCatalogPort;
  readonly #credentials: CommercialCatalogCredentials;
  readonly #dependencies: ExecutionDependencies;
  readonly #policy: CommercialCatalogPolicy;

  constructor(
    catalog: CommercialCatalogPort,
    audit: CommercialToolAuditPort,
    credentials: CommercialCatalogCredentials,
    policy: CommercialCatalogPolicy,
    dependencies: ExecutionDependencies = {},
  ) {
    this.#audit = audit;
    this.#catalog = catalog;
    this.#credentials = credentials;
    this.#dependencies = dependencies;
    this.#policy = policy;
  }

  createSession(
    scope: CommercialToolExecutionScope,
  ): CommercialToolExecutionSession {
    return new EnabledCommercialToolExecutionSession(
      scope,
      this.#catalog,
      this.#audit,
      this.#credentials,
      this.#policy,
      this.#dependencies,
    );
  }
}

export class DisabledCommercialToolExecutionService implements CommercialToolExecutionPort {
  readonly definitions = Object.freeze([]);

  createSession(
    scope: CommercialToolExecutionScope,
  ): CommercialToolExecutionSession {
    void scope;
    throw new CommercialToolExecutionError(
      "invalid-scope",
      "El catálogo comercial no está configurado en este ambiente.",
    );
  }
}
