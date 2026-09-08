/**
 * E2E de gestión de calendario (`P6-T06`).
 *
 * Levanta base efímera, API y panel antes de recorrer con Chrome el ciclo que
 * usa la persona operadora: crear desde un snapshot aprobado, calcular el
 * impacto de mover, pausar, reanudar y cancelar. No hay worker ni Meta en esta
 * prueba: una programación es una intención persistida, no una publicación.
 *
 * ```bash
 * pnpm e2e:scheduling
 * ```
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from "playwright-core";

import { createDatabaseClient } from "@aramayo/database";

import { apiEnvironment, webEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";
import {
  e2ePassword,
  seedPublishingFixture,
} from "../e2e-publishing/fixture.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const webDirectory = `${repositoryDirectory}apps/web`;
const nextBinary = "./node_modules/next/dist/bin/next";
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const buildTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;
const scheduleTimeZone = "America/Argentina/Cordoba";
const browserFaults: string[] = [];

function reportCheck(detail: string): void {
  process.stdout.write(`  ok ${detail}\n`);
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL es obligatorio para el E2E de calendario.");
  }
  return databaseUrl;
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

function localDateAfter(days: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: scheduleTimeZone,
    year: "numeric",
  }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const part = (kind: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function login(
  apiBaseUrl: string,
  email: string,
): Promise<Readonly<{ name: string; value: string }>> {
  const response = await fetch(new URL("auth/login", apiBaseUrl), {
    body: JSON.stringify({ email, password: e2ePassword }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 201, "El login no creó una sesión.");
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "El login no devolvió cookie de sesión.");
  const [pair] = setCookie.split(";");
  const separator = pair?.indexOf("=") ?? -1;
  assert.ok(pair !== undefined && separator > 0, "Cookie de sesión inválida.");
  return Object.freeze({
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
  });
}

async function calendarPage(
  browser: Browser,
  input: Readonly<{
    apiBaseUrl: string;
    email: string;
    timeZone: string;
    viewport: Readonly<{ height: number; width: number }>;
    webBaseUrl: string;
  }>,
): Promise<Page> {
  const session = await login(input.apiBaseUrl, input.email);
  const context = await browser.newContext({
    timezoneId: input.timeZone,
    viewport: input.viewport,
  });
  await context.addCookies([
    {
      domain: "127.0.0.1",
      httpOnly: true,
      name: session.name,
      path: "/",
      value: session.value,
    },
  ]);
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    browserFaults.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserFaults.push(`console: ${message.text()}`);
    }
  });
  await page.goto(`${input.webBaseUrl}/programacion`, { waitUntil: "load" });
  await page
    .getByRole("heading", { name: "Cada salida con su turno visible." })
    .waitFor({ timeout: startupTimeoutMs });
  await page
    .getByRole("button", { name: "Programar pieza aprobada" })
    .waitFor({ timeout: startupTimeoutMs });
  return page;
}

function publicationOccurrence(page: Page): Locator {
  return page
    .locator('button[data-status="planned"]:visible')
    .filter({ hasText: "Promoción de amoladoras" })
    .first();
}

async function selectOccurrence(page: Page): Promise<void> {
  const event = publicationOccurrence(page);
  await event.waitFor({ timeout: startupTimeoutMs });
  await event.click();
  await page.getByText("Snapshot aprobado", { exact: true }).waitFor({
    timeout: startupTimeoutMs,
  });
}

async function main(): Promise<void> {
  const configuredDatabaseUrl = requiredDatabaseUrl();
  const databaseName = `e2e_scheduling_${randomBytes(6).toString("hex")}`;
  assert.match(databaseName, /^[a-z0-9_]+$/u);
  const databaseUrl = databaseUrlFor(configuredDatabaseUrl, databaseName);
  const adminPool = new Pool({
    connectionString: databaseUrlFor(configuredDatabaseUrl, "postgres"),
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
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
    const fixture = await seedPublishingFixture(databaseUrl);
    process.stdout.write("Base efímera migrada y sembrada.\n");

    const apiPort = await reserveEphemeralPort();
    const webPort = await reserveEphemeralPort();
    const apiBaseUrl = `http://127.0.0.1:${String(apiPort)}/`;
    const webBaseUrl = `http://127.0.0.1:${String(webPort)}`;
    const redisUrl = process.env["REDIS_URL"];
    assert.ok(redisUrl, "REDIS_URL es obligatorio para el E2E de calendario.");
    api = startProcess({
      arguments: ["dist/main.js"],
      environment: {
        ...apiEnvironment(apiPort),
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        WEB_ORIGIN: webBaseUrl,
      },
      workingDirectory: apiDirectory,
    });
    try {
      await waitForHttp(`${apiBaseUrl}health`, startupTimeoutMs);
    } catch (cause: unknown) {
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

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await calendarPage(browser, {
      apiBaseUrl,
      email: fixture.people.scheduler.email,
      timeZone: scheduleTimeZone,
      viewport: { height: 1080, width: 1440 },
      webBaseUrl,
    });

    // El primer flujo usa teclado: el control adquiere foco y Enter abre el
    // formulario sin depender de un click de mouse.
    const createButton = page.getByRole("button", {
      name: "Programar pieza aprobada",
    });
    await createButton.focus();
    assert.equal(
      await createButton.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
      "El control de crear debe poder recibir foco.",
    );
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "Definí el turno" }).waitFor({
      timeout: startupTimeoutMs,
    });

    const initialDate = localDateAfter(2);
    await page.getByLabel("Fecha local inicial").fill(initialDate);
    await page.getByLabel("Hora local").fill("09:00");
    await page.getByRole("button", { name: "Crear programación" }).click();
    try {
      await page
        .getByText("Programación creada con", { exact: false })
        .waitFor({ timeout: startupTimeoutMs });
    } catch (cause: unknown) {
      throw new Error(
        `El panel no confirmó la creación. Mostraba:\n${await page.locator("body").innerText()}\n\nFallos del navegador:\n${browserFaults.join("\n")}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    reportCheck(
      "el formulario crea una programación desde un snapshot aprobado",
    );

    const database = createDatabaseClient(databaseUrl);
    try {
      const createdSchedule =
        await database.publicationSchedule.findFirstOrThrow({
          include: { occurrences: true },
          where: { organizationId: fixture.organizationId },
        });
      assert.equal(createdSchedule.status, "active");
      assert.equal(createdSchedule.localTime, "09:00");
      assert.equal(createdSchedule.timeZone, scheduleTimeZone);
      assert.equal(createdSchedule.occurrences.length, 1);
      assert.equal(createdSchedule.occurrences[0]?.status, "planned");
      const publication = await database.publication.findUniqueOrThrow({
        where: { id: fixture.approvedPublicationId },
      });
      assert.equal(publication.status, "scheduled");
      reportCheck(
        "crear deja una intención activa y una ocurrencia, sin publicar",
      );

      await selectOccurrence(page);
      await page.getByRole("button", { name: "Mover regla" }).click();
      await page
        .getByRole("heading", { name: "Calculá el impacto" })
        .waitFor({ timeout: startupTimeoutMs });
      const movedDate = localDateAfter(3);
      await page.getByLabel("Fecha local inicial").fill(movedDate);
      await page.getByLabel("Hora local").fill("10:30");
      await page.getByRole("button", { name: "Calcular impacto" }).click();
      try {
        await page
          .getByText("Impacto calculado:", { exact: false })
          .waitFor({ timeout: 15_000 });
      } catch (cause: unknown) {
        throw new Error(
          `El panel no mostró el impacto. Mostraba:\n${await page.locator("body").innerText()}\n\nFallos del navegador:\n${browserFaults.join("\n")}`,
          cause instanceof Error ? { cause } : undefined,
        );
      }
      await page.getByRole("button", { name: "Confirmar cambio" }).click();
      await page.getByText("Regla actualizada:", { exact: false }).waitFor({
        timeout: startupTimeoutMs,
      });
      const movedSchedule =
        await database.publicationSchedule.findUniqueOrThrow({
          include: { occurrences: { orderBy: { createdAt: "asc" } } },
          where: { id: createdSchedule.id },
        });
      assert.equal(movedSchedule.version, 2);
      assert.equal(movedSchedule.localTime, "10:30");
      assert.equal(
        movedSchedule.occurrences.filter(
          (occurrence) => occurrence.status === "planned",
        ).length,
        1,
      );
      assert.equal(
        movedSchedule.occurrences.filter(
          (occurrence) => occurrence.status === "cancelled",
        ).length,
        1,
      );
      reportCheck(
        "mover calcula el impacto antes de cambiar sólo ocurrencias futuras",
      );

      await selectOccurrence(page);
      await page.getByRole("button", { name: "Pausar" }).click();
      await page.getByText("Programación pausada.", { exact: true }).waitFor({
        timeout: startupTimeoutMs,
      });
      assert.equal(
        (
          await database.publicationSchedule.findUniqueOrThrow({
            where: { id: createdSchedule.id },
          })
        ).status,
        "paused",
      );
      await selectOccurrence(page);
      await page.getByRole("button", { name: "Reanudar" }).click();
      await page.getByText("Programación reanudada.", { exact: true }).waitFor({
        timeout: startupTimeoutMs,
      });
      assert.equal(
        (
          await database.publicationSchedule.findUniqueOrThrow({
            where: { id: createdSchedule.id },
          })
        ).status,
        "active",
      );
      reportCheck(
        "pausar y reanudar conservan la regla y cambian su estado visible",
      );

      // Un navegador en otra zona no cambia la decisión local de Córdoba; en
      // móvil la línea de tiempo reemplaza la grilla sin ocultar zona ni hora.
      const mobilePage = await calendarPage(browser, {
        apiBaseUrl,
        email: fixture.people.scheduler.email,
        timeZone: "America/New_York",
        viewport: { height: 844, width: 390 },
        webBaseUrl,
      });
      const mobileEvent = publicationOccurrence(mobilePage);
      await mobileEvent.waitFor({ timeout: startupTimeoutMs });
      const mobileEventText = await mobileEvent.innerText();
      assert.match(
        mobileEventText,
        new RegExp(scheduleTimeZone, "u"),
        "La zona IANA debe seguir visible en la línea de tiempo móvil.",
      );
      assert.match(
        mobileEventText,
        /10:30/u,
        "La hora debe seguir siendo la de Córdoba aunque el navegador esté en Nueva York.",
      );
      assert.equal(
        await mobilePage.locator(".schedule-timeline").isVisible(),
        true,
        "En móvil el calendario debe exponer la línea de tiempo.",
      );
      const artifactDirectory = `${repositoryDirectory}output/playwright`;
      await mkdir(artifactDirectory, { recursive: true });
      await mobilePage.screenshot({
        fullPage: true,
        path: `${artifactDirectory}/p6-t06-calendar-mobile.png`,
      });
      await mobilePage.context().close();
      reportCheck(
        "la zona del navegador no altera la hora de regla y móvil conserva el detalle",
      );

      await selectOccurrence(page);
      await page.getByRole("button", { name: "Cancelar regla" }).click();
      await page
        .getByText("Programación cancelada.", { exact: false })
        .waitFor({
          timeout: startupTimeoutMs,
        });
      const cancelledSchedule =
        await database.publicationSchedule.findUniqueOrThrow({
          include: { occurrences: true },
          where: { id: createdSchedule.id },
        });
      assert.equal(cancelledSchedule.status, "cancelled");
      assert.equal(
        cancelledSchedule.occurrences.filter(
          (occurrence) => occurrence.status === "planned",
        ).length,
        0,
      );
      const restoredPublication = await database.publication.findUniqueOrThrow({
        where: { id: fixture.approvedPublicationId },
      });
      assert.equal(restoredPublication.status, "approved");
      reportCheck(
        "cancelar retira lo planificado y devuelve la pieza a aprobada",
      );
    } finally {
      await database.$disconnect();
    }

    await page.context().close();
    process.stdout.write("E2E de calendario completo.\n");
  } finally {
    await browser?.close();
    await web?.terminate().catch(() => undefined);
    await api?.terminate().catch(() => undefined);
    if (created) {
      await adminPool.query(
        `SELECT pg_terminate_backend("pid") FROM pg_stat_activity
         WHERE "datname" = $1 AND "pid" <> pg_backend_pid()`,
        [databaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
    await adminPool.end();
  }
}

try {
  await main();
} catch (cause: unknown) {
  const message =
    cause instanceof Error ? cause.message : "Error desconocido en el E2E.";
  process.stderr.write(`E2E de calendario falló: ${message}\n`);
  process.exitCode = 1;
}
