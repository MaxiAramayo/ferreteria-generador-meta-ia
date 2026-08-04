/**
 * Contrato del gateway de imágenes contra un transporte falso.
 *
 * Nunca llama a la API real: el smoke de staging verifica la integración. Acá se
 * fija la traducción, que es donde viven los errores silenciosos —una respuesta
 * incompleta que pasa por éxito, un timeout que se confunde con un rechazo de
 * seguridad— y donde podría filtrarse al log algo que devolvió el proveedor.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  ImageGenerationError,
  type EditImageCommand,
  type GenerateImageCommand,
} from "@aramayo/domain";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai";
import sharp from "sharp";

import { imageFailureFor } from "./openai-image-transport.ts";
import type {
  OpenAIImageTransportRequest,
  OpenAIImageTransportResponse,
  OpenAIImagesTransport,
} from "./openai-image-transport.ts";
import { OpenAIImageGenerationGateway } from "./openai-image.gateway.ts";

async function pngBase64(width = 1024, height = 1536): Promise<string> {
  const png = await sharp({
    create: {
      background: { b: 40, g: 90, r: 200 },
      channels: 3,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
  return png.toString("base64");
}

class FakeImagesTransport implements OpenAIImagesTransport {
  readonly requests: OpenAIImageTransportRequest[] = [];
  readonly #reply: () => Promise<OpenAIImageTransportResponse>;

  constructor(reply: () => Promise<OpenAIImageTransportResponse>) {
    this.#reply = reply;
  }

  async generate(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse> {
    this.requests.push(request);
    return this.#reply();
  }

  async edit(
    request: OpenAIImageTransportRequest,
  ): Promise<OpenAIImageTransportResponse> {
    this.requests.push(request);
    return this.#reply();
  }
}

function ok(encodedImage: string): OpenAIImageTransportResponse {
  return {
    encodedImage,
    requestId: "req_fake",
    usage: { inputTokens: 12, outputTokens: 300, totalTokens: 312 },
  };
}

const command: GenerateImageCommand = Object.freeze({
  background: "opaque",
  kind: "generate",
  negativeGuidance: ["texto", "logotipo"],
  prompt: "un banco de trabajo",
  quality: "medium",
  size: "1024x1536",
});

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (cause: unknown) {
    assert.ok(cause instanceof ImageGenerationError);
    // Ningún fallo puede reproducir la respuesta del proveedor.
    assert.equal(cause.message, "La generación de imagen no pudo completarse.");
    return cause.code;
  }
  assert.fail("Se esperaba un fallo.");
}

test("la guía negativa viaja dentro del prompt y no se pierde", async () => {
  const transport = new FakeImagesTransport(async () => ok(await pngBase64()));
  await new OpenAIImageGenerationGateway(transport).generate(command);

  const prompt = transport.requests[0]?.prompt ?? "";
  assert.ok(prompt.startsWith("un banco de trabajo"));
  assert.match(prompt, /No incluir: texto; logotipo\./u);
});

test("las dimensiones salen de decodificar los bytes, no del pedido", async () => {
  // El pedido dice 1024x1536 y el proveedor devuelve un cuadrado: gana lo que
  // llegó, porque es lo que después se compone.
  const transport = new FakeImagesTransport(async () =>
    ok(await pngBase64(1024, 1024)),
  );
  const image = await new OpenAIImageGenerationGateway(transport).generate(
    command,
  );

  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  assert.match(image.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(image.mimeType, "image/png");
  assert.equal(image.requestId, "req_fake");
  assert.equal(image.model, "gpt-image-2");
  assert.equal(image.usage?.totalTokens, 312);
});

test("una respuesta sin imagen es contenido inválido y no un éxito vacío", async () => {
  for (const encodedImage of [null, ""]) {
    const transport = new FakeImagesTransport(async () =>
      Promise.resolve({ encodedImage, requestId: null, usage: null }),
    );
    assert.equal(
      await codeOf(async () =>
        new OpenAIImageGenerationGateway(transport).generate(command),
      ),
      "content-invalid",
    );
  }
});

test("bytes que no decodifican no se dan por buenos", async () => {
  const transport = new FakeImagesTransport(async () =>
    Promise.resolve(ok(Buffer.from("no soy una imagen").toString("base64"))),
  );
  assert.equal(
    await codeOf(async () =>
      new OpenAIImageGenerationGateway(transport).generate(command),
    ),
    "content-invalid",
  );
});

test("un parámetro no admitido falla sin llegar al proveedor", async () => {
  const transport = new FakeImagesTransport(async () => ok(await pngBase64()));
  assert.equal(
    await codeOf(async () =>
      new OpenAIImageGenerationGateway(transport).generate({
        ...command,
        size: "4096x4096" as never,
      }),
    ),
    "unsupported-parameter",
  );
  assert.equal(transport.requests.length, 0);
});

test("editar adjunta las referencias y usa el método de edición", async () => {
  const transport = new FakeImagesTransport(async () => ok(await pngBase64()));
  const edit: EditImageCommand = {
    background: "opaque",
    kind: "edit",
    negativeGuidance: [],
    prompt: "un banco de trabajo",
    quality: "medium",
    references: [
      {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "image/png",
        name: "referencia.png",
      },
    ],
    size: "1024x1536",
  };
  await new OpenAIImageGenerationGateway(transport).edit(edit);

  const request = transport.requests[0];
  assert.ok(request !== undefined);
  assert.equal(request.references.length, 1);
  assert.equal(request.references[0]?.name, "referencia.png");
});

test("la latencia se mide con el reloj inyectado", async () => {
  const transport = new FakeImagesTransport(async () => ok(await pngBase64()));
  let current = 1_000;
  const image = await new OpenAIImageGenerationGateway(transport, {
    now: (): number => {
      current += 250;
      return current;
    },
  }).generate(command);

  assert.ok(image.latencyMilliseconds > 0);
});

test("timeout, rate limit, conexión y seguridad se distinguen entre sí", () => {
  const cases: readonly Readonly<{
    code: string;
    error: unknown;
    retryable: boolean;
  }>[] = [
    {
      code: "timeout",
      error: new APIConnectionTimeoutError({ message: "tardó demasiado" }),
      retryable: true,
    },
    {
      code: "rate-limit",
      error: new RateLimitError(429, undefined, "demasiadas", new Headers()),
      retryable: true,
    },
    {
      code: "provider-error",
      error: new APIConnectionError({ message: "sin conexión" }),
      retryable: true,
    },
    {
      code: "safety-rejection",
      error: Object.assign(
        new APIError(400, undefined, "rechazado", new Headers()),
        { code: "content_policy_violation" },
      ),
      retryable: false,
    },
    {
      code: "provider-error",
      error: new Error("algo raro"),
      retryable: true,
    },
  ];

  for (const entry of cases) {
    const failure = imageFailureFor(entry.error);
    assert.equal(failure.code, entry.code);
    assert.equal(failure.retryable, entry.retryable, entry.code);
    assert.equal(
      failure.message,
      "La generación de imagen no pudo completarse.",
    );
  }
});

test("un 4xx del proveedor no se reintenta y un 5xx sí", () => {
  assert.equal(
    imageFailureFor(
      new APIError(400, undefined, "pedido inválido", new Headers()),
    ).retryable,
    false,
  );
  assert.equal(
    imageFailureFor(
      new APIError(503, undefined, "no disponible", new Headers()),
    ).retryable,
    true,
  );
});
