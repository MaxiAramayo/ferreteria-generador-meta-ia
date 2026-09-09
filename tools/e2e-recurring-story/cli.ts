/**
 * E2E de la cadena regla → borrador → aprobación → ocurrencia → excepción
 * (`P6-T04` y `P6-T08`).
 *
 * Levanta la vertical entera —base efímera migrada, API y panel— y recorre con
 * un navegador real el camino que convierte una rutina editorial en una
 * ocurrencia programada. Existe porque cada eslabón vive en una capa distinta
 * y ninguna prueba de una sola capa demuestra que estén conectados: el panel
 * crea la regla, el worker la materializa, la API aprueba y recién ahí nace la
 * ocurrencia.
 *
 * Lo que comprueba:
 *
 * - **activar una regla no publica nada**: al guardar existe la regla y no
 *   existen publicación, programación ni ocurrencia;
 * - **la vista previa respeta el formato**: relación de aspecto y zonas seguras
 *   medidas en el navegador contra `FORMATS.historia`, que es su única
 *   definición;
 * - **el borrador cita su fuente**: la materialización guarda dirección,
 *   horario y versión de la sucursal vigentes al crearlo;
 * - **aprobar programa**: la aprobación por HTTP responde `scheduled` y deja
 *   una programación con una única ocurrencia planificada;
 * - **programar no es publicar**: la ocurrencia queda sin orden de publicación;
 * - **una excepción de horario manda sobre lo programado** (`P6-T08`): el panel
 *   no habilita guardar hasta calcular el impacto, y guardar el feriado cancela
 *   la ocurrencia y devuelve la historia a revisión.
 *
 * No contacta Meta ni Cloudinary: el almacenamiento de medios es un doble local
 * y el render usa el mismo Chromium del worker.
 *
 * ```bash
 * pnpm e2e:recurring-story
 * ```
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { chromium, type Browser, type Page } from "playwright-core";

import { ARAMAYO_BRAND_PROFILE } from "@aramayo/brand-knowledge";
import {
  createDatabaseClient,
  PrismaMediaAssetRepository,
  PrismaOutboxRepository,
  PrismaPublicationProductionRepository,
  PrismaRecurringStoryRepository,
} from "@aramayo/database";
import type { MediaAssetRecord } from "@aramayo/domain";
import { FORMATS } from "@aramayo/design-engine";

import type { UploadMediaCommand } from "../../apps/worker/src/media/media-lifecycle.service.ts";
import { OutboxDispatcherService } from "../../apps/worker/src/outbox/outbox-dispatcher.service.ts";
import { createPlaywrightRenderer } from "../../apps/worker/src/rendering/playwright-renderer.ts";
import { PublicationRenderOutboxTransport } from "../../apps/worker/src/rendering/publication-render.service.ts";
import { renderContextFor } from "../../apps/worker/src/rendering/render-document.ts";
import { RecurringStoryMaterializationService } from "../../apps/worker/src/scheduling/recurring-story-materialization.service.ts";
import { apiEnvironment, webEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";
import {
  recurringStoryPassword,
  seedRecurringStoryFixture,
} from "./fixture.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const webDirectory = `${repositoryDirectory}apps/web`;
const nextBinary = "./node_modules/next/dist/bin/next";
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const buildTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;
const locationTimeZone = "America/Argentina/Cordoba";
// Una semana de anticipación deja exactamente una ocurrencia del único día
// elegido dentro de la ventana, así que las cuentas son verificables.
const leadTimeMinutes = 10_080;
const weekdayLabels = Object.freeze([
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
]);

function reportCheck(detail: string): void {
  process.stdout.write(`  ok ${detail}\n`);
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

/** Fecha civil de mañana en la zona de la sucursal, como la ve el panel. */
function tomorrowInLocationZone(): Readonly<{
  localDate: string;
  weekdayLabel: string;
}> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: locationTimeZone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(new Date(Date.now() + 86_400_000));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdayIndex = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ].indexOf(value("weekday"));
  assert.ok(weekdayIndex >= 0, "No se pudo resolver el día de mañana.");
  const label = weekdayLabels[weekdayIndex];
  assert.ok(label);
  return Object.freeze({
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
    weekdayLabel: label,
  });
}

/**
 * Ejecuta una mutación desde la propia pestaña.
 *
 * Se hace dentro del navegador y no con `fetch` del proceso para que la cookie,
 * el `Origin` y el token CSRF sean los que el panel realmente envía.
 */
