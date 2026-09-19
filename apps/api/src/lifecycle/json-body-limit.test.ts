import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultJsonBodyLimitBytes,
  jsonBodyLimitFor,
  limitJsonBodies,
  photoJsonBodyLimitBytes,
} from "./json-body-limit.ts";

test("sólo las rutas que llevan la foto propia aceptan cuerpos grandes", () => {
  assert.equal(
    jsonBodyLimitFor("POST", "/scheduling/recurring-stories"),
    photoJsonBodyLimitBytes,
  );
  assert.equal(
    jsonBodyLimitFor(
      "PATCH",
      "/scheduling/recurring-stories/0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11/visual-style",
    ),
    photoJsonBodyLimitBytes,
  );
  assert.equal(
    jsonBodyLimitFor(
      "PATCH",
      "/publications/0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11",
    ),
    photoJsonBodyLimitBytes,
  );
  // El login y el resto de las escrituras conservan el límite de Express.
  assert.equal(
    jsonBodyLimitFor("POST", "/auth/login"),
    defaultJsonBodyLimitBytes,
  );
  assert.equal(
    jsonBodyLimitFor(
      "POST",
      "/publications/0f5ee2d4-8a3b-4c0e-9d64-2b0c1d9a7e11/approve",
    ),
    defaultJsonBodyLimitBytes,
  );
  assert.equal(
    jsonBodyLimitFor("GET", "/scheduling/recurring-stories"),
    defaultJsonBodyLimitBytes,
  );
});

function run(
  method: string,
  path: string,
  contentLength: number,
): Readonly<{ nextCalled: boolean; status: number | undefined }> {
  interface FakeResponse {
    json(): FakeResponse;
    status(code: number): FakeResponse;
  }
  let status: number | undefined;
  let nextCalled = false;
  const response: FakeResponse = {
    json(): FakeResponse {
      return response;
    },
    status(code: number): FakeResponse {
      status = code;
      return response;
    },
  };
  limitJsonBodies(
    {
      headers: { "content-length": String(contentLength) },
      method,
      path,
    } as unknown as Parameters<typeof limitJsonBodies>[0],
    response as unknown as Parameters<typeof limitJsonBodies>[1],
    () => {
      nextCalled = true;
    },
  );
  return { nextCalled, status };
}

test("un cuerpo que declara más de lo permitido se rechaza sin leerlo", () => {
  assert.deepEqual(run("POST", "/auth/login", 200 * 1024), {
    nextCalled: false,
    status: 413,
  });
  assert.deepEqual(run("POST", "/scheduling/recurring-stories", 800 * 1024), {
    nextCalled: true,
    status: undefined,
  });
  assert.deepEqual(
    run("POST", "/scheduling/recurring-stories", photoJsonBodyLimitBytes + 1),
    { nextCalled: false, status: 413 },
  );
});
