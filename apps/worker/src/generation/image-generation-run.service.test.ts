import assert from "node:assert/strict";
import test from "node:test";

import {
  ImageGenerationError,
  type ContentBriefRunRecord,
  type ContentBriefRunRepository,
  type ContentBrief,
  type GenerateImageCommand,
  type GeneratedImage,
  type GenerationRunRecord,
  type GenerationVariantRecord,
  type ImageGenerationPort,
  type MediaAssetRecord,
  type OrganizationScope,
} from "@aramayo/domain";

import type { UploadMediaCommand } from "../media/media-lifecycle.service.ts";
import { ImageGenerationRunService } from "./image-generation-run.service.ts";
import { InMemoryGenerationRunRepository } from "./in-memory-generation-runs.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const briefRunId = "33333333-3333-4333-8333-333333333333";
const runId = "44444444-4444-4444-8444-444444444444";
const variantIds = [
  "55555555-5555-4555-8555-555555555551",
  "55555555-5555-4555-8555-555555555552",
];

/**
 * Un sujeto genérico —tornillos, clavos, tarugos— es el caso que sí se genera
 * sin foto: `P4-T01` decidió que sólo `branded` exige referencia real.
 */
const brief: ContentBrief = Object.freeze({
  brand: "ferreteria",
  callToAction: Object.freeze({
    kind: "whatsapp",
    label: "Consultanos por WhatsApp",
  }),
  caption: "Tenemos tornillos para tu obra; pasá por el local y consultanos.",
  creativeProposal: "Tono directo, foco en el uso real del artículo.",
  missingInformation: Object.freeze([]),
  objective: "product",
  products: Object.freeze([
    Object.freeze({
      evidenceId: "C1",
      externalProductId: "odoo-product-101",
      label: "Tornillos autoperforantes",
    }),
  ]),
  requiresHumanApproval: false,
  subtitle: null,
  title: "Tornillos para tu obra",
  verifiedFacts: Object.freeze([]),
  visualDirection: "clean_product",
});

class StubBriefRuns implements ContentBriefRunRepository {
  readonly #brief: ContentBrief | null;

  constructor(value: ContentBrief | null = brief) {
    this.#brief = value;
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    if (scope.organizationId !== organizationId || scope.id !== briefRunId) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      actorMembershipId: membershipId,
      attempts: 1,
      brief: this.#brief,
      cancelledAt: null,
      completedAt: "2026-08-03T11:00:00.000Z",
      estimatedCostUsd: null,
      evidence: [],
      id: briefRunId,
      knowledgeStatus: "grounded",
      latencyMilliseconds: 100,
      locationId: null,
      model: "gpt-5.6-terra",
      organizationId,
      promptHash: "a".repeat(64),
      promptVersion: "content-brief/2026-07-30.2",
      rejection: null,
      request: "Pieza de tornillos.",
      requestHash: "b".repeat(64),
      requestId: null,
      requestedAt: "2026-08-03T11:00:00.000Z",
      responseId: null,
      schemaVersion: "content-brief/2026-07-30.1",
      status: this.#brief === null ? "rejected" : "generated",
      toolInvocations: [],
      toolNames: [],
      usage: {
        cacheWriteInputTokens: 0,
        cachedInputTokens: 0,
        estimatedCostUsd: null,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
    });
  }

  cancel(): Promise<never> {
    throw new Error("no usado");
  }
  complete(): Promise<never> {
    throw new Error("no usado");
  }
  list(): Promise<never> {
    throw new Error("no usado");
  }
  reserve(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Un brief cuya lectura falla no es un pedido inválido: es un fallo nuestro, y
 * tiene que subir en lugar de cerrar el lote.
 */
class UnreachableBriefRuns extends StubBriefRuns {
  override findById(): Promise<never> {
    return Promise.reject(new Error("la base no respondió"));
  }
}

interface ImageOutcome {
  readonly error?: ImageGenerationError;
  readonly sha256?: string;
}

class StubImages implements ImageGenerationPort {
  readonly requests: GenerateImageCommand[] = [];
  #outcomes: ImageOutcome[];
  #onRequest: (index: number) => Promise<void>;

  constructor(
    outcomes: readonly ImageOutcome[],
    onRequest: (index: number) => Promise<void> = (): Promise<void> =>
      Promise.resolve(),
  ) {
    this.#onRequest = onRequest;
    this.#outcomes = [...outcomes];
  }

  async generate(command: GenerateImageCommand): Promise<GeneratedImage> {
    const index = this.requests.length;
    this.requests.push(command);
    await this.#onRequest(index);
    const outcome = this.#outcomes[index] ?? {};
    if (outcome.error !== undefined) {
      throw outcome.error;
    }
    return {
      bytes: Uint8Array.from([1, 2, 3]),
      height: 1536,
      latencyMilliseconds: 1_000,
      mimeType: "image/png",
      model: "gpt-image-2",
      requestId: null,
      sha256: outcome.sha256 ?? String(index).repeat(64).slice(0, 64),
      usage: {
        estimatedCostUsd: null,
        inputTokens: 10,
        outputTokens: 90,
        totalTokens: 100,
      },
      width: 1024,
    };
  }

  edit(): Promise<GeneratedImage> {
    throw new Error("La edición no forma parte de este lote.");
  }
}

class StubMedia {
  readonly uploads: UploadMediaCommand[] = [];

  upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
    this.uploads.push(command);
    // Los campos ausentes se omiten en lugar de viajar como `null`: el registro
    // los declara opcionales, y un activo recién subido no tiene borrado ni
    // fallo que informar.
    return Promise.resolve({
      byteSize: "3",
      checksumSha256: "c".repeat(64),
      createdAt: "2026-08-03T12:00:00.000Z",
      height: 1536,
      id: command.mediaAssetId,
      mimeType: "image/png",
      organizationId: command.organizationId,
      origin: command.origin,
      originalFileName: command.originalFileName,
      ownerMembershipId: command.ownerMembershipId,
      secureUrl: "https://media.invalid/generated.png",
      status: "available",
      storageKey: `generated/${command.mediaAssetId}`,
      storageProvider: "cloudinary",
      storageVersion: 1,
      updatedAt: "2026-08-03T12:00:00.000Z",
      width: 1024,
    });
  }
}

