import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./load.mjs";

const ctx = loadLib("format.js", "defaults.js", "model.js");
const M = ctx.CarifyModel;
const D = ctx.CarifyDefaults;
// Objects from the vm context have other prototypes; compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));
const NB = "\u00a0";

// Fake data only – never real customers or CARIFY prices in tests.
function settingsWithTeam() {
  return M.mergeSettings({
    schema: "carify-offerten/1",
    company: { name: "CARIFY", legalName: "Muster Abo AG", street: "Teststrasse 1", zip: "9999", city: "Testhausen" },
    team: [{ id: "t1", name: "Alex Beispiel", role: "Key Account Manager", phone: "+41 00 000 00 00", email: "alex@example.test" }],
    defaults: { extraKmRate: 0.5 },
  });
}

function offerFixture(settings) {
  const doc = M.newDocument("offer", settings, "2026-10-24");
  doc.customer.company = "Beispiel GmbH";
  doc.contact = { salutation: "Frau", firstName: "Maria", lastName: "Muster", email: "" };
  const v = doc.offer.vehicles[0];
  v.model = "TESTMARKE Kombi Line";
  v.year = "2026";
  v.fuel = "Benzin";
  v.gearbox = "Automatik";
  v.kms = [1000, 1750];
  v.rows = [
    { months: 12, prices: { 1000: 690, 1750: 760 }, insurance: 30 },
    { months: 3, prices: { 1000: 800, 1750: null }, insurance: null },
    { months: 24, prices: { 1000: null, 1750: null }, insurance: null },
  ];
  return doc;
}

test("mergeSettings rejects files without schema and keeps defaults for missing keys", () => {
  assert.throws(() => M.mergeSettings({ foo: 1 }), /schema/);
  assert.throws(() => M.mergeSettings([1, 2]), /schema/);
  const s = M.mergeSettings({ schema: "carify-offerten/1", company: { city: "Testhausen", hacker: "x" }, unknown: 1 });
  assert.equal(s.company.city, "Testhausen");
  assert.equal(s.company.hacker, undefined);
  assert.equal(s.unknown, undefined);
  assert.deepEqual(plain(s.defaults.terms), plain(D.settings().defaults.terms));
  assert.ok(s.texts.de.letterBody.includes("{{inhalt}}"));
});

test("mergeSettings ignores __proto__ and constructor keys", () => {
  const evil = JSON.parse('{"schema":"carify-offerten/1","__proto__":{"polluted":1},"company":{"__proto__":{"polluted":2}},"texts":{"__proto__":{"polluted":3},"de":{"constructor":{"x":1}}}}');
  const s = M.mergeSettings(evil);
  assert.equal(({}).polluted, undefined);
  assert.equal(s.polluted, undefined);
  assert.equal(s.company.polluted, undefined);
  assert.equal(s.texts.polluted, undefined);
  assert.equal(typeof s.texts.de.constructor, "function");
});

test("mergeSettings lets a settings file override and extend texts", () => {
  const s = M.mergeSettings({ schema: "carify-offerten/1", texts: { de: { footerClaim: "Hallo", extraKey: "x" } } });
  assert.equal(M.texts(s, "de").footerClaim, "Hallo");
  assert.equal(M.texts(s, "de").extraKey, "x");
  // French falls back to German only for keys French does not have
  assert.equal(M.texts(s, "fr").coverButton, D.settings().texts.fr.coverButton);
});

test("fill replaces known placeholders and blanks unknown ones", () => {
  assert.equal(M.fill("Hallo {{ name }}, {{x}}!", { name: "Welt" }), "Hallo Welt, !");
});

test("richText: paragraphs, bullets, bold and list expansion", () => {
  const blocks = M.richText("A **fett** B\nzweite Zeile\n\n• eins\n- zwei\n\n{{inhalt}}", {}, { inhalt: ["X", "Y"] });
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, "p");
  assert.deepEqual(plain(blocks[0].lines[0]), [{ text: "A " }, { text: "fett", bold: true }, { text: " B" }]);
  assert.equal(blocks[0].lines.length, 2);
  assert.equal(blocks[1].type, "list");
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[2].type, "list");
  assert.deepEqual(plain(blocks[2].items), [[{ text: "X" }], [{ text: "Y" }]]);
});

