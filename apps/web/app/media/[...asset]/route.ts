import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { BRAND_ASSETS } from "@aramayo/design-engine";

/**
 * Sirve los activos migrados del motor de diseño.
 *
 * La biblioteca aprobada es la lista blanca: sólo se entrega un archivo que
 * figure en `BRAND_ASSETS`. Cualquier otra ruta responde 404 sin tocar el disco,
 * de modo que no existe forma de recorrer directorios desde la URL.
 *
 * Los activos no se duplican en `public/`: viven una sola vez en el paquete. La
 * ubicación se resuelve por `node_modules` en tiempo de ejecución porque el
 * empaquetador reescribe `import.meta.url` y perdería la ruta real.
 */

const contentTypes: ReadonlyMap<string, string> = new Map([
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
]);

const approvedFiles: ReadonlySet<string> = new Set(
  BRAND_ASSETS.map((asset) => asset.file),
);

function assetsDirectory(): string {
  const resolveFromApp = createRequire(join(process.cwd(), "package.json"));

  return join(
    dirname(resolveFromApp.resolve("@aramayo/design-engine/package.json")),
    "assets",
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ asset: string[] }> },
): Promise<Response> {
  const { asset } = await context.params;
  const requestedFile = asset
    .map((segment) => decodeURIComponent(segment))
    .join("/");

  if (!approvedFiles.has(requestedFile)) {
    return new Response("Activo no aprobado.", { status: 404 });
  }

  const extension = requestedFile.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = contentTypes.get(extension) ?? "application/octet-stream";
  const content = await readFile(join(assetsDirectory(), requestedFile));

  return new Response(new Uint8Array(content), {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": contentType,
    },
  });
}
