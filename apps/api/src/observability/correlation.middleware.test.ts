import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  createLogEmitter,
  currentCorrelationId,
  isCorrelationId,
  newCorrelationId,
} from "@aramayo/observability";
import type { NextFunction, Request, Response } from "express";

import {
  correlationHeader,
  createCorrelationMiddleware,
} from "./correlation.middleware.ts";

interface FakeResponse extends EventEmitter {
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
  statusCode: number;
}

function fakeResponse(statusCode: number): FakeResponse {
  const response = new EventEmitter() as FakeResponse;
  response.headers = {};
  response.statusCode = statusCode;
  response.setHeader = (name: string, value: string): void => {
    response.headers[name] = value;
  };
  return response;
}

function fakeRequest(
  headers: Readonly<Record<string, string>>,
  route?: string,
): Request {
  return {
    baseUrl: "",
    headers,
    method: "POST",
    ...(route === undefined ? {} : { route: { path: route } }),
  } as unknown as Request;
}

function run(
  request: Request,
  response: FakeResponse,
  lines: string[],
  observed: { correlationId?: string | undefined },
): void {
  const middleware = createCorrelationMiddleware(
    createLogEmitter("api", (line) => {
      lines.push(line);
    }),
    (() => {
      let clock = 1_000;
      return (): number => {
        clock += 25;
        return clock;
      };
    })(),
  );
  const next: NextFunction = () => {
    observed.correlationId = currentCorrelationId();
  };
  middleware(request, response as unknown as Response, next);
  response.emit("finish");
}

test("una correlación entrante válida se conserva y viaja en la respuesta", () => {
  const incoming = newCorrelationId();
  const response = fakeResponse(201);
  const lines: string[] = [];
  const observed: { correlationId?: string | undefined } = {};

  run(
    fakeRequest({ [correlationHeader]: incoming }, "/publications"),
    response,
    lines,
    observed,
  );

  assert.equal(observed.correlationId, incoming);
  assert.equal(response.headers[correlationHeader], incoming);
  assert.deepEqual(JSON.parse(lines[0] ?? "null"), {
    correlationId: incoming,
    detail: { method: "POST", route: "/publications", status: 201 },
    durationMs: 25,
    event: "api.request",
    level: "info",
    outcome: "success",
    process: "api",
    ts: (JSON.parse(lines[0] ?? "null") as { ts: string }).ts,
  });
});

test("una correlación entrante inventada se descarta en vez de propagarse", () => {
  const response = fakeResponse(200);
  const lines: string[] = [];
  const observed: { correlationId?: string | undefined } = {};

  run(
    fakeRequest(
      { [correlationHeader]: '{"inyección":"<script>"}' },
      "/publications",
    ),
    response,
    lines,
    observed,
  );

  assert.ok(observed.correlationId);
  assert.ok(isCorrelationId(observed.correlationId));
  assert.equal(response.headers[correlationHeader], observed.correlationId);
});

test("un rechazo previo al controlador también queda observado", () => {
  const response = fakeResponse(403);
  const lines: string[] = [];

  run(fakeRequest({}), response, lines, {});

  const record = JSON.parse(lines[0] ?? "null") as Readonly<{
    detail: Readonly<{ route: string; status: number }>;
    level: string;
    outcome: string;
  }>;
  assert.equal(record.outcome, "failure");
  assert.equal(record.level, "info");
  assert.equal(record.detail.status, 403);
  // Sin ruta resuelta no se inventa una: la URL concreta no se registra.
  assert.equal(record.detail.route, "desconocida");
});

test("un fallo del servidor se registra con nivel de error", () => {
  const response = fakeResponse(500);
  const lines: string[] = [];

  run(fakeRequest({}, "/publications"), response, lines, {});

  const record = JSON.parse(lines[0] ?? "null") as Readonly<{ level: string }>;
  assert.equal(record.level, "error");
});
