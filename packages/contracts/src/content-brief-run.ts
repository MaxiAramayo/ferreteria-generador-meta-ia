/**
 * Contrato público de la ejecución del brief.
 *
 * Proyecta lo que el panel necesita para mostrar estado, evidencia, costo e
 * historial. Deja afuera lo que no le sirve a quien revisa: hashes del pedido,
 * identificadores de respuesta del proveedor y parámetros internos.
 */

import type { ContentBrief } from "./content-brief.ts";

export type ContentBriefRunStatusResponse =
  "pending" | "generated" | "rejected" | "cancelled";

export type ContentBriefEvidenceKindResponse = "commercial" | "document";

export type ContentBriefRunEvidenceResponse = {
  citationId: string;
  kind: ContentBriefEvidenceKindResponse;
  observedAt: string | null;
  reference: string;
};

export type ContentBriefRunToolInvocationResponse = {
  outcome: "failure" | "success";
  toolName: string;
};

export type ContentBriefRunRejectionResponse = {
  code: string;
  message: string;
};

/** Costo y consumo del intento, para que el editor los vea sin adivinar. */
export type ContentBriefRunUsageResponse = {
  estimatedCostUsd: number | null;
  latencyMilliseconds: number;
  totalTokens: number;
};

export type ContentBriefRunResponse = {
  brief: ContentBrief | null;
  cancelledAt: string | null;
  completedAt: string | null;
  evidence: readonly ContentBriefRunEvidenceResponse[];
  id: string;
  /** Estado de la recuperación documental: `grounded`, faltante o pendiente. */
  knowledgeStatus: string;
  locationId: string | null;
  model: string | null;
  /** Nulo mientras la ejecución sigue pendiente: todavía no eligió prompt. */
  promptVersion: string | null;
  rejection: ContentBriefRunRejectionResponse | null;
  request: string;
  requestedAt: string;
  schemaVersion: string | null;
  status: ContentBriefRunStatusResponse;
  toolInvocations: readonly ContentBriefRunToolInvocationResponse[];
  usage: ContentBriefRunUsageResponse;
};

export type ContentBriefRunAcceptedResponse = {
  runId: string;
  status: "pending";
};

export type ContentBriefRunListResponse = {
  items: readonly ContentBriefRunResponse[];
  limit: number;
  page: number;
  total: number;
};

export type ContentBriefRunCancellationResponse = {
  runId: string;
  status: ContentBriefRunStatusResponse;
};
