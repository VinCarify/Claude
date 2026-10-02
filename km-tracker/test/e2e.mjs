#!/usr/bin/env node
// End-to-end test with Playwright (uses a globally installed playwright, no npm deps).
//
//   node test/e2e.mjs
//
// Env:
//   SCREENSHOT_DIR            where to write screenshots (default: <os tmp>/km-tracker-screens)
//   PLAYWRIGHT_BROWSERS_PATH  defaults to /opt/pw-browsers
//   PLAYWRIGHT_MODULE         optional absolute path to the playwright package
//
// Never runs "playwright install".

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = process.env.SCREENSHOT_DIR || path.join(os.tmpdir(), "km-tracker-screens");
const PASSWORD = "e2e-only-password";
const TITLE = "Demo KM-Tracking";
const CONTACT = ["hallo", "example.test"].join("@");

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

async function startServer(fixture) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(root, "scripts", "dev-server.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      FIXTURE_CSV: path.join(root, "test", "fixtures", fixture),
      SHEET_CSV_URL: "",
      DASHBOARD_PASSWORD: PASSWORD,
      DASHBOARD_TITLE: TITLE,
      CONTACT_EMAIL: CONTACT,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev server did not start:\n${output}`)), 10_000);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`dev server exited (${code}):\n${output}`));
    });
  });
  return { url: `http://127.0.0.1:${port}/`, stop: () => child.kill("SIGTERM") };
}

// --------------------------------------------------------------------------- helpers

const nf = new Intl.NumberFormat("de-CH");
const fmt = (n) => nf.format(n);

function watchPage(page, bucket) {
  page.on("console", (msg) => {
    if (msg.type() === "error") bucket.console.push(msg.text());
  });
  page.on("pageerror", (err) => bucket.console.push(`pageerror: ${err.message}`));
}

async function newPage(browser, options, bucket) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const page = await context.newPage();
  watchPage(page, bucket);
  return { context, page };
}

async function collectCsp(page, bucket) {
  const list = await page.evaluate(() => window.__cspViolations || []);
  bucket.csp.push(...list);
}

async function login(page, password) {
  await page.fill("#password", password);
  await page.click("#login-submit");
}

async function assertNoHorizontalScroll(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(scrollWidth <= clientWidth, `${label}: horizontal scroll (${scrollWidth} > ${clientWidth})`);
}

// Units are joined with non-breaking spaces in the UI; compare with plain spaces.
async function bodyText(page) {
  return page.evaluate(() => document.body.innerText.replace(/\u00a0/g, " "));
}

// --------------------------------------------------------------------------- scenarios

