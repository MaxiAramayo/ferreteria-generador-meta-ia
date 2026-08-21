/**
 * E2E de publicación por rol y estado.
 *
 * Levanta la vertical entera —base efímera migrada, API y panel— y la recorre
 * con un navegador real. Existe porque las reglas que gobiernan publicar están
 * escritas dos veces a propósito: el panel decide qué ofrecer y la API decide
 * qué permitir, y sólo una corrida de punta a punta demuestra que las dos dicen
 * lo mismo. Una prueba del panel con la API simulada pasaría igual el día que
 * se desincronicen.
 *
 * Lo que comprueba:
 *
 * - **por rol**: quien no tiene `publisher` no ve el control ni consigue
 *   publicar llamando directo a la API;
 * - **por estado**: la misma persona puede publicar una pieza aprobada y no una
 *   en borrador;
 * - **doble envío**: dos clics seguidos sobre el botón dejan una sola orden;
 * - **refresh en el medio**: recargar durante la publicación tampoco crea una
 *   segunda.
 *
 * ```bash
 * pnpm e2e:publishing
 * ```
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import { chromium, type Browser, type Page } from "playwright-core";

import { createDatabaseClient } from "@aramayo/database";

import { apiEnvironment, webEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";
import { e2ePassword, seedPublishingFixture } from "./fixture.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const webDirectory = `${repositoryDirectory}apps/web`;
const nextBinary = "./node_modules/next/dist/bin/next";
// `runProcess` siempre lanza `node`, así que los CLI se referencian por su
// entrada JavaScript y no por el nombre del binario.
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const buildTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL es obligatorio para el E2E de publicación.");
  }
  return databaseUrl;
}

function databaseUrlFor(baseUrl: string, databaseName: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${databaseName}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

function reportCheck(detail: string): void {
  process.stdout.write(`  ok ${detail}\n`);
}

/**
 * Inicia sesión por la API y devuelve la cookie.
 *
 * Se hace por HTTP y no escribiendo la sesión en la base: una sesión inventada
 * probaría el panel contra un guard que nunca corrió.
 */
