import { randomUUID } from "node:crypto";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  parseCloudinaryIntegration,
  type CloudinaryCredentials,
} from "@aramayo/configuration";
import {
  DESIGN_SCHEMA_VERSION,
  parseDesignDocument,
  type DesignDocument,
} from "@aramayo/design-engine";
import sharp from "sharp";

import {
  createPlaywrightRenderer,
  type ManagedRenderer,
} from "../rendering/playwright-renderer.ts";
import { renderContextFor } from "../rendering/render-document.ts";
import { CloudinaryMediaStorage } from "./cloudinary-media-storage.ts";

const stagingFolderPattern = /(?:^|\/)staging(?:\/|$)/u;

function requiredStagingCredentials(): CloudinaryCredentials {
  if (process.env["NODE_ENV"] !== "staging") {
    throw new Error(
      "El smoke remoto solo puede ejecutarse con NODE_ENV=staging.",
    );
  }

  const cloudinary = parseCloudinaryIntegration(
    process.env,
    "cloudinary-smoke",
  );
  if (!cloudinary.enabled) {
    throw new Error(
      "El smoke remoto requiere las cuatro variables de Cloudinary.",
    );
  }
  if (!stagingFolderPattern.test(cloudinary.credentials.folder)) {
    throw new Error(
      "CLOUDINARY_FOLDER debe identificar explícitamente un directorio staging.",
    );
  }

  return cloudinary.credentials;
}

function remoteDocument(remoteUrl: string): DesignDocument {
  const parsed = parseDesignDocument({
    content: {
      badge: "Prueba controlada",
      callToAction: "Consultá por WhatsApp",
      subtitle: "Recurso remoto validado y servido por HTTPS.",
      title: "Ciclo de medios",
    },
    format: "feed",
    layout: "producto-destacado",
    media: [
      {
        alt: "Muestra azul para verificar el render remoto",
        reference: { source: "remote", url: remoteUrl },
      },
    ],
    schemaVersion: DESIGN_SCHEMA_VERSION,
    slug: "cloudinary-staging-smoke",
    theme: "taller",
  });
  if (!parsed.ok) {
    throw new Error("El documento del smoke remoto no es válido.");
  }

  return parsed.document;
}

async function syntheticPng(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: {
        background: { alpha: 1, b: 180, g: 85, r: 12 },
        channels: 4,
        height: 320,
        width: 320,
      },
    })
      .png()
      .toBuffer(),
  );
}

async function assertPublicImage(remoteUrl: string): Promise<void> {
  const response = await fetch(remoteUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `La variante remota respondió HTTP ${String(response.status)}.`,
    );
  }
  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error("La variante remota no devolvió un tipo de imagen.");
  }
  await response.body?.cancel();
}

async function assertRemoteRender(
  remoteUrl: string,
  renderer: ManagedRenderer,
): Promise<void> {
  const render = await renderer.render({
    document: remoteDocument(remoteUrl),
    requestId: `cloudinary-smoke-${randomUUID()}`,
  });
  if (!render.ok) {
    throw new Error(`El render remoto falló en etapa ${render.failure.stage}.`);
  }
  if (render.image.width !== 1080 || render.image.height !== 1350) {
    throw new Error("El render remoto no conservó las dimensiones de feed.");
  }
}

async function runCloudinarySmoke(): Promise<void> {
  const credentials = requiredStagingCredentials();
  const storage = new CloudinaryMediaStorage(credentials);
  const mediaAssetId = randomUUID();
  const organizationScope = "p1-t07-smoke";
  const storageKey = `${credentials.folder}/${organizationScope}/${mediaAssetId}`;
  const renderer = createPlaywrightRenderer({
    context: renderContextFor(ARAMAYO_BRAND_PROFILE),
    timeoutMs: 30_000,
  });

  try {
    const stored = await storage.store({
      bytes: await syntheticPng(),
      mediaAssetId,
      mimeType: "image/png",
      organizationId: organizationScope,
    });
    if (stored.storageKey !== storageKey) {
      throw new Error("Cloudinary no conservó la clave temporal esperada.");
    }
    const remoteUrl = storage.deliveryUrl(stored, "meta-feed");
    await assertPublicImage(remoteUrl);
    await assertRemoteRender(remoteUrl, renderer);
    process.stdout.write(
      "Cloudinary staging: carga, variante HTTPS y render remoto verificados.\n",
    );
  } finally {
    await renderer.close();
    await storage.delete(storageKey);
    process.stdout.write(
      "Cloudinary staging: recurso temporal eliminado de forma idempotente.\n",
    );
  }
}

try {
  await runCloudinarySmoke();
} catch (cause: unknown) {
  process.stderr.write(
    `Cloudinary staging smoke failed: ${
      cause instanceof Error ? cause.message : "Error desconocido."
    }\n`,
  );
  process.exitCode = 1;
}