async function reservedRun(
  runs: InMemoryGenerationRunRepository,
  subjectKind: "branded" | "generic" = "generic",
): Promise<void> {
  await runs.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: runId,
    organizationId,
    requestedAt: "2026-08-03T12:00:00.000Z",
    subjectKind,
    variantIds,
  });
}

function service(
  runs: InMemoryGenerationRunRepository,
  images: ImageGenerationPort,
  media: StubMedia = new StubMedia(),
  briefs: ContentBriefRunRepository = new StubBriefRuns(),
  overrides: Partial<{ concurrency: number; maxAttempts: number }> = {},
): ImageGenerationRunService {
  return new ImageGenerationRunService(runs, briefs, images, media, {
    concurrency: overrides.concurrency ?? 1,
    maxAttempts: overrides.maxAttempts ?? 3,
    // Sin espera real las pruebas de reintento no tardan.
    sleep: (): Promise<void> => Promise.resolve(),
  });
}

/** Lee el lote y afirma que existe, para que las aserciones no encadenen. */
async function loadRun(
  runs: InMemoryGenerationRunRepository,
): Promise<GenerationRunRecord> {
  const run = await runs.findById({ id: runId, organizationId });
  assert.ok(run !== null);
  return run;
}

/** Lee una variante por índice y afirma que existe, sin encadenar opcionales. */
function variantAt(
  run: GenerationRunRecord,
  index: number,
): GenerationVariantRecord {
  const variant = run.variants[index];
  assert.ok(variant !== undefined);
  return variant;
}

test("un lote completo conserva sus variantes, su plan y su uso", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const media = new StubMedia();
  const images = new StubImages([{}, {}]);

  const result = await service(runs, images, media).execute({
    organizationId,
    runId,
  });

  assert.deepEqual(result, { runId, status: "completed" });
  assert.equal(images.requests.length, 2);
  const run = await loadRun(runs);
  assert.equal(run.status, "completed");
  assert.ok(run.variants.every((variant) => variant.status === "succeeded"));
  // El plan queda ligado a la ejecución con su perfil, versión y hash.
  assert.match(run.plan?.promptVersion ?? "", /^visual-prompt\//u);
  assert.match(run.plan?.profileVersion ?? "", /^visual-profile\//u);
  assert.equal(run.plan?.format, "feed");
  assert.equal(run.totalTokens, 200);
  assert.equal(run.resolution, null);
  // Cada imagen se persiste antes de anotarse, con origen `generated`.
  assert.equal(media.uploads.length, 2);
  assert.ok(media.uploads.every((upload) => upload.origin === "generated"));

  // El tamaño sale del formato de la pieza y no de una constante suelta.
  assert.ok(images.requests.every((request) => request.size === "1024x1536"));
  // El prompt nunca lleva texto comercial: eso se compone determinísticamente.
  assert.ok(
    images.requests.every((request) => !request.prompt.includes("WhatsApp")),
  );
});

test("un fallo parcial conserva la variante válida y explica la fallida", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([
    {},
    {
      error: new ImageGenerationError(
        "safety-rejection",
        "El proveedor rechazó el pedido.",
        false,
      ),
    },
  ]);

  const result = await service(runs, images).execute({
    organizationId,
    runId,
  });

  // El lote sirve: una sola variante viva alcanza.
  assert.deepEqual(result, { runId, status: "completed" });
  const run = await loadRun(runs);
  assert.equal(run.status, "completed");
  assert.equal(variantAt(run, 0).status, "succeeded");
  assert.equal(variantAt(run, 1).status, "failed");
  const failure = variantAt(run, 1).failure;
  assert.ok(failure !== null);
  assert.equal(failure.code, "safety-rejection");
  // El motivo dice qué hacer, no sólo qué pasó.
  assert.match(failure.correction, /Revisá el brief/u);
  // Sólo la variante que salió cuenta tokens.
  assert.equal(run.totalTokens, 100);
});

