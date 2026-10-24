// CARIFY Offerten & Verträge – data model: settings, documents, derived view data, validation.
// Pure functions without DOM access, so the Node tests can cover them (see test/load.mjs).

"use strict";

globalThis.CarifyModel = (function () {
  const F = globalThis.CarifyFormat;
  const D = globalThis.CarifyDefaults;

  const TYPES = ["offer", "contract"];
  // new = Auto-Abo Vertrag, adjustment = re-issued contract with changed terms,
  // takeover = "Vertragsanpassung": a company takes over existing subscriptions.
  const CONTRACT_KINDS = ["new", "adjustment", "takeover"];
  const LANGS = ["de", "fr", "en"];
  const VAT_MODES = ["excl", "incl", "both"];
  const INSURANCE_DISPLAY = ["none", "column", "note"];

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const clone = (v) => JSON.parse(JSON.stringify(v));

  let counter = 0;
  function uid(prefix) {
    counter += 1;
    const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix || "id"}-${rnd.slice(0, 13)}-${counter}`;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  // Objects merge key by key, arrays and scalars replace. Keys that do not exist in the base are
  // dropped, except inside free-form maps (texts per language), so a typo cannot add junk.
  // Imported files are untrusted: "__proto__" & co. never reach an object.
  const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  function mergeInto(base, patch, path) {
    if (!isObj(patch)) return base;
    for (const [key, value] of Object.entries(patch)) {
      if (UNSAFE_KEYS.has(key)) continue;
      const here = path ? `${path}.${key}` : key;
      const freeForm = path === "texts" || /^texts\.\w+$/.test(path);
      if (!Object.hasOwn(base, key) && !freeForm) continue;
      if (isObj(base[key]) && isObj(value)) mergeInto(base[key], value, here);
      else if (value !== undefined) base[key] = clone(value);
    }
    return base;
  }

  function mergeSettings(imported) {
    const base = D.settings();
    if (imported == null) return base;
    if (!isObj(imported) || typeof imported.schema !== "string" || !imported.schema.startsWith("carify-offerten/")) {
      throw new Error("Das ist keine Einstellungs-Datei der Offerten-App (Feld «schema» fehlt).");
    }
    mergeInto(base, imported, "");
    base.schema = D.SCHEMA;
    if (!LANGS.every((l) => isObj(base.texts[l]))) base.texts = D.settings().texts;
    base.team = (Array.isArray(base.team) ? base.team : []).filter(isObj).map((m) => ({
      id: str(m.id) || uid("team"),
      name: str(m.name),
      role: str(m.role),
      phone: str(m.phone),
      email: str(m.email),
    }));
    base.catalog = (Array.isArray(base.catalog) ? base.catalog : []).filter(isObj).map(normalizeVehicle);
    return base;
  }

  // Texts for a language, falling back to German and then to the built-in defaults for keys
  // that an older settings file does not have yet.
  function texts(settings, lang) {
    const builtIn = D.settings().texts;
    return Object.assign({}, builtIn.de, builtIn[lang] || {}, settings.texts?.de || {}, settings.texts?.[lang] || {});
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  function emptyPrices(kms) {
    const prices = {};
    for (const km of kms) prices[km] = null;
    return prices;
  }

  function newVehicle(settings, kms, terms) {
    const d = settings.defaults;
    const useKms = kms || d.kmPackages.slice(0, 3);
    const useTerms = terms || [12];
    return {
      id: uid("veh"),
      model: "",
      year: "",
      fuel: "",
      gearbox: "",
      link: "",
      kms: useKms.slice(),
      rows: useTerms.map((months) => ({ months, prices: emptyPrices(useKms), insurance: null })),
    };
  }

  function normalizeVehicle(v) {
    const kms = (Array.isArray(v.kms) ? v.kms : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    const rows = (Array.isArray(v.rows) ? v.rows : []).filter(isObj).map((r) => {
      const prices = {};
      for (const km of kms) {
        const p = r.prices?.[km];
        prices[km] = F.isNum(p) ? p : F.parseNumber(str(p));
      }
      const insurance = F.isNum(r.insurance) ? r.insurance : F.parseNumber(str(r.insurance));
      return { months: Number(r.months) || 0, prices, insurance };
    });
    return {
      id: str(v.id) || uid("veh"),
      model: str(v.model),
      year: str(v.year),
      fuel: str(v.fuel),
      gearbox: str(v.gearbox),
      link: str(v.link),
      kms,
      rows,
      stand: str(v.stand),
    };
  }

  // One line per model group ("2x MARKE Modell …"). Start, km package, term, insurance and package type
  // are shared by all vehicles of a contract, exactly like in the contracts so far.
  function newContractItem(settings) {
    return {
      id: uid("item"),
      qty: 1,
      model: "",
      rate: null,
      extraKmRate: settings.defaults.extraKmRate,
    };
  }

  function newDocument(type, settings, todayIso) {
    if (!TYPES.includes(type)) throw new Error(`Unbekannter Dokumenttyp: ${type}`);
    const d = settings.defaults;
    const today = todayIso || F.toIsoDate(new Date());
    const doc = {
      id: uid("doc"),
      type,
      lang: "de",
      createdAt: today,
      updatedAt: "",
      date: today,
      customer: { company: "", street: "", zip: "", city: "", country: "CH" },
      contact: { salutation: "", firstName: "", lastName: "", email: "" },
      ownerId: settings.team[0]?.id || "",
    };
    if (type === "offer") {
      doc.offer = {
        validityDays: d.offerValidityDays,
        indicative: d.offerIndicative,
        vatMode: d.vatMode,
        insuranceDisplay: d.insuranceDisplay,
        privateSurcharge: null,
        hideEmptyRows: true,
        sections: { cover: true, letter: true, why: true, prices: true, options: false },
        vehicles: [newVehicle(settings)],
      };
    } else if (type === "contract") {
      doc.contract = {
        kind: "new",
        number: "",
        vehicleIds: "",
        downPayment: null,
        start: "",
        startMonthOnly: false,
        km: null,
        months: null,
        insurance: d.insurancePackages[0] || "",
        insuranceSurcharge: null,
        packageType: d.packageTypes[0] || "",
        packageSurcharge: null,
        vatMode: "excl",
        noticePeriod: d.noticePeriod,
        signatory: "",
        items: [newContractItem(settings)],
      };
    }
    return doc;
  }

  // Older drafts or hand-edited JSON: fill in anything missing so the renderer can rely on shapes.
  function normalizeDocument(raw, settings) {
    if (!isObj(raw) || !TYPES.includes(raw.type)) throw new Error("Ungültiger Entwurf.");
    const base = newDocument(raw.type, settings, str(raw.date) || undefined);
    const doc = mergeInto(base, raw, "");
    doc.id = str(raw.id) || doc.id;
    doc.lang = LANGS.includes(doc.lang) ? doc.lang : "de";
    if (doc.offer) {
      doc.offer.vehicles = (Array.isArray(raw.offer?.vehicles) ? raw.offer.vehicles : doc.offer.vehicles)
        .filter(isObj)
        .map(normalizeVehicle);
      if (!VAT_MODES.includes(doc.offer.vatMode)) doc.offer.vatMode = "excl";
      if (!INSURANCE_DISPLAY.includes(doc.offer.insuranceDisplay)) doc.offer.insuranceDisplay = "none";
    }
    if (doc.contract) {
      doc.contract.items = (Array.isArray(raw.contract?.items) ? raw.contract.items : doc.contract.items)
        .filter(isObj)
        .map((it) => ({
          id: str(it.id) || uid("item"),
          qty: Math.max(1, Math.round(Number(it.qty) || 1)),
          model: str(it.model),
          rate: F.isNum(it.rate) ? it.rate : F.parseNumber(str(it.rate)),
          extraKmRate: F.isNum(it.extraKmRate) ? it.extraKmRate : F.parseNumber(str(it.extraKmRate)),
        }));
      if (doc.contract.vatMode !== "incl") doc.contract.vatMode = "excl";
      if (!CONTRACT_KINDS.includes(doc.contract.kind)) doc.contract.kind = "new";
    }
    return doc;
  }

  function duplicateDocument(doc, todayIso) {
    const copy = clone(doc);
    copy.id = uid("doc");
    copy.date = todayIso || F.toIsoDate(new Date());
    copy.createdAt = copy.date;
    copy.updatedAt = "";
    return copy;
  }

  // ---------------------------------------------------------------------------
  // Offer → contract
  // ---------------------------------------------------------------------------

  // All priced combinations of an offer, e.g. for the «Vertrag erstellen» picker.
  function offerOptions(doc) {
    const out = [];
    for (const v of doc.offer?.vehicles || []) {
      for (const row of v.rows) {
        for (const km of v.kms) {
          const price = row.prices[km];
          if (F.isNum(price)) {
            out.push({ key: `${v.id}|${row.months}|${km}`, vehicleId: v.id, model: v.model, months: row.months, km, price, insurance: row.insurance });
          }
        }
      }
    }
    return out;
  }

  function contractFromOffer(offer, optionKeys, settings, todayIso) {
    const doc = newDocument("contract", settings, todayIso);
    doc.lang = offer.lang;
    doc.customer = clone(offer.customer);
    doc.contact = clone(offer.contact);
    doc.ownerId = offer.ownerId;
    const options = offerOptions(offer);
    const picked = optionKeys.map((k) => options.find((o) => o.key === k)).filter(Boolean);
    if (picked.length) {
      const c = doc.contract;
      // Shared terms come from the first pick; differing picks are listed so the user can check them.
      c.km = picked[0].km;
      c.months = picked[0].months;
      c.vatMode = offer.offer.vatMode === "incl" ? "incl" : "excl";
      if (F.isNum(picked[0].insurance)) c.insuranceSurcharge = picked[0].insurance;
      c.items = picked.map((o) => {
        const vehicle = offer.offer.vehicles.find((v) => v.id === o.vehicleId);
        const item = newContractItem(settings);
        const extras = [vehicle?.fuel, vehicle?.gearbox].map((x) => str(x).trim()).filter(Boolean).join(" & ");
        item.model = [o.model, extras].filter(Boolean).join(" - ");
        item.rate = offer.offer.vatMode === "incl" ? vatIncl(o.price, Number(settings.defaults.vatRate) || 0) : o.price;
        return item;
      });
      doc.contractMismatch = picked.some((o) => o.km !== c.km || o.months !== c.months);
    }
    return doc;
  }

  // ---------------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------------

  // {{key}} → vars[key]. Unknown keys become "" so a typo never shows curly braces to a customer.
  function fill(template, vars) {
    return str(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => str(vars[key]));
  }

  // "a **b** c" → [{text:"a "},{text:"b",bold:true},{text:" c"}]
  function runs(line) {
    const out = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push({ text: line.slice(last, m.index) });
      out.push({ text: m[1], bold: true });
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push({ text: line.slice(last) });
    return out;
  }

  // Plain text with light markup → blocks for the renderer:
  //   blank line = new paragraph, "• " / "- " lines = bullet list, **bold**,
  //   a paragraph that is exactly {{listKey}} expands to lists[listKey].
  function richText(template, vars, lists) {
    const blocks = [];
    const paragraphs = str(template).replace(/\r\n?/g, "\n").split(/\n\s*\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      const listMatch = trimmed.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
      if (listMatch && lists && Array.isArray(lists[listMatch[1]])) {
        const items = lists[listMatch[1]].filter(Boolean);
        if (items.length) blocks.push({ type: "list", items: items.map((t) => runs(t)) });
        continue;
      }
      const lines = fill(trimmed, vars).split("\n");
      let current = null;
      for (const line of lines) {
        const bullet = line.match(/^\s*(?:[•\-–]\s+)(.*)$/);
        if (bullet) {
          if (!current || current.type !== "list") {
            current = { type: "list", items: [] };
            blocks.push(current);
          }
          current.items.push(runs(bullet[1]));
        } else {
          if (!current || current.type !== "p") {
            current = { type: "p", lines: [] };
            blocks.push(current);
          }
          current.lines.push(runs(line));
        }
      }
    }
    return blocks;
  }

  function salutation(doc, t) {
    const last = doc.contact.lastName.trim();
    if (doc.contact.salutation === "Herr" && last) return fill(t.salutationMr, { nachname: last });
    if (doc.contact.salutation === "Frau" && last) return fill(t.salutationMrs, { nachname: last });
    return t.salutationNone;
  }

  function salutationWord(doc, t) {
    if (doc.contact.salutation === "Herr") return t.salutationWordMr;
    if (doc.contact.salutation === "Frau") return t.salutationWordMrs;
    return "";
  }

  function owner(doc, settings) {
    return settings.team.find((m) => m.id === doc.ownerId) || null;
  }

  function addressLine(parts, country) {
    const street = str(parts.street).trim();
    const city = [str(parts.zip).trim(), str(parts.city).trim()].filter(Boolean).join(" ");
    return [street, city, str(country ?? parts.country).trim()].filter(Boolean).join(" | ");
  }

  // ---------------------------------------------------------------------------
  // Offer view
  // ---------------------------------------------------------------------------

  function pricedRows(vehicle, hideEmpty) {
    return vehicle.rows
      .filter((r) => r.months > 0)
      .filter((r) => !hideEmpty || vehicle.kms.some((km) => F.isNum(r.prices[km])))
      .sort((a, b) => a.months - b.months);
  }

  function vatIncl(price, rate) {
    return F.isNum(price) ? Math.round(price * (1 + rate / 100)) : null;
  }

  function offerView(doc, settings) {
    const t = texts(settings, doc.lang);
    const o = doc.offer;
    const rate = Number(settings.defaults.vatRate) || 0;
    const vehicles = o.vehicles
      .map((v) => ({
        id: v.id,
        model: v.model.trim(),
        sub: [v.year, v.fuel, v.gearbox].map((s) => str(s).trim()).filter(Boolean).join(" - "),
        link: /^https:\/\//i.test(v.link.trim()) ? v.link.trim() : "",
        rows: pricedRows(v, o.hideEmptyRows).map((r) => ({
          months: r.months,
          insurance: F.isNum(r.insurance) ? r.insurance : null,
          lines: v.kms.map((km) => ({ km, price: r.prices[km], priceIncl: vatIncl(r.prices[km], rate) })),
        })),
      }))
      .filter((v) => v.model || v.rows.length);

    const columns = ["vehicle", "term", "km"];
    if (o.vatMode === "excl" || o.vatMode === "both") columns.push("priceExcl");
    if (o.vatMode === "incl" || o.vatMode === "both") columns.push("priceIncl");
    if (o.insuranceDisplay === "column" && vehicles.some((v) => v.rows.some((r) => r.insurance != null))) columns.push("insurance");

    const validUntil = F.addDays(doc.date, Number(o.validityDays) || 0);
    const vars = baseVars(doc, settings, t);
    vars.gueltig_tage = String(o.validityDays ?? "");
    vars.gueltig_bis = F.date(validUntil);
    vars.indikativ = o.indicative ? t.indicativeWord : "";
    vars.mwst_satz = `${F.number(rate, doc.lang)}%`;
    vars.mwst_hinweis = fill(o.vatMode === "incl" ? t.vatIncl : o.vatMode === "both" ? t.vatBoth : t.vatExcl, vars);
    vars.zum_fahrzeug = vehicles.length > 1 ? t.vehiclePlural : t.vehicleSingular;

    const options = (Array.isArray(t.options) ? t.options : []).filter((x) => isObj(x) && str(x.title).trim());
    const showOptions = Boolean(o.sections.options && options.length);
    const contents = [];
    if (o.sections.why) contents.push(t.whyTitle);
    if (o.sections.prices) contents.push(t.pricesTitle);
    if (showOptions) contents.push(t.optionsTitle);

    const notes = [];
    if (F.isNum(o.privateSurcharge)) notes.push(fill(t.privateSurchargeNote, { betrag: F.chf(o.privateSurcharge, doc.lang) }));

    const footnotes = [fill(t.validityNote, vars), t.footnoteTerm, t.footnoteKm].filter((s) => str(s).trim());

    return { t, vars, contents, vehicles, columns, notes, footnotes, validUntil, vatRate: rate, owner: owner(doc, settings), options: showOptions ? options : [] };
  }

  function baseVars(doc, settings, t) {
    const own = owner(doc, settings);
    return {
      briefanrede: salutation(doc, t),
      anrede: salutationWord(doc, t),
      vorname: doc.contact.firstName.trim(),
      nachname: doc.contact.lastName.trim(),
      firma: doc.customer.company.trim(),
      datum: F.date(doc.date),
      ansprechpartner: own?.name || "",
      funktion: own?.role || "",
      telefon: own?.phone || "",
      email: own?.email || "",
      carify: settings.company.legalName || settings.company.name,
    };
  }

  // ---------------------------------------------------------------------------
  // Contract view
  // ---------------------------------------------------------------------------

  function startText(c, lang) {
    if (!c.start) return "";
    return c.startMonthOnly ? F.monthYear(c.start, lang) : F.date(c.start);
  }

  // "A", "A und B", "A, B und C"
  function joinList(items, and) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
  }

  function contractView(doc, settings) {
    const t = texts(settings, doc.lang);
    const c = doc.contract;
    const lang = doc.lang;
    const items = c.items
      .map((it) => ({
        qty: Math.max(1, Math.round(Number(it.qty) || 1)),
        model: str(it.model).trim(),
        rate: F.isNum(it.rate) ? it.rate : null,
        extraKmRate: F.isNum(it.extraKmRate) ? it.extraKmRate : null,
      }))
      .filter((it) => it.model || it.rate != null);
    const vehicleCount = items.reduce((n, it) => n + it.qty, 0);
    const labelled = (it) => (vehicleCount > 1 ? `${it.qty}x ${it.model}` : it.model);
    const kind = CONTRACT_KINDS.includes(c.kind) ? c.kind : "new";
    const each = vehicleCount > 1 ? t.contractEach : "";
    const surcharge = (name, amount) => [str(name).trim(), F.isNum(amount) ? `(+${F.number(amount, lang)} CHF)` : ""].filter(Boolean).join(" ");

    const vars = baseVars(doc, settings, t);
    vars.mwst = c.vatMode === "incl" ? t.contractVatIncl : t.contractVatExcl;
    vars.kuendigungsfrist = str(c.noticePeriod);
    vars.vertragsnummer = str(c.number);

    // Monthly fee sentence: one vehicle / several of one model / several model groups
    const rates = items.filter((it) => it.rate != null);
    const sameRate = rates.length > 0 && rates.every((it) => it.rate === rates[0].rate);
    if (rates.length === 0) vars.aborate_satz = "";
    else if (vehicleCount === 1) vars.aborate_satz = fill(t.contractRateOne, { ...vars, betrag: F.chf(rates[0].rate, lang) });
    else if (sameRate) vars.aborate_satz = fill(t.contractRateEach, { ...vars, betrag: F.chf(rates[0].rate, lang) });
    else {
      const list = rates.map((it) => fill(t.contractRateFor, { betrag: F.chf(it.rate, lang), modell: it.model }));
      vars.aborate_satz = fill(t.contractRateGroups, { ...vars, liste: joinList(list, t.listAnd) });
    }

    // Surcharges per vehicle (insurance upgrade, package)
    const extras = [];
    if (F.isNum(c.insuranceSurcharge)) extras.push(fill(t.contractSurchargeInsurance, { betrag: F.chf(c.insuranceSurcharge, lang) }));
    if (F.isNum(c.packageSurcharge)) extras.push(fill(t.contractSurchargePackage, { betrag: F.chf(c.packageSurcharge, lang), paket: str(c.packageType).trim() }));
    vars.aufpreis_satz = extras.length ? ` ${fill(t.contractSurchargeText, { ...vars, liste: joinList(extras, t.listAnd) })}` : "";
    if (F.isNum(c.downPayment)) vars.aufpreis_satz += ` ${fill(t.contractDownPaymentText, { ...vars, betrag: F.chf(c.downPayment, lang) })}`;

    // Extra kilometres
    const kmRates = items.filter((it) => it.extraKmRate != null);
    const sameKm = kmRates.length > 0 && kmRates.every((it) => it.extraKmRate === kmRates[0].extraKmRate);
    if (kmRates.length === 0) vars.mehrkm_satz = "";
    else if (sameKm) vars.mehrkm_satz = fill(t.contractExtraKmOne, { ...vars, betrag: F.chf2(kmRates[0].extraKmRate, lang) });
    else {
      const list = kmRates.map((it) => fill(t.contractRateFor, { betrag: F.chf2(it.extraKmRate, lang), modell: it.model }));
      vars.mehrkm_satz = fill(t.contractExtraKmGroups, { ...vars, liste: joinList(list, t.listAnd) });
    }

    const number = str(c.number).trim();
    const subtitle =
      kind === "takeover" ? t.contractTakeoverSubtitle : number ? `${t.contractNumberLabel} ${number}${kind === "adjustment" ? t.contractAdjustmentSuffix : ""}` : "";
    const startLabel = { new: t.contractFieldStart, adjustment: t.contractFieldStartAdjustment, takeover: t.contractFieldStartTakeover }[kind];
    const grid = [
      { label: t.contractFieldModel, lines: items.map(labelled) },
      { label: startLabel, lines: [startText(c, lang)] },
      { label: t.contractFieldKm, lines: [F.isNum(c.km) ? `${each}${F.number(c.km, lang)}` : str(c.km)] },
      { label: t.contractFieldTerm, lines: [F.isNum(c.months) ? String(c.months) : str(c.months)] },
      { label: t.contractFieldInsurance, lines: [surcharge(c.insurance, c.insuranceSurcharge)] },
      { label: t.contractFieldPackage, lines: [surcharge(c.packageType, c.packageSurcharge)] },
    ];
    if (str(c.vehicleIds).trim()) grid.splice(2, 0, { label: t.contractFieldVehicleId, lines: [str(c.vehicleIds).trim()] });
    return {
      t,
      vars,
      kind,
      number,
      subtitle,
      intro: { new: t.contractVehiclesIntro, adjustment: t.contractVehiclesIntroAdjustment, takeover: t.contractVehiclesIntroTakeover }[kind],
      models: items.map(labelled),
      grid,
      vehicleCount,
      rateBlocks: richText(t.contractRateText, vars),
      carify: {
        name: settings.company.legalName || settings.company.name,
        address: addressLine(settings.company),
      },
      customer: { name: doc.customer.company.trim(), address: addressLine(doc.customer) },
      signDate: F.date(doc.date),
      signatory: str(c.signatory).trim(),
    };
  }

  // ---------------------------------------------------------------------------
  // Names, e-mail, validation
  // ---------------------------------------------------------------------------

  const FILE_PATTERNS = {
    offer: "Offerte {{nachname}} ({{firma}})",
    new: "CARIFY Vertrag - {{firma}}",
    adjustment: "CARIFY Vertrag - {{firma}} - Anpassung",
    takeover: "CARIFY Vertragsanpassung - {{firma}}",
  };

  function fileName(doc, settings) {
    const t = texts(settings, doc.lang);
    const vars = baseVars(doc, settings, t);
    const pattern = doc.type === "offer" ? FILE_PATTERNS.offer : FILE_PATTERNS[doc.contract.kind] || FILE_PATTERNS.new;
    let name = fill(pattern, vars)
      .replace(/\(\s*\)/g, "")
      .replace(/\s+-\s*$/, "");
    if (!vars.firma && !vars.nachname) name = name.replace(/\s+$/, "") + ` ${F.date(doc.date)}`;
    return F.fileSafe(name) || "CARIFY Dokument";
  }

  // template: "send" (offer or contract) or "followup" (offers only)
  function emailText(doc, settings, template) {
    const t = texts(settings, doc.lang);
    const vars = doc.type === "offer" ? offerView(doc, settings).vars : baseVars(doc, settings, t);
    let subject = t.emailSubjectContract;
    let body = t.emailContract;
    if (doc.type === "offer" && template === "followup") {
      subject = t.emailSubjectFollowUp;
      body = t.emailFollowUp;
    } else if (doc.type === "offer") {
      subject = t.emailSubjectOffer;
      body = t.emailOffer;
    }
    subject = fill(subject, vars);
    return { subject: vars.firma ? `${subject} – ${vars.firma}` : subject, body: fill(body, vars) };
  }

  // Returns [{ field, message }] – missing or suspicious inputs, shown as a checklist in the editor.
  function validate(doc, settings) {
    const issues = [];
    const need = (cond, field, message) => {
      if (!cond) issues.push({ field, message });
    };
    need(doc.customer.company.trim(), "customer.company", "Firma des Kunden fehlt.");
    need(F.parseIsoDate(doc.date), "date", "Datum fehlt.");
    if (doc.type === "offer") {
      const o = doc.offer;
      need(settings.team.length === 0 || owner(doc, settings), "ownerId", "Ansprechpartner/in bei CARIFY wählen.");
      need(settings.team.length > 0, "ownerId", "Noch kein Team erfasst (Einstellungen → Team).");
      if (doc.contact.salutation) need(doc.contact.lastName.trim(), "contact.lastName", "Nachname der Kontaktperson fehlt.");
      if (o.sections.prices) {
        need(o.vehicles.length > 0, "vehicles", "Mindestens ein Fahrzeug erfassen.");
        o.vehicles.forEach((v, i) => {
          need(v.model.trim(), `vehicles.${i}.model`, `Fahrzeug ${i + 1}: Modell fehlt.`);
          need(v.rows.some((r) => v.kms.some((km) => F.isNum(r.prices[km]))), `vehicles.${i}.prices`, `Fahrzeug ${i + 1}: noch kein Preis erfasst.`);
          need(!v.link.trim() || /^https:\/\//i.test(v.link.trim()), `vehicles.${i}.link`, `Fahrzeug ${i + 1}: Link muss mit https:// beginnen.`);
        });
      }
    } else {
      const c = doc.contract;
      if (c.kind !== "takeover") need(c.number.trim(), "contract.number", "Vertragsnummer fehlt.");
      need(doc.customer.street.trim() && doc.customer.zip.trim() && doc.customer.city.trim(), "customer.address", "Anschrift des Kunden unvollständig.");
      need(settings.company.street && settings.company.city, "settings.company", "CARIFY-Anschrift fehlt (Einstellungen → Firma).");
      need(c.start, "contract.start", "Geplanter Abobeginn fehlt.");
      need(F.isNum(c.km) || str(c.km).trim(), "contract.km", "Kilometer-Package fehlt.");
      need(F.isNum(c.months) || str(c.months).trim(), "contract.months", "Mindestlaufzeit fehlt.");
      need(c.items.length > 0, "items", "Mindestens ein Fahrzeug erfassen.");
      c.items.forEach((it, i) => {
        const n = c.items.length > 1 ? `Fahrzeug ${i + 1}: ` : "";
        need(str(it.model).trim(), `items.${i}.model`, `${n}Fahrzeugmodell fehlt.`);
        need(F.isNum(it.rate), `items.${i}.rate`, `${n}Aborate fehlt.`);
        need(F.isNum(it.extraKmRate), `items.${i}.extraKmRate`, `${n}Preis für Mehrkilometer fehlt.`);
      });
    }
    return issues;
  }

  return {
    TYPES,
    CONTRACT_KINDS,
    LANGS,
    uid,
    clone,
    mergeSettings,
    texts,
    newDocument,
    newVehicle,
    newContractItem,
    normalizeVehicle,
    normalizeDocument,
    duplicateDocument,
    offerOptions,
    contractFromOffer,
    fill,
    runs,
    richText,
    salutation,
    addressLine,
    offerView,
    contractView,
    fileName,
    emailText,
    validate,
  };
})();
