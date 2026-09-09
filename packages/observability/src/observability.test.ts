import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptCorrelationId,
  attachCorrelationActor,
  currentCorrelation,
  currentCorrelationId,
  isCorrelationId,
  newCorrelationId,
  runWithCorrelation,
} from "./correlation.ts";
import { dependencyFailureCode, observeDependency } from "./dependency.ts";
import { redactDetail, redactedPlaceholder } from "./redaction.ts";
import { createLogEmitter } from "./structured-log.ts";

function collect(): {
  readonly lines: string[];
  readonly write: (line: string) => void;
} {
  const lines: string[] = [];
  return {
    lines,
    write: (line: string): void => {
      lines.push(line);
    },
  };
}

function parse(line: string | undefined): Readonly<Record<string, unknown>> {
  assert.ok(line);
  const parsed: unknown = JSON.parse(line);
  assert.ok(typeof parsed === "object" && parsed !== null);
  return parsed as Readonly<Record<string, unknown>>;
}

test("un identificador entrante se acepta sólo con su forma exacta", () => {
  const emitted = newCorrelationId();
  assert.ok(isCorrelationId(emitted));
  assert.equal(acceptCorrelationId(emitted), emitted);

  for (const rejected of [
    "no-es-una-correlación",
    `${emitted}0`,
    emitted.toUpperCase(),
    "../../etc/passwd",
    '{"inyección":true}',
    42,
    null,
    undefined,
  ]) {
    const accepted = acceptCorrelationId(rejected);
    assert.notEqual(accepted, rejected);
    assert.ok(isCorrelationId(accepted));
  }
});

test("el contexto acompaña el trabajo asíncrono y se completa al autenticar", async () => {
  const correlationId = newCorrelationId();
  assert.equal(currentCorrelationId(), undefined);

  await runWithCorrelation({ correlationId }, async () => {
    assert.equal(currentCorrelationId(), correlationId);
    await Promise.resolve();
    attachCorrelationActor({
      actorMembershipId: "membership-1",
      organizationId: "organization-1",
    });
    await Promise.resolve();
    assert.deepEqual(currentCorrelation(), {
      actorMembershipId: "membership-1",
      correlationId,
      organizationId: "organization-1",
    });
  });

  assert.equal(currentCorrelationId(), undefined);
  // Sin contexto activo no se inventa uno.
  attachCorrelationActor({ organizationId: "organization-1" });
  assert.equal(currentCorrelation(), undefined);
});

test("la redacción tapa secretos por nombre de campo y por forma del valor", () => {
  assert.deepEqual(
    redactDetail({
      accessToken: "EAAG" + "x".repeat(40),
      attempts: 2,
      cancelled: false,
      databaseUrl: "postgresql://aramayo:clave-real@127.0.0.1:5432/contenido",
      failureCode: "rate-limited",
      header: "Bearer abcdefghijklmnop",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma",
      nested: { adentro: "invisible" },
      openAiKey: "sk-" + "y".repeat(40),
      ratio: Number.NaN,
      route: "/publications/:publicationId/approve",
      target: null,
    }),
    {
      accessToken: redactedPlaceholder,
      attempts: 2,
      cancelled: false,
      databaseUrl: redactedPlaceholder,
      failureCode: "rate-limited",
      header: redactedPlaceholder,
      jwt: redactedPlaceholder,
      openAiKey: redactedPlaceholder,
      ratio: null,
      route: "/publications/:publicationId/approve",
      target: null,
    },
  );
});

test("un valor con forma de secreto se tapa aunque el campo parezca inocente", () => {
  assert.deepEqual(
    redactDetail({
      mensaje: `El proveedor devolvió sk-${"z".repeat(40)} en el cuerpo.`,
    }),
    { mensaje: redactedPlaceholder },
  );
});

test("un texto largo se recorta en vez de crecer sin límite", () => {
  const detail = redactDetail({ detalle: "a".repeat(500) });
  const value = detail["detalle"];
  assert.equal(typeof value, "string");
  assert.equal((value as string).length, 201);
});

test("cada línea es un objeto JSON con proceso, evento y correlación", () => {
  const sink = collect();
  const emitter = createLogEmitter(
    "api",
    sink.write,
    () => new Date("2026-09-09T12:00:00.000Z"),
  );
  const correlationId = newCorrelationId();

  runWithCorrelation(
    { correlationId, organizationId: "organization-1" },
    () => {
      emitter.emit({
        detail: { route: "/publications", status: 201 },
        durationMs: 12.6,
        event: "api.request",
        outcome: "success",
      });
    },
  );
  emitter.emit({ event: "api.stopped", level: "warn" });

  assert.deepEqual(parse(sink.lines[0]), {
    correlationId,
    detail: { route: "/publications", status: 201 },
    durationMs: 13,
    event: "api.request",
    level: "info",
    organizationId: "organization-1",
    outcome: "success",
    process: "api",
    ts: "2026-09-09T12:00:00.000Z",
  });
  const withoutCorrelation = parse(sink.lines[1]);
  assert.equal(withoutCorrelation["correlationId"], undefined);
  assert.equal(withoutCorrelation["level"], "warn");
});

test("un salto de línea en el detalle no puede partir el registro", () => {
  const sink = collect();
  const emitter = createLogEmitter("worker", sink.write);

  emitter.emit({
    detail: { mensaje: 'primera\n{"event":"falsificado"}' },
    event: "worker.job",
  });

  assert.equal(sink.lines.length, 1);
  const record = parse(sink.lines[0]);
  assert.equal(record["event"], "worker.job");
});

test("una llamada a un proveedor deja latencia y desenlace dentro de su correlación", async () => {
  const sink = collect();
  const emitter = createLogEmitter("worker", sink.write);
  let clock = 0;
  const now = (): number => {
    clock += 40;
    return clock;
  };
  const correlationId = newCorrelationId();

  await runWithCorrelation({ correlationId }, async () => {
    assert.equal(
      await observeDependency(
        emitter,
        { dependency: "openai", operation: "responses.create" },
        () => Promise.resolve("listo"),
        now,
      ),
      "listo",
    );
    const rejection = Object.assign(new Error("La clave sk-secreta falló."), {
      code: "rate_limit_exceeded",
    });
    await assert.rejects(
      observeDependency(
        emitter,
        { dependency: "meta", operation: "graph.publish" },
        () => Promise.reject(rejection),
        now,
      ),
      /sk-secreta/u,
    );
  });

  assert.deepEqual(parse(sink.lines[0])["detail"], {
    dependency: "openai",
    operation: "responses.create",
  });
  assert.equal(parse(sink.lines[0])["correlationId"], correlationId);
  assert.equal(parse(sink.lines[0])["durationMs"], 40);
  const failure = parse(sink.lines[1]);
  assert.equal(failure["outcome"], "failure");
  assert.equal(failure["level"], "warn");
  assert.deepEqual(failure["detail"], {
    dependency: "meta",
    failureCode: "rate_limit_exceeded",
    operation: "graph.publish",
  });
  // El mensaje del proveedor no viaja al log aunque lo lleve la excepción.
  assert.ok(!(sink.lines[1] ?? "").includes("sk-secreta"));
});

test("un fallo sin código usa el nombre del error y nunca su mensaje", () => {
  assert.equal(
    dependencyFailureCode(new TypeError("host secreto")),
    "TypeError",
  );
  assert.equal(dependencyFailureCode("cualquier cosa"), "desconocido");
  assert.equal(
    dependencyFailureCode(
      Object.assign(new Error("x"), { code: "mensaje largo con espacios" }),
    ),
    "Error",
  );
});
