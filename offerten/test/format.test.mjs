import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./load.mjs";

const F = loadLib("format.js").CarifyFormat;
const NB = "\u00a0";

test("parseNumber accepts Swiss formats and rejects junk", () => {
  assert.equal(F.parseNumber("1’140"), 1140);
  assert.equal(F.parseNumber("1'140"), 1140);
  assert.equal(F.parseNumber("1 140"), 1140);
  assert.equal(F.parseNumber("CHF 691"), 691);
  assert.equal(F.parseNumber("691 CHF"), 691);
  assert.equal(F.parseNumber("0,53"), 0.53);
  assert.equal(F.parseNumber("0.53"), 0.53);
  assert.equal(F.parseNumber(42), 42);
  assert.equal(F.parseNumber(""), null);
  assert.equal(F.parseNumber("–"), null);
  assert.equal(F.parseNumber("auf Anfrage"), null);
  assert.equal(F.parseNumber(Number.NaN), null);
  assert.equal(F.parseNumber(null), null);
});

test("CHF formatting uses Swiss grouping and non-breaking spaces", () => {
  assert.equal(F.chf(1140), `CHF${NB}1’140`);
  assert.equal(F.chfAfter(1063), `1’063${NB}CHF`);
  assert.equal(F.chf2(0.53), `CHF${NB}0.53`);
  assert.equal(F.chf(-0), `CHF${NB}0`);
  assert.equal(F.chf(null), "");
  assert.equal(F.chf(99.5), `CHF${NB}99.50`);
});

test("French formatting groups with a non-breaking space", () => {
  assert.match(F.chf(1140, "fr"), /^CHF 1 140$/);
});

test("dates", () => {
  assert.equal(F.date("2026-10-02"), "02.10.2026");
  assert.equal(F.date("nope"), "");
  assert.equal(F.monthYear("2026-09"), "September 2026");
  assert.equal(F.monthYear("2026-09-01", "fr"), "septembre 2026");
  assert.equal(F.addDays("2026-12-20", 30), "2027-01-19");
  assert.equal(F.addDays("", 30), "");
});

test("fileSafe strips characters that break file names", () => {
  assert.equal(F.fileSafe('A/B: "C" <D>'), "A B C D");
  assert.equal(F.fileSafe("  Muster   AG  "), "Muster AG");
});
