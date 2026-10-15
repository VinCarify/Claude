// Netlify Function (v2): GET /api/data
//
// Liefert die KM-Daten aus dem veröffentlichten CSV des Sheet-Tabs "web" –
// aber nur mit gültigem Passwort (Header "Authorization: Bearer <passwort>").
//
// Env vars:
//   SHEET_CSV_URL       (required) published CSV URL of the sheet tab "web"
//   DASHBOARD_PASSWORD  (required) shared dashboard password, set in Netlify
//   DASHBOARD_TITLE     (optional) header title shown after login
//   CONTACT_EMAIL       (optional) used for the mailto link in the tip box
//
// Hardening (see README.md): Netlify rate limiting in `config` below, and the
// function only serves data in the production / local dev context. The real
// guard against fork deploy previews is scoping both secrets to "Production".
//
// No dependencies: global fetch + node:crypto only.

import { createHash, timingSafeEqual } from "node:crypto";

/** Exact column order of the sheet tab "web" (the data contract). */
export const CONTRACT = Object.freeze([
  "vehicle",
  "plate",
  "status",
  "insurance",
  "km_package",
  "min_duration_months",
  "min_duration_left",
  "months_elapsed",
  "monthly_price_chf",
  "handover_date",
  "handover_km",
  "segment_start",
  "min_term_end",
  "checkpoint_date",
  "checkpoint_type",
  "current_km",
  "driven_km",
  "included_km",
  "diff_km",
  "extra_km_price_rp",
  "extra_km_cost_chf",
  "deposit_chf",
  "open_extra_km",
  "avg_km_month",
  "projected_km_end",
  "included_km_end",
  "projected_diff_end",
  "projected_cost_end_chf",
  "recommended_package",
]);

/** Text columns; every other contract column is an integer (dates are serials). */
export const TEXT_KEYS = Object.freeze(["vehicle", "plate", "status", "insurance", "checkpoint_type"]);

const TEXT_SET = new Set(TEXT_KEYS);
const MAX_TEXT_LENGTH = 120;
const MAX_VEHICLES = 50;
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60_000;
const FAIL_DELAY_MS = 400;
export const MIN_PASSWORD_LENGTH = 1;
// Deploy contexts that may serve data ("dev" = netlify dev). Unknown/absent
// context (local dev server, tests) is allowed.
const ALLOWED_CONTEXTS = new Set(["production", "dev"]);

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and line
 * breaks inside quotes, CRLF / LF / CR line endings, optional UTF-8 BOM.
 * Returns an array of rows (arrays of strings).
 */
export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  // Last line without trailing newline
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Locale-proof integer conversion: keeps only digits and a leading minus
 * ("1'234" → 1234, "-2 713" → -2713, "" → null).
 */
export function toInt(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  const negative = /^[-−]/.test(s);
  const digits = s.replace(/\D+/g, "");
  if (digits === "" || digits.length > 15) return null;
  const n = Number.parseInt(digits, 10);
  return negative && n !== 0 ? -n : n;
}

function cleanText(value) {
  const s = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .trim();
  if (s === "") return null;
  return s.slice(0, MAX_TEXT_LENGTH);
}

/**
 * Maps parsed CSV rows (first row = header) to vehicle objects.
 * Only whitelisted CONTRACT keys survive; numeric/date keys become integers.
 * Rows without vehicle or plate (e.g. blank padding rows) are dropped.
 * Throws if the header does not contain the required columns.
 */
export function toVehicles(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("csv_empty");
  }
  const header = rows[0].map((h) =>
    String(h ?? "")
      .replace(/^﻿/, "")
      .trim()
      .toLowerCase(),
  );
  const index = new Map();
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i);
  });
  if (!index.has("vehicle") || !index.has("plate")) {
    throw new Error("csv_header");
  }

  const vehicles = [];
  for (const row of rows.slice(1)) {
    if (vehicles.length >= MAX_VEHICLES) break;
    const out = {};
    for (const key of CONTRACT) {
      const i = index.get(key);
      const raw = i === undefined ? "" : row[i];
      out[key] = TEXT_SET.has(key) ? cleanText(raw) : toInt(raw);
    }
    if (!out.vehicle || !out.plate) continue;
    vehicles.push(out);
  }
  return vehicles;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest();
}

/**
 * Constant-time password check against "Authorization: Bearer <password>".
 */
export function checkAuth(authorizationHeader, password) {
  if (typeof password !== "string" || password === "") return false;
  if (typeof authorizationHeader !== "string") return false;
  const match = /^bearer (.+)$/is.exec(authorizationHeader);
  const supplied = match ? match[1] : "";
  // Always hash + compare (also for malformed headers) to keep timing uniform.
  const ok = timingSafeEqual(sha256(supplied), sha256(password));
  return ok && match !== null;
}

// ---------------------------------------------------------------------------
// Upstream fetch with small in-memory cache
// ---------------------------------------------------------------------------

let cache = { url: null, at: 0, vehicles: null };
let inflight = null;

/** Test hook: forget cached sheet data. */
export function resetCache() {
  cache = { url: null, at: 0, vehicles: null };
  inflight = null;
}

async function fetchVehicles(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: { accept: "text/csv, text/plain;q=0.9" },
  });
  if (!res.ok) throw new Error(`upstream_status_${res.status}`);
  const text = await res.text();
  // An unpublished sheet answers with an HTML login page – treat as failure.
  if (/^\s*</.test(text)) throw new Error("upstream_html");
  return toVehicles(parseCsv(text));
}

async function loadVehicles(url) {
  const now = Date.now();
  if (cache.vehicles && cache.url === url && now - cache.at < CACHE_TTL_MS) {
    return cache;
  }
  if (inflight && inflight.url === url) return inflight.promise;

  const promise = fetchVehicles(url)
    .then((vehicles) => {
      cache = { url, at: Date.now(), vehicles };
      return cache;
    })
    .finally(() => {
      if (inflight && inflight.promise === promise) inflight = null;
    });
  inflight = { url, promise };
  return promise;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function deployContext(context) {
  const value = context?.deploy?.context ?? process.env.CONTEXT;
  return typeof value === "string" && value !== "" ? value : null;
}

export default async function handler(req, context) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { allow: "GET, OPTIONS", "cache-control": "no-store" },
    });
  }
  if (req.method !== "GET") {
    return json(405, { error: "method_not_allowed" }, { allow: "GET, OPTIONS" });
  }

  const sheetUrl = process.env.SHEET_CSV_URL;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!sheetUrl || !password || password.length < MIN_PASSWORD_LENGTH) {
    return json(500, { error: "not_configured" });
  }
  const ctx = deployContext(context);
  if (ctx && !ALLOWED_CONTEXTS.has(ctx)) {
    return json(500, { error: "not_configured" });
  }

  if (!checkAuth(req.headers.get("authorization"), password)) {
    await sleep(FAIL_DELAY_MS);
    return json(401, { error: "unauthorized" });
  }

  let data;
  try {
    data = await loadVehicles(sheetUrl);
  } catch {
    return json(502, { error: "upstream" });
  }

  const title = (process.env.DASHBOARD_TITLE || "").trim() || "KM-Tracking";
  const contactEmail = (process.env.CONTACT_EMAIL || "").trim() || null;

  return json(200, {
    title,
    contactEmail,
    generatedAt: new Date(data.at).toISOString(),
    vehicles: data.vehicles,
  });
}

// Netlify code-based rate limiting: max 20 requests per minute per IP + domain
// (answers 429). The 400 ms delay above only slows single attempts.
export const config = {
  path: "/api/data",
  rateLimit: {
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
