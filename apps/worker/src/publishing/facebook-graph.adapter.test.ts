import assert from "node:assert/strict";
import test from "node:test";

import { MetaPublishingError } from "@aramayo/domain";

import { FacebookGraphPublishingAdapter } from "./facebook-graph.adapter.ts";

const pageAssetId = "1098765432109876";
const accessToken = "page-token-de-prueba";
const imageUrl =
  "https://res.cloudinary.com/m73l9k4c/image/upload/v3/aramayo-posts/staging/pieza.jpg";

interface RecordedCall {
  readonly authorization: string | null;
  readonly body: string;
  readonly method: string;
  readonly url: URL;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function recorder(responder: (call: RecordedCall) => Response): Readonly<{
  adapter: FacebookGraphPublishingAdapter;
  calls: readonly RecordedCall[];
}> {
  const calls: RecordedCall[] = [];
  const adapter = new FacebookGraphPublishingAdapter("v26.0", (input, init) => {
    const call: RecordedCall = {
      authorization:
        init?.headers === undefined
          ? null
          : new Headers(init.headers).get("authorization"),
      body: typeof init?.body === "string" ? init.body : "",
      method: init?.method ?? "GET",
      url: new URL(input instanceof Request ? input.url : input.toString()),
    };
    calls.push(call);
    return Promise.resolve(responder(call));
  });
  return { adapter, calls };
}

async function failureOf(
  operation: () => Promise<unknown>,
): Promise<MetaPublishingError> {
  try {
    await operation();
  } catch (cause: unknown) {
    assert.ok(cause instanceof MetaPublishingError);
    return cause;
  }
  throw new Error("La operación tenía que fallar.");
}

test("la versión de Graph es obligatoria y explícita", () => {
  assert.throws(() => new FacebookGraphPublishingAdapter("26.0"), RangeError);
});

test("la foto se sube sin publicar y devuelve su identificador", async () => {
  const { adapter, calls } = recorder(() => json({ id: "photo-1" }));
  const staged = await adapter.stagePhoto(
    { imageUrl, pageAssetId },
    accessToken,
  );

  assert.equal(staged.photoId, "photo-1");
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.method, "POST");
  assert.equal(call.url.pathname, `/v26.0/${pageAssetId}/photos`);
  const body = new URLSearchParams(call.body);
  // Sin esto la foto saldría publicada sola, sin el texto de la pieza.
  assert.equal(body.get("published"), "false");
  assert.equal(body.get("url"), imageUrl);
});

test("la publicación adjunta la foto preparada y lleva el copy", async () => {
  const { adapter, calls } = recorder(() => json({ id: "post-1" }));
  const post = await adapter.createPagePost(
    { copy: "Filtros Wega en stock.", pageAssetId, stagedPhotoId: "photo-1" },
    accessToken,
  );

  assert.equal(post.postId, "post-1");
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.url.pathname, `/v26.0/${pageAssetId}/feed`);
  const body = new URLSearchParams(call.body);
  assert.equal(body.get("message"), "Filtros Wega en stock.");
  assert.equal(
    body.get("attached_media"),
    JSON.stringify([{ media_fbid: "photo-1" }]),
  );
});

test("el token viaja en el encabezado y nunca en la URL", async () => {
  const { adapter, calls } = recorder((call) =>
    call.method === "POST" ? json({ id: "photo-1" }) : json({}),
  );
  await adapter.stagePhoto({ imageUrl, pageAssetId }, accessToken);
  await adapter.readStagedPhoto("photo-1", accessToken);

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.authorization, `Bearer ${accessToken}`);
    assert.ok(!call.url.toString().includes(accessToken));
    assert.ok(!call.body.includes(accessToken));
  }
});

test("page_story_id prueba que la publicación existe", async () => {
  const { adapter, calls } = recorder(() => json({ page_story_id: "post-1" }));
  const report = await adapter.readStagedPhoto("photo-1", accessToken);
  assert.equal(report.postId, "post-1");
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.url.searchParams.get("fields"), "page_story_id");
});

test("la ausencia de page_story_id no se convierte en una negativa", async () => {
  // Meta documenta que el campo puede faltar, así que el adaptador devuelve
  // ausencia y no `false`: quien decida tiene que ver la diferencia.
  const { adapter } = recorder(() => json({ id: "photo-1" }));
  const report = await adapter.readStagedPhoto("photo-1", accessToken);
  assert.deepEqual(report, {});
});

