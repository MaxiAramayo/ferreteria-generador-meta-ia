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
import { readFile } from "node:fs/promises";
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
): Promise<
  Readonly<{ body: unknown; correlationId: string | null; status: number }>
> {
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
      return {
        body: await response.json(),
        correlationId: response.headers.get("x-correlation-id"),
        status: response.status,
      };
    })()`,
  );
  assert.ok(
    typeof result === "object" && result !== null,
    "La mutación no devolvió una respuesta legible.",
  );
  const status = (result as { status?: unknown }).status;
  assert.equal(typeof status, "number", "La respuesta no trae estado.");
  const correlationId = (result as { correlationId?: unknown }).correlationId;
  return Object.freeze({
    body: (result as { body?: unknown }).body,
    correlationId: typeof correlationId === "string" ? correlationId : null,
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
    // Cada flujo tiene su dirección: se entra directo a Historia recurrente.
    await page.goto(
      `${webBaseUrl}/publicaciones/nueva?flujo=historia-recurrente`,
      { waitUntil: "load" },
    );
    await page
      .getByRole("button", { name: "Programar" })
      .waitFor({ timeout: startupTimeoutMs });
    await page
      .getByText("Aprobar y publicar rutina", { exact: true })
      .waitFor({ timeout: startupTimeoutMs });
    await page
      .getByText("Renderiza y publica al horario elegido", { exact: false })
      .waitFor({ timeout: startupTimeoutMs });
    reportCheck(
      "la política automática explica que la rutina normal se renderiza y publica sin revisión diaria",
    );

    // --- La vista previa monta el mismo documento del motor ---
    const format = FORMATS.historia;
    const preview = page.locator('[data-card][data-format="historia"]');
    const previewBox = await preview.boundingBox();
    assert.ok(previewBox, "Falta la vista previa real.");
    assert.ok(
      Math.abs(
        previewBox.width / previewBox.height - format.width / format.height,
      ) < 0.01,
      "La vista previa del motor no respeta la relación de historia.",
    );
    assert.deepEqual(
      JSON.parse((await preview.getAttribute("data-safe-area")) ?? "{}"),
      format.safeArea,
      "La vista previa tiene que declarar las zonas seguras del motor.",
    );
    await preview
      .getByText(fixture.openingHours, { exact: false })
      .waitFor({ timeout: 10_000 });
    reportCheck(
      "la vista previa usa el documento real de historia, sus zonas seguras y el horario vigente",
    );

    // --- La imagen propia sin imagen no se activa ---
    await page.getByText("Imagen propia", { exact: true }).click();
    await page
      .getByText("Subí la imagen que querés publicar para verla acá.")
      .waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Programar" }).click();
    await page
      .getByText("«Imagen propia» no tiene otra cosa que mostrar", {
        exact: false,
      })
      .waitFor({ timeout: 10_000 });
    await page.getByText("Foto al medio", { exact: true }).click();
    reportCheck("la imagen propia sin imagen no deja activar la regla");

    // La mayoría de las historias son para todas las sucursales, así que el
    // formulario arranca ahí; elegir el lubricentro lo cambia, porque el
    // servicio existe en una sola.
    const scope = page.getByTestId("recurring-story-location");
    assert.equal(
      await scope.inputValue(),
      "",
      "El formulario tiene que arrancar en «Ambas sucursales».",
    );

    // --- Cada historia ofrece sus marcos y su paleta ---
    // «Lubricentro» también es uno de los rubros que dibuja la apertura: el
    // selector se busca dentro de su propio grupo.
    const storyKinds = page.getByRole("group", { name: "Qué historia arma" });
    await storyKinds.getByText("Lubricentro", { exact: true }).click();
    await preview.getByText("¿Toca el service?").waitFor({ timeout: 10_000 });
    await page.getByText("Foto enmarcada", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Rojo Aramayo", { exact: true }).count(),
      0,
      "El lubricentro usa su paleta: no ofrece la de la ferretería.",
    );
    assert.notEqual(
      await scope.inputValue(),
      "",
      "El lubricentro tiene que quedar atado a la sucursal donde se atiende.",
    );
    await storyKinds.getByText("Apertura", { exact: true }).click();
    await preview.getByText("¡Ya abrimos!").waitFor({ timeout: 10_000 });
    reportCheck(
      "cambiar de historia cambia copy, marcos y paleta en la vista previa real",
    );

    // --- Una foto propia se prepara en el navegador y entra a la pieza ---
    // Es una foto real del local: el render de más abajo la decodifica.
    const photoBytes = await readFile(
      fileURLToPath(
        new URL(
          "../../packages/design-engine/assets/brand/local-aramayo.jpg",
          import.meta.url,
        ),
      ),
    );
    await page.getByLabel("Subir foto").setInputFiles({
      buffer: photoBytes,
      mimeType: "image/jpeg",
      name: "mascota.jpg",
    });
    await preview
      .locator('img[src^="data:image/jpeg;base64,"]')
      .waitFor({ timeout: 30_000 });
    await page.getByText("Verde", { exact: true }).click();
    await preview
      .locator(
        '[data-cta][style*="background-color:#1e7d3f"], [data-cta][style*="rgb(30, 125, 63)"]',
      )
      .waitFor({ timeout: 10_000 });
    reportCheck(
      "la foto subida y el acento verde aparecen en la vista previa real antes de guardar",
    );

    // --- El encuadre se acomoda acercando y arrastrando la foto ---
    await page.getByLabel("Acercar").fill("150");
    const movableSurface = page.locator('[data-movable="true"]');
    await movableSurface.scrollIntoViewIfNeeded();
    const surfaceBox = await movableSurface.boundingBox();
    assert.ok(surfaceBox, "La vista previa tiene que poder arrastrarse.");
    const surfaceCenter = {
      x: surfaceBox.x + surfaceBox.width / 2,
      y: surfaceBox.y + surfaceBox.height / 2,
    };
    await page.mouse.move(surfaceCenter.x, surfaceCenter.y);
    await page.mouse.down();
    await page.mouse.move(surfaceCenter.x, surfaceCenter.y - 80, { steps: 8 });
    await page.mouse.up();
    reportCheck(
      "la foto se acerca y se mueve arrastrándola en la vista previa",
    );

    // --- Crear la regla desde el panel ---
    // Este recorrido prueba el camino de una sola sucursal: el de todas lo
    // cubren la integración de la base y el dominio.
    await scope.selectOption({ label: `Sólo ${fixture.locationName}` });
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
    await page.getByRole("button", { name: "Programar" }).click();
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
      assert.equal(rule.kind, "apertura");
      assert.equal(rule.designVariant, "cartel");
      // El encuadre elegido en el panel es el que guarda la regla.
      assert.equal(rule.photoZoom, 150);
      assert.ok(
        rule.photoFocusY !== null && rule.photoFocusY > 50,
        "Arrastrar la foto hacia arriba tiene que mover su encuadre.",
      );
      // El rojo de marca es el punto de partida de una regla nueva.
      assert.equal(rule.theme, "promo");
      assert.equal(rule.accent, "verde");
      assert.ok(
        rule.photoDataUrl?.startsWith("data:image/jpeg;base64,") === true,
        "La regla tiene que guardar la foto preparada como JPEG.",
      );
      assert.ok(
        rule.photoDataUrl.length < photoBytes.byteLength * 2,
        "La foto se guarda achicada y recodificada, no el archivo original.",
      );
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
      const materializedRevision =
        await database.publicationRevision.findFirstOrThrow({
          where: { organizationId: fixture.organizationId, publicationId },
        });
      const materializedDocument = JSON.stringify(
        materializedRevision.designDocument,
      );
      assert.ok(
        materializedDocument.includes(rule.photoDataUrl),
        "El borrador tiene que llevar la foto de la regla.",
      );
      assert.match(materializedDocument, /"accent":"verde"/u);
      reportCheck(
        "el worker materializa un borrador versionado que cita dirección, horario y versión de sucursal, con la foto y el color de la regla",
      );

      // --- El borrador se puede ajustar antes de pedir el PNG ---
      await page.goto(`${webBaseUrl}/publicaciones`, { waitUntil: "load" });
      const editButton = page.getByRole("button", { name: "Editar borrador" });
      await editButton.waitFor({ timeout: startupTimeoutMs });
      await editButton.click();
      await page
        .getByRole("heading", { name: "Editá lo que verá tu cliente." })
        .waitFor({ timeout: startupTimeoutMs });
      await page.getByLabel("Titular").fill("¡Abrimos temprano!");
      await page.getByText("Datos abajo", { exact: true }).click();
      await page.getByText("Claro", { exact: true }).click();
      const saveDraftResponse = page.waitForResponse(
        (response) =>
          response.url() === `${apiBaseUrl}publications/${publicationId}` &&
          response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Guardar revisión" }).click();
      assert.equal(
        (await saveDraftResponse).status(),
        200,
        "El ajuste del borrador no fue confirmado.",
      );
      const revised = await database.publication.findUniqueOrThrow({
        include: { revisions: { orderBy: { revisionNumber: "desc" } } },
        where: { id: publicationId },
      });
      assert.equal(revised.version, 2);
      assert.equal(revised.revisions.length, 2);
      assert.match(
        JSON.stringify(revised.revisions[0]?.designDocument),
        /"layout":"historia-apertura-placa"/u,
      );
      assert.match(
        JSON.stringify(revised.revisions[0]?.designDocument),
        /"theme":"claro"/u,
      );
      assert.ok(
        JSON.stringify(revised.revisions[0]?.designDocument).includes(
          rule.photoDataUrl,
        ),
        "Editar el borrador no puede perder la foto.",
      );
      reportCheck(
        "la edición guarda otra revisión con copy, marco y tema, conserva la foto y no aprueba ni publica",
      );

      // --- Render de la pieza, sin proveedores externos ---
      const renderResponse = await mutateFromPage(
        page,
        apiBaseUrl,
        `publications/${publicationId}/render`,
        { expectedVersion: 2 },
      );
      assert.equal(renderResponse.status, 201, "El render no fue aceptado.");
      const revisionId = fieldFrom(renderResponse.body, "revisionId");

      // --- La correlación de la solicitud llega a la base (`P7-T03`) ---
      const correlationId = renderResponse.correlationId;
      assert.ok(
        correlationId !== null && /^[0-9a-f]{32}$/u.test(correlationId),
        "La API debe devolver la correlación de la solicitud.",
      );
      const correlatedAudit = await database.auditEvent.count({
        where: { correlationId, organizationId: fixture.organizationId },
      });
      const correlatedOutbox = await database.outboxMessage.count({
        where: { correlationId, organizationId: fixture.organizationId },
      });
      assert.ok(
        correlatedAudit >= 1 && correlatedOutbox >= 1,
        `La correlación ${correlationId} debe alcanzar auditoría (${String(correlatedAudit)}) y outbox (${String(correlatedOutbox)}).`,
      );
      reportCheck(
        "la correlación de la solicitud llega a la auditoría y al trabajo que la ejecuta",
      );
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
          rendered = state.status === "ready_for_review" && state.version === 4;
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
        { expectedVersion: 4 },
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
