#!/usr/bin/env node
// Zero-dependency local dev server (Node 22): serves ./public with the same security headers
// as netlify.toml, so CSP problems show up locally and not only after the deploy.
//
// Usage:
//   node scripts/dev-server.mjs [--port 8899] [--host 127.0.0.1]
//
// Env vars (CLI flags win): PORT, HOST.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");

const { values: args } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string" },
  },
  allowPositionals: false,
});

const port = Number(args.port ?? process.env.PORT ?? 8899);
const host = args.host ?? process.env.HOST ?? "127.0.0.1";

// Headers are read from netlify.toml (`Key = "value"` lines in [headers.values]).
function netlifyHeaders() {
  const toml = readFileSync(path.join(root, "netlify.toml"), "utf8");
  const block = toml.split("[headers.values]")[1] ?? "";
  const headers = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
    if (m) headers[m[1]] = m[2];
  }
  return headers;
}

const HEADERS = netlifyHeaders();

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.resolve(publicDir, "." + rel);
    if (!file.startsWith(publicDir + path.sep)) {
      res.writeHead(403, HEADERS).end("Forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      res.writeHead(404, { ...HEADERS, "content-type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      ...HEADERS,
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (err) {
    console.error(err);
    res.writeHead(500, HEADERS).end("Server error");
  }
});

server.listen(port, host, () => {
  console.log(`[dev] CARIFY Offerten & Verträge listening on http://${host}:${port}`);
});