const SCENARIOS = [
  {
    fixture: "web_sample_1.csv",
    name: "1-vehicle",
    expect: [
      "Demo SUV 2.0 Automatik",
      "XX 000 001",
      "Aktiv",
      "Stand: 28.09.2026",
      `${fmt(8460)} km gefahren`,
      `${fmt(10500)} km inklusive bis heute`,
      `Alles im grünen Bereich – du hast noch ${fmt(2040)} km Puffer.`,
      "Ø pro Monat",
      "Mindestlaufzeit",
      "noch 5 Monate",
      "bis 15.03.2027",
      "Prognose Laufzeitende",
      `${fmt(2320)} km Puffer`,
      "Preis pro Mehrkilometer",
      "nur für km über deinem Paket",
      "CHF 0.73 / km",
      "Dein Verlauf",
      "Inklusive km",
      "Gefahren",
      "Prognose",
      "Kennzeichen",
      "KM-Paket",
      `${fmt(1500)} km / Monat`,
      "Versicherung",
      "Premium",
      "Preis / Monat",
      `CHF ${fmt(1193)}`,
      `15.03.2026 · ${fmt(12000)} km`,
      `28.09.2026 · ${fmt(20460)} km`,
      "12 Monate",
      "Mindestlaufzeit bis",
      "Prognose: wenn du so weiterfährst wie bisher.",
      "Mehrkilometer werden am Ende der Laufzeit abgerechnet. Alle Angaben ohne Gewähr – massgebend ist die Schlussabrechnung.",
    ],
    absent: ["Tipp:", "Deine Flotte", "Du liegst", "Mehrkilometer-Depot", "Extra-km-Preis", "-0"],
  },
  {
    fixture: "web_sample_3.csv",
    name: "3-vehicles",
    expect: [
      "Deine Flotte",
      "3",
      "Fahrzeuge",
      fmt(18800),
      "km gefahren",
      "Fahrzeug über Paket",
      `${fmt(2400)} km über Paket`,
      "Noch kein KM-Stand",
      "Demo Kombi 1.5 Automatik",
      "Demo Stromer Long Range",
      "Demo Cabrio 1.0 Turbo",
      "Gekündigt",
      `Alles im grünen Bereich – du hast noch ${fmt(2900)} km Puffer.`,
      // deposit (CHF 500 = 632 km) is subtracted: 1'768 km × 0.79 = CHF 1'397
      `Du liegst ${fmt(2400)} km über deinem Paket. Kein Stress: Mehrkilometer werden erst am Ende der Laufzeit abgerechnet (Stand heute noch offen: ca. CHF ${fmt(1397)}).`,
      `Dein Mehrkilometer-Depot von CHF 500 deckt davon bereits ${fmt(632)} km ab – offen sind noch ${fmt(1768)} km.`,
      `${fmt(3756)} km drüber`,
      // (3'756 − 632) km × 0.79
      `ca. CHF ${fmt(2468)} Mehrkosten nach Depot`,
      `Tipp: Mit dem ${fmt(1500)}-km-Paket bist du auf der sicheren Seite. Schreib uns – wir passen das gerne für dich an.`,
      "Noch kein KM-Stand da – sobald wir einen haben, siehst du hier deinen Verlauf.",
      "CHF 0.79 / km",
      // car without checkpoint still shows the checkpoint-independent values
      "Inklusive bis heute",
      `${fmt(4000)} km`,
      "noch 4 Monate",
      "bis 20.02.2027",
      "CHF 0.49 / km",
      "Mehrkilometer-Depot",
    ],
    absent: ["NaN", "undefined", "null", "-0", "Mehrkilometer · ", `CHF ${fmt(1896)}`],
  },
  {
    fixture: "web_sample_edge.csv",
    name: "edge",
    expect: [
      // 6-digit fleet total
      fmt(116500),
      "km gefahren",
      "1",
      "Fahrzeug über Paket",
      `${fmt(7000)} km über Paket`,
      "Punktgenau im Paket",
      `${fmt(500)} km über Paket\ndurch Depot gedeckt`,
      `${fmt(2000)} km Puffer`,
      `${fmt(3000)} km Puffer`,
      `Du liegst ${fmt(7000)} km über deinem Paket. Kein Stress: Mehrkilometer werden erst am Ende der Laufzeit abgerechnet (Stand heute ca. CHF ${fmt(2240)}).`,
      // diff_km = 0
      "Punktgenau im Paket – du bist genau auf deinen Inklusiv-Kilometern.",
      "0 km Puffer",
      // deposit covers everything
      "Du liegst 500 km über deinem Paket. Kein Stress: Dein Mehrkilometer-Depot von CHF 500 deckt das komplett ab. Im Depot sind sogar noch 125 km übrig.",
      `${fmt(1700)} km drüber`,
      "ca. CHF 860 Mehrkosten nach Depot",
      `Tipp: Mit dem ${fmt(1500)}-km-Paket`,
      // minimum term already over
      "Bilanz heute",
      "seit 01.01.2025",
      // unbroken amounts in details
      `13.09.2026 · ${fmt(143000)} km`,
    ],
    absent: ["NaN", "undefined", "null", "-0", "Stand heute ca. CHF 400"],
  },
];

