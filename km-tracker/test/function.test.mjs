// Unit tests for netlify/functions/data.mjs (node:test, no dependencies).
// All data here is fake.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import handler, {
  CONTRACT,
  MIN_PASSWORD_LENGTH,
  checkAuth,
  config,
  parseCsv,
  resetCache,
  toInt,
  toVehicles,
} from "../netlify/functions/data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFile(path.join(here, "fixtures", name), "utf8");

const PASSWORD = "test-only-password";
const SHEET_URL = "https://sheet.invalid/web.csv";
const ENV_KEYS = ["SHEET_CSV_URL", "DASHBOARD_PASSWORD", "DASHBOARD_TITLE", "CONTACT_EMAIL", "CONTEXT"];

const realFetch = globalThis.fetch;
let savedEnv;
let fetchCalls;

function stubFetch(impl) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push(String(url));
    return impl(url, init);
  };
}

function csvResponse(text, status = 200) {
  return new Response(text, { status, headers: { "content-type": "text/csv" } });
}

function request(method = "GET", authorization) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("http://localhost/api/data", { method, headers });
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SHEET_CSV_URL = SHEET_URL;
  process.env.DASHBOARD_PASSWORD = PASSWORD;
  delete process.env.DASHBOARD_TITLE;
  delete process.env.CONTACT_EMAIL;
  delete process.env.CONTEXT;
  resetCache();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  globalThis.fetch = realFetch;
  resetCache();
});

// ---------------------------------------------------------------------------

describe("config", () => {
  test("mounts at /api/data", () => {
    assert.equal(config.path, "/api/data");
  });

  test("declares Netlify rate limiting per IP", () => {
    assert.equal(config.rateLimit.windowSize, 60);
    assert.ok(config.rateLimit.windowLimit > 0 && config.rateLimit.windowLimit <= 30);
    assert.ok(config.rateLimit.aggregateBy.includes("ip"));
  });

  test("contract has the 29 documented keys in order", () => {
    assert.equal(CONTRACT.length, 29);
    assert.equal(CONTRACT[0], "vehicle");
    assert.equal(CONTRACT.at(-1), "recommended_package");
  });
});

describe("checkAuth", () => {
  test("accepts the correct bearer password", () => {
    assert.equal(checkAuth(`Bearer ${PASSWORD}`, PASSWORD), true);
  });

  test("bearer scheme is case-insensitive", () => {
    assert.equal(checkAuth(`bearer ${PASSWORD}`, PASSWORD), true);
  });

  test("rejects wrong, missing and malformed credentials", () => {
    assert.equal(checkAuth("Bearer nope", PASSWORD), false);
    assert.equal(checkAuth(`Bearer ${PASSWORD}x`, PASSWORD), false);
    assert.equal(checkAuth(undefined, PASSWORD), false);
    assert.equal(checkAuth(null, PASSWORD), false);
    assert.equal(checkAuth("", PASSWORD), false);
    assert.equal(checkAuth(PASSWORD, PASSWORD), false);
    assert.equal(checkAuth(`Basic ${PASSWORD}`, PASSWORD), false);
  });

  test("never accepts anything when no password is configured", () => {
    assert.equal(checkAuth("Bearer ", ""), false);
    assert.equal(checkAuth("Bearer x", undefined), false);
  });
});