async function login(
  apiBaseUrl: string,
  email: string,
): Promise<Readonly<{ name: string; value: string }>> {
  const response = await fetch(new URL("auth/login", apiBaseUrl), {
    body: JSON.stringify({ email, password: e2ePassword }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert.equal(response.status, 201, `Login de ${email} devolvió otro estado.`);
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

async function pageFor(
  browser: Browser,
  webBaseUrl: string,
  apiBaseUrl: string,
  email: string,
): Promise<Page> {
  const cookie = await login(apiBaseUrl, email);
  const context = await browser.newContext({
    viewport: { height: 900, width: 1280 },
  });
  await context.addCookies([
    {
      domain: "127.0.0.1",
      httpOnly: true,
      name: cookie.name,
      path: "/",
      value: cookie.value,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${webBaseUrl}/publicaciones`, { waitUntil: "load" });
  // El listado llega por fetch del cliente: sin esperarlo se mediría el estado
  // de carga y no el resultado.
  try {
    await page.getByText("Promoción de amoladoras").first().waitFor({
      timeout: 20_000,
    });
  } catch (cause) {
    const visible = await page.locator("body").innerText();
    throw new Error(
      `El panel no listó la publicación para ${email}. Mostraba:\n${visible}`,
      cause instanceof Error ? { cause } : undefined,
    );
  }
  return page;
}

function orderCountFor(
  databaseUrl: string,
  publicationId: string,
): Promise<number> {
  const database = createDatabaseClient(databaseUrl);
  return database.publicationOrder
    .count({ where: { publicationId } })
    .finally(() => database.$disconnect());
}

async function main(): Promise<void> {
  const configuredUrl = requiredDatabaseUrl();
  const databaseName = `e2e_publishing_${randomBytes(6).toString("hex")}`;
  assert.match(databaseName, /^[a-z0-9_]+$/u);
  const adminPool = new Pool({
    connectionString: databaseUrlFor(configuredUrl, "postgres"),
    connectionTimeoutMillis: 5_000,
    max: 1,
  });
  const databaseUrl = databaseUrlFor(configuredUrl, databaseName);

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

    // El entorno se arma desde el del smoke y no heredando `process.env`: el
    // `.env` local trae integraciones a medias —Meta sin `META_PAGE_ID`, por
    // ejemplo— que hacen abortar el arranque por algo ajeno a esta prueba.
    const redisUrl = process.env["REDIS_URL"];
    assert.ok(redisUrl, "REDIS_URL es obligatorio para el E2E de publicación.");
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
      // Sin la salida del proceso, «no respondió» no dice nada de por qué.
      throw new Error(
        `La API no arrancó:\n${api.output()}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    process.stdout.write("API en pie.\n");

    // `NEXT_PUBLIC_API_BASE_URL` se incrusta al compilar, así que el panel se
    // construye recién cuando se conoce el puerto de la API.
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

    // --- Por rol ---
    const editorPage = await pageFor(
      browser,
      webBaseUrl,
      apiBaseUrl,
      fixture.people.editor.email,
    );
    assert.equal(
      await editorPage.getByRole("button", { name: "Publicar…" }).count(),
      0,
      "Una editora no puede ver el control de publicar.",
    );
    reportCheck("una editora no ve el control de publicar");

    // El panel no es la defensa: la API tiene que rechazarlo igual.
    const editorAttempt = await editorPage.evaluate(
      `(async () => {
        const response = await fetch(${JSON.stringify(apiBaseUrl)} + "publications/${fixture.approvedPublicationId}/publish", {
          body: JSON.stringify({ expectedVersion: 1, targets: ["facebook_page"] }),
          credentials: "include",
          headers: { "content-type": "application/json", "idempotency-key": "e2e-editora" },
          method: "POST",
        });
        return response.status;
      })()`,
    );
    assert.ok(
      editorAttempt === 401 || editorAttempt === 403,
      `La API dejó publicar a una editora: ${String(editorAttempt)}.`,
    );
    reportCheck("la API rechaza a una editora aunque llame directo");
    await editorPage.context().close();

    const publisherPage = await pageFor(
      browser,
      webBaseUrl,
      apiBaseUrl,
      fixture.people.publisher.email,
    );

    // --- Por estado ---
    const publishButtons = publisherPage.getByRole("button", {
      name: "Publicar…",
    });
    assert.equal(
      await publishButtons.count(),
      1,
      "Sólo la pieza aprobada ofrece publicar.",
    );
    await publisherPage
      .getByText("La pieza todavía no está aprobada", { exact: false })
      .first()
      .waitFor({ timeout: 10_000 });
    reportCheck(
      "sólo la pieza aprobada ofrece publicar y el borrador explica por qué",
    );

    // --- La confirmación muestra lo que va a salir ---
    await publishButtons.first().click();
    await publisherPage
      .getByRole("heading", { name: "Revisá antes de publicar" })
      .waitFor({ timeout: 20_000 });
    await publisherPage
      .getByText("Ferretería y Lubricentro Aramayo", { exact: false })
      .first()
      .waitFor({ timeout: 10_000 });
    try {
      await publisherPage
        .getByText("Amoladora angular 850 W.", { exact: false })
        .first()
        .waitFor({ timeout: 10_000 });
    } catch (cause) {
      const visible = await publisherPage
        .locator(".publish-confirmation")
        .innerText();
      const detail = await publisherPage.evaluate(
        `(async () => {
          const response = await fetch(${JSON.stringify(apiBaseUrl)} + "publications/${fixture.approvedPublicationId}", { credentials: "include" });
          return JSON.stringify({ body: await response.json(), status: response.status });
        })()`,
      );
      throw new Error(
        `La confirmación no mostró el copy aprobado. Mostraba:\n${visible}\n\nAPI:\n${String(detail)}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    reportCheck("la confirmación nombra la cuenta y muestra el copy aprobado");

    // --- Doble envío ---
    const confirm = publisherPage.getByRole("button", {
      name: "Publicar ahora",
    });
    await confirm.waitFor({ timeout: 10_000 });
    // Dos clics sin esperar la respuesta: es lo que hace una persona apurada.
    await Promise.all([
      confirm.click({ force: true }),
      confirm.click({ force: true, timeout: 5_000 }).catch(() => undefined),
    ]);
    await publisherPage
      .getByText("Publicación pedida", { exact: false })
      .first()
      .waitFor({ timeout: 30_000 });
    assert.equal(
      await orderCountFor(databaseUrl, fixture.approvedPublicationId),
      1,
      "El doble clic creó más de una orden.",
    );
    reportCheck("dos clics seguidos dejan una sola orden");

    // --- Refresh durante la publicación ---
    await publisherPage.reload({ waitUntil: "load" });
    await publisherPage.getByText("Promoción de amoladoras").first().waitFor({
      timeout: 20_000,
    });
    assert.equal(
      await orderCountFor(databaseUrl, fixture.approvedPublicationId),
      1,
      "Recargar durante la publicación creó otra orden.",
    );
    // Y la pieza ya no ofrece publicar: está en curso.
    assert.equal(
      await publisherPage.getByRole("button", { name: "Publicar…" }).count(),
      0,
      "Una publicación en curso no puede volver a pedirse.",
    );
    reportCheck("recargar no duplica y la pieza en curso no se vuelve a pedir");

    // --- Navegación atrás ---
    // Salir y volver con el botón del navegador puede servir una página
    // cacheada; lo que no puede es reabrir un pedido ya hecho.
    await publisherPage.goto(`${webBaseUrl}/configuracion`, {
      waitUntil: "load",
    });
    await publisherPage.goBack({ waitUntil: "load" });
    await publisherPage.getByText("Promoción de amoladoras").first().waitFor({
      timeout: 20_000,
    });
    assert.equal(
      await orderCountFor(databaseUrl, fixture.approvedPublicationId),
      1,
      "Volver atrás creó otra orden.",
    );
    assert.equal(
      await publisherPage.getByRole("button", { name: "Publicar…" }).count(),
      0,
      "Volver atrás reabrió el control de publicar.",
    );
    reportCheck("volver atrás no duplica ni reabre el control");

    await publisherPage.context().close();
    process.stdout.write("E2E de publicación completo.\n");
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
  process.stderr.write(`E2E de publicación falló: ${message}\n`);
  process.exitCode = 1;
}
