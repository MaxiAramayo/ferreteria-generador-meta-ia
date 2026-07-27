/**
 * Ubicación en disco de los activos migrados.
 *
 * Sirve a los consumidores que ejecutan el paquete sin empaquetador —el worker
 * al renderizar, las herramientas internas—: preguntan acá en lugar de
 * reconstruir la ruta. Un empaquetador reescribe `import.meta.url`, así que el
 * panel resuelve la ubicación por `node_modules` en su propia ruta.
 */

const packageRootUrl = new URL("../../", import.meta.url);

export const designEngineAssetsUrl = new URL("assets/", packageRootUrl);

export function assetFileUrl(file: string): URL {
  return new URL(file, designEngineAssetsUrl);
}