async function runScenario(browser, playwright, scenario) {
  const server = await startServer(scenario.fixture);
  const bucket = { console: [], csp: [] };
  const shots = [];
  try {
    // ---------------- desktop light: login flow + content
    {
      const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: "light" }, bucket);
      const headers = (await page.goto(server.url)).headers();
      assert.match(headers["content-security-policy"] || "", /default-src 'self'/, "CSP header present");
      assert.equal(headers["x-frame-options"], "DENY");

      await page.waitForSelector("#view-login:not([hidden])");
      assert.equal((await page.textContent("#login-title")).trim(), "CARIFY · KM-Tracking");
      assert.equal((await page.textContent("#login-submit")).trim(), "Los geht’s");
      assert.equal(await page.isEnabled("#login-submit"), true, "app.js enables the submit button");
      assert.equal(await page.isVisible("#header-title"), false, "title hidden before login");
      assert.equal(await page.isVisible("#logout"), false, "logout hidden before login");
      shots.push(await shot(page, `${scenario.name}-login-desktop-light`));

      // wrong password first
      await login(page, "definitely-wrong");
      await page.waitForFunction(
        () => document.querySelector("#login-error")?.textContent.includes("Hoppla"),
        null,
        { timeout: 5000 },
      );
      assert.equal(
        (await page.textContent("#login-error")).trim(),
        "Hoppla, das Passwort stimmt leider nicht.",
      );
      assert.equal(await page.getAttribute("#password", "aria-invalid"), "true");
      assert.equal(await page.isVisible("#view-dashboard"), false);

      // correct password
      await login(page, PASSWORD);
      await page.waitForSelector("#view-dashboard:not([hidden]) .vehicle");
      await page.waitForSelector(".chart-svg");
      assert.equal((await page.textContent("#header-title")).trim(), TITLE);
      assert.equal(await page.isVisible("#logout"), true);

      const text = await bodyText(page);
      for (const needle of scenario.expect) {
        assert.ok(text.includes(needle), `${scenario.name}: expected text "${needle}"`);
      }
      for (const needle of scenario.absent) {
        assert.ok(!text.includes(needle), `${scenario.name}: unexpected text "${needle}"`);
      }
      assert.ok(!text.includes(PASSWORD), "password must never be rendered");

      if (scenario.name === "3-vehicles") {
        const href = await page.getAttribute(".tip a", "href");
        assert.ok(href && href.startsWith(`mailto:${CONTACT}`), "tip has mailto link");
        assert.equal(await page.locator(".vehicle").count(), 3);
        assert.equal(await page.locator(".chart-svg").count(), 2, "no chart without checkpoint");
        assert.equal(await page.locator(".kpis--basic .kpi").count(), 3, "reduced KPIs without checkpoint");
      }
      if (scenario.name === "edge") {
        assert.equal(await page.locator(".vehicle").count(), 5);
        assert.equal(await page.locator(".chart-svg").count(), 5);
        // forecast caption only where there is a forecast (not: term over / no projection)
        assert.equal(await page.locator(".chart-caption").count(), 3, "caption only with forecast");
        assert.equal(await page.locator(".callout--warn").count(), 1, "deposit-covered car is not orange");
        // chart without projection: last key is "Stand", tooltip has no empty rows
        const lastPlot = page.locator(".chart-plot").nth(4);
        await lastPlot.scrollIntoViewIfNeeded();
        await lastPlot.focus();
        await page.keyboard.press("End");
        const lastTip = await lastPlot.locator(".chart-tip").textContent();
        assert.ok(lastTip.startsWith("Stand"), `no term-end key without forecast (${lastTip})`);
        assert.ok(!lastTip.includes("–"), `tooltip without empty rows (${lastTip})`);
        await page.keyboard.press("Escape");
      }

      // chart accessibility + hover layer
      const svgTitle = await page.locator(".chart-svg title").first().textContent();
      assert.ok(svgTitle.startsWith("KM-Verlauf"), "chart has <title>");
      assert.ok((await page.locator(".chart-svg desc").first().textContent()).length > 20, "chart has <desc>");
      const plot = page.locator(".chart-plot").first();
      await plot.scrollIntoViewIfNeeded();
      const box = await plot.boundingBox();
      await plot.hover({ position: { x: Math.round(box.width * 0.55), y: Math.round(box.height * 0.5) } });
      await page.waitForSelector(".chart-tip:not([hidden])", { timeout: 5000 });
      await plot.focus();
      await page.keyboard.press("End");
      const tipText = await page.locator(".chart-tip").first().textContent();
      assert.ok(tipText.includes("Laufzeitende"), "keyboard moves to term end");
      await page.mouse.move(0, 0);
      await page.locator("#dash-title").focus();

      shots.push(await shot(page, `${scenario.name}-desktop-light`, true));

      // reload keeps the session (sessionStorage)
      await page.reload();
      await page.waitForSelector("#view-dashboard:not([hidden]) .vehicle");
      assert.equal((await page.textContent("#header-title")).trim(), TITLE);

      // logout
      await page.click("#logout");
      await page.waitForSelector("#view-login:not([hidden])");
      assert.equal(await page.isVisible("#header-title"), false);
      assert.equal(await page.evaluate(() => sessionStorage.length), 0, "logout clears storage");
      await page.reload();
      await page.waitForSelector("#view-login:not([hidden])");

      await collectCsp(page, bucket);
      await context.close();
    }

    // ---------------- mobile light (390) + 360 overflow checks
    {
      const { context, page } = await newPage(
        browser,
        { ...playwright.devices["iPhone 13"], browserName: undefined, defaultBrowserType: undefined, colorScheme: "light" },
        bucket,
      );
      await page.goto(server.url);
      await page.waitForSelector("#view-login:not([hidden])");
      shots.push(await shot(page, `${scenario.name}-login-mobile-light`));
      await login(page, PASSWORD);
      await page.waitForSelector("#view-dashboard:not([hidden]) .chart-svg");
      // Playwright's full-page capture briefly drops touch emulation ((hover: hover) turns true);
      // park the pointer on empty space so the tap position doesn't leave a hover state in the shots.
      await page.mouse.move(1, 1);
      await assertNoHorizontalScroll(page, `${scenario.name} 390px`);
      shots.push(await shot(page, `${scenario.name}-mobile-light`, true));

      await page.setViewportSize({ width: 360, height: 780 });
      await page.waitForTimeout(150);
      await assertNoHorizontalScroll(page, `${scenario.name} 360px dashboard`);
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll(".fleet-value")]
          .filter((el) => el.offsetHeight > parseFloat(getComputedStyle(el).lineHeight) * 1.5)
          .map((el) => el.textContent),
      );
      assert.deepEqual(wrapped, [], `${scenario.name} 360px: fleet numbers must not wrap`);
      shots.push(await shot(page, `${scenario.name}-mobile-360-light`, true));
      await page.click("#logout");
      await page.waitForSelector("#view-login:not([hidden])");
      await assertNoHorizontalScroll(page, `${scenario.name} 360px login`);

      await collectCsp(page, bucket);
      await context.close();
    }

    // ---------------- desktop dark
    {
      const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 900 }, colorScheme: "dark" }, bucket);
      await page.goto(server.url);
      await page.waitForSelector("#view-login:not([hidden])");
      shots.push(await shot(page, `${scenario.name}-login-desktop-dark`));
      await login(page, PASSWORD);
      await page.waitForSelector("#view-dashboard:not([hidden]) .chart-svg");
      await page.locator("#dash-title").focus();
      shots.push(await shot(page, `${scenario.name}-desktop-dark`, true));
      await collectCsp(page, bucket);
      await context.close();
    }

    // ---------------- mobile dark (extra)
    {
      const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 }, bucket);
      await page.goto(server.url);
      await login(page, PASSWORD);
      await page.waitForSelector("#view-dashboard:not([hidden]) .chart-svg");
      await assertNoHorizontalScroll(page, `${scenario.name} 390px dark`);
      shots.push(await shot(page, `${scenario.name}-mobile-dark`, true));
      await collectCsp(page, bucket);
      await context.close();
    }

    // 401 responses are logged by Chrome as "Failed to load resource" – expected for the wrong-password step.
    const unexpected = bucket.console.filter((m) => !/status of 401/.test(m));
    assert.deepEqual(unexpected, [], `${scenario.name}: console errors`);
    assert.deepEqual(bucket.csp, [], `${scenario.name}: CSP violations`);
    return shots;
  } finally {
    server.stop();
  }
}

