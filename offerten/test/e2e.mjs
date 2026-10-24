#!/usr/bin/env node
// End-to-end test with Playwright (uses a globally installed playwright, no npm deps).
//
//   node test/e2e.mjs
//
// Env:
//   SCREENSHOT_DIR            where to write screenshots and PDFs (default: <os tmp>/offerten-screens)
//   PLAYWRIGHT_BROWSERS_PATH  defaults to /opt/pw-browsers
//   PLAYWRIGHT_MODULE         optional absolute path to the playwright package
//
// Uses only fake data (test/fixtures/settings.fake.json). Never runs "playwright install".

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), "offerten-screens");
const SETTINGS_FIXTURE = path.join(root, "test", "fixtures", "settings.fake.json");

// --------------------------------------------------------------------------- playwright

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    /* fall through */
  }
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    "/opt/node-tools/node_modules/playwright",
    "/opt/node22/lib/node_modules/playwright",
    process.env.NODE_PATH && path.join(process.env.NODE_PATH, "playwright"),
  ].filter(Boolean);
  const require = createRequire(import.meta.url);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch {
      /* try next */
    }
  }
  throw new Error("playwright not found – install it globally or set PLAYWRIGHT_MODULE");
}

async function launch(chromium) {
  try {
    return await chromium.launch();
  } catch (err) {
    const fallback = "/opt/pw-browsers/chromium";
    if (!existsSync(fallback)) throw err;
    return chromium.launch({ executablePath: fallback });
  }
}

// --------------------------------------------------------------------------- dev server

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "scripts", "dev-server.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev server did not start:\n${output}`)), 10_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`dev server exited (${code}):\n${output}`));
    });
  });
  return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill("SIGTERM") };
}

// --------------------------------------------------------------------------- helpers

const problems = { console: [], csp: [] };

async function newPage(browser, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.console.push(msg.text());
  });
  page.on("pageerror", (err) => problems.console.push(`pageerror: ${err.message}`));
  page.on("dialog", (dialog) => dialog.accept());
  return { context, page };
}

async function collectCsp(page) {
  problems.csp.push(...(await page.evaluate(() => window.__cspViolations || [])));
}

// Amounts use non-breaking spaces, and depending on the ICU version de-CH groups thousands with
// \u2019 or '. Compare normalised text.
const norm = (text) => text.replace(/[\u00a0\u202f]/g, " ").replace(/\u2019/g, "'");

async function previewText(page) {
  return norm(await page.evaluate(() => document.querySelector("#doc-root").innerText));
}

async function pageCount(page) {
  return page.locator("#doc-root .doc-page").count();
}

// Waits until the debounced preview has caught up with the last input.
async function settle(page) {
  await page.waitForTimeout(450);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: false });
}

async function assertNoHorizontalScroll(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(scrollWidth <= clientWidth, `${label}: horizontal scroll (${scrollWidth} > ${clientWidth})`);
}

function pdfInfo(buffer) {
  const text = buffer.toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  return { pages, width: box ? Number(box[1]) : 0, height: box ? Number(box[2]) : 0 };
}

async function savePdf(page, name) {
  await page.emulateMedia({ media: "print" });
  // In print the pages must sit at x=0 with full A4 width, otherwise Chrome shrinks them to fit.
  const box = await page.locator("#doc-root .doc-page").first().boundingBox();
  assert.ok(Math.abs(box.x) < 1 && Math.abs(box.width - 793.7) < 1.5, `print layout at x=0, A4 wide (got x=${box.x}, w=${box.width})`);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: "screen" });
  await writeFile(path.join(screenshotDir, `${name}.pdf`), pdf);
  return pdfInfo(pdf);
}

// --------------------------------------------------------------------------- scenarios