test("salutation per language and gender", () => {
  const s = settingsWithTeam();
  const doc = M.newDocument("offer", s, "2026-10-24");
  const t = M.texts(s, "de");
  assert.equal(M.salutation(doc, t), "Sehr geehrte Damen und Herren");
  doc.contact = { salutation: "Herr", firstName: "", lastName: "Muster" };
  assert.equal(M.salutation(doc, t), "Sehr geehrter Herr Muster");
  doc.contact.salutation = "Frau";
  assert.equal(M.salutation(doc, M.texts(s, "fr")), "Bonjour Madame Muster,");
  assert.equal(M.salutation(doc, M.texts(s, "en")), "Dear Ms Muster");
});

test("offerView hides unpriced terms, sorts them and computes VAT", () => {
  const s = settingsWithTeam();
  const doc = offerFixture(s);
  doc.offer.vatMode = "both";
  const view = M.offerView(doc, s);
  const rows = view.vehicles[0].rows;
  assert.deepEqual(plain(rows.map((r) => r.months)), [3, 12]);
  assert.equal(rows[1].lines[0].priceIncl, Math.round(690 * 1.081));
  assert.deepEqual(plain(view.columns), ["vehicle", "term", "km", "priceExcl", "priceIncl"]);
  assert.equal(view.vehicles[0].sub, "2026 - Benzin - Automatik");
  assert.equal(view.vars.zum_fahrzeug, "zum gewünschten Fahrzeug");
  assert.equal(view.vars.gueltig_bis, "29.10.2026");
  assert.match(view.footnotes[0], /indikative Offerte ist 5 Tage gültig \(bis 29\.10\.2026\)/);
  doc.offer.hideEmptyRows = false;
  assert.deepEqual(plain(M.offerView(doc, s).vehicles[0].rows.map((r) => r.months)), [3, 12, 24]);
});

test("offerView: insurance column only when a value exists, plural wording", () => {
  const s = settingsWithTeam();
  const doc = offerFixture(s);
  doc.offer.insuranceDisplay = "column";
  assert.ok(M.offerView(doc, s).columns.includes("insurance"));
  doc.offer.vehicles[0].rows.forEach((r) => (r.insurance = null));
  assert.ok(!M.offerView(doc, s).columns.includes("insurance"));
  doc.offer.vehicles.push(M.newVehicle(s));
  doc.offer.vehicles[1].model = "Zweites Auto";
  assert.equal(M.offerView(doc, s).vars.zum_fahrzeug, "zu den gewünschten Fahrzeugen");
});

test("offerView drops non-https links", () => {
  const s = settingsWithTeam();
  const doc = offerFixture(s);
  doc.offer.vehicles[0].link = "javascript:alert(1)";
  assert.equal(M.offerView(doc, s).vehicles[0].link, "");
  doc.offer.vehicles[0].link = "https://example.test/auto";
  assert.equal(M.offerView(doc, s).vehicles[0].link, "https://example.test/auto");
});

test("contract from offer takes the chosen combinations", () => {
  const s = settingsWithTeam();
  const offer = offerFixture(s);
  const options = M.offerOptions(offer);
  assert.equal(options.length, 3);
  const pick = options.find((o) => o.months === 12 && o.km === 1750);
  const contract = M.contractFromOffer(offer, [pick.key], s, "2026-10-25");
  assert.equal(contract.type, "contract");
  assert.equal(contract.customer.company, "Beispiel GmbH");
  assert.equal(contract.contract.km, 1750);
  assert.equal(contract.contract.months, 12);
  assert.equal(contract.contract.insuranceSurcharge, 30);
  assert.equal(contract.contract.items.length, 1);
  assert.equal(contract.contract.items[0].rate, 760);
  assert.equal(contract.contract.items[0].model, "TESTMARKE Kombi Line - Benzin & Automatik");
  assert.equal(contract.contract.items[0].extraKmRate, 0.5);
  assert.equal(contract.contractMismatch, false);
  // the offer is untouched
  contract.customer.company = "x";
  assert.equal(offer.customer.company, "Beispiel GmbH");
  // picks with different terms are flagged
  const other = options.find((o) => o.months === 3);
  assert.equal(M.contractFromOffer(offer, [pick.key, other.key], s).contractMismatch, true);
});

