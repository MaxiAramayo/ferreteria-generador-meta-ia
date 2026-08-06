import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import type {
  DesignRenderer,
  RenderRequest,
  RenderResult,
} from "@aramayo/design-engine";
import {
  ImageGenerationError,
  type ContentModerationPort,
  type ContentModerationResult,
  type ContentBriefRunRecord,
  type ContentBriefRunRepository,
  type ContentBrief,
  type GenerateImageCommand,
  type GeneratedImage,
  type GenerationRunRecord,
  type GenerationAttemptLedgerRepository,
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
  readonly #organizationId: string;

  constructor(
    value: ContentBrief | null = brief,
    owner: string = organizationId,
  ) {
    this.#brief = value;
    this.#organizationId = owner;
  }

  findById(
    scope: OrganizationScope & { readonly id: string },
  ): Promise<ContentBriefRunRecord | null> {
    if (
      scope.organizationId !== this.#organizationId ||
      scope.id !== briefRunId
    ) {
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
      organizationId: this.#organizationId,
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
        imageInputTokens: 0,
        inputTokens: 10,
        outputTokens: 90,
        textInputTokens: 10,
        totalTokens: 100,
      },
      width: 1024,
    };
  }

  edit(): Promise<GeneratedImage> {
    throw new Error("La edición no forma parte de este lote.");
  }
}

/**
 * Renderizador de prueba.
 *
 * Devuelve un PNG cuyo hash depende del documento, así que dos composiciones
 * distintas producen piezas distintas y dos iguales, la misma. Es lo que
 * permite afirmar reproducibilidad sin abrir un navegador; el render real tiene
 * su propia suite con Chromium.
 */
class StubRenderer implements DesignRenderer {
  readonly requests: RenderRequest[] = [];
  #failStage: string | null;

  constructor(failStage: string | null = null) {
    this.#failStage = failStage;
  }

