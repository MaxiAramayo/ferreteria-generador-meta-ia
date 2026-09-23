/**
 * E2E de navegación del panel.
 *
 * Levanta la vertical entera —base efímera migrada, API y panel— y recorre con
 * un navegador real cómo se mueve cada rol entre secciones. Existe porque la
 * barra decide qué ofrecer con la sesión que devuelve la API, y sólo una corrida
 * con los guards de verdad demuestra que lo que se ofrece es lo que se puede
 * abrir.
 *
 * Lo que comprueba:
 *
 * - **sin sesión**: una pantalla del panel lleva al login y recuerda a cuál
 *   volver;
 * - **por rol**: cada persona ve sólo sus secciones y su «Para hoy»;
 * - **moverse**: desde cualquier pantalla, Configuración y Cuenta incluidas, se
 *   llega a las demás sin escribir la dirección;
 * - **cada flujo compone**: la historia de producto arma la pieza con la foto
 *   que se sube, cambia de marco sin perderla, y al guardar el panel lleva a
 *   la pieza con su PNG listo para aprobar;
 * - **salir**: cerrar sesión la revoca en la API;
 * - **API caída**: el panel lo dice en vez de mandar a iniciar sesión.
 *
 * ```bash
 * pnpm e2e:navigation
 * ```
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";

import {
  e2ePassword,
  seedPublishingFixture,
} from "../e2e-publishing/fixture.ts";
import { apiEnvironment, webEnvironment } from "../smoke/environment.ts";
import {
  reserveEphemeralPort,
  runProcess,
  startProcess,
  waitForHttp,
  type RunningProcess,
} from "../smoke/process-control.ts";

const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const apiDirectory = `${repositoryDirectory}apps/api`;
const webDirectory = `${repositoryDirectory}apps/web`;
const outputDirectory = `${repositoryDirectory}output/e2e-panel-navigation`;
const nextBinary = "./node_modules/next/dist/bin/next";
const prismaBinary = `${repositoryDirectory}node_modules/prisma/build/index.js`;
const buildTimeoutMs = 360_000;
const startupTimeoutMs = 90_000;
const uiTimeoutMs = 20_000;
const desktop = Object.freeze({ height: 900, width: 1280 });
const phone = Object.freeze({ height: 844, width: 390 });
const todayHeading = "Lo que hay que mover hoy.";

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL es obligatorio para el E2E de navegación.");
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
 * Inicia sesión por la API y devuelve la cookie. Una sesión escrita a mano en
 * la base probaría la barra contra un guard que nunca corrió.
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

async function signedInContext(
  browser: Browser,
  apiBaseUrl: string,
  email: string,
  viewport: Readonly<{ height: number; width: number }>,
): Promise<BrowserContext> {
  const cookie = await login(apiBaseUrl, email);
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport,
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
  return context;
}

/**
 * Errores que delatan una pantalla rota. Un 403 de una lectura que el rol no
 * tiene es esperable y no cuenta; una excepción o un fallo de hidratación, sí.
 */
function collectPageErrors(page: Page): () => readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|react/iu.test(message.text())) {
      errors.push(message.text());
    }
  });
  return () => errors;
}

async function waitForHeading(page: Page, name: string): Promise<void> {
  try {
    await page.getByRole("heading", { name }).waitFor({ timeout: uiTimeoutMs });
  } catch (cause) {
    const visible = await page.locator("body").innerText();
    throw new Error(
      `No apareció «${name}» en ${page.url()}. Mostraba:\n${visible}`,
      cause instanceof Error ? { cause } : undefined,
    );
  }
}

/** Secciones de la barra por su nombre, sin el contador de alertas. */
async function navigation(
  page: Page,
): Promise<Readonly<{ current: string | null; sections: readonly string[] }>> {
  const bar = page.getByRole("navigation", { name: "Secciones del panel" });
  await bar.waitFor({ timeout: uiTimeoutMs });
  return bar.locator("a").evaluateAll((links) => ({
    current:
      links.find((link) => link.getAttribute("aria-current") === "page")
        ?.firstChild?.textContent ?? null,
    sections: links.map((link) => link.firstChild?.textContent ?? ""),
  }));
}

