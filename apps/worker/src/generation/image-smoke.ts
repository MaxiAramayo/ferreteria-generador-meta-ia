/**
 * Smoke real de generación y edición de imágenes contra staging.
 *
 * Es la única verificación de `P4-T03` que llama a la API. Gasta dinero, así que
 * corre a mano y no en cada commit: dos imágenes de calidad baja, la segunda
 * editando la primera.
 *
 * La salida no incluye el prompt, ni la imagen, ni ninguna URL: sólo medidas y
 * hashes. Las imágenes quedan en `output/`, que no se versiona, para poder
 * mirarlas.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  parseOpenAiIntegration,
  type OpenAIIntegration,
} from "@aramayo/configuration";
import {
  ImageGenerationError,
  imageSizeForFormat,
  type GeneratedImage,
} from "@aramayo/domain";

import { OfficialOpenAIImagesTransport } from "./openai-image-transport.ts";
import { OpenAIImageGenerationGateway } from "./openai-image.gateway.ts";

const outputDirectory = fileURLToPath(
  new URL("../../../../output/image-smoke/", import.meta.url),
);

function requiredStagingIntegration(): Extract<
  OpenAIIntegration,
  { readonly enabled: true }
> {
  if (process.env["NODE_ENV"] !== "staging") {
    throw new Error("El smoke de imágenes solo admite NODE_ENV=staging.");
  }
  const integration = parseOpenAiIntegration(
    process.env,
    "image-staging-smoke",
  );
  if (!integration.enabled) {
    throw new Error(
      "El smoke requiere OPENAI_API_KEY y OPENAI_PROJECT_ID de staging.",
    );
  }
  return integration;
}

function describe(label: string, image: GeneratedImage): string {
  return [
    `${label}:`,
    `${String(image.width)}x${String(image.height)}`,
    `modelo=${image.model}`,
    `hash=${image.sha256.slice(0, 16)}…`,
    `latencia=${String(image.latencyMilliseconds)}ms`,
    image.usage === null
      ? "sin uso informado"
      : `tokens=${String(image.usage.totalTokens)}`,
  ].join(" ");
}

async function runImageSmoke(): Promise<void> {
  const integration = requiredStagingIntegration();
  const gateway = new OpenAIImageGenerationGateway(
    new OfficialOpenAIImagesTransport(integration.credentials),
  );
  await mkdir(outputDirectory, { recursive: true });

  // El formato de la pieza decide el tamaño que admite el proveedor; acá se
  // comprueba que ese mapeo produzca algo que el proveedor efectivamente acepta.
  const size = imageSizeForFormat("feed");
  const generated = await gateway.generate({
    background: "opaque",
    kind: "generate",
    negativeGuidance: ["texto", "logotipo", "rostro humano"],
    prompt:
      "Fotografía de producto: una llave inglesa de acero sobre una superficie de trabajo lisa y gris, luz de estudio suave, tercio inferior despejado.",
    quality: "low",
    size,
  });
  await writeFile(`${outputDirectory}generada.png`, generated.bytes);
  process.stdout.write(`${describe("generación", generated)}\n`);

  // Editar la imagen recién generada verifica el segundo contrato sin depender
  // de material del negocio.
  const edited = await gateway.edit({
    background: "opaque",
    kind: "edit",
    negativeGuidance: ["texto", "logotipo"],
    prompt:
      "Mantené la llave inglesa exactamente como está y oscurecé la superficie de apoyo.",
    quality: "low",
    references: [
      {
        bytes: generated.bytes,
        mimeType: generated.mimeType,
        name: "base.png",
      },
    ],
    size,
  });
  await writeFile(`${outputDirectory}editada.png`, edited.bytes);
  process.stdout.write(`${describe("edición", edited)}\n`);

  if (edited.sha256 === generated.sha256) {
    throw new Error("La edición devolvió la misma imagen que la generación.");
  }
  process.stdout.write(
    `imágenes guardadas en output/image-smoke/ (no se versionan)\n`,
  );
}

try {
  await runImageSmoke();
} catch (cause: unknown) {
  // Un fallo tipado se informa por su código: es lo que distingue un permiso
  // faltante de un problema de red o de un rechazo de contenido.
  if (cause instanceof ImageGenerationError) {
    process.stderr.write(
      `El smoke de imágenes falló: ${cause.code} — ${cause.detail}\n`,
    );
    if (cause.code === "provider-error") {
      process.stderr.write(
        "Si el estado es 403, la organización todavía no tiene habilitado GPT Image.\n",
      );
    }
    process.exit(1);
  }
  throw cause;
}
