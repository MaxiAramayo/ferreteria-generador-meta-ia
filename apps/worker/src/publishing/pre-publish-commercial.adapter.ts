/**
 * Adaptador de revalidación comercial.
 *
 * Reusa el único camino autorizado al catálogo: el ejecutor de herramientas
 * ya deriva organización y sucursal del scope, aplica límites y conserva una
 * auditoría sin valores ni identificadores comerciales en texto plano.
 */

import { createHash } from "node:crypto";

import type { CommercialToolExecutionPort } from "../catalog/commercial-tool-execution.service.ts";
import type {
  PrePublishCommercialPort,
  PrePublishCommercialSession,
} from "./pre-publish.validator.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function callId(kind: "price" | "stock", externalProductId: string): string {
  const digest = createHash("sha256")
    .update(externalProductId)
    .digest("hex")
    .slice(0, 24);
  return `prepublish-${kind}-${digest}`;
}

function resultData(output: string): Readonly<Record<string, unknown>> | null {
  try {
    const envelope = record(JSON.parse(output));
    if (envelope?.["status"] !== "ok") return null;
    return record(envelope["data"]);
  } catch {
    return null;
  }
}

class CommercialRevalidationSession implements PrePublishCommercialSession {
  readonly #execution: ReturnType<CommercialToolExecutionPort["createSession"]>;

  constructor(
    execution: ReturnType<CommercialToolExecutionPort["createSession"]>,
  ) {
    this.#execution = execution;
  }

  async price(
    externalProductId: string,
  ): Promise<Readonly<{ amountMinor: number; kind: "priced" }> | null> {
    const result = await this.#execution.execute({
      arguments: JSON.stringify({ externalProductId }),
      callId: callId("price", externalProductId),
      name: "get_current_price",
    });
    const data =
      result.outcome === "success" ? resultData(result.output) : null;
    if (
      data?.["kind"] !== "priced" ||
      typeof data["amountMinor"] !== "number" ||
      !Number.isSafeInteger(data["amountMinor"]) ||
      data["amountMinor"] < 0
    ) {
      return null;
    }
    return Object.freeze({ amountMinor: data["amountMinor"], kind: "priced" });
  }

  async stock(
    externalProductId: string,
  ): Promise<Readonly<{ kind: "known"; quantity: number }> | null> {
    const result = await this.#execution.execute({
      arguments: JSON.stringify({ externalProductId }),
      callId: callId("stock", externalProductId),
      name: "get_stock_by_location",
    });
    const data =
      result.outcome === "success" ? resultData(result.output) : null;
    if (
      data?.["kind"] !== "known" ||
      typeof data["quantity"] !== "number" ||
      !Number.isSafeInteger(data["quantity"]) ||
      data["quantity"] < 0
    ) {
      return null;
    }
    return Object.freeze({ kind: "known", quantity: data["quantity"] });
  }
}

export class PrePublishCommercialAdapter implements PrePublishCommercialPort {
  readonly #execution: CommercialToolExecutionPort;

  constructor(execution: CommercialToolExecutionPort) {
    this.#execution = execution;
  }

  createSession(
    input: Readonly<{
      actorMembershipId: string;
      locationId: string;
      organizationId: string;
      runId: string;
    }>,
  ): PrePublishCommercialSession {
    return new CommercialRevalidationSession(
      this.#execution.createSession({
        actorMembershipId: input.actorMembershipId,
        locationId: input.locationId,
        organizationId: input.organizationId,
        runId: input.runId,
      }),
    );
  }
}