/**
 * Cifra y unidad de cada tarjeta de «Para hoy», una vez que todas cargaron. Se
 * lee el texto del DOM y no el visible, que llega en mayúsculas por CSS.
 */
async function ticketFigures(page: Page): Promise<readonly string[]> {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".today-ticket").length > 0 &&
      document.querySelectorAll('.today-ticket[aria-busy="true"]').length === 0,
    undefined,
    { timeout: uiTimeoutMs },
  );
  return page
    .locator(".today-ticket-figure")
    .evaluateAll((figures) =>
      figures.map((figure) =>
        [
          figure.querySelector("strong")?.textContent ?? "",
          figure.querySelector("span")?.textContent ?? "",
        ]
          .join(" ")
          .trim(),
      ),
    );
}

async function main(): Promise<void> {
  const configuredUrl = requiredDatabaseUrl();
  const databaseName = `e2e_navegacion_${randomBytes(6).toString("hex")}`;
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

    // El entorno sale del smoke y no de `process.env`: el `.env` local trae
    // integraciones a medias que harían abortar el arranque por algo ajeno.
    const redisUrl = process.env["REDIS_URL"];
    assert.ok(redisUrl, "REDIS_URL es obligatorio para el E2E de navegación.");
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

    await mkdir(outputDirectory, { recursive: true });
    browser = await chromium.launch({ channel: "chrome", headless: true });

    // --- Sin sesión ---
    const anonymous = await browser.newContext({
      reducedMotion: "reduce",
      viewport: desktop,
    });
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(`${webBaseUrl}/programacion?vista=mes`, {
      waitUntil: "load",
    });
    await anonymousPage.waitForURL(/\/iniciar-sesion\?volver=/u, {
      timeout: uiTimeoutMs,
    });
    assert.equal(
      new URL(anonymousPage.url()).searchParams.get("volver"),
      "/programacion?vista=mes",
      "El login no recuerda la pantalla pedida.",
    );
    await waitForHeading(anonymousPage, "Iniciar sesión");
    await anonymous.close();
    reportCheck(
      "sin sesión, una pantalla del panel lleva al login y recuerda a cuál volver",
    );

    // --- Editora ---
    const editor = await signedInContext(
      browser,
      apiBaseUrl,
      fixture.people.editor.email,
      desktop,
    );
    const editorPage = await editor.newPage();
    const editorErrors = collectPageErrors(editorPage);
    await editorPage.goto(`${webBaseUrl}/`, { waitUntil: "load" });
    await waitForHeading(editorPage, todayHeading);
    assert.deepEqual(await navigation(editorPage), {
      current: "Inicio",
      sections: ["Inicio", "Publicaciones", "Programación", "Configuración"],
    });
    assert.deepEqual(await ticketFigures(editorPage), [
      "1 borrador",
      "0 piezas con problemas",
    ]);
    await editorPage
      .getByText("No hay salidas en los próximos 14 días.")
      .waitFor({ timeout: uiTimeoutMs });
    await editorPage.getByRole("link", { name: "Crear pieza" }).waitFor();
    await editorPage.screenshot({
      fullPage: true,
      path: `${outputDirectory}/inicio-editora.png`,
    });
    reportCheck(
      "la editora entra a «Para hoy» con su borrador y sin Operación en la barra",
    );

    // --- Crear pieza: cada flujo en su dirección ---
    await editorPage.getByRole("link", { name: "Crear pieza" }).click();
    await editorPage.waitForURL(`${webBaseUrl}/publicaciones/nueva`, {
      waitUntil: "commit",
    });
    await waitForHeading(editorPage, "¿Qué querés publicar?");
    await editorPage.screenshot({
      fullPage: true,
      path: `${outputDirectory}/crear-pieza.png`,
    });
    const flows = editorPage.getByRole("navigation", {
      name: "Flujos para crear una pieza",
    });
    // El nombre del flujo es el rótulo fuerte; debajo va su explicación.
    const currentFlow = flows.locator('a[aria-current="page"] strong');
    assert.equal(await currentFlow.textContent(), "Plantilla");
    await flows.getByRole("link", { name: "Creatividad IA" }).click();
    await editorPage.waitForURL(
      `${webBaseUrl}/publicaciones/nueva?flujo=creatividad-ia`,
      { waitUntil: "commit" },
    );
    await editorPage
      .getByRole("region", { name: "Compositor de creatividad con IA" })
      .waitFor({ timeout: uiTimeoutMs });
    await editorPage.reload({ waitUntil: "load" });
    await waitForHeading(editorPage, "¿Qué querés publicar?");
    assert.equal(await currentFlow.textContent(), "Creatividad IA");
    assert.equal((await navigation(editorPage)).current, "Publicaciones");

    // --- La historia de producto arma la pieza con la foto que se sube ---
    // Cambiar de marco es lo que pidió el dueño: el mismo producto, otra zona
    // de la foto libre (`ADR-031`).
    await flows.getByRole("link", { name: "Producto" }).click();
    await editorPage.waitForURL(
      `${webBaseUrl}/publicaciones/nueva?flujo=producto`,
      {
        waitUntil: "commit",
      },
    );
    const productComposer = editorPage.getByRole("region", {
      name: "Compositor de historia de producto",
    });
    await productComposer.waitFor({ timeout: uiTimeoutMs });
    await editorPage
      .getByLabel("Nombre del producto")
      .fill("Guantes de trabajo");
    await editorPage.getByLabel("Precio", { exact: true }).fill("$ 48.900");
    await editorPage.getByLabel("Subir foto").setInputFiles({
      buffer: await readFile(
        fileURLToPath(
          new URL(
            "../../packages/design-engine/assets/brand/local-aramayo.jpg",
            import.meta.url,
          ),
        ),
      ),
      mimeType: "image/jpeg",
      name: "guantes.jpg",
    });
    const productPreview = editorPage.locator(
      '[data-card][data-format="historia"]',
    );
    await productPreview
      .locator('img[src^="data:image/jpeg;base64,"]')
      .waitFor({ timeout: 30_000 });
    await productPreview
      .locator('[data-frame-card="abajo"]')
      .waitFor({ timeout: uiTimeoutMs });
    assert.ok(
      await productPreview.getByText("$ 48.900").count(),
      "El precio se dibuja en la pieza, que es donde vive.",
    );
    await editorPage.getByText("Tarjeta a la derecha", { exact: true }).click();
    await productPreview
      .locator('[data-frame-card="esquina"]')
      .waitFor({ timeout: uiTimeoutMs });
    reportCheck(
      "la historia de producto compone la foto subida y cambia de marco sin perderla",
    );

    // Guardar de verdad: la foto embebida viaja en el cuerpo del POST y la
    // API tiene que aceptarla. Con el límite por defecto de 100 KB, este paso
    // termina en 413 y el borrador no existe.
    await editorPage
      .getByLabel("Texto que acompaña")
      .fill("Pasá por el local y probátelos.");
    // Lo que respondió la API, para que un rechazo se lea en el fallo y no
    // haya que adivinarlo desde el aviso del panel.
    let saveOutcome = "sin respuesta";
    editorPage.on("response", (response) => {
      const url = new URL(response.url());
      if (
        url.pathname !== "/publications" ||
        response.request().method() !== "POST"
      ) {
        return;
      }
      void response
        .text()
        .then((body) => {
          saveOutcome = `${String(response.status())} ${body.slice(0, 400)}`;
        })
        .catch(() => {
          saveOutcome = `${String(response.status())} (sin cuerpo)`;
        });
    });
    await editorPage.getByRole("button", { name: "Guardar borrador" }).click();
    // Guardar termina en la pieza: el panel navega solo. Si no navega, el
    // aviso del compositor dice por qué, en vez de dejar un timeout mudo.
    const productNotice = editorPage
      .locator('[data-variant="product-story"] [role="status"]')
      .first();
    try {
      await editorPage.waitForURL(/\/publicaciones\?revisar=/u, {
        timeout: uiTimeoutMs,
      });
    } catch (cause) {
      const notice = (await productNotice.textContent()) ?? "(sin aviso)";
      throw new Error(
        `Guardar la historia de producto falló: ${notice} — la API respondió ${saveOutcome}`,
        cause instanceof Error ? { cause } : undefined,
      );
    }
    await waitForHeading(
      editorPage,
      "De la idea al borrador, sin saltos ocultos.",
    );
    reportCheck(
      "guardar la historia de producto lleva a la pieza, con su foto embebida",
    );

    // El PNG se pide solo al llegar: sin esto habría que pedirlo a mano,
    // esperar y abrirlo, que es justo el ir y venir que se quería sacar.
    await editorPage
      .getByText("PNG pedido. El estado se actualiza solo cuando esté listo.")
      .waitFor({ timeout: uiTimeoutMs });
    reportCheck(
      "al llegar a la pieza el panel pide el PNG sin que se lo pidan",
    );

    assert.equal((await navigation(editorPage)).current, "Publicaciones");
    assert.equal(
      await flows.count(),
      0,
      "El listado volvió a mostrar el compositor.",
    );
    reportCheck(
      "«Crear pieza» abre cada flujo en su dirección y recargar lo conserva",
    );

    // --- Eliminar borra la pieza del listado, con confirmación ---
    const productRow = editorPage
      .locator(".publication-list li")
      .filter({ hasText: "Guantes de trabajo" });
    await productRow.first().waitFor({ timeout: uiTimeoutMs });
    await productRow.first().getByRole("button", { name: "Eliminar" }).click();
    // Sin confirmar no pasa nada: tirar trabajo no es un clic suelto.
    await editorPage.getByRole("button", { name: "No" }).click();
    assert.equal(
      await productRow.count(),
      1,
      "Cancelar la confirmación no debe eliminar la pieza.",
    );
    await productRow.first().getByRole("button", { name: "Eliminar" }).click();
    const deleted = editorPage.waitForResponse((response) =>
      response.url().endsWith("/delete"),
    );
    await editorPage.getByRole("button", { name: "Sí, eliminar" }).click();
    const deleteResponse = await deleted;
    const deleteOutcome = `${String(deleteResponse.status())} ${(await deleteResponse.text()).slice(0, 240)}`;
    const deleteNotice = editorPage.locator(".publication-command-notice");
    await editorPage.waitForFunction(
      () =>
        !(
          document.querySelector(".publication-command-notice")?.textContent ??
          "Eliminando"
        ).includes("Eliminando"),
      undefined,
      { timeout: uiTimeoutMs },
    );
    const deleteText = (await deleteNotice.first().textContent()) ?? "";
    assert.match(
      deleteText,
      /se eliminó para siempre/u,
      `El panel dijo «${deleteText}»; la API respondió ${deleteOutcome}`,
    );
    // La fila se va del DOM: la pieza ya no existe en la base.
    await productRow
      .first()
      .waitFor({ state: "detached", timeout: uiTimeoutMs });
    assert.equal(await productRow.count(), 0);
    reportCheck("eliminar borra la pieza del listado y pide confirmación");

    const editorBar = editorPage.getByRole("navigation", {
      name: "Secciones del panel",
    });
    await editorBar.getByRole("link", { name: "Programación" }).click();
    await editorPage.waitForURL(`${webBaseUrl}/programacion`, {
      waitUntil: "commit",
    });
    await waitForHeading(editorPage, "Cada salida con su turno visible.");
    assert.equal((await navigation(editorPage)).current, "Programación");
    await editorBar.getByRole("link", { name: "Configuración" }).click();
    await editorPage.waitForURL(`${webBaseUrl}/configuracion`, {
      waitUntil: "commit",
    });
    await waitForHeading(editorPage, "Configuración operativa");
    assert.equal((await navigation(editorPage)).current, "Configuración");
    await editorPage.screenshot({
      path: `${outputDirectory}/configuracion-con-barra.png`,
    });
    await editorBar.getByRole("link", { name: "Publicaciones" }).click();
    await editorPage.waitForURL(`${webBaseUrl}/publicaciones`, {
      waitUntil: "commit",
    });
    await waitForHeading(
      editorPage,
      "De la idea al borrador, sin saltos ocultos.",
    );
    reportCheck(
      "desde Configuración la barra sigue ahí y lleva a las otras secciones",
    );

    await editorPage.locator(".panel-account summary").click();
    const accountMenu = editorPage.locator(".panel-account-menu");
    await accountMenu.waitFor({ state: "visible" });
    await accountMenu.getByText("Edición", { exact: true }).waitFor();
    await accountMenu.getByRole("link", { name: "Cambiar contraseña" }).click();
    await editorPage.waitForURL(`${webBaseUrl}/cuenta`, {
      waitUntil: "commit",
    });
    await waitForHeading(editorPage, "Cambiar contraseña");
    assert.equal(
      await editorPage.locator(".panel-account").getAttribute("open"),
      null,
      "El menú de sesión quedó abierto sobre la pantalla nueva.",
    );
    assert.equal((await navigation(editorPage)).current, null);
    await editorPage
      .getByRole("link", { name: "Aramayo Content Platform" })
      .click();
    await editorPage.waitForURL(`${webBaseUrl}/`, { waitUntil: "commit" });
    await waitForHeading(editorPage, todayHeading);
    assert.deepEqual(editorErrors(), []);
    await editor.close();
    reportCheck(
      "Cuenta se abre desde el menú de sesión y la marca vuelve al inicio",
    );

    // --- Quien aprueba y programa ---
    const scheduler = await signedInContext(
      browser,
      apiBaseUrl,
      fixture.people.scheduler.email,
      desktop,
    );
    const schedulerPage = await scheduler.newPage();
    await schedulerPage.goto(`${webBaseUrl}/`, { waitUntil: "load" });
    await waitForHeading(schedulerPage, todayHeading);
    assert.deepEqual((await navigation(schedulerPage)).sections, [
      "Inicio",
      "Publicaciones",
      "Programación",
      "Configuración",
    ]);
    assert.deepEqual(await ticketFigures(schedulerPage), [
      "0 piezas por aprobar",
      "1 aprobada sin programar",
    ]);
    await schedulerPage
      .locator(".today-ticket")
      .filter({ hasText: "aprobada sin programar" })
      .getByRole("link", { name: "Programar", exact: true })
      .click();
    await schedulerPage.waitForURL(`${webBaseUrl}/programacion`, {
      waitUntil: "commit",
    });
    await waitForHeading(schedulerPage, "Cada salida con su turno visible.");
    reportCheck(
      "quien aprueba ve lo aprobado sin programar y la tarjeta lo lleva a Programación",
    );

    // Una pieza aprobada se programa desde su fila, y Programación abre con esa
    // pieza ya elegida.
    await schedulerPage
      .getByRole("navigation", { name: "Secciones del panel" })
      .getByRole("link", { name: "Publicaciones" })
      .click();
    await schedulerPage.waitForURL(`${webBaseUrl}/publicaciones`, {
      waitUntil: "commit",
    });
    await schedulerPage
      .locator(`#publicacion-${fixture.approvedPublicationId}`)
      .getByRole("link", { name: "Programar" })
      .click({ timeout: uiTimeoutMs });
    await schedulerPage.waitForURL(
      `${webBaseUrl}/programacion?publicacion=${fixture.approvedPublicationId}`,
      { waitUntil: "commit" },
    );
    const picker = schedulerPage.getByLabel(/^Pieza aprobada/u);
    await picker.waitFor({ timeout: uiTimeoutMs });
    assert.equal(
      await picker.inputValue(),
      fixture.approvedPublicationId,
      "Programación no abrió con la pieza elegida.",
    );
    await scheduler.close();
    reportCheck(
      "una pieza aprobada se programa desde su fila con la pieza ya elegida",
    );

    // --- Publicadora ---
    const publisher = await signedInContext(
      browser,
      apiBaseUrl,
      fixture.people.publisher.email,
      desktop,
    );
    const publisherPage = await publisher.newPage();
    const publisherErrors = collectPageErrors(publisherPage);
    await publisherPage.goto(`${webBaseUrl}/`, { waitUntil: "load" });
    await waitForHeading(publisherPage, todayHeading);
    assert.deepEqual(await navigation(publisherPage), {
      current: "Inicio",
      sections: [
        "Inicio",
        "Publicaciones",
        "Programación",
        "Operación",
        "Configuración",
      ],
    });
    assert.deepEqual(await ticketFigures(publisherPage), [
      "0 alertas abiertas",
      "Lista para publicar",
    ]);
    await publisherPage.screenshot({
      fullPage: true,
      path: `${outputDirectory}/inicio-publicadora.png`,
    });
    await publisherPage
      .getByRole("navigation", { name: "Secciones del panel" })
      .getByRole("link", { name: /^Operación/u })
      .click();
    await publisherPage.waitForURL(`${webBaseUrl}/operacion`, {
      waitUntil: "commit",
    });
    await waitForHeading(publisherPage, "Lo que necesita una decisión.");
    reportCheck(
      "quien publica ve Operación y si la conexión está lista antes de publicar",
    );

    const phoneContext = await signedInContext(
      browser,
      apiBaseUrl,
      fixture.people.publisher.email,
      phone,
    );
    const phonePage = await phoneContext.newPage();
    await phonePage.goto(`${webBaseUrl}/`, { waitUntil: "load" });
    await waitForHeading(phonePage, todayHeading);
    await ticketFigures(phonePage);
    const phoneBar = phonePage.getByRole("navigation", {
      name: "Secciones del panel",
    });
    const overflow = await phonePage.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    assert.ok(
      overflow <= 1,
      `La página se desborda ${String(overflow)} px en el celular.`,
    );
    await phonePage.screenshot({
      path: `${outputDirectory}/inicio-celular.png`,
    });
    // Entrando directo a la última sección, la barra la deja a la vista sola.
    await phonePage.goto(`${webBaseUrl}/configuracion`, { waitUntil: "load" });
    await waitForHeading(phonePage, "Configuración operativa");
    const barBox = await phoneBar.boundingBox();
    const currentBox = await phoneBar
      .locator('a[aria-current="page"]')
      .boundingBox();
    assert.ok(barBox !== null && currentBox !== null, "La barra no se dibujó.");
    assert.ok(
      currentBox.x >= barBox.x &&
        currentBox.x + currentBox.width <= barBox.x + barBox.width + 1,
      "La sección actual quedó fuera de la barra en el celular.",
    );
    await phonePage.screenshot({
      path: `${outputDirectory}/configuracion-celular.png`,
    });
    await phoneContext.close();
    reportCheck(
      "en el celular la página no se desborda y la sección actual queda a la vista",
    );

    const [publisherCookie] = await publisher.cookies();
    assert.ok(publisherCookie, "La publicadora no tenía cookie de sesión.");
    await publisherPage.locator(".panel-account summary").click();
    await publisherPage.locator(".panel-account-menu").waitFor();
    await publisherPage.screenshot({
      path: `${outputDirectory}/menu-de-sesion.png`,
    });
    await publisherPage.getByRole("button", { name: "Cerrar sesión" }).click();
    await publisherPage.waitForURL(`${webBaseUrl}/iniciar-sesion`, {
      timeout: uiTimeoutMs,
    });
    const revoked = await fetch(new URL("auth/session", apiBaseUrl), {
      headers: { cookie: `${publisherCookie.name}=${publisherCookie.value}` },
    });
    assert.equal(
      revoked.status,
      401,
      "La sesión seguía viva en la API después de cerrarla.",
    );
    await publisherPage.goto(`${webBaseUrl}/operacion`, { waitUntil: "load" });
    await publisherPage.waitForURL(/\/iniciar-sesion\?volver=%2Foperacion$/u, {
      timeout: uiTimeoutMs,
    });
    assert.deepEqual(publisherErrors(), []);
    await publisher.close();
    reportCheck(
      "cerrar sesión la revoca en la API y el panel vuelve a pedir login",
    );

    // --- API caída ---
    await api.terminate();
    api = undefined;
    const offline = await browser.newContext({
      reducedMotion: "reduce",
      viewport: desktop,
    });
    const offlinePage = await offline.newPage();
    await offlinePage.goto(`${webBaseUrl}/publicaciones`, {
      waitUntil: "load",
    });
    await offlinePage
      .getByText("La API no respondió")
      .waitFor({ timeout: uiTimeoutMs });
    await offlinePage.getByRole("button", { name: "Reintentar" }).waitFor();
    assert.equal(
      new URL(offlinePage.url()).pathname,
      "/publicaciones",
      "Con la API caída no se manda a nadie a iniciar sesión.",
    );
    await offline.close();
    reportCheck(
      "con la API caída el panel lo dice y no manda a iniciar sesión",
    );

    process.stdout.write(
      "E2E de navegación completo. Capturas en output/e2e-panel-navigation/.\n",
    );
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
  process.stderr.write(`E2E de navegación falló: ${message}\n`);
  process.exitCode = 1;
}