describe("parseCsv", () => {
  test("handles quoted commas, escaped quotes and newlines in quotes", () => {
    const rows = parseCsv('a,b,c\n"Demo, Kombi","say ""hi""","line1\nline2"\n');
    assert.deepEqual(rows, [
      ["a", "b", "c"],
      ["Demo, Kombi", 'say "hi"', "line1\nline2"],
    ]);
  });

  test("handles CRLF, CR, BOM and a missing trailing newline", () => {
    assert.deepEqual(parseCsv("﻿a,b\r\n1,2\r\n3,4"), [
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    assert.deepEqual(parseCsv("a,b\r1,2\r"), [
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("keeps empty fields and empty rows", () => {
    assert.deepEqual(parseCsv("a,,c\n,,\n"), [
      ["a", "", "c"],
      ["", "", ""],
    ]);
    assert.deepEqual(parseCsv(""), []);
  });
});

describe("toInt", () => {
  test("strips everything except digits and a leading minus", () => {
    assert.equal(toInt("1234"), 1234);
    assert.equal(toInt("1'234"), 1234);
    assert.equal(toInt("1’234"), 1234);
    assert.equal(toInt(" 12 345 "), 12345);
    assert.equal(toInt("-2713"), -2713);
    assert.equal(toInt("-2'713"), -2713);
    assert.equal(toInt("−2713"), -2713);
    assert.equal(toInt("CHF 1'193"), 1193);
    assert.equal(toInt("-0"), 0);
  });

  test("empty / non-numeric becomes null", () => {
    assert.equal(toInt(""), null);
    assert.equal(toInt("   "), null);
    assert.equal(toInt("-"), null);
    assert.equal(toInt("n/a"), null);
    assert.equal(toInt(undefined), null);
    assert.equal(toInt("9".repeat(20)), null);
  });
});

describe("toVehicles", () => {
  test("maps the fixture with one vehicle and drops blank padding rows", async () => {
    const vehicles = toVehicles(parseCsv(await fixture("web_sample_1.csv")));
    assert.equal(vehicles.length, 1);
    const v = vehicles[0];
    assert.deepEqual(Object.keys(v), [...CONTRACT]);
    assert.equal(v.vehicle, "Demo SUV 2.0 Automatik");
    assert.equal(v.plate, "XX 000 001");
    assert.equal(v.status, "on_lease");
    assert.equal(v.km_package, 1500);
    assert.equal(v.handover_date, 46096);
    assert.equal(v.diff_km, -2040);
    assert.equal(typeof v.current_km, "number");
  });

  test("maps the fixture with three vehicles incl. missing checkpoint", async () => {
    const vehicles = toVehicles(parseCsv(await fixture("web_sample_3.csv")));
    assert.equal(vehicles.length, 3);
    const noCheckpoint = vehicles[2];
    assert.equal(noCheckpoint.status, "notice_given");
    assert.equal(noCheckpoint.checkpoint_date, null);
    assert.equal(noCheckpoint.current_km, null);
    assert.equal(noCheckpoint.checkpoint_type, null);
    assert.equal(vehicles[1].open_extra_km, 1768);
  });

  test("whitelist drops extra columns (e.g. last_name)", () => {
    const csv = [
      "vehicle,last_name,plate,secret_note,current_km",
      "Demo SUV 2.0 Automatik,Muster,XX 000 001,do-not-leak,1'234",
    ].join("\n");
    const [v] = toVehicles(parseCsv(csv));
    assert.equal(v.current_km, 1234);
    assert.equal("last_name" in v, false);
    assert.equal("secret_note" in v, false);
    const serialized = JSON.stringify(v);
    assert.equal(serialized.includes("Muster"), false);
    assert.equal(serialized.includes("do-not-leak"), false);
    // Missing contract columns are present as null
    assert.equal(v.diff_km, null);
    assert.equal(v.insurance, null);
  });

  test("header is matched case/whitespace-insensitively, order independent", () => {
    const csv = " Plate ,VEHICLE,diff_km\nXX 000 001,Demo SUV,-2'713\n";
    const [v] = toVehicles(parseCsv(csv));
    assert.equal(v.vehicle, "Demo SUV");
    assert.equal(v.plate, "XX 000 001");
    assert.equal(v.diff_km, -2713);
  });

  test("drops rows without vehicle or plate", () => {
    const csv = [
      "vehicle,plate,current_km",
      ",,",
      "Demo SUV,,100",
      ",XX 000 002,100",
      "Demo Kombi,XX 000 003,200",
      "",
    ].join("\r\n");
    const vehicles = toVehicles(parseCsv(csv));
    assert.deepEqual(
      vehicles.map((v) => v.plate),
      ["XX 000 003"],
    );
  });

  test("quoted text with commas survives", () => {
    const csv = 'vehicle,plate\n"Demo SUV, 2.0 Automatik",XX 000 001\n';
    const [v] = toVehicles(parseCsv(csv));
    assert.equal(v.vehicle, "Demo SUV, 2.0 Automatik");
  });

  test("throws on a header without the required columns", () => {
    assert.throws(() => toVehicles(parseCsv("foo,bar\n1,2\n")), /csv_header/);
    assert.throws(() => toVehicles([]), /csv_empty/);
  });
});

// ---------------------------------------------------------------------------

describe("handler", () => {
  test("200 with whitelisted vehicles for the correct password", async () => {
    const csv = await fixture("web_sample_3.csv");
    stubFetch(() => csvResponse(csv));
    process.env.DASHBOARD_TITLE = "Demo Dashboard";

    const res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.match(res.headers.get("content-type"), /application\/json/);

    const body = await res.json();
    assert.equal(body.title, "Demo Dashboard");
    assert.equal(body.contactEmail, null);
    assert.ok(!Number.isNaN(Date.parse(body.generatedAt)));
    assert.equal(body.vehicles.length, 3);
    assert.deepEqual(Object.keys(body.vehicles[0]), [...CONTRACT]);
    assert.deepEqual(fetchCalls, [SHEET_URL]);
  });

  test("default title and optional contact e-mail", async () => {
    const csv = await fixture("web_sample_1.csv");
    stubFetch(() => csvResponse(csv));
    const contact = ["kontakt", "example.test"].join("@");
    process.env.CONTACT_EMAIL = contact;

    const body = await (await handler(request("GET", `Bearer ${PASSWORD}`))).json();
    assert.equal(body.title, "KM-Tracking");
    assert.equal(body.contactEmail, contact);
  });

  test("extra sheet columns never reach the response", async () => {
    stubFetch(() =>
      csvResponse("vehicle,plate,last_name,current_km\nDemo SUV,XX 000 001,Muster,100\n"),
    );
    const res = await handler(request("GET", `Bearer ${PASSWORD}`));
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.equal(text.includes("Muster"), false);
    assert.equal(text.includes("last_name"), false);
  });

  test("401 for a wrong password (with delay) and no upstream call", async () => {
    stubFetch(() => csvResponse("vehicle,plate\n"));
    const started = Date.now();
    const res = await handler(request("GET", "Bearer wrong"));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
    assert.ok(Date.now() - started >= 350, "failed auth should be delayed");
    assert.equal(fetchCalls.length, 0);
  });

  test("401 for a missing authorization header", async () => {
    stubFetch(() => csvResponse("vehicle,plate\n"));
    const res = await handler(request("GET"));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  });

  test("500 not_configured when env vars are missing – without leaking values", async () => {
    stubFetch(() => csvResponse("vehicle,plate\n"));
    delete process.env.DASHBOARD_PASSWORD;
    let res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 500);
    let text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "not_configured" });
    assert.equal(text.includes(SHEET_URL), false);

    process.env.DASHBOARD_PASSWORD = PASSWORD;
    delete process.env.SHEET_CSV_URL;
    res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 500);
    text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: "not_configured" });
    assert.equal(text.includes(PASSWORD), false);
    assert.equal(fetchCalls.length, 0);
  });

  test("500 not_configured for a weak (too short) password – even if it matches", async () => {
    stubFetch(() => csvResponse("vehicle,plate\n"));
    const weak = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    process.env.DASHBOARD_PASSWORD = weak;
    const res = await handler(request("GET", `Bearer ${weak}`));
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "not_configured" });
    assert.equal(fetchCalls.length, 0);
  });

  test("only serves data in production / dev deploy contexts", async () => {
    const csv = await fixture("web_sample_1.csv");
    stubFetch(() => csvResponse(csv));
    const auth = `Bearer ${PASSWORD}`;
    for (const ctx of ["deploy-preview", "branch-deploy"]) {
      const res = await handler(request("GET", auth), { deploy: { context: ctx } });
      assert.equal(res.status, 500, ctx);
      assert.deepEqual(await res.json(), { error: "not_configured" });
    }
    process.env.CONTEXT = "deploy-preview";
    assert.equal((await handler(request("GET", auth))).status, 500, "CONTEXT env var");
    delete process.env.CONTEXT;
    assert.equal(fetchCalls.length, 0);

    for (const ctx of ["production", "dev"]) {
      const res = await handler(request("GET", auth), { deploy: { context: ctx } });
      assert.equal(res.status, 200, ctx);
    }
  });

  test("502 when upstream answers with an error status", async () => {
    stubFetch(() => csvResponse("boom", 500));
    const res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "upstream" });
  });

  test("502 when upstream throws (network / timeout)", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "upstream" });
  });

  test("502 when upstream returns HTML or an unexpected header", async () => {
    stubFetch(() => csvResponse("<!doctype html><title>Sign in</title>"));
    let res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 502);

    resetCache();
    stubFetch(() => csvResponse("foo,bar\n1,2\n"));
    res = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(res.status, 502);
  });

  test("caches upstream data for subsequent requests", async () => {
    const csv = await fixture("web_sample_1.csv");
    stubFetch(() => csvResponse(csv));
    const a = await handler(request("GET", `Bearer ${PASSWORD}`));
    const b = await handler(request("GET", `Bearer ${PASSWORD}`));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(fetchCalls.length, 1);
  });

  test("405 for other methods, 204 for OPTIONS", async () => {
    stubFetch(() => csvResponse("vehicle,plate\n"));
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await handler(request(method, `Bearer ${PASSWORD}`));
      assert.equal(res.status, 405, method);
      assert.deepEqual(await res.json(), { error: "method_not_allowed" });
      assert.match(res.headers.get("allow"), /GET/);
    }
    const res = await handler(request("OPTIONS"));
    assert.equal(res.status, 204);
    assert.equal(fetchCalls.length, 0);
  });
});
