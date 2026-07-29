import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";

import {
  createPlaywrightRenderer,
  type ManagedRenderer,
} from "./playwright-renderer.ts";
import { renderContextFor } from "./render-document.ts";

/**
 * Capacidad de render del worker.
 *
 * El navegador se administra por proceso: se abre en el primer trabajo y se
 * cierra con la aplicación. La concurrencia sale de la configuración del
 * worker, de modo que un lote no puede abrir más páginas de las declaradas.
 */

export const DESIGN_RENDERER = Symbol("DESIGN_RENDERER");

@Injectable()
export class RendererLifecycleService implements OnApplicationShutdown {
  readonly #logger = new Logger("worker");
  readonly #renderer: ManagedRenderer;

  constructor(@Inject(DESIGN_RENDERER) renderer: ManagedRenderer) {
    this.#renderer = renderer;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#renderer.close();
    this.#logger.log("render.browser.closed");
  }
}

@Module({})
export class RenderingModule {
  static forConfiguration(configuration: WorkerConfiguration): DynamicModule {
    const renderer = createPlaywrightRenderer({
      concurrency: configuration.concurrency,
      context: renderContextFor(ARAMAYO_BRAND_PROFILE),
      ...(configuration.chromiumExecutablePath === undefined
        ? {}
        : { executablePath: configuration.chromiumExecutablePath }),
    });

    return {
      exports: [DESIGN_RENDERER],
      global: true,
      module: RenderingModule,
      providers: [
        RendererLifecycleService,
        { provide: DESIGN_RENDERER, useValue: renderer },
      ],
    };
  }
}
