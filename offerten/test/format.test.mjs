import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./load.mjs";

const F = loadLib("format.js").CarifyFormat;
const NB = "\u00a0";

test("parseNumber accepts Swiss formats and rejects junk", () => {
  assert.equal(F.parseNumber("1’230"), 1230);
  assert.equal(F.parseNumber("1'230"), 1230);
  assert.equal(F.parseNumber("1 230"), 1230);
  assert.equal(F.parseNumber("CHF 612"), 612);
  assert.equal(F.parseNumber("612 CHF"), 612);
  assert.equal(F.parseNumber("0,47"), 0.47);
  assert.equal(F.parseNumber("0.47"), 0.47);
  assert.equal(F.parseNumber("1,230"), 1230);
  assert.equal(F.parseNumber("12,345,678"), 12345678);
  assert.equal(F.parseNumber("30.-"), 30);
  assert.equal(F.parseNumber(42), 42);
  assert.equal(F.parseNumber(""), null);
  assert.equal(F.parseNumber("–"), null);
  assert.equal(F.parseNumber("auf Anfrage"), null);
  assert.equal(F.parseNumber(Number.NaN), null);
  assert.equal(F.parseNumber(null), null);
});

test("CHF formatting uses Swiss grouping and non-breaking spaces", () => {
  assert.equal(F.chf(1230), `CHF${NB}1’230`);
  assert.equal(F.chfAfter(1048), `1’048${NB}CHF`);
  assert.equal(F.chf2(0.47), `CHF${NB}0.47`);
  assert.equal(F.chf(-0), `CHF${NB}0`);
  assert.equal(F.chf(null), "");
  assert.equal(F.chf(99.5), `CHF${NB}99.50`);
});

test("French formatting groups with a non-breaking space", () => {
  assert.match(F.chf(1230, "fr"), /^CHF\u00a01\u00a0230$/);
});

test("decimal trims trailing zeros", () => {
  assert.equal(F.decimal(8.1), "8.1");
  assert.equal(F.decimal(8), "8");
  assert.equal(F.decimal(8.1, "fr"), "8,1");
});

test("dates", () => {
  assert.equal(F.date("2026-10-02"), "02.10.2026");
  assert.equal(F.date("nope"), "");
  assert.equal(F.monthYear("2026-09"), "September 2026");
  assert.equal(F.monthYear("2026-09-01", "fr"), "septembre 2026");
  assert.equal(F.monthYear("2027-03", "en"), "March 2027");
  assert.equal(F.addDays("2026-12-20", 30), "2027-01-19");
  assert.equal(F.addDays("", 30), "");
});

test("fileSafe strips characters that break file names", () => {
  assert.equal(F.fileSafe('A/B: "C" <D>'), "A B C D");
  assert.equal(F.fileSafe("  Muster   AG  "), "Muster AG");
});