test("contractView: one vehicle, several of one model, model groups", () => {
  const s = settingsWithTeam();
  const doc = M.newDocument("contract", s, "2026-10-24");
  Object.assign(doc.contract, { number: "0123456", start: "2026-11-01", km: 2500, months: 3, insurance: "OPTIMUM", packageType: "Flex" });
  Object.assign(doc.contract.items[0], { model: "Modell A", rate: 1140 });
  let view = M.contractView(doc, s);
  let text = JSON.stringify(plain(view.rateBlocks));
  assert.ok(text.includes(`CHF${NB}1’140 pro Monat`), text);
  assert.ok(text.includes(`CHF${NB}0.50 pro km`));
  assert.ok(!text.includes("je Fahrzeug"));
  assert.equal(view.grid[0].lines[0], "Modell A");
  assert.equal(view.grid[1].lines[0], "01.11.2026");
  assert.equal(view.grid[2].lines[0], "2’500");
  assert.equal(view.carify.address, "Teststrasse 1 | 9999 Testhausen | CH");

  doc.contract.items[0].qty = 2;
  doc.contract.insuranceSurcharge = 75;
  doc.contract.packageSurcharge = 29;
  doc.contract.startMonthOnly = true;
  view = M.contractView(doc, s);
  text = JSON.stringify(plain(view.rateBlocks));
  assert.ok(text.includes("je Fahrzeug"));
  assert.ok(text.includes("Versicherungs-Upgrade"));
  assert.ok(text.includes("Flex-Paket"));
  assert.equal(view.grid[0].lines[0], "2x Modell A");
  assert.equal(view.grid[1].lines[0], "November 2026");
  assert.equal(view.grid[2].lines[0], "je 2’500");
  assert.equal(view.grid[4].lines[0], "OPTIMUM (+75 CHF)");
  assert.equal(view.grid[5].lines[0], "Flex (+29 CHF)");

  doc.contract.items.push(Object.assign(M.newContractItem(s), { qty: 1, model: "Modell B", rate: 949, extraKmRate: 0.6 }));
  doc.contract.vatMode = "incl";
  view = M.contractView(doc, s);
  text = JSON.stringify(plain(view.rateBlocks));
  assert.equal(view.vehicleCount, 3);
  assert.ok(text.includes("für Modell A"));
  assert.ok(text.includes("für Modell B"));
  assert.ok(text.includes("inkl. MwSt"));
  assert.ok(text.includes(`CHF${NB}0.60`));
});

