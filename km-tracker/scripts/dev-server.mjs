#!/usr/bin/env node
// Zero-dependency local dev server (Node 22):
//   - serves ./public with the same security headers as netlify.toml
//   - mounts netlify/functions/data.mjs at its configured path (/api/data)
//
// Usage:
//   node scripts/dev-server.mjs [--port 8888] [--password <min. 16 Zeichen>] [--fixture test/fixtures/web_sample_3.csv]
//                               [--title "KM-Tracking"] [--contact <e-mail>]
//
// Env vars (CLI flags win): PORT, HOST, DASHBOARD_PASSWORD, DASHBOARD_TITLE, CONTACT_EMAIL,
//   SHEET_CSV_URL (http(s) URL or file:// path), FIXTURE_CSV (local CSV path).
//
// Test-only hook: with FIXTURE_CSV (or a file:// SHEET_CSV_URL) the global fetch is stubbed
// so that the function reads the local CSV. The function itself stays untouched.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

const { values: args } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string" },
    password: { type: "string" },
    fixture: { type: "string" },
    sheet: { type: "string" },
    title: { type: "string" },
    contact: { type: "string" },
  },
  allowPositionals: false,
});

if (args.password) process.env.DASHBOARD_PASSWORD = args.password;
if (args.title) process.env.DASHBOARD_TITLE = args.title;
if (args.contact) process.env.CONTACT_EMAIL = args.contact;
if (args.sheet) process.env.SHEET_CSV_URL = args.sheet;
if (args.fixture) process.env.FIXTURE_CSV = args.fixture;

const DEV_PASSWORD = "lokal-demo-passwort"; // local only – the function refuses < 16 chars
if (!process.env.DASHBOARD_PASSWORD) {
  process.env.DASHBOARD_PASSWORD = DEV_PASSWORD;
  console.log(`[dev] DASHBOARD_PASSWORD not set – using "${DEV_PASSWORD}"`);
}
if (!process.env.SHEET_CSV_URL && !process.env.FIXTURE_CSV) {
  process.env.FIXTURE_CSV = path.join(root, "test", "fixtures", "web_sample_1.csv");
}

// ---------------------------------------------------------------------------
// Test-only fetch stub for local CSV files
// ---------------------------------------------------------------------------

const FIXTURE_URL = "https://fixture.invalid/web.csv";
let fixturePath = null;

if (process.env.FIXTURE_CSV) {
  fixturePath = path.resolve(process.cwd(), process.env.FIXTURE_CSV);
  process.env.SHEET_CSV_URL = FIXTURE_URL;
} else if (process.env.SHEET_CSV_URL.startsWith("file:")) {
  fixturePath = fileURLToPath(process.env.SHEET_CSV_URL);
  process.env.SHEET_CSV_URL = FIXTURE_URL;
}

if (fixturePath) {
  if (!existsSync(fixturePath)) {
    console.error(`[dev] fixture not found: ${fixturePath}`);
    process.exit(1);
  }
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url === FIXTURE_URL) {
      const text = await readFile(fixturePath, "utf8");
      return new Response(text, { status: 200, headers: { "content-type": "text/csv" } });
    }
    return realFetch(input, init);
  };
  console.log(`[dev] serving sheet data from fixture ${path.relative(root, fixturePath)}`);
}

// ---------------------------------------------------------------------------
// Security headers from netlify.toml (single source of truth)
// ---------------------------------------------------------------------------

function readNetlifyHeaders() {
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  const headers = {};
  let inValues = false;
  for (const line of toml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      inValues = trimmed === "[headers.values]";
      continue;
    }
    if (!inValues) continue;
    const m = /^([A-Za-z0-9-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(trimmed);
    if (m) headers[m[1].toLowerCase()] = m[2].replace(/\\"/g, '"');
  }
  return headers;
}

const securityHeaders = readNetlifyHeaders();

// ---------------------------------------------------------------------------
// Function mount
// ---------------------------------------------------------------------------

const fnModule = await import(pathToFileURL(path.join(root, "netlify", "functions", "data.mjs")).href);
const fnPath = fnModule.config?.path ?? "/api/data";
const fnHandler = fnModule.default;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function serveFunction(req, res, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value !== undefined) headers.set(key, value);
  }
  const request = new Request(url, { method: req.method, headers });
  let response;
  try {
    response = await fnHandler(request, {});
  } catch (err) {
    console.error("[dev] function crashed:", err);
    response = new Response(JSON.stringify({ error: "crash" }), { status: 500 });
  }
  const outHeaders = { ...securityHeaders };
  response.headers.forEach((value, key) => {
    outHeaders[key] = value;
  });
  res.writeHead(response.status, outHeaders);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { ...securityHeaders, allow: "GET, HEAD" });
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = "/";
  }
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir + path.sep)) {
    res.writeHead(403, securityHeaders);
    return res.end("Forbidden");
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders,
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { ...securityHeaders, "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  try {
    if (url.pathname === fnPath) await serveFunction(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error("[dev] request failed:", err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

const port = Number(args.port ?? process.env.PORT ?? 8888);
const host = args.host ?? process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  const address = server.address();
  console.log(`[dev] listening on http://${host}:${address.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