async function shot(page, name, fullPage = false) {
  const file = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}

// --------------------------------------------------------------------------- password never in URL

async function checkPasswordNeverInUrl(browser) {
  const server = await startServer("web_sample_1.csv");
  const secret = "url-leak-check-123";
  try {
    // JS disabled: the submit button stays disabled and the input has no name → no native GET.
    {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(server.url);
      assert.equal(await page.getAttribute("#password", "name"), null, "password input has no name");
      assert.equal(await page.isDisabled("#login-submit"), true, "submit disabled without JS");
      await page.fill("#password", secret);
      await page.press("#password", "Enter");
      await page.waitForTimeout(300);
      assert.ok(!page.url().includes(secret) && !page.url().includes("password="), `no JS: ${page.url()}`);
      await context.close();
    }
    // Old bookmark with ?password=… is cleaned up at boot.
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${server.url}?password=${secret}`);
      await page.waitForSelector("#view-login:not([hidden])");
      assert.equal(new URL(page.url()).search, "", `query stripped: ${page.url()}`);
      await context.close();
    }
  } finally {
    server.stop();
  }
}

// --------------------------------------------------------------------------- main

const playwright = await loadPlaywright();
await mkdir(screenshotDir, { recursive: true });
const browser = await launch(playwright.chromium);
let failed = false;
const allShots = [];
try {
  try {
    await checkPasswordNeverInUrl(browser);
    console.log("ok   password-never-in-url");
  } catch (err) {
    failed = true;
    console.error(`FAIL password-never-in-url\n${err.stack || err}`);
  }
  for (const scenario of SCENARIOS) {
    try {
      const shots = await runScenario(browser, playwright, scenario);
      allShots.push(...shots);
      console.log(`ok   ${scenario.name}`);
    } catch (err) {
      failed = true;
      console.error(`FAIL ${scenario.name}\n${err.stack || err}`);
    }
  }
} finally {
  await browser.close();
}
console.log(`\nScreenshots (${allShots.length}) in ${screenshotDir}:`);
for (const file of allShots) console.log(`  ${file}`);
if (failed) {
  console.error("\ne2e: FAILED");
  process.exit(1);
}
console.log("\ne2e: all scenarios passed");
