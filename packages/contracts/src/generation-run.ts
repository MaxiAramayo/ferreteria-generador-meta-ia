/**
 * Contrato público del lote de generación.
 *
 * Proyecta lo que el panel necesita para mostrar estado, progreso, variantes y
 * motivo de cada fallo. Deja afuera lo que no le sirve a quien revisa y sí
 * ampliaría la superficie expuesta: el hash del prompt, el identificador de
 * respuesta del proveedor y el detalle interno de cada error.
 */

import type { GenerationAdmissionResponse } from "./generation-policy.ts";

export type GenerationRunStatusResponse =
  "pending" | "running" | "completed" | "failed" | "cancelled";

export type GenerationVariantStatusResponse =
  "pending" | "succeeded" | "failed" | "discarded";

/**
 * Por qué una variante no salió.
 *
 * `correction` dice qué hacer. El detalle interno no viaja: puede traer el
 * prompt reflejado o una URL temporal del proveedor.
 */
export type GenerationVariantFailureResponse = {
  code: string;
  correction: string;
};

export type GenerationVariantResponse = {
  failure: GenerationVariantFailureResponse | null;
  height: number | null;
  id: string;
  index: number;
  /** Activo con la base generada; nulo en una pieza sin imagen del modelo. */
  mediaAssetId: string | null;
  /** Pieza compuesta con la capa de marca; presente si la variante salió. */
  composition: GenerationVariantCompositionResponse | null;
  /** De dónde salió: `generated` gastó proveedor, `deterministic` no. */
  source: string;
  status: GenerationVariantStatusResponse;
  width: number | null;
};

/**
 * Pieza compuesta: es lo que se publica.
 *
 * `compositionHash` sale porque es lo que permite comparar dos variantes sin
 * mirar píxeles, que es justo lo que necesita el panel. El hash de la base y el
 * modelo siguen sin salir: no le sirven a quien revisa.
 */
export type GenerationVariantCompositionResponse = {
  compositionHash: string;
  height: number;
  layout: string;
  mediaAssetId: string;
  theme: string;
  version: string;
  width: number;
};

/** Progreso del lote, para que la espera sea legible sin contar a mano. */
export type GenerationRunProgressResponse = {
  discarded: number;
  failed: number;
  pending: number;
  succeeded: number;
  total: number;
};

/**
 * Por qué el lote se resolvió sin gastar ninguna llamada.
 *
 * Presente sólo en ese caso. Un lote determinista es una pieza que sale con
 * render de marca, no un error, y quien revisa necesita distinguirlo.
 */
export type GenerationRunResolutionResponse = {
  deterministicReason: string | null;
  detail: string;
};

export type GenerationRunPlanResponse = {
  format: string;
  profileId: string;
  profileVersion: string;
  promptVersion: string;
};

export type GenerationRunUsageResponse = {
  estimatedCostUsd: number | null;
  totalTokens: number;
  cost: {
    imageInputTokens: number;
    inputTokens: number;
    outputTokens: number;
    pricingVersion: string | null;
    reservedMicrousd: number;
    settledMicrousd: number;
    textInputTokens: number;
    totalTokens: number;
    unconfirmedMicrousd: number;
  };
};

export type GenerationRunResponse = {
  cancelledAt: string | null;
  completedAt: string | null;
  contentBriefRunId: string;
  format: string;
  id: string;
  /** Nulo mientras el lote no se ejecutó: todavía no eligió perfil ni prompt. */
  plan: GenerationRunPlanResponse | null;
  progress: GenerationRunProgressResponse;
  requestedAt: string;
  resolution: GenerationRunResolutionResponse | null;
  startedAt: string | null;
  status: GenerationRunStatusResponse;
  subjectKind: string;
  usage: GenerationRunUsageResponse;
  variants: readonly GenerationVariantResponse[];
};

export type GenerationRunAcceptedResponse = {
  admission: GenerationAdmissionResponse;
  runId: string;
  status: "pending";
};

export type GenerationRunListResponse = {
  items: readonly GenerationRunResponse[];
  limit: number;
  page: number;
  total: number;
};

export type GenerationRunCancellationResponse = {
  runId: string;
  status: GenerationRunStatusResponse;
};