async function mutateFromPage(
  page: Page,
  apiBaseUrl: string,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Readonly<{ body: unknown; status: number }>> {
  const result = await page.evaluate(
    `(async () => {
      const base = ${JSON.stringify(apiBaseUrl)};
      const csrfResponse = await fetch(base + "auth/csrf", {
        credentials: "include",
      });
      const csrf = await csrfResponse.json();
      const response = await fetch(base + ${JSON.stringify(path)}, {
        body: JSON.stringify(${JSON.stringify(body)}),
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "idempotency-key": ${JSON.stringify(randomUUID())},
          "x-csrf-token": csrf.csrfToken,
        },
        method: "POST",
      });
      return { body: await response.json(), status: response.status };
    })()`,
  );
  assert.ok(
    typeof result === "object" && result !== null,
    "La mutación no devolvió una respuesta legible.",
  );
  const status = (result as { status?: unknown }).status;
  assert.equal(typeof status, "number", "La respuesta no trae estado.");
  return Object.freeze({
    body: (result as { body?: unknown }).body,
    status: status as number,
  });
}

function fieldFrom(body: unknown, field: string): string {
  assert.ok(typeof body === "object" && body !== null, "Respuesta vacía.");
  const value = (body as Record<string, unknown>)[field];
  assert.equal(typeof value, "string", `La respuesta no trae ${field}.`);
  return value as string;
}

async function main(): Promise<void> {
  const baseUrl = process.env["DATABASE_URL"];
  assert.ok(baseUrl, "DATABASE_URL es obligatorio para este E2E.");
  const redisUrl = process.env["REDIS_URL"];
  assert.ok(redisUrl, "REDIS_URL es obligatorio para este E2E.");

  const databaseName = `aramayo_recurring_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = databaseUrlFor(baseUrl, databaseName);
  const adminPool = new Pool({ connectionString: baseUrl, max: 1 });
  let created = false;
  let api: RunningProcess | undefined;
  let web: RunningProcess | undefined;
  let browser: Browser | undefined;

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const migrate = await runProcess(
      {
        arguments: [prismaBinary, "migrate", "deploy"],
        environment: { ...process.env, DATABASE_URL: databaseUrl },
        workingDirectory: repositoryDirectory,
      },
      buildTimeoutMs,
    );
    assert.equal(migrate.exitCode, 0, `La migración falló:\n${migrate.output}`);
    const fixture = await seedRecurringStoryFixture(databaseUrl);
    process.stdout.write("Base efímera migrada y sembrada.\n");

    const apiPort = await reserveEphemeralPort();
    const webPort = await reserveEphemeralPort();
    const apiBaseUrl = `http://127.0.0.1:${String(apiPort)}/`;
    const webBaseUrl = `http://127.0.0.1:${String(webPort)}`;
    const apiEnv = {
      ...apiEnvironment(apiPort),
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      WEB_ORIGIN: webBaseUrl,
    };
    api = startProcess({
      arguments: ["dist/main.js"],
      environment: apiEnv,
      workingDirectory: apiDirectory,
    });
    try {
      await waitForHttp(`${apiBaseUrl}health`, startupTimeoutMs);
    } catch (cause) {
      throw new Error(
        `La API no arrancó:\n${api.output()}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    process.stdout.write("API en pie.\n");

    const webEnv = {
      ...webEnvironment(webPort, apiBaseUrl),
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
    };
    const build = await runProcess(
      {
        arguments: [nextBinary, "build"],
        environment: webEnv,
        workingDirectory: webDirectory,
      },
      buildTimeoutMs,
    );
    assert.equal(build.exitCode, 0, `El panel no compiló:\n${build.output}`);
    web = startProcess({
      arguments: [nextBinary, "start"],
      environment: webEnv,
      workingDirectory: webDirectory,
    });
    await waitForHttp(`${webBaseUrl}/`, startupTimeoutMs);
    process.stdout.write("Panel en pie.\n");

    const login = await fetch(new URL("auth/login", apiBaseUrl), {
      body: JSON.stringify({
        email: fixture.email,
        password: recurringStoryPassword,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(login.status, 201, "El login no creó sesión.");
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie, "El login no devolvió cookie de sesión.");
    const [pair] = setCookie.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    assert.ok(
      pair !== undefined && separator > 0,
      "Cookie de sesión inválida.",
    );

    browser = await chromium.launch({ channel: "chrome", headless: true });
    // El panel calcula «mañana» con la fecha del navegador: fijar la zona de la
    // sucursal evita que la prueba dependa de dónde corra.
    const context = await browser.newContext({
      timezoneId: locationTimeZone,
      viewport: { height: 1200, width: 1280 },
    });
    await context.addCookies([
      {
        domain: "127.0.0.1",
        httpOnly: true,
        name: pair.slice(0, separator),
        path: "/",
        value: pair.slice(separator + 1),
      },
    ]);
    const page = await context.newPage();
    // Una respuesta rechazada de la API explica un fallo de panel mucho mejor
    // que un timeout de localizador, así que se conservan para el mensaje.
    const rejectedResponses: string[] = [];
    page.on("response", (response) => {
      if (response.url().startsWith(apiBaseUrl) && response.status() >= 400) {
        rejectedResponses.push(
          `${String(response.status())} ${response.request().method()} ${response.url()}`,
        );
      }
    });
    await page.goto(`${webBaseUrl}/publicaciones`, { waitUntil: "load" });
    await page
      .getByRole("button", { name: "Historia recurrente" })
      .click({ timeout: startupTimeoutMs });
    await page
      .getByRole("button", { name: "Activar regla" })
      .waitFor({ timeout: startupTimeoutMs });

    // --- La vista previa respeta el formato y sus zonas seguras ---
    const format = FORMATS.historia;
    const preview = page.getByRole("complementary");
    const previewBox = await preview.boundingBox();
    const topGuide = await page.getByText("Zona segura superior").boundingBox();
    const bottomGuide = await page
      .getByText("Zona segura inferior")
      .boundingBox();
    assert.ok(previewBox && topGuide && bottomGuide, "Falta la vista previa.");
    const measurements = [
      {
        expected: format.width / format.height,
        measured: previewBox.width / previewBox.height,
        name: "relación de aspecto",
      },
      {
        expected: format.safeArea.top / format.height,
        measured: topGuide.height / previewBox.height,
        name: "zona segura superior",
      },
      {
        expected: format.safeArea.bottom / format.height,
        measured: bottomGuide.height / previewBox.height,
        name: "zona segura inferior",
      },
    ];
    for (const measurement of measurements) {
      assert.ok(
        Math.abs(measurement.measured - measurement.expected) < 0.01,
        `La vista previa no respeta la ${measurement.name}: esperaba ${measurement.expected.toFixed(4)} y midió ${measurement.measured.toFixed(4)}.`,
      );
    }
    await preview
      .getByText(fixture.openingHours, { exact: false })
      .waitFor({ timeout: 10_000 });
    reportCheck(
      "la vista previa usa el formato historia, sus zonas seguras y el horario vigente",
    );

    // --- Crear la regla desde el panel ---
    const tomorrow = tomorrowInLocationZone();
    for (const label of weekdayLabels) {
      const button = page.getByRole("button", { name: label, exact: true });
      const pressed = await button.getAttribute("aria-pressed");
      if ((pressed === "true") !== (label === tomorrow.weekdayLabel)) {
        await button.click();
      }
    }
    await page.getByLabel("Anticipación").selectOption(String(leadTimeMinutes));
    await page.getByLabel("Vigente desde").fill(tomorrow.localDate);
    await page.getByLabel("Nombre de la regla").fill("Ya abrimos E2E");
    await page.getByRole("button", { name: "Activar regla" }).click();
    await page
      .getByText("Regla “Ya abrimos E2E” activa", { exact: false })
      .waitFor({ timeout: 30_000 });
    reportCheck("el panel activa la regla y explica que todavía no hay pieza");

    const database = createDatabaseClient(databaseUrl);
    try {
      const rule = await database.recurringStoryRule.findFirstOrThrow({
        where: { organizationId: fixture.organizationId },
      });
      assert.equal(rule.status, "active");
      assert.equal(rule.leadTimeMinutes, leadTimeMinutes);
      assert.equal(rule.timeZone, locationTimeZone);
      assert.equal(rule.approvalPolicy, "human_each_cycle");
      assert.equal(
        await database.publication.count({
          where: { organizationId: fixture.organizationId },
        }),
        0,
        "Activar una regla no puede crear una publicación.",
      );
      assert.equal(
        await database.publicationScheduleOccurrence.count({
          where: { organizationId: fixture.organizationId },
        }),
        0,
        "Activar una regla no puede crear una ocurrencia.",
      );
      reportCheck("activar la regla no crea publicación ni ocurrencia");

      // --- El worker materializa el borrador ---
      const recurring = new PrismaRecurringStoryRepository(database);
      const materialization = new RecurringStoryMaterializationService(
        recurring,
      );
      assert.deepEqual(await materialization.materialize(new Date(), 50), {
        blocked: 0,
        created: 1,
        reviewed: 1,
      });
      const draft =
        await database.recurringStoryMaterialization.findFirstOrThrow({
          where: { organizationId: fixture.organizationId },
        });
      assert.equal(draft.status, "draft_created");
      assert.equal(draft.requiresHumanApproval, true);
      assert.equal(draft.locationVersion, 1);
      const publicationId = draft.publicationId;
      assert.ok(publicationId, "El borrador debe existir como publicación.");
      const snapshot = JSON.stringify(draft.sourceSnapshot);
      assert.match(snapshot, /Avenida Belgrano 100/u);
      assert.ok(
        snapshot.includes(fixture.openingHours),
        `El snapshot no citó el horario vigente: ${snapshot}`,
      );
      assert.equal(
        await database.publicationRevision.count({
          where: { organizationId: fixture.organizationId, publicationId },
        }),
        1,
        "El borrador debe nacer versionado.",
      );
      reportCheck(
        "el worker materializa un borrador versionado que cita dirección, horario y versión de sucursal",
      );

      // --- Render de la pieza, sin proveedores externos ---
      const renderResponse = await mutateFromPage(
        page,
        apiBaseUrl,
        `publications/${publicationId}/render`,
        { expectedVersion: 1 },
      );
      assert.equal(renderResponse.status, 201, "El render no fue aceptado.");
      const revisionId = fieldFrom(renderResponse.body, "revisionId");
      const production = new PrismaPublicationProductionRepository(database);
      const mediaRepository = new PrismaMediaAssetRepository(database);
      const renderer = createPlaywrightRenderer({
        concurrency: 1,
        context: renderContextFor(ARAMAYO_BRAND_PROFILE),
      });
      const media = {
        async upload(command: UploadMediaCommand): Promise<MediaAssetRecord> {
          const checksumSha256 = createHash("sha256")
            .update(command.bytes)
            .digest("hex");
          const reservation = await mediaRepository.reserveUpload({
            id: command.mediaAssetId,
            organizationId: command.organizationId,
            origin: command.origin,
            originalFileName: command.originalFileName,
            ownerMembershipId: command.ownerMembershipId,
            storageProvider: "cloudinary",
          });
          assert.notEqual(reservation.status, "not-found");
          const completed = await mediaRepository.completeUpload({
            byteSize: String(command.bytes.byteLength),
            checksumSha256,
            height: format.height,
            mediaAssetId: command.mediaAssetId,
            mimeType: "image/png",
            organizationId: command.organizationId,
            secureUrl: `https://media.example.invalid/${command.mediaAssetId}.png`,
            storageKey: `render/${command.mediaAssetId}`,
            storageVersion: 1,
            width: format.width,
          });
          assert.equal(completed.status, "updated");
          return completed.asset;
        },
      };
      const dispatcher = new OutboxDispatcherService(
        new PrismaOutboxRepository(database),
        new PublicationRenderOutboxTransport(production, renderer, media),
        `e2e-${randomUUID()}`,
      );
      try {
        let rendered = false;
        for (let round = 0; round < 5 && !rendered; round += 1) {
          const dispatched = await dispatcher.dispatchBatch(new Date(), 100);
          if (dispatched.claimed === 0) {
            break;
          }
          const state = await database.publication.findUniqueOrThrow({
            select: { status: true, version: true },
            where: { id: publicationId },
          });
          rendered = state.status === "ready_for_review" && state.version === 3;
          if (rendered) {
            const reviewed =
              await database.publicationRevision.findUniqueOrThrow({
                select: { publicationId: true },
                where: { id: revisionId },
              });
            assert.equal(reviewed.publicationId, publicationId);
          }
        }
        assert.ok(rendered, "El render no dejó la pieza lista para revisar.");
      } finally {
        await renderer.close();
      }

      // --- Aprobar por HTTP programa la ocurrencia ---
      const approval = await mutateFromPage(
        page,
        apiBaseUrl,
        `publications/${publicationId}/approve`,
        { expectedVersion: 3 },
      );
      assert.equal(approval.status, 201, "La aprobación fue rechazada.");
      assert.equal(
        fieldFrom(approval.body, "status"),
        "scheduled",
        "Aprobar una historia recurrente tiene que programarla.",
      );
      const scheduled =
        await database.recurringStoryMaterialization.findUniqueOrThrow({
          include: { schedule: { include: { occurrences: true } } },
          where: { id: draft.id },
        });
      assert.equal(scheduled.status, "approved_scheduled");
      const schedule = scheduled.schedule;
      assert.ok(schedule, "La aprobación tiene que dejar una programación.");
      assert.equal(schedule.kind, "once");
      assert.deepEqual(schedule.targets, ["instagram_story"]);
      assert.equal(schedule.occurrences.length, 1);
      const occurrence = schedule.occurrences[0];
      assert.ok(occurrence);
      assert.equal(occurrence.status, "planned");
      assert.equal(occurrence.occurrenceKey.slice(0, 10), tomorrow.localDate);
      reportCheck(
        "aprobar el borrador programa una única ocurrencia en la fecha civil esperada",
      );

      assert.equal(occurrence.publicationOrderId, null);
      assert.equal(
        await database.publicationOrder.count({
          where: { organizationId: fixture.organizationId },
        }),
        0,
        "Programar no puede crear una orden de publicación.",
      );
      reportCheck("programar no publica: la ocurrencia todavía no tiene orden");

      // --- Una excepción de horario invalida lo que ya estaba programado ---
      await page.goto(`${webBaseUrl}/configuracion`, { waitUntil: "load" });
      const exceptions = page.getByRole("region", {
        name: `Excepciones de ${fixture.locationName}`,
      });
      await exceptions.waitFor({ timeout: startupTimeoutMs });
      await exceptions.getByLabel("Fecha").fill(tomorrow.localDate);
      await exceptions.getByLabel("Qué pasa ese día").selectOption("closed");
      await exceptions
        .getByLabel("Fuente del dato")
        .fill("Feriado confirmado por la dueña");
      const saveOverride = exceptions.getByRole("button", {
        name: "Guardar excepción",
      });
      assert.equal(
        await saveOverride.isDisabled(),
        true,
        "Guardar no puede habilitarse antes de ver el impacto.",
      );
      await exceptions.getByRole("button", { name: "Ver impacto" }).click();
      await exceptions
        .getByText("1 historia futura vuelve a revisión", { exact: false })
        .waitFor({ timeout: 30_000 });
      assert.equal(
        await saveOverride.isDisabled(),
        false,
        "Con el impacto a la vista, guardar tiene que habilitarse.",
      );
      reportCheck(
        "el panel exige ver el impacto antes de guardar y lo cuenta en historias reales",
      );

      await saveOverride.click();
      try {
        await exceptions
          .getByText("Excepción guardada", { exact: false })
          .waitFor({ timeout: 30_000 });
      } catch (cause) {
        throw new Error(
          `El panel no confirmó la excepción. Respuestas rechazadas: ${rejectedResponses.join(", ") || "ninguna"}.`,
          cause instanceof Error ? { cause } : undefined,
        );
      }
      await exceptions
        .getByRole("listitem")
        .getByText("Cerrado todo el día", { exact: true })
        .waitFor({ timeout: 30_000 });

      const invalidated =
        await database.recurringStoryMaterialization.findUniqueOrThrow({
          include: { publication: true },
          where: { id: draft.id },
        });
      assert.equal(invalidated.status, "invalidated");
      assert.equal(
        invalidated.invalidatedReasonCode,
        "location-day-override-changed",
      );
      assert.equal(invalidated.publication?.status, "validation_failed");
      const cancelledOccurrence =
        await database.publicationScheduleOccurrence.findUniqueOrThrow({
          where: { id: occurrence.id },
        });
      assert.equal(cancelledOccurrence.status, "cancelled");
      assert.equal(
        (
          await database.publicationSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
          })
        ).status,
        "cancelled",
      );
      reportCheck(
        "guardar el feriado cancela la ocurrencia y devuelve la historia a revisión",
      );
    } finally {
      await database.$disconnect();
    }

    await context.close();
    process.stdout.write("E2E de historia recurrente completo.\n");
  } finally {
    await browser?.close();
    if (web !== undefined) {
      await web.terminate();
    }
    if (api !== undefined) {
      await api.terminate();
    }
    if (created) {
      await adminPool.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
    }
    await adminPool.end();
  }
}

await main();
