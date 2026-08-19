import assert from "node:assert/strict";
import test from "node:test";

import { InstagramPublishingError } from "@aramayo/domain";

import {
  HttpPublicMediaProbe,
  InstagramGraphAdapter,
} from "./instagram-graph.adapter.ts";

const assetId = "17841400000000000";
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
  adapter: InstagramGraphAdapter;
  calls: readonly RecordedCall[];
}> {
  const calls: RecordedCall[] = [];
  const adapter = new InstagramGraphAdapter("v26.0", (input, init) => {
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

function graphError(
  code: number,
  subcode: number | undefined,
  status = 400,
): Response {
  return json(
    {
      error: {
        code,
        ...(subcode === undefined ? {} : { error_subcode: subcode }),
        message: `URL reflejada por Meta: ${imageUrl}`,
        type: "OAuthException",
      },
    },
    status,
  );
}

async function failureOf(
  operation: () => Promise<unknown>,
): Promise<InstagramPublishingError> {
  try {
    await operation();
  } catch (cause: unknown) {
    assert.ok(cause instanceof InstagramPublishingError);
    return cause;
  }
  throw new Error("La operación tenía que fallar.");
}

test("la versión de Graph es obligatoria y explícita", () => {
  assert.throws(() => new InstagramGraphAdapter("26.0"), RangeError);
  assert.throws(() => new InstagramGraphAdapter(""), RangeError);
});

test("el contenedor de feed no declara media_type y viaja por POST versionado", async () => {
  const { adapter, calls } = recorder(() => json({ id: "17999" }));
  const container = await adapter.createContainer(
    {
      caption: "Filtros Wega en stock.",
      imageUrl,
      instagramAssetId: assetId,
      target: "instagram_feed",
    },
    accessToken,
  );

  assert.equal(container.containerId, "17999");
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.method, "POST");
  assert.equal(call.url.origin, "https://graph.facebook.com");
  assert.equal(call.url.pathname, `/v26.0/${assetId}/media`);
  const body = new URLSearchParams(call.body);
  assert.equal(body.get("image_url"), imageUrl);
  assert.equal(body.get("caption"), "Filtros Wega en stock.");
  assert.equal(body.get("media_type"), null);
});

test("el contenedor de historia declara STORIES", async () => {
  const { adapter, calls } = recorder(() => json({ id: "18000" }));
  await adapter.createContainer(
    { imageUrl, instagramAssetId: assetId, target: "instagram_story" },
    accessToken,
  );
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(new URLSearchParams(call.body).get("media_type"), "STORIES");
});

test("el token viaja en el encabezado y nunca en la URL", async () => {
  const { adapter, calls } = recorder((call) =>
    call.method === "POST"
      ? json({ id: "17999" })
      : json({ status_code: "FINISHED" }),
  );
  await adapter.createContainer(
    { imageUrl, instagramAssetId: assetId, target: "instagram_feed" },
    accessToken,
  );
  await adapter.readContainer("17999", accessToken);
  await adapter.publishContainer(
    { containerId: "17999", instagramAssetId: assetId },
    accessToken,
  );

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.authorization, `Bearer ${accessToken}`);
    assert.ok(!call.url.toString().includes(accessToken));
    assert.ok(!call.body.includes(accessToken));
  }
});

test("publicar usa media_publish con el contenedor como creation_id", async () => {
  const { adapter, calls } = recorder(() => json({ id: "17841999999" }));
  const published = await adapter.publishContainer(
    { containerId: "17999", instagramAssetId: assetId },
    accessToken,
  );
  assert.equal(published.mediaId, "17841999999");
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.url.pathname, `/v26.0/${assetId}/media_publish`);
  assert.equal(new URLSearchParams(call.body).get("creation_id"), "17999");
});

