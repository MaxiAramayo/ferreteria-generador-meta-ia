/**
 * E2E de «Cambiar marco y textos» (`ADR-029`, `ADR-016`).
 *
 * Levanta la vertical entera —base efímera migrada, API y panel— y recorre con
 * un navegador real el camino que convierte una variante ya compuesta en otra
 * con distinto marco y distinto copy. Existe porque ese camino cruza cuatro
 * capas y cada una tiene su propia regla: el panel acota los campos al marco,
 * la API valida el copy contra el brief, el repositorio admite la edición sin
 * proveedor y el worker recompone. Sólo una corrida de punta a punta demuestra
 * que dicen lo mismo.
 *
 * Lo que comprueba:
 *
 * - **la variante de partida la produce el sistema**: el panel pide el lote y
 *   el worker lo resuelve determinista, sin llamar a Images;
 * - **el formulario arranca de lo que se ve**: marco de la pieza y copy del
 *   brief;
 * - **cada marco acota sus campos**: el sello no ofrece bajada ni etiqueta y
 *   limita el título a su presupuesto;
 * - **un precio sin evidencia se rechaza con un motivo legible** y no crea
 *   ninguna ejecución;
 * - **dos clics seguidos dejan una sola recomposición**;
 * - **la hija no gasta**: admisión `composition-edit`, ningún intento
 *   facturable y costo cero en el panel;
 * - **reeditar parte de la recomposición**, no del brief.
 *
 * No contacta OpenAI, Meta ni Cloudinary: el proveedor de imágenes rechaza
 * cualquier llamada, las piezas quedan en memoria y el navegador las recibe
 * interceptando su URL, y el render usa el mismo Chromium del worker. Deja capturas y las dos piezas en
 * `output/e2e-composition-edit/` para revisarlas a ojo.
 *
 * ```bash
 * pnpm e2e:composition-edit
 * ```
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { chromium, type Browser, type Locator } from "playwright-core";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  createDatabaseClient,
  PrismaContentBriefRunRepository,
  PrismaGenerationAttemptLedgerRepository,
  PrismaGenerationPolicyRepository,
  PrismaGenerationRunRepository,
  PrismaMediaAssetRepository,
  PrismaOutboxRepository,
  type DatabaseClient,
} from "@aramayo/database";
import type {
  GeneratedImage,
  ImageGenerationPort,
  MediaAssetRecord,
  OutboxMessageRecord,
  OutboxTransport,
} from "@aramayo/domain";

import { GenerationRunOutboxTransport } from "../../apps/worker/src/generation/generation-run-outbox.transport.ts";
import { ImageGenerationRunService } from "../../apps/worker/src/generation/image-generation-run.service.ts";
import type {
  ReadMediaResult,
  UploadMediaCommand,
} from "../../apps/worker/src/media/media-lifecycle.service.ts";
import { OutboxDispatcherService } from "../../apps/worker/src/outbox/outbox-dispatcher.service.ts";
import { createPlaywrightRenderer } from "../../apps/worker/src/rendering/playwright-renderer.ts";
import { renderContextFor } from "../../apps/worker/src/rendering/render-document.ts";
import { apiEnvironment, webEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";
import {
  compositionEditPassword,
  seedCompositionEditFixture,
} from "./fixture.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const webDirectory = `${repositoryDirectory}apps/web`;
const outputDirectory = join(
  repositoryDirectory,
  "output/e2e-composition-edit",
);
const nextBinary = "./node_modules/next/dist/bin/next";
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const buildTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;

function reportCheck(detail: string): void {
  process.stdout.write(`  ok ${detail}\n`);
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

/** Ancho y alto de un PNG, leídos de su cabecera `IHDR`. */
function pngSize(
  bytes: Uint8Array,
): Readonly<{ height: number; width: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Object.freeze({
    height: view.getUint32(20),
    width: view.getUint32(16),
  });
}

/**
 * Host de las piezas renderizadas.
 *
 * La base exige que `secureUrl` empiece con `https://` y el panel pinta la
 * vista previa desde ahí. Las piezas viven en memoria bajo un host que no
 * existe y el navegador las recibe interceptando esa URL: con una URL que no
 * responde la prueba pasaría igual, pero las capturas no mostrarían nada que
 * revisar.
 */
const previewOrigin = "https://medios.e2e.invalid";