  render(request: RenderRequest): Promise<RenderResult> {
    this.requests.push(request);

    if (this.#failStage !== null) {
      return Promise.resolve({
        durationMs: 5,
        failure: { durationMs: 5, reason: "timeout", stage: "render" },
        ok: false,
        requestId: request.requestId,
      });
    }

    const serialized = JSON.stringify(request.document);
    const png = Uint8Array.from(Buffer.from(serialized));

    return Promise.resolve({
      durationMs: 10,
      image: {
        byteLength: png.byteLength,
        height: 1350,
        png,
        sha256: createHash("sha256").update(serialized).digest("hex"),
        width: 1080,
      },
      ok: true,
      requestId: request.requestId,
    });
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

class StubAttemptLedger implements GenerationAttemptLedgerRepository {
  readonly events: string[] = [];
  #attempt = 0;

  auditModeration(
    input: Parameters<GenerationAttemptLedgerRepository["auditModeration"]>[0],
  ): Promise<void> {
    this.events.push(`moderation:${input.phase}:${input.outcome}`);
    return Promise.resolve();
  }

  begin(): Promise<
    Awaited<ReturnType<GenerationAttemptLedgerRepository["begin"]>>
  > {
    this.#attempt += 1;
    this.events.push("attempt:in-flight");
    return Promise.resolve({
      attemptId: `attempt-${String(this.#attempt)}`,
      attemptNumber: 1,
      status: "started",
    });
  }

  markUnconfirmed(): Promise<void> {
    this.events.push("attempt:unconfirmed");
    return Promise.resolve();
  }

  recoverInFlight(): Promise<void> {
    this.events.push("attempt:recovered");
    return Promise.resolve();
  }

  releaseRunReservations(): Promise<void> {
    this.events.push("attempt:released");
    return Promise.resolve();
  }

  settle(): Promise<void> {
    this.events.push("attempt:settled");
    return Promise.resolve();
  }
}

class StubModeration implements ContentModerationPort {
  readonly events: string[] = [];
  readonly #outputStatus: "allowed" | "rejected";

  constructor(outputStatus: "allowed" | "rejected") {
    this.#outputStatus = outputStatus;
  }

  moderateImage(): Promise<ContentModerationResult> {
    this.events.push("output");
    return Promise.resolve({
      categories: this.#outputStatus === "rejected" ? ["violence"] : [],
      model: "omni-moderation-latest",
      requestId: "mod-output",
      status: this.#outputStatus,
    });
  }

  moderateText(): Promise<ContentModerationResult> {
    this.events.push("input");
    return Promise.resolve({
      categories: [],
      model: "omni-moderation-latest",
      requestId: "mod-input",
      status: "allowed",
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
  overrides: Partial<{
    attempts: GenerationAttemptLedgerRepository;
    concurrency: number;
    maxAttempts: number;
    moderation: ContentModerationPort;
    renderer: DesignRenderer;
  }> = {},
): ImageGenerationRunService {
  return new ImageGenerationRunService(
    runs,
    briefs,
    images,
    media,
    overrides.renderer ?? new StubRenderer(),
    {
      concurrency: overrides.concurrency ?? 1,
      maxAttempts: overrides.maxAttempts ?? 3,
      ...(overrides.attempts === undefined
        ? {}
        : { attempts: overrides.attempts }),
      ...(overrides.moderation === undefined
        ? {}
        : { moderation: overrides.moderation }),
      // Sin espera real las pruebas de reintento no tardan.
      sleep: (): Promise<void> => Promise.resolve(),
    },
  );
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
  // Cada variante persiste dos activos: la base que devolvió el modelo y la
  // pieza compuesta con la capa de marca. Son cosas distintas y las dos
  // importan —la base prueba qué generó el modelo, la pieza es lo que se
  // publica—, así que dos variantes dejan cuatro subidas.
  assert.equal(media.uploads.length, 4);
  assert.ok(media.uploads.every((upload) => upload.origin === "generated"));

  // Toda variante que salió tiene pieza: no existe el estado intermedio de
  // «generó pero no compuso», porque componer necesita los bytes de la base y
  // el almacenamiento no sabe devolverlos.
  for (const variant of run.variants) {
    const composition = variant.composition;
    assert.ok(composition !== null, "Una variante que salió no tiene pieza.");
    assert.equal(composition.layout, "composicion-tercio-inferior");
    assert.equal(composition.theme, "taller");
    assert.equal(composition.width, 1080);
    assert.equal(composition.height, 1350);
    assert.match(composition.version, /^visual-composition\//u);
    assert.notEqual(composition.mediaAssetId, variant.mediaAssetId);
  }

  // Dos variantes con bases distintas dan piezas distintas.
  assert.notEqual(
    variantAt(run, 0).composition?.compositionHash,
    variantAt(run, 1).composition?.compositionHash,
  );
  // Pero comparten la capa determinista: el copy es el mismo brief.
  assert.equal(
    variantAt(run, 0).composition?.overlayHash,
    variantAt(run, 1).composition?.overlayHash,
  );

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
      composition: {
        compositionHash: "1".repeat(64),
        height: 1350,
        layout: "composicion-tercio-inferior",
        mediaAssetId: "77777777-7777-4777-8777-777777777777",
        overlayHash: "2".repeat(64),
        sha256: "3".repeat(64),
        theme: "taller",
        version: "visual-composition/2026-08-05.1",
        width: 1080,
      },
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

  // Un lote determinista entrega pieza, no un motivo: la primera variante sale
  // compuesta enteramente por el motor de marca.
  const first = variantAt(run, 0);
  assert.equal(first.status, "succeeded");
  assert.equal(first.source, "deterministic");
  assert.equal(first.mediaAssetId, null, "No hubo base: nadie generó nada.");
  assert.equal(first.model, null);
  assert.ok(first.composition !== null);
  assert.equal(first.composition.layout, "composicion-tercio-inferior");

  // Las demás no se intentaron y no gastaron nada: una pieza determinista es
  // siempre la misma, así que pedir copias idénticas no tendría sentido.
  assert.equal(variantAt(run, 1).status, "discarded");
});

test("dos organizaciones con la misma imagen no comparten activo", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const media = new StubMedia();
  // Las dos variantes devuelven bytes de hash idéntico, que es el caso que
  // colisionaría si el identificador no llevara la organización.
  const images = new StubImages([
    { sha256: "f".repeat(64) },
    { sha256: "f".repeat(64) },
  ]);
  await service(runs, images, media).execute({ organizationId, runId });

  const otherOrganizationId = "77777777-7777-4777-8777-777777777777";
  const otherRuns = new InMemoryGenerationRunRepository();
  await otherRuns.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: runId,
    organizationId: otherOrganizationId,
    requestedAt: "2026-08-03T12:00:00.000Z",
    subjectKind: "generic",
    variantIds,
  });
  const otherMedia = new StubMedia();
  await service(
    otherRuns,
    new StubImages([{ sha256: "f".repeat(64) }]),
    otherMedia,
    new StubBriefRuns(brief, otherOrganizationId),
  ).execute({ organizationId: otherOrganizationId, runId });

  const mine = media.uploads[0]?.mediaAssetId;
  const theirs = otherMedia.uploads[0]?.mediaAssetId;
  assert.ok(mine !== undefined && theirs !== undefined);
  // `media_assets.id` es clave primaria global: sin la organización en la
  // derivación, la segunda organización chocaría contra el activo de la primera.
  assert.notEqual(mine, theirs);
  // Cada variante sube base y pieza, en ese orden, así que las dos bases son la
  // primera y la tercera subida. Dentro de la misma organización se reutilizan:
  // la misma imagen es el mismo archivo y no se paga dos veces por subirlo.
  assert.equal(media.uploads[0]?.mediaAssetId, media.uploads[2]?.mediaAssetId);
  // Y también la pieza, porque la composición es la misma sobre la misma base.
  assert.equal(media.uploads[1]?.mediaAssetId, media.uploads[3]?.mediaAssetId);
});

test("si la pieza no se puede componer el lote no gasta nada", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await runs.reserve({
    actorMembershipId: membershipId,
    contentBriefRunId: briefRunId,
    format: "feed",
    id: runId,
    organizationId,
    requestedAt: "2026-08-03T12:00:00.000Z",
    subjectKind: "generic",
    variantIds,
  });
  const images = new StubImages([{}, {}]);
  // Un titular más largo que el presupuesto de la región es un rechazo
  // determinista: reintentar no lo cambia, y descubrirlo después de pagarle una
  // imagen al proveedor sería gastar para nada.
  const longTitle = { ...brief, title: "P".repeat(80) };

  const result = await service(
    runs,
    images,
    new StubMedia(),
    new StubBriefRuns(longTitle),
  ).execute({ organizationId, runId });

  assert.equal(result.status, "failed");
  assert.equal(images.requests.length, 0);
  const run = await loadRun(runs);
  assert.equal(run.status, "failed");
  assert.match(run.resolution?.detail ?? "", /copy-too-long/u);
  // La corrección dice qué hacer, no sólo qué pasó.
  assert.match(run.resolution?.detail ?? "", /Acortá el título/u);
});

test("una pieza que no se pudo renderizar no se atribuye al proveedor", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);