test("contract kinds: adjustment and takeover", () => {
  const s = settingsWithTeam();
  const doc = M.newDocument("contract", s, "2026-10-24");
  Object.assign(doc.contract, { number: "0123456", start: "2027-03-31", km: 1000, months: "12 + Verlängerung" });
  Object.assign(doc.contract.items[0], { model: "Modell A", rate: 800 });
  let view = M.contractView(doc, s);
  assert.equal(view.subtitle, "Vertrag Nr. 0123456");
  assert.equal(view.intro, "Der Abo-Nehmer übernimmt folgende Fahrzeuge von CARIFY:");

  doc.contract.kind = "adjustment";
  view = M.contractView(doc, s);
  assert.equal(view.subtitle, "Vertrag Nr. 0123456 – Anpassung");
  assert.equal(view.intro, "Bezüglich folgender Fahrzeuge von CARIFY:");
  assert.equal(view.grid[1].label, "Mindestlaufzeit bis");
  assert.equal(view.grid[3].lines[0], "12 + Verlängerung");
  assert.equal(M.fileName(Object.assign(doc, { customer: { ...doc.customer, company: "Beispiel GmbH" } }), s), "CARIFY Vertrag - Beispiel GmbH - Anpassung");

  doc.contract.kind = "takeover";
  doc.contract.number = "";
  doc.contract.vehicleIds = "12345, 67890";
  doc.contract.downPayment = 5000;
  view = M.contractView(doc, s);
  assert.equal(view.subtitle, "Vertragsanpassung");
  assert.equal(view.intro, "Der Abo-Nehmer übernimmt folgende Fahrzeuge:");
  assert.equal(view.grid[1].label, "Änderungsdatum");
  assert.equal(view.grid[2].label, "Fahrzeug-ID");
  assert.equal(view.grid[2].lines[0], "12345, 67890");
  assert.ok(JSON.stringify(plain(view.rateBlocks)).includes("Anzahlung"));
  assert.ok(!M.validate(doc, s).some((i) => i.field === "contract.number"));
  assert.equal(M.fileName(doc, s), "CARIFY Vertragsanpassung - Beispiel GmbH");
});

test("fileName follows the existing naming and is file-system safe", () => {
  const s = settingsWithTeam();
  const offer = offerFixture(s);
  assert.equal(M.fileName(offer, s), "Offerte Muster (Beispiel GmbH)");
  offer.customer.company = "A/B AG";
  assert.equal(M.fileName(offer, s), "Offerte Muster (A B AG)");
  const contract = M.newDocument("contract", s, "2026-10-24");
  contract.customer.company = "Beispiel GmbH";
  assert.equal(M.fileName(contract, s), "CARIFY Vertrag - Beispiel GmbH");
  const empty = M.newDocument("offer", s, "2026-10-24");
  assert.equal(M.fileName(empty, s), "Offerte 24.10.2026");
});

test("emailText fills salutation, vehicle wording and validity", () => {
  const s = settingsWithTeam();
  const mail = M.emailText(offerFixture(s), s);
  assert.equal(mail.subject, "Ihre CARIFY Offerte – Beispiel GmbH");
  assert.match(mail.body, /^Sehr geehrte Frau Muster/);
  assert.match(mail.body, /5 Tage gültig/);
  assert.match(mail.body, /Alex Beispiel$/);
  const follow = M.emailText(offerFixture(s), s, "followup");
  assert.equal(follow.subject, "Ihre CARIFY Offerte vom 24.10.2026 – Beispiel GmbH");
  assert.match(follow.body, /Offerte vom 24\.10\.2026/);
});

test("validate lists what is missing", () => {
  const s = settingsWithTeam();
  const offer = M.newDocument("offer", s, "2026-10-24");
  const fields = M.validate(offer, s).map((i) => i.field);
  assert.ok(fields.includes("customer.company"));
  assert.ok(fields.includes("vehicles.0.model"));
  assert.ok(fields.includes("vehicles.0.prices"));
  assert.deepEqual(plain(M.validate(offerFixture(s), s)), []);

  const contract = M.newDocument("contract", s, "2026-10-24");
  const cf = M.validate(contract, s).map((i) => i.field);
  assert.ok(cf.includes("contract.number"));
  assert.ok(cf.includes("contract.start"));
  assert.ok(cf.includes("items.0.rate"));
  assert.ok(!cf.includes("items.0.extraKmRate"));
});

test("normalizeDocument repairs partial drafts", () => {
  const s = settingsWithTeam();
  const doc = M.normalizeDocument({ type: "offer", lang: "xx", offer: { vehicles: [{ model: "X", kms: ["1000"], rows: [{ months: "6", prices: { 1000: "1'234" } }] }] } }, s);
  assert.equal(doc.lang, "de");
  assert.equal(doc.offer.vehicles[0].rows[0].months, 6);
  assert.equal(doc.offer.vehicles[0].rows[0].prices[1000], 1234);
  assert.equal(doc.offer.sections.cover, true);
  assert.throws(() => M.normalizeDocument({ type: "nope" }, s));
});