interface PreviewStore {
  bytesFor(mediaAssetId: string): Uint8Array;
  find(url: string): Uint8Array | undefined;
  store(mediaAssetId: string, bytes: Uint8Array): void;
  urlFor(mediaAssetId: string): string;
}

function createPreviewStore(): PreviewStore {
  const pieces = new Map<string, Uint8Array>();
  return Object.freeze({
    bytesFor(mediaAssetId: string): Uint8Array {
      const bytes = pieces.get(mediaAssetId);
      assert.ok(bytes, `No se renderizó la pieza ${mediaAssetId}.`);
      return bytes;
    },
    find(url: string): Uint8Array | undefined {
      const mediaAssetId = new URL(url).pathname
        .replace(/^\//u, "")
        .replace(/\.png$/u, "");
      return pieces.get(mediaAssetId);
    },
    store(mediaAssetId: string, bytes: Uint8Array): void {
      pieces.set(mediaAssetId, bytes);
    },
    urlFor(mediaAssetId: string): string {
      return `${previewOrigin}/${mediaAssetId}.png`;
    },
  });
}

/** Un proveedor que no puede usarse: si alguien lo llama, la prueba falla. */
const providerNeverCalled: ImageGenerationPort = Object.freeze({
  edit(): Promise<GeneratedImage> {
    return Promise.reject(
      new Error("El E2E de marcos no puede llamar a Images edit."),
    );
  },
  generate(): Promise<GeneratedImage> {
    return Promise.reject(
      new Error("El E2E de marcos no puede llamar a Images generate."),
    );
  },
});

/**
 * Doble del ciclo de medios: registra el activo en la base igual que
 * producción, pero guarda los bytes en memoria en lugar de subirlos.
 */
function localMedia(
  database: DatabaseClient,
  previews: PreviewStore,
): Readonly<{
  read(): Promise<ReadMediaResult>;
  upload(command: UploadMediaCommand): Promise<MediaAssetRecord>;
}> {
  const repository = new PrismaMediaAssetRepository(database);
  return Object.freeze({
    read(): Promise<ReadMediaResult> {
      return Promise.reject(
        new Error(
          "La pieza de este E2E es determinista: no hay base que leer.",
        ),
      );
    },
    async upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
      const size = pngSize(command.bytes);
      previews.store(command.mediaAssetId, command.bytes);
      const reservation = await repository.reserveUpload({
        id: command.mediaAssetId,
        organizationId: command.organizationId,
        origin: command.origin,
        originalFileName: command.originalFileName,
        ownerMembershipId: command.ownerMembershipId,
        storageProvider: "cloudinary",
      });
      assert.notEqual(reservation.status, "not-found");
      const completed = await repository.completeUpload({
        byteSize: String(command.bytes.byteLength),
        checksumSha256: createHash("sha256")
          .update(command.bytes)
          .digest("hex"),
        height: size.height,
        mediaAssetId: command.mediaAssetId,
        mimeType: "image/png",
        organizationId: command.organizationId,
        secureUrl: previews.urlFor(command.mediaAssetId),
        storageKey: `composicion/${command.mediaAssetId}`,
        storageVersion: 1,
        width: size.width,
      });
      assert.equal(completed.status, "updated");
      return completed.asset;
    },
  });
}

/**
 * Transporte que recuerda por qué falló cada entrega.
 *
 * El dispatcher del worker guarda sólo «La entrega outbox falló.» y reintenta
 * más tarde: correcto en producción, donde el log lleva la causa, pero una
 * prueba que falla con ese mensaje no dice nada de lo que se rompió.
 */
function capturingTransport(
  transport: OutboxTransport,
  errors: string[],
): OutboxTransport {
  return Object.freeze({
    async deliver(message: OutboxMessageRecord): Promise<void> {
      try {
        await transport.deliver(message);
      } catch (cause: unknown) {
        errors.push(
          cause instanceof Error
            ? (cause.stack ?? cause.message)
            : "Error desconocido.",
        );
        throw cause;
      }
    },
  });
}