  const result = await service(
    runs,
    images,
    new StubMedia(),
    new StubBriefRuns(),
    {
      renderer: new StubRenderer("render"),
    },
  ).execute({ organizationId, runId });

  assert.equal(result.status, "failed");
  const run = await loadRun(runs);
  const failure = variantAt(run, 0).failure;
  assert.ok(failure !== null);
  // La imagen llegó bien: decir que falló OpenAI mandaría a reintentar contra
  // el lugar equivocado.
  assert.equal(failure.code, "composition-failed");
  assert.match(failure.detail, /no se pudo renderizar/u);
  // Y no se reintenta contra el proveedor: un render que falla no se arregla
  // pidiendo otra imagen.
  assert.equal(images.requests.length, 2);
});

test("liquida el costo antes de la moderación final y no persiste una imagen marcada", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);
  const media = new StubMedia();
  const attempts = new StubAttemptLedger();
  const moderation = new StubModeration("rejected");

  const result = await service(runs, images, media, new StubBriefRuns(), {
    attempts,
    moderation,
  }).execute({ organizationId, runId });

  assert.deepEqual(result, { runId, status: "failed" });
  assert.equal(images.requests.length, 2);
  assert.equal(media.uploads.length, 0);
  assert.deepEqual(moderation.events, ["input", "output", "output"]);
  assert.deepEqual(attempts.events, [
    "moderation:input:allowed",
    "attempt:in-flight",
    "attempt:settled",
    "moderation:output:rejected",
    "attempt:in-flight",
    "attempt:settled",
    "moderation:output:rejected",
  ]);
  const run = await loadRun(runs);
  assert.ok(
    run.variants.every(
      (variant) => variant.failure?.code === "moderation-rejected",
    ),
  );
});

test("liquida el usage aunque la respuesta de Images no contenga una imagen utilizable", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const accounting = {
    requestId: "req_invalid",
    usage: {
      estimatedCostUsd: null,
      imageInputTokens: 0,
      inputTokens: 10,
      outputTokens: 90,
      textInputTokens: 10,
      totalTokens: 100,
    },
  } as const;
  const images = new StubImages([
    {
      error: new ImageGenerationError(
        "content-invalid",
        "La respuesta no contiene una imagen.",
        false,
        accounting,
      ),
    },
    {
      error: new ImageGenerationError(
        "content-invalid",
        "La respuesta no contiene una imagen.",
        false,
        accounting,
      ),
    },
  ]);
  const attempts = new StubAttemptLedger();

  const result = await service(
    runs,
    images,
    new StubMedia(),
    new StubBriefRuns(),
    { attempts },
  ).execute({ organizationId, runId });

  assert.deepEqual(result, { runId, status: "failed" });
  assert.deepEqual(attempts.events, [
    "attempt:in-flight",
    "attempt:settled",
    "attempt:in-flight",
    "attempt:settled",
  ]);
});

test("si la moderación previa no está disponible falla cerrado sin llamar al proveedor", async () => {
  const runs = new InMemoryGenerationRunRepository();
  await reservedRun(runs);
  const images = new StubImages([{}, {}]);
  const attempts = new StubAttemptLedger();
  const unavailableModeration: ContentModerationPort = {
    moderateImage: (): Promise<never> =>
      Promise.reject(new Error("moderation unavailable")),
    moderateText: (): Promise<never> =>
      Promise.reject(new Error("moderation unavailable")),
  };

  const result = await service(
    runs,
    images,
    new StubMedia(),
    new StubBriefRuns(),
    { attempts, moderation: unavailableModeration },
  ).execute({ organizationId, runId });

  assert.deepEqual(result, { runId, status: "failed" });
  assert.equal(images.requests.length, 0);
  assert.deepEqual(attempts.events, [
    "moderation:input:unavailable",
    "attempt:released",
  ]);
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
    new StubRenderer(),
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