test("cada status_code se normaliza y uno desconocido no se interpreta", async () => {
  for (const [statusCode, expected] of [
    ["ERROR", "error"],
    ["EXPIRED", "expired"],
    ["FINISHED", "finished"],
    ["IN_PROGRESS", "in_progress"],
    ["PUBLISHED", "published"],
  ] as const) {
    const { adapter } = recorder(() => json({ status_code: statusCode }));
    const report = await adapter.readContainer("17999", accessToken);
    assert.equal(report.state, expected);
  }

  const { adapter } = recorder(() => json({ status_code: "SOMETHING_NEW" }));
  const failure = await failureOf(() =>
    adapter.readContainer("17999", accessToken),
  );
  assert.equal(failure.code, "provider-error");
  assert.equal(failure.retryable, false);
});

test("la cuota se lee de Meta y no se fija en el código", async () => {
  const { adapter, calls } = recorder(() =>
    json({
      data: [
        { config: { quota_duration: 86_400, quota_total: 50 }, quota_usage: 7 },
      ],
    }),
  );
  const quota = await adapter.readPublishingQuota(assetId, accessToken);
  assert.deepEqual(quota, {
    quotaDurationSeconds: 86_400,
    quotaTotal: 50,
    quotaUsage: 7,
  });
  const [call] = calls;
  assert.ok(call !== undefined);
  assert.equal(call.url.pathname, `/v26.0/${assetId}/content_publishing_limit`);
});

test("una cuota ausente no se asume disponible", async () => {
  const { adapter } = recorder(() => json({ data: [] }));
  const failure = await failureOf(() =>
    adapter.readPublishingQuota(assetId, accessToken),
  );
  assert.equal(failure.code, "provider-error");
  assert.equal(failure.retryable, true);
});

test("los subcódigos de publicación se distinguen entre sí", async () => {
  for (const [subcode, code, retryable] of [
    [2_207_003, "media-unreachable", true],
    [2_207_004, "media-invalid", false],
    [2_207_005, "media-invalid", false],
    [2_207_006, "permission-denied", false],
    [2_207_008, "container-expired", true],
    [2_207_009, "media-invalid", false],
    [2_207_020, "container-expired", true],
    [2_207_042, "publishing-limit-reached", false],
    [2_207_052, "media-unreachable", true],
  ] as const) {
    const { adapter } = recorder(() => graphError(9004, subcode));
    const failure = await failureOf(() =>
      adapter.createContainer(
        { imageUrl, instagramAssetId: assetId, target: "instagram_feed" },
        accessToken,
      ),
    );
    assert.equal(failure.code, code, String(subcode));
    assert.equal(failure.retryable, retryable, String(subcode));
  }
});

test("límite de tasa, credencial y permiso se distinguen por código superior", async () => {
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
  ] as const) {
    const { adapter } = recorder(() => graphError(code, undefined));
    const failure = await failureOf(() =>
      adapter.publishContainer(
        { containerId: "17999", instagramAssetId: assetId },
        accessToken,
      ),
    );
    assert.equal(failure.code, expected, String(code));
    assert.equal(failure.retryable, retryable, String(code));
  }
});

test("un 429 sin código reconocible sigue siendo límite de tasa", async () => {
  const { adapter } = recorder(() =>
    json({ error: { message: "slow down" } }, 429),
  );
  const failure = await failureOf(() =>
    adapter.readContainer("17999", accessToken),
  );
  assert.equal(failure.code, "rate-limit");
  assert.equal(failure.retryable, true);
});

test("un 5xx se reintenta y un 4xx desconocido no", async () => {
  const serverError = recorder(() => json({ error: { code: 999_999 } }, 503));
  const transient = await failureOf(() =>
    serverError.adapter.readContainer("17999", accessToken),
  );
  assert.equal(transient.code, "provider-error");
  assert.equal(transient.retryable, true);

  const clientError = recorder(() => json({ error: { code: 999_999 } }, 400));
  const permanent = await failureOf(() =>
    clientError.adapter.readContainer("17999", accessToken),
  );
  assert.equal(permanent.code, "provider-error");
  assert.equal(permanent.retryable, false);
});