/** Estado de lotes, variantes y outbox, para explicar una espera que no llegó. */
async function describeGenerationState(
  database: DatabaseClient,
  organizationId: string,
  deliveryErrors: readonly string[],
): Promise<string> {
  const runs = await database.generationRun.findMany({
    include: { variants: true },
    orderBy: { requestedAt: "asc" },
    where: { organizationId },
  });
  const messages = await database.outboxMessage.findMany({
    orderBy: { createdAt: "asc" },
    where: { organizationId },
  });
  const runLines = runs.map((run) =>
    JSON.stringify({
      admission: `${run.admissionMode}/${run.admissionReason ?? "-"}`,
      editKind: run.editKind,
      resolution: run.resolutionDetail,
      status: run.status,
      variants: run.variants.map(
        (variant) =>
          `${variant.status}:${variant.failureCode ?? "-"}:${variant.compositionLayout ?? "-"}`,
      ),
    }),
  );
  const messageLines = messages.map((message) =>
    JSON.stringify({
      attempts: message.attempts,
      error: message.lastErrorMessage,
      status: message.status,
      topic: message.topic,
    }),
  );
  return [
    `Lotes:\n${runLines.join("\n") || "ninguno"}`,
    `Outbox:\n${messageLines.join("\n") || "ninguno"}`,
    `Errores de entrega:\n${deliveryErrors.join("\n---\n") || "ninguno"}`,
  ].join("\n");
}

async function dispatchUntil(
  dispatcher: OutboxDispatcherService,
  done: () => Promise<boolean>,
  what: string,
  diagnose: () => Promise<string>,
): Promise<void> {
  for (let round = 0; round < 40; round += 1) {
    await dispatcher.dispatchBatch(new Date(), 20);
    if (await done()) {
      return;
    }
    await delay(500);
  }
  assert.fail(
    `${what} no terminó después de despachar el outbox.\n${await diagnose()}`,
  );
}

async function waitForText(
  locator: Locator,
  pattern: RegExp,
  timeoutMs: number,
  explain: () => string,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await locator.count()) > 0 ? await locator.first().innerText() : "";
    if (pattern.test(last)) {
      return last;
    }
    await delay(250);
  }
  assert.fail(
    `Esperaba ${String(pattern)} y el panel mostraba «${last}». ${explain()}`,
  );
}

/**
 * Inicia sesión por la API y devuelve la cookie.
 *
 * Se hace por HTTP y no escribiendo la sesión en la base: una sesión inventada
 * probaría el panel contra un guard que nunca corrió.
 */