async function desktopFlow(browser, url) {
  const { context, page } = await newPage(browser, { viewport: { width: 1440, height: 1000 } });
  await page.goto(url);
  await page.waitForSelector("body[data-ready]");
  assert.ok(await page.locator("#setup-banner").isVisible(), "setup banner shown without settings");
  assert.equal(await pageCount(page), 4, "empty offer: cover, letter, why, prices");
  await shot(page, "01-start");

  // Import the (fake) settings file
  const chooser = page.waitForEvent("filechooser");
  await page.click("#banner-import");
  await (await chooser).setFiles(SETTINGS_FIXTURE);
  await page.waitForSelector("#setup-banner", { state: "hidden" });
  await settle(page);

  // Customer
  await page.getByLabel("Firma", { exact: true }).fill("Beispiel GmbH");
  await page.getByRole("radio", { name: "Frau" }).first().check();
  await page.getByLabel("Vorname", { exact: true }).fill("Maria");
  await page.getByLabel("Nachname", { exact: true }).fill("Muster");
  await page.getByLabel("Ansprechpartner/in").selectOption("t-kim");

  // Vehicle from the catalog replaces the empty starter vehicle
  await page.getByLabel("Fahrzeugkatalog").selectOption("cat-1");
  await settle(page);
  assert.equal(await page.locator(".card .card-title", { hasText: "TESTMARKE Kombi Sportline" }).count(), 1);

  // Second vehicle, prices pasted from a spreadsheet (2 rows × 2 columns)
  await page.getByRole("button", { name: "＋ Fahrzeug hinzufügen" }).click();
  const card = page.locator("#sec-vehicles .card").nth(1);
  await card.getByLabel("Modell").fill("TESTMARKE Kompakt Style");
  await card.locator(".price-grid tbody input").first().evaluate((input) => {
    const data = new DataTransfer();
    data.setData("text/plain", "520\t590\n480\t550\n");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await settle(page);

  let text = await previewText(page);
  for (const expected of [
    "Ihre Offerte",
    "Frau",
    "Maria Muster",
    "Sehr geehrte Frau Muster",
    "zu den gewünschten Fahrzeugen",
    "Kim Muster",
    "Key Account Managerin",
    "TESTMARKE Kombi Sportline",
    "2026 - Benzin - Automatik",
    "690 CHF",
    "810 CHF",
    "TESTMARKE Kompakt Style",
    "550 CHF",
    "Testpreis-Garantie",
    "Testkunden-Claim",
    "indikative Offerte ist 5 Tage gültig",
    "Alle Preise exkl. MwSt.",
  ]) {
    assert.ok(text.includes(norm(expected)), `offer preview contains «${expected}»`);
  }
  assert.equal(await page.locator("#doc-filename").textContent(), "Offerte Muster (Beispiel GmbH).pdf");
  assert.equal(await page.locator(".checklist.is-done").count(), 1, "checklist complete");
  await shot(page, "02-offer");

  // VAT both + insurance column
  await page.getByRole("radio", { name: "beides" }).check();
  await page.getByRole("radio", { name: "als Spalte" }).check();
  await settle(page);
  text = await previewText(page);
  assert.ok(text.includes("Preis inkl. MwSt."), "incl. VAT column");
  assert.ok(text.includes(norm(`${new Intl.NumberFormat("de-CH").format(Math.round(690 * 1.081))} CHF`)), "incl. VAT computed");
  assert.ok(text.includes("Insurance Upgrade"), "insurance column");

  // Optional options page
  await page.locator("#sec-pages summary").click();
  await page.getByLabel("Zusatzoptionen").check();
  await settle(page);
  assert.equal(await page.locator(".doc-page--options").count(), 1, "options page");
  assert.ok((await previewText(page)).includes("TESTOPTION"));

  // PDF: same number of A4 pages as the preview
  const offerPages = await pageCount(page);
  const offerPdf = await savePdf(page, "offer");
  assert.equal(offerPdf.pages, offerPages, `offer PDF pages (${offerPdf.pages}) = preview pages (${offerPages})`);
  assert.ok(Math.abs(offerPdf.width - 595.9) < 2 && Math.abs(offerPdf.height - 841.9) < 2, `A4 page size, got ${offerPdf.width}×${offerPdf.height}`);

  // French
  await page.getByRole("radio", { name: "Français" }).check();
  await settle(page);
  text = await previewText(page);
  assert.ok(text.includes("Votre offre") && text.includes("Bonjour Madame Muster,"), "French offer");
  await page.getByRole("radio", { name: "Deutsch" }).check();
  await settle(page);

  // E-mail text
  await page.click("#email-button");
  assert.equal(await page.inputValue("#email-subject"), "Ihre CARIFY Offerte – Beispiel GmbH");
  assert.match(await page.inputValue("#email-body"), /^Sehr geehrte Frau Muster/);
  await page.locator("#email-dialog .dialog-head button").click();

  // Contract from the offer
  await page.click("#contract-from-offer");
  await page.locator("#contract-options label", { hasText: /12 Monate · 1.750 km\/Monat · CHF.760/ }).first().locator("input").check();
  await page.click("#contract-create");
  await settle(page);
  assert.equal(await page.locator(".type-chip").textContent(), "Vertrag");
  await page.getByLabel("Vertragsnummer").fill("0123456");
  await page.getByLabel("Geplanter Abobeginn").fill("2026-11-01");
  await page.getByLabel("Strasse, Nr.").fill("Musterweg 5");
  await page.getByLabel("PLZ").fill("8000");
  await page.getByLabel("Ort", { exact: true }).fill("Zürich");
  await page.getByLabel("Insurance-Package").fill("PLUS");
  await settle(page);
  text = await previewText(page);
  for (const expected of [
    "Auto-Abo Vertrag",
    "Vertrag Nr. 0123456",
    "Muster Abo AG",
    "Teststrasse 1 | 9999 Testhausen | CH",
    "Beispiel GmbH",
    "Musterweg 5 | 8000 Zürich | CH",
    "TESTMARKE Kombi Sportline - Benzin & Automatik",
    "01.11.2026",
    "1’750",
    "CHF 760 pro Monat",
    "CHF 0.50 pro km",
    "14 Tage",
    "Unterschriften",
  ]) {
    assert.ok(text.includes(norm(expected)), `contract preview contains «${expected}»`);
  }
  assert.equal(await pageCount(page), 1, "contract fits on one page");
  assert.equal(await page.locator(".checklist.is-done").count(), 1, "contract checklist complete");
  assert.equal(await page.locator("#doc-filename").textContent(), "CARIFY Vertrag - Beispiel GmbH.pdf");
  const contractPdf = await savePdf(page, "contract");
  assert.equal(contractPdf.pages, 1, "contract PDF has one page");
  await shot(page, "03-contract");

  // Takeover variant
  await page.getByRole("radio", { name: "Übernahme" }).check();
  await settle(page);
  text = await previewText(page);
  assert.ok(text.includes("Vertragsanpassung") && text.includes("Der Abo-Nehmer übernimmt folgende Fahrzeuge:"), "takeover wording");
  assert.ok(text.includes("Änderungsdatum"), "takeover date label");

  // Drafts persist across reloads
  await page.reload();
  await page.waitForSelector("body[data-ready]");
  assert.equal(await page.locator(".type-chip").textContent(), "Vertragsanpassung (Übernahme)");
  await page.click("#drafts-button");
  assert.equal(await page.locator("#draft-list .draft").count(), 2, "two drafts");
  await page.locator("#draft-list .draft-open", { hasText: "Offerte · Beispiel GmbH" }).click();
  await settle(page);
  assert.equal(await page.locator(".type-chip").textContent(), "Offerte");
  await shot(page, "04-offer-reloaded");

  // Settings dialog: every tab renders
  await page.click("#settings-button");
  for (const tab of ["Firma", "Team", "Standards", "Texte", "Design", "Fahrzeugkatalog", "Daten & Import"]) {
    await page.locator("#settings-tabs button", { hasText: tab }).click();
    assert.ok((await page.locator("#settings-body").innerText()).length > 20, `settings tab ${tab}`);
  }
  await page.locator("#settings-tabs button", { hasText: "Texte" }).click();
  await shot(page, "05-settings");
  await page.locator("#settings-dialog .dialog-head button").click();

  await collectCsp(page);
  await context.close();
}

async function mobileFlow(browser, url) {
  const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(url);
  await page.waitForSelector("body[data-ready]");
  await assertNoHorizontalScroll(page, "mobile editor");
  await page.getByLabel("Firma", { exact: true }).fill("Mobil AG");
  await settle(page);
  // The preview is paginated even while its tab is hidden
  assert.equal(await pageCount(page), 4);
  await shot(page, "06-mobile-edit");
  await page.click("#tab-preview");
  await page.waitForTimeout(200);
  await assertNoHorizontalScroll(page, "mobile preview");
  assert.ok(await page.locator("#doc-root .doc-page").first().isVisible());
  await shot(page, "07-mobile-preview");
  await collectCsp(page);
  await context.close();
}

// --------------------------------------------------------------------------- main

await mkdir(screenshotDir, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await launch(chromium);
try {
  await desktopFlow(browser, server.url);
  await mobileFlow(browser, server.url);
  assert.deepEqual(problems.csp, [], "no CSP violations");
  assert.deepEqual(problems.console, [], "no console errors");
  console.log(`e2e ok – screenshots and PDFs in ${screenshotDir}`);
} finally {
  await browser.close();
  server.stop();
}
