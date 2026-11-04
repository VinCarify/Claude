// CARIFY Offerten & Verträge – formatting helpers (de-CH / fr-CH).
// Classic script (no modules, so index.html also works when opened from file://).
// The Node tests evaluate it in a vm context, see test/load.mjs.

"use strict";

globalThis.CarifyFormat = (function () {
  // Non-breaking space: amounts never wrap away from their unit.
  const NBSP = "\u00a0";

  const LOCALES = { de: "de-CH", fr: "fr-CH", en: "en-CH" };
  const locale = (lang) => LOCALES[lang] || LOCALES.de;

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  // "1'140", "0.53", "30.-" -> number; "", "–", "abc" -> null. Accepts ’ ' and spaces as group
  // separators and a comma as decimal separator, because people paste prices from everywhere.
  function parseNumber(value) {
    if (isNum(value)) return value;
    if (typeof value !== "string") return null;
    let cleaned = value
      .trim()
      .replace(/^CHF\s*/i, "")
      .replace(/\s*CHF$/i, "")
      .replace(/\.[-–]$/, "")
      .replace(/[\s\u00a0\u202f\u2019'`]/g, "");
    // "1,140" from an English spreadsheet is grouping, "0,53" is a decimal comma.
    cleaned = /^-?\d{1,3}(,\d{3})+$/.test(cleaned) ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    return Number(cleaned);
  }

  function number(n, lang, decimals) {
    if (!isNum(n)) return "";
    const d = decimals ?? (Number.isInteger(n) ? 0 : 2);
    const nf = new Intl.NumberFormat(locale(lang), { minimumFractionDigits: d, maximumFractionDigits: d });
    // `n === 0` is also true for -0, which Intl would print as "-0".
    return nf.format(n === 0 ? 0 : n).replace(/\u202f/g, NBSP);
  }

  // 8.1 → "8.1", 8 → "8" (rates, no trailing zeros)
  function decimal(n, lang) {
    if (!isNum(n)) return "";
    return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n).replace(/\u202f/g, NBSP);
  }

  // "CHF 1’140" (contract style) – decimals only when there are cents.
  function chf(n, lang) {
    return isNum(n) ? `CHF${NBSP}${number(n, lang)}` : "";
  }

  // "1’140 CHF" (offer price table style).
  function chfAfter(n, lang) {
    return isNum(n) ? `${number(n, lang)}${NBSP}CHF` : "";
  }

  // "CHF 0.53" – always two decimals (per-km tariffs).
  function chf2(n, lang) {
    return isNum(n) ? `CHF${NBSP}${number(n, lang, 2)}` : "";
  }

  // ISO "2026-10-24" -> Date (local, no timezone shift).
  function parseIsoDate(iso) {
    if (typeof iso !== "string") return null;
    const m = iso.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toIsoDate(d) {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // "24.10.2026"
  function date(iso) {
    const d = parseIsoDate(iso);
    if (!d) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getFullYear()}`;
  }

  // "September 2026" / "septembre 2026" (planned subscription start is a month, not a day)
  function monthYear(iso, lang) {
    const d = parseIsoDate(iso);
    if (!d) return "";
    return new Intl.DateTimeFormat(locale(lang), { month: "long", year: "numeric" }).format(d);
  }

  function addDays(iso, days) {
    const d = parseIsoDate(iso);
    if (!d) return "";
    d.setDate(d.getDate() + days);
    return toIsoDate(d);
  }

  // Safe for file names on macOS, Windows and Google Drive.
  function fileSafe(text) {
    return String(text ?? "")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  return { NBSP, isNum, parseNumber, number, decimal, chf, chfAfter, chf2, parseIsoDate, toIsoDate, date, monthYear, addDays, fileSafe };
})();