async function login(
  apiBaseUrl: string,
  email: string,
): Promise<Readonly<{ name: string; value: string }>> {
  const response = await fetch(new URL("auth/login", apiBaseUrl), {
    body: JSON.stringify({ email, password: compositionEditPassword }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 201, "El login no creó sesión.");
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "El login no devolvió cookie de sesión.");
  const [pair] = setCookie.split(";");
  const separator = pair?.indexOf("=") ?? -1;
  assert.ok(pair !== undefined && separator > 0, "Cookie de sesión inválida.");
  return Object.freeze({
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
  });
}

async function main(): Promise<void> {
  const baseUrl = process.env["DATABASE_URL"];
  assert.ok(baseUrl, "DATABASE_URL es obligatorio para este E2E.");
  const redisUrl = process.env["REDIS_URL"];
  assert.ok(redisUrl, "REDIS_URL es obligatorio para este E2E.");

  const databaseName = `aramayo_marcos_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = databaseUrlFor(baseUrl, databaseName);
  const adminPool = new Pool({ connectionString: baseUrl, max: 1 });
  let created = false;
  let api: RunningProcess | undefined;
  let web: RunningProcess | undefined;
  let browser: Browser | undefined;
  let database: DatabaseClient | undefined;
  let closeRenderer: (() => Promise<void>) | undefined;

  try {
    await mkdir(outputDirectory, { recursive: true });
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const migrate = await runProcess(
      {
        arguments: [prismaBinary, "migrate", "deploy"],
        environment: { ...process.env, DATABASE_URL: databaseUrl },
        workingDirectory: repositoryDirectory,
      },
      buildTimeoutMs,
    );
    assert.equal(migrate.exitCode, 0, `La migración falló:\n${migrate.output}`);
    const fixture = await seedCompositionEditFixture(databaseUrl);
    process.stdout.write("Base efímera migrada y sembrada.\n");

    const apiPort = await reserveEphemeralPort();
    const webPort = await reserveEphemeralPort();
    const apiBaseUrl = `http://127.0.0.1:${String(apiPort)}/`;
    const webBaseUrl = `http://127.0.0.1:${String(webPort)}`;
    api = startProcess({
      arguments: ["dist/main.js"],
      environment: {
        ...apiEnvironment(apiPort),
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        WEB_ORIGIN: webBaseUrl,
      },
      workingDirectory: apiDirectory,
    });
    try {
      await waitForHttp(`${apiBaseUrl}health`, startupTimeoutMs);
    } catch (cause) {
      throw new Error(
        `La API no arrancó:\n${api.output()}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    process.stdout.write("API en pie.\n");

    const webEnv = {
      ...webEnvironment(webPort, apiBaseUrl),
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
    };
    const build = await runProcess(
      {
        arguments: [nextBinary, "build"],
        environment: webEnv,
        workingDirectory: webDirectory,
      },
      buildTimeoutMs,
    );
    assert.equal(build.exitCode, 0, `El panel no compiló:\n${build.output}`);
    web = startProcess({
      arguments: [nextBinary, "start"],
      environment: webEnv,
      workingDirectory: webDirectory,
    });
    await waitForHttp(`${webBaseUrl}/`, startupTimeoutMs);
    process.stdout.write("Panel en pie.\n");

    // --- El worker, dentro del proceso y sin proveedores externos ---
    const localPreviews = createPreviewStore();
    const db = createDatabaseClient(databaseUrl);
    database = db;
    const renderer = createPlaywrightRenderer({
      concurrency: 1,
      context: renderContextFor(ARAMAYO_BRAND_PROFILE),
    });
    closeRenderer = (): Promise<void> => renderer.close();
    const generation = new ImageGenerationRunService(
      new PrismaGenerationRunRepository(db),
      new PrismaContentBriefRunRepository(db),
      providerNeverCalled,
      localMedia(db, localPreviews),
      renderer,
      {
        attempts: new PrismaGenerationAttemptLedgerRepository(db),
        // Sin proveedor configurado, igual que un worker sin credenciales: el
        // lote original sale determinista y no puede gastar.
        generationEnabled: false,
        policies: new PrismaGenerationPolicyRepository(db),
      },
    );
    const deliveryErrors: string[] = [];
    const dispatcher = new OutboxDispatcherService(
      new PrismaOutboxRepository(db),
      capturingTransport(
        new GenerationRunOutboxTransport(generation),
        deliveryErrors,
      ),
      `e2e-marcos-${randomUUID()}`,
    );

    // --- Sesión real en el navegador ---
    const cookie = await login(apiBaseUrl, fixture.email);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { height: 1400, width: 1280 },
    });
    await context.route(`${previewOrigin}/**`, async (route) => {
      const bytes = localPreviews.find(route.request().url());
      await (bytes === undefined
        ? route.fulfill({ status: 404 })
        : route.fulfill({
            body: Buffer.from(bytes),
            contentType: "image/png",
            status: 200,
          }));
    });
    await context.addCookies([
      {
        domain: "127.0.0.1",
        httpOnly: true,
        name: cookie.name,
        path: "/",
        value: cookie.value,
      },
    ]);
    const page = await context.newPage();
    // Una respuesta rechazada de la API explica un fallo del panel mucho mejor
    // que un timeout de localizador, así que se conservan para el mensaje.
    const rejectedResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().startsWith(apiBaseUrl) && response.status() >= 400) {
        rejectedResponses.push(
          `${String(response.status())} ${response.request().method()} ${response.url()}`,
        );
      }
    });
    const explain = (): string =>
      `Respuestas rechazadas: ${rejectedResponses.join(", ") || "ninguna"}.`;
    const diagnose = async (): Promise<string> => {
      const workspaceNotice = await page
        .locator(".generation-workspace .composer-notice")
        .allInnerTexts();
      return [
        await describeGenerationState(
          db,
          fixture.organizationId,
          deliveryErrors,
        ),
        `Aviso del panel: ${workspaceNotice.join(" | ") || "ninguno"}`,
        explain(),
      ].join("\n");
    };

    // Cada flujo tiene su dirección: se entra directo a Creatividad IA.
    await page.goto(`${webBaseUrl}/publicaciones/nueva?flujo=creatividad-ia`, {
      waitUntil: "load",
    });
    await page
      .locator(".composer-history button", { hasText: fixture.brief.request })
      .click({ timeout: 30_000 });
    const workspace = page.locator(".generation-workspace");
    await workspace
      .getByRole("heading", { name: "Variantes visuales trazables" })
      .waitFor({ timeout: 30_000 });

    // --- La variante de partida la produce el sistema ---
    await workspace.getByRole("button", { name: "Generar variantes" }).click();
    await dispatchUntil(
      dispatcher,
      async () =>
        (await db.generationRun.count({
          where: {
            editKind: null,
            organizationId: fixture.organizationId,
            status: "completed",
          },
        })) === 1,
      "La generación original",
      diagnose,
    );
    const root = await db.generationRun.findFirstOrThrow({
      include: { variants: true },
      where: { editKind: null, organizationId: fixture.organizationId },
    });
    assert.equal(root.admissionMode, "deterministic");
    const rootVariant = root.variants.find(
      (variant) => variant.status === "succeeded",
    );
    assert.ok(
      rootVariant?.compositionLayout && rootVariant.composedMediaAssetId,
      "La generación original no dejó una pieza compuesta.",
    );
    const originalCard = workspace
      .locator("article.generation-variant-card", {
        hasText: "Generación original",
      })
      .filter({ has: page.locator("img") })
      .first();
    await originalCard.waitFor({ timeout: 60_000 });
    reportCheck(
      "el panel pide el lote y el worker entrega una pieza compuesta sin llamar a Images",
    );

    // --- El formulario arranca de lo que se ve ---
    await originalCard
      .getByRole("button", { name: "Cambiar marco y textos" })
      .click();
    const form = workspace.locator("form.generation-composition-form");
    await form.waitFor({ timeout: 10_000 });
    // El `select` vive dentro de su `label`, así que su nombre accesible suma
    // la opción elegida («Marco Zócalo»): se busca por prefijo.
    const layoutSelect = form.getByLabel(/^Marco/u);
    const titleInput = form.getByLabel(/^Título/u);
    const subtitleInput = form.getByLabel("Bajada", { exact: true });
    const badgeInput = form.getByLabel("Etiqueta (opcional)", { exact: true });
    const callToActionInput = form.getByLabel("Llamado a la acción", {
      exact: true,
    });
    assert.equal(
      await layoutSelect.inputValue(),
      rootVariant.compositionLayout,
    );
    assert.equal(await titleInput.inputValue(), fixture.brief.title);
    assert.equal(
      await callToActionInput.inputValue(),
      fixture.brief.callToAction,
    );
    assert.equal(await subtitleInput.inputValue(), fixture.brief.subtitle);
    reportCheck(
      `el formulario arranca con el marco de la pieza (${rootVariant.compositionLayout}) y el copy del brief`,
    );

    // --- Cada marco acota sus campos ---
    await layoutSelect.selectOption("marco-sello");
    assert.equal(await subtitleInput.count(), 0, "El sello no lleva bajada.");
    assert.equal(await badgeInput.count(), 0, "El sello no lleva etiqueta.");
    assert.equal(await titleInput.getAttribute("maxlength"), "32");
    await layoutSelect.selectOption("marco-etiqueta");
    await badgeInput.waitFor({ timeout: 5_000 });
    assert.equal(
      await subtitleInput.count(),
      0,
      "La etiqueta no lleva bajada.",
    );
    assert.equal(await titleInput.getAttribute("maxlength"), "44");
    reportCheck(
      "cada marco muestra sólo los campos que sabe ubicar y acota el título a su presupuesto",
    );

    // --- Un precio sin evidencia se rechaza con un motivo legible ---
    const submit = form.getByRole("button", { name: "Recomponer" });
    const notice = workspace.locator(".composer-notice");
    await titleInput.fill("Tornillos a $ 25.000");
    await submit.click();
    await waitForText(notice, /precio/iu, 20_000, explain);
    assert.equal(
      await db.generationRun.count({
        where: {
          editKind: "composition",
          organizationId: fixture.organizationId,
        },
      }),
      0,
      "Un copy rechazado no puede crear una ejecución.",
    );
    reportCheck(
      "un precio sin hecho verificado se rechaza con un motivo legible y no crea ejecución",
    );

    // --- Dos clics seguidos dejan una sola recomposición ---
    await titleInput.fill(fixture.brief.title);
    await badgeInput.fill("Nuevo");
    await form.screenshot({ path: join(outputDirectory, "formulario.png") });
    await Promise.all([
      submit.click(),
      submit.click({ timeout: 3_000 }).catch(() => undefined),
    ]);
    await dispatchUntil(
      dispatcher,
      async () =>
        (await db.generationRun.count({
          where: {
            editKind: "composition",
            organizationId: fixture.organizationId,
            status: "completed",
          },
        })) === 1,
      "La recomposición",
      diagnose,
    );
    assert.equal(
      await db.generationRun.count({
        where: {
          editKind: "composition",
          organizationId: fixture.organizationId,
        },
      }),
      1,
      "Dos clics seguidos crearon más de una recomposición.",
    );
    reportCheck("dos clics seguidos dejan una sola recomposición");

    // --- La hija no gasta ---
    const child = await db.generationRun.findFirstOrThrow({
      include: { attempts: true, variants: true },
      where: {
        editKind: "composition",
        organizationId: fixture.organizationId,
      },
    });
    assert.equal(child.admissionMode, "deterministic");
    assert.equal(child.admissionReason, "composition-edit");
    assert.equal(child.deterministicReason, "composition-edit");
    assert.equal(child.editInstruction, null);
    assert.equal(child.editLayout, "marco-etiqueta");
    assert.deepEqual(child.editCopy, {
      badge: "Nuevo",
      callToAction: fixture.brief.callToAction,
      subtitle: null,
      title: fixture.brief.title,
    });
    assert.equal(child.parentRunId, root.id);
    assert.equal(child.parentVariantId, rootVariant.id);
    assert.equal(child.lineageRootId, root.id);
    assert.equal(child.attempts.length, 0, "La hija registró intentos.");
    const childVariant = child.variants.find(
      (variant) => variant.status === "succeeded",
    );
    assert.ok(
      childVariant?.composedMediaAssetId,
      "La recomposición no dejó una pieza.",
    );
    assert.equal(childVariant.compositionLayout, "marco-etiqueta");
    assert.notEqual(childVariant.compositionHash, rootVariant.compositionHash);
    reportCheck(
      "la hija guarda marco y copy, se admite sin proveedor y no registra intentos",
    );

    const childCard = workspace
      .locator("article.generation-variant-card", {
        hasText: `Etiqueta: ${fixture.brief.title}`,
      })
      .filter({ has: page.locator("img") })
      .first();
    await childCard.waitFor({ timeout: 60_000 });
    const childSection = workspace
      .locator(".generation-lineage > section")
      // El localizador interno se busca dentro de cada sección: no puede partir
      // del workspace, que está afuera.
      .filter({
        has: page.locator("article.generation-variant-card", {
          hasText: `Etiqueta: ${fixture.brief.title}`,
        }),
      });
    await waitForText(
      childSection.locator("header"),
      /USD 0\.0000/u,
      10_000,
      explain,
    );
    reportCheck("el panel muestra la pieza recompuesta con costo cero");

    // --- Reeditar parte de la recomposición ---
    await childCard
      .getByRole("button", { name: "Cambiar marco y textos" })
      .click();
    await form.waitFor({ timeout: 10_000 });
    assert.equal(await layoutSelect.inputValue(), "marco-etiqueta");
    assert.equal(await badgeInput.inputValue(), "Nuevo");
    assert.equal(await titleInput.inputValue(), fixture.brief.title);
    await form.getByRole("button", { name: "Cancelar" }).click();
    reportCheck(
      "reeditar una recomposición arranca de su propio marco y copy, no del brief",
    );

    await page.screenshot({
      fullPage: true,
      path: join(outputDirectory, "linaje.png"),
    });
    await writeFile(
      join(outputDirectory, "pieza-original.png"),
      localPreviews.bytesFor(rootVariant.composedMediaAssetId),
    );
    await writeFile(
      join(outputDirectory, "pieza-recompuesta.png"),
      localPreviews.bytesFor(childVariant.composedMediaAssetId),
    );
    await context.close();
    process.stdout.write(
      "E2E de cambiar marco y textos completo. Capturas en output/e2e-composition-edit/.\n",
    );
  } finally {
    await browser?.close();
    await closeRenderer?.();
    await database?.$disconnect();
    if (web !== undefined) {
      await web.terminate();
    }
    if (api !== undefined) {
      await api.terminate();
    }
    if (created) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    }
    await adminPool.end();
  }
}

await main();