test("sin ninguna variante utilizable el lote falla", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([
    {
      error: new ImageGenerationError(
        "content-invalid",
        "La respuesta no trae imagen.",
        false,
      ),
    },
    {
      error: new ImageGenerationError(
        "content-invalid",
        "La respuesta no trae imagen.",
        false,
      ),
    },
  ]);

  const result = await service(runs, images).execute({
    organizationId,
    runId,
  });

  assert.deepEqual(result, { runId, status: "failed" });
  const run = await loadRun(runs);
  assert.equal(run.status, "failed");
  assert.ok(run.variants.every((variant) => variant.status === "failed"));
});

test("un fallo reintentable se reintenta y uno definitivo no", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  // La primera variante falla dos veces con un límite de tasa y sale al tercer
  // intento; la segunda recibe un 4xx que no se reintenta.
  const images = new StubImages([
    { error: new ImageGenerationError("rate-limit", "Límite.", true) },
    { error: new ImageGenerationError("rate-limit", "Límite.", true) },
    {},
    {
      error: new ImageGenerationError(
        "unsupported-parameter",
        "Parámetro inválido.",
        false,
      ),
    },
  ]);

  await service(runs, images).execute({ organizationId, runId });

  // Tres llamadas para la primera variante y una sola para la segunda:
  // repetir un pedido que el proveedor ya rechazó repetiría el gasto.
  assert.equal(images.requests.length, 4);
  const run = await loadRun(runs);
  assert.equal(variantAt(run, 0).status, "succeeded");
  assert.equal(variantAt(run, 0).attempts, 3);
  assert.equal(variantAt(run, 1).status, "failed");
  assert.equal(variantAt(run, 1).attempts, 1);
});

test("cancelar durante el lote deja de gastar y no promueve el resultado tardío", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  // La cancelación llega mientras la primera variante está en vuelo.
  const images = new StubImages([{}, {}], async (index) => {
    if (index === 0) {
      await runs.cancel({
        cancelledAt: "2026-08-03T12:00:05.000Z",
        id: runId,
        organizationId,
      });
    }
  });

  const result = await service(runs, images).execute({
    organizationId,
    runId,
  });

  assert.deepEqual(result, { runId, status: "discarded" });
  // No se pidió la segunda: no se puede detener al proveedor, pero sí no
  // pedirle nada más.
  assert.equal(images.requests.length, 1);
  const run = await loadRun(runs);
  assert.equal(run.status, "cancelled");
  assert.equal(run.completedAt, null);
  // El resultado tardío de la primera no quedó vigente.
  assert.ok(run.variants.every((variant) => variant.mediaAssetId === null));
  assert.ok(run.variants.every((variant) => variant.status === "discarded"));
});

test("cancelar antes de que el worker tome el lote no gasta nada", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  await runs.cancel({
    cancelledAt: "2026-08-03T12:00:01.000Z",
    id: runId,
    organizationId,
  });
  const images = new StubImages([{}, {}]);

  const result = await service(runs, images).execute({
    organizationId,
    runId,
  });

  assert.deepEqual(result, { runId, status: "discarded" });
  assert.equal(images.requests.length, 0);
});

test("cancelar después de terminado informa el estado real y no revierte nada", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);
  await service(runs, images).execute({ organizationId, runId });

  assert.deepEqual(
    await runs.cancel({
      cancelledAt: "2026-08-03T12:10:00.000Z",
      id: runId,
      organizationId,
    }),
    { resolvedStatus: "completed", status: "already-resolved" },
  );
  const run = await loadRun(runs);
  assert.equal(run.status, "completed");
  assert.ok(run.variants.every((variant) => variant.status === "succeeded"));
});

test("una segunda entrega del mismo evento no vuelve a gastar el lote", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);
  const executor = service(runs, images);

  await executor.execute({ organizationId, runId });
  const replay = await executor.execute({ organizationId, runId });

  assert.deepEqual(replay, { runId, status: "discarded" });
  // Las dos llamadas siguen siendo las del primer lote.
  assert.equal(images.requests.length, 2);
});