test("el enlace permanente se lee y su fallo no rompe la publicación", async () => {
  const found = recorder(() =>
    json({ permalink_url: "https://www.facebook.com/aramayo/posts/1" }),
  );
  assert.equal(
    await found.adapter.readPermalink("post-1", accessToken),
    "https://www.facebook.com/aramayo/posts/1",
  );

  const missing = recorder(() => json({ id: "post-1" }));
  assert.equal(
    await missing.adapter.readPermalink("post-1", accessToken),
    null,
  );

  const failing = recorder(() => json({ error: { code: 190 } }, 400));
  assert.equal(
    await failing.adapter.readPermalink("post-1", accessToken),
    null,
  );
});

test("límite de tasa, credencial, permiso y pieza inválida se distinguen", async () => {
  for (const [code, expected, retryable] of [
    [4, "rate-limit", true],
    [17, "rate-limit", true],
    [32, "rate-limit", true],
    [341, "rate-limit", true],
    [613, "rate-limit", true],
    [102, "token-expired", false],
    [190, "token-expired", false],
    [10, "permission-denied", false],
    [200, "permission-denied", false],
    [299, "permission-denied", false],
    [324, "media-invalid", false],
    [1, "provider-error", true],
    [2, "provider-error", true],
    [100, "staged-media-expired", true],
  ] as const) {
    const { adapter } = recorder(() => json({ error: { code } }, 400));
    const failure = await failureOf(() =>
      adapter.createPagePost(
        { copy: "texto", pageAssetId, stagedPhotoId: "photo-1" },
        accessToken,
      ),
    );
    assert.equal(failure.code, expected, String(code));
    assert.equal(failure.retryable, retryable, String(code));
  }
});

test("un 429 y un 5xx se reintentan; un 4xx desconocido no", async () => {
  const throttled = recorder(() => json({}, 429));
  assert.equal(
    (await failureOf(() => throttled.adapter.readStagedPhoto("p", accessToken)))
      .code,
    "rate-limit",
  );

  const serverError = recorder(() => json({ error: { code: 999_999 } }, 503));
  const transient = await failureOf(() =>
    serverError.adapter.readStagedPhoto("p", accessToken),
  );
  assert.equal(transient.code, "provider-error");
  assert.equal(transient.retryable, true);

  const clientError = recorder(() => json({ error: { code: 999_999 } }, 400));
  const permanent = await failureOf(() =>
    clientError.adapter.readStagedPhoto("p", accessToken),
  );
  assert.equal(permanent.code, "provider-error");
  assert.equal(permanent.retryable, false);
});

test("un timeout se distingue de un corte de red", async () => {
  const offline = new FacebookGraphPublishingAdapter("v26.0", () =>
    Promise.reject(new Error("ECONNRESET")),
  );
  assert.equal(
    (
      await failureOf(() =>
        offline.stagePhoto({ imageUrl, pageAssetId }, accessToken),
      )
    ).code,
    "provider-error",
  );

  const timeout = new FacebookGraphPublishingAdapter("v26.0", () => {
    const error = new Error("aborted");
    error.name = "TimeoutError";
    return Promise.reject(error);
  });
  const expired = await failureOf(() =>
    timeout.stagePhoto({ imageUrl, pageAssetId }, accessToken),
  );
  assert.equal(expired.code, "request-timeout");
  assert.equal(expired.retryable, true);
});

test("el fallo no arrastra la respuesta del proveedor", async () => {
  const { adapter } = recorder(() =>
    json(
      { error: { code: 324, message: `URL reflejada por Meta: ${imageUrl}` } },
      400,
    ),
  );
  const failure = await failureOf(() =>
    adapter.stagePhoto({ imageUrl, pageAssetId }, accessToken),
  );
  for (const text of [failure.message, failure.detail, failure.stack ?? ""]) {
    assert.ok(!text.includes(imageUrl));
    assert.ok(!text.includes(accessToken));
  }
});

test("una respuesta ilegible o desmedida no se toma por válida", async () => {
  const unreadable = new FacebookGraphPublishingAdapter("v26.0", () =>
    Promise.resolve(new Response("<html>502</html>", { status: 200 })),
  );
  assert.equal(
    (await failureOf(() => unreadable.readStagedPhoto("p", accessToken))).code,
    "provider-error",
  );

  const oversized = new FacebookGraphPublishingAdapter("v26.0", () =>
    Promise.resolve(json({ padding: "x".repeat(70 * 1024) })),
  );
  const failure = await failureOf(() =>
    oversized.readStagedPhoto("p", accessToken),
  );
  assert.equal(failure.code, "provider-error");
  assert.equal(failure.retryable, false);
});