test("el fallo no arrastra la respuesta del proveedor", async () => {
  const { adapter } = recorder(() => graphError(9004, 2_207_052));
  const failure = await failureOf(() =>
    adapter.createContainer(
      { imageUrl, instagramAssetId: assetId, target: "instagram_feed" },
      accessToken,
    ),
  );
  for (const text of [failure.message, failure.detail, failure.stack ?? ""]) {
    assert.ok(!text.includes(imageUrl));
    assert.ok(!text.includes(accessToken));
  }
});

test("un corte de red y un timeout se distinguen", async () => {
  const offline = new InstagramGraphAdapter("v26.0", () =>
    Promise.reject(new Error("ECONNRESET")),
  );
  const network = await failureOf(() =>
    offline.readContainer("17999", accessToken),
  );
  assert.equal(network.code, "provider-error");
  assert.equal(network.retryable, true);

  const timeout = new InstagramGraphAdapter("v26.0", () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "TimeoutError";
    return Promise.reject(error);
  });
  const expired = await failureOf(() =>
    timeout.readContainer("17999", accessToken),
  );
  assert.equal(expired.code, "request-timeout");
  assert.equal(expired.retryable, true);
});

test("una respuesta ilegible o desmedida no se toma por válida", async () => {
  const unreadable = new InstagramGraphAdapter("v26.0", () =>
    Promise.resolve(new Response("<html>502</html>", { status: 200 })),
  );
  assert.equal(
    (await failureOf(() => unreadable.readContainer("17999", accessToken)))
      .code,
    "provider-error",
  );

  const oversized = new InstagramGraphAdapter("v26.0", () =>
    Promise.resolve(json({ padding: "x".repeat(70 * 1024) })),
  );
  const failure = await failureOf(() =>
    oversized.readContainer("17999", accessToken),
  );
  assert.equal(failure.code, "provider-error");
  assert.equal(failure.retryable, false);
});

test("la sonda informa tipo y peso reales de la entrega", async () => {
  const probe = new HttpPublicMediaProbe((_input, init) => {
    assert.equal(init?.method, "HEAD");
    return Promise.resolve(
      new Response(null, {
        headers: {
          "content-length": "742183",
          "content-type": "image/jpeg; charset=binary",
        },
        status: 200,
      }),
    );
  });
  assert.deepEqual(await probe.probe(imageUrl), {
    byteSize: 742_183,
    mimeType: "image/jpeg",
    status: "reachable",
  });
});

test("si el servidor no admite HEAD la sonda cae a un GET de un byte", async () => {
  const methods: string[] = [];
  const probe = new HttpPublicMediaProbe((_input, init) => {
    methods.push(init?.method ?? "GET");
    if (init?.method === "HEAD") {
      return Promise.resolve(new Response(null, { status: 405 }));
    }
    assert.equal(new Headers(init?.headers).get("range"), "bytes=0-0");
    return Promise.resolve(
      new Response("x", {
        headers: {
          "content-range": "bytes 0-0/742183",
          "content-type": "image/jpeg",
        },
        status: 206,
      }),
    );
  });
  assert.deepEqual(await probe.probe(imageUrl), {
    byteSize: 742_183,
    mimeType: "image/jpeg",
    status: "reachable",
  });
  assert.deepEqual(methods, ["HEAD", "GET"]);
});

test("una URL inaccesible se informa como tal en vez de suponer la pieza", async () => {
  const notFound = new HttpPublicMediaProbe(() =>
    Promise.resolve(new Response(null, { status: 404 })),
  );
  assert.deepEqual(await notFound.probe(imageUrl), { status: "unreachable" });

  const offline = new HttpPublicMediaProbe(() =>
    Promise.reject(new Error("ENOTFOUND")),
  );
  assert.deepEqual(await offline.probe(imageUrl), { status: "unreachable" });

  const withoutHeaders = new HttpPublicMediaProbe(() =>
    Promise.resolve(new Response(null, { status: 200 })),
  );
  assert.deepEqual(await withoutHeaders.probe(imageUrl), {
    status: "unreachable",
  });
});
