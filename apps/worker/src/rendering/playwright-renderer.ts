import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DesignEngineError,
  formatFor,
  type DesignFailure,
  type DesignRenderer,
  type RenderRequest,
  type RenderResult,
} from "@aramayo/design-engine";
import type { LayoutContext } from "@aramayo/design-engine/react";
import { chromium, type Browser, type Page } from "playwright-core";

import { buildRenderHtml, waitForRenderAssets } from "./render-document.ts";

/**
 * Renderizador con navegador administrado.
 *
 * Exporta exactamente el nodo `[data-card]`, nunca la ventana: el recorte no
 * depende del viewport. Cada trabajo tiene timeout y limpieza propia, y la
 * concurrencia está limitada para que un lote no agote la memoria del proceso.
 *
 * El navegador se reutiliza entre trabajos porque abrirlo cuesta segundos; las
 * páginas, en cambio, se crean y se cierran por trabajo para que un render no
 * herede estado de otro.
 */

export interface PlaywrightRendererOptions {
  /** Canal de navegador del sistema. En desarrollo, el Chrome instalado. */
  readonly browserChannel?: string;
  /** Perfil de marca y base de activos: es configuración, no dato del trabajo. */
  readonly context: LayoutContext;
  readonly concurrency?: number;
  readonly executablePath?: string;
  readonly timeoutMs?: number;
}

export interface ManagedRenderer extends DesignRenderer {
  close(): Promise<void>;
}

const defaultTimeoutMs = 30_000;
const defaultConcurrency = 2;
const defaultChannel = "chrome";

function failure(
  failureValue: DesignFailure,
  requestId: string,
  durationMs: number,
): RenderResult {
  return { durationMs, failure: failureValue, ok: false, requestId };
}

/**
 * Semáforo simple: un lote grande no puede abrir una página por documento.
 */
function createSemaphore(limit: number): {
  acquire: () => Promise<() => void>;
} {
  let active = 0;
  const waiting: (() => void)[] = [];

  const release = (): void => {
    active -= 1;
    const next = waiting.shift();
    if (next !== undefined) {
      next();
    }
  };

  return {
    acquire: async (): Promise<() => void> => {
      if (active >= limit) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      active += 1;
      return release;
    },
  };
}

export function createPlaywrightRenderer(
  options: PlaywrightRendererOptions,
): ManagedRenderer {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const semaphore = createSemaphore(options.concurrency ?? defaultConcurrency);
  let browser: Browser | undefined;
  let browserLaunch: Promise<Browser> | undefined;

  async function browserInstance(): Promise<Browser> {
    if (browser !== undefined && browser.isConnected()) {
      return browser;
    }

    browserLaunch ??= chromium
      .launch({
        ...(options.executablePath === undefined
          ? { channel: options.browserChannel ?? defaultChannel }
          : { executablePath: options.executablePath }),
        args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
        headless: true,
      })
      .then((launchedBrowser) => {
        browser = launchedBrowser;
        return launchedBrowser;
      })
      .finally(() => {
        browserLaunch = undefined;
      });

    return browserLaunch;
  }

  async function renderOnce(request: RenderRequest): Promise<RenderResult> {
    const startedAt = performance.now();
    const format = formatFor(request.document.format);
    const scale = request.scale ?? 1;
    const workingDirectory = await mkdtemp(join(tmpdir(), "aramayo-render-"));
    const documentPath = join(workingDirectory, "piece.html");
    let page: Page | undefined;

    try {
      await writeFile(
        documentPath,
        buildRenderHtml({
          context: options.context,
          document: request.document,
        }),
        "utf8",
      );

      const instance = await browserInstance();
      page = await instance.newPage({
        deviceScaleFactor: scale,
        viewport: { height: format.height, width: format.width },
      });
      page.setDefaultTimeout(timeoutMs);

      await page.goto(pathToFileURL(documentPath).href, {
        timeout: timeoutMs,
        waitUntil: "load",
      });

      const brokenImages: unknown = await page.evaluate(waitForRenderAssets);

      if (Array.isArray(brokenImages) && brokenImages.length > 0) {
        return failure(
          {
            assetReference: "media",
            reason: "decode-failed",
            stage: "asset",
          },
          request.requestId,
          Math.round(performance.now() - startedAt),
        );
      }

      const card = page.locator("[data-card]");
      const png = await card.screenshot({ timeout: timeoutMs, type: "png" });

      return {
        durationMs: Math.round(performance.now() - startedAt),
        image: {
          byteLength: png.byteLength,
          height: Math.round(format.height * scale),
          png: new Uint8Array(png),
          sha256: createHash("sha256").update(png).digest("hex"),
          width: Math.round(format.width * scale),
        },
        ok: true,
        requestId: request.requestId,
      };
    } catch (cause: unknown) {
      const durationMs = Math.round(performance.now() - startedAt);

      if (cause instanceof DesignEngineError) {
        return failure(cause.failure, request.requestId, durationMs);
      }

      const message = cause instanceof Error ? cause.message : "";
      const reason = message.includes("imeout") ? "timeout" : "browser-crashed";

      return failure(
        { durationMs, reason, stage: "render" },
        request.requestId,
        durationMs,
      );
    } finally {
      await page?.close().catch(() => undefined);
      await rm(workingDirectory, { force: true, recursive: true }).catch(
        () => undefined,
      );
    }
  }

  return {
    async close(): Promise<void> {
      const pendingLaunch = browserLaunch;
      const instance = browser ?? (await pendingLaunch?.catch(() => undefined));
      browser = undefined;
      browserLaunch = undefined;
      await instance?.close().catch(() => undefined);
    },
    async render(request: RenderRequest): Promise<RenderResult> {
      const release = await semaphore.acquire();

      try {
        return await renderOnce(request);
      } finally {
        release();
      }
    },
  };
}