test("un lote interrumpido se retoma sin repetir la variante ya resuelta", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  // Estado que deja un worker que murió después de anotar la primera variante:
  // el lote quedó en curso y la segunda nunca se pidió.
  await runs.start({
    id: runId,
    organizationId,
    startedAt: "2026-08-03T12:00:01.000Z",
  });
  await runs.completeVariant(
    {
      attempts: 1,
      height: 1536,
      latencyMilliseconds: 1_000,
      mediaAssetId: "66666666-6666-4666-8666-666666666666",
      model: "gpt-image-2",
      organizationId,
      requestId: null,
      runId,
      sha256: "e".repeat(64),
      status: "succeeded",
      variantId: variantIds[0] ?? "",
      width: 1024,
    },
    "2026-08-03T12:00:10.000Z",
  );

  const interrupted = await loadRun(runs);
  assert.equal(interrupted.status, "running");
  assert.equal(variantAt(interrupted, 0).status, "succeeded");
  assert.equal(variantAt(interrupted, 1).status, "pending");

  // El lease del outbox vence y el mensaje se reentrega.
  const resumed = new StubImages([{}]);
  const result = await service(runs, resumed).execute({
    organizationId,
    runId,
  });

  assert.deepEqual(result, { runId, status: "completed" });
  // Sólo se pidió la variante que faltaba: la ya resuelta no se vuelve a pagar.
  assert.equal(resumed.requests.length, 1);
  const run = await loadRun(runs);
  assert.equal(run.status, "completed");
  assert.ok(run.variants.every((variant) => variant.status === "succeeded"));
});

test("un sujeto de marca sin foto aprobada se resuelve sin gastar", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs, "branded");
  const images = new StubImages([{}, {}]);

  const result = await service(runs, images).execute({
    organizationId,
    runId,
  });

  assert.equal(result.status, "deterministic");
  assert.equal(images.requests.length, 0);
  const run = await loadRun(runs);
  // No es un error: la pieza sale con render de marca y `P4-T05` la compone.
  assert.equal(run.status, "completed");
  assert.equal(run.resolution?.deterministicReason, "no-approved-reference");
  assert.equal(run.plan, null);
  assert.equal(run.totalTokens, 0);
  assert.ok(run.variants.every((variant) => variant.status === "discarded"));
});

test("sin generación habilitada el lote no intenta ninguna llamada", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);

  const result = await new ImageGenerationRunService(
    runs,
    new StubBriefRuns(),
    images,
    new StubMedia(),
    { concurrency: 1, generationEnabled: false },
  ).execute({ organizationId, runId });

  assert.equal(result.status, "deterministic");
  // La palanca es una decisión de configuración, no una falla del proveedor:
  // gastar el lote contra un gateway que sólo sabe rechazar habría dejado un
  // lote fallido donde corresponde un render determinista.
  assert.equal(images.requests.length, 0);
  const run = await loadRun(runs);
  assert.equal(run.status, "completed");
  assert.equal(run.resolution?.deterministicReason, "generation-disabled");
});

test("un fallo interno del planificador no da el lote por resuelto", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);
  // Tiene que subir para que el outbox lo reintente, en lugar de cerrar el
  // lote como fallido y perder el error.
  await assert.rejects(() =>
    service(runs, images, new StubMedia(), new UnreachableBriefRuns()).execute({
      organizationId,
      runId,
    }),
  );
  const run = await loadRun(runs);
  assert.equal(run.status, "pending");
  assert.equal(images.requests.length, 0);
});

test("un brief que no produjo contenido no genera nada y lo explica", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);

  const result = await service(
    runs,
    images,
    new StubMedia(),
    new StubBriefRuns(null),
  ).execute({ organizationId, runId });

  assert.deepEqual(result, { runId, status: "failed" });
  assert.equal(images.requests.length, 0);
  const run = await loadRun(runs);
  assert.equal(run.status, "failed");
  assert.match(run.resolution?.detail ?? "", /no produjo un brief/u);
  assert.equal(run.resolution?.deterministicReason, null);
});

test("un lote de otra organización no se ejecuta", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);

  await assert.rejects(
    service(runs, images).execute({
      organizationId: "99999999-9999-4999-8999-999999999999",
      runId,
    }),
  );
  assert.equal(images.requests.length, 0);
});

test("con concurrencia mayor a uno el lote sigue resolviendo cada variante una vez", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);

  const result = await service(runs, images, new StubMedia(), undefined, {
    concurrency: 2,
  }).execute({ organizationId, runId });

  assert.deepEqual(result, { runId, status: "completed" });
  // Dos variantes, dos llamadas: la cola compartida no entrega el mismo índice
  // a dos trabajadores.
  assert.equal(images.requests.length, 2);
  const run = await loadRun(runs);
  assert.ok(run.variants.every((variant) => variant.status === "succeeded"));
});
