// CARIFY Offerten & Verträge – editor UI. Vanilla JS, no dependencies.
// All dynamic content is created with DOM APIs (textContent / createElement), never via innerHTML.
// Everything is stored in this browser (localStorage); nothing leaves the device.

"use strict";

(() => {
  const F = globalThis.CarifyFormat;
  const M = globalThis.CarifyModel;
  const R = globalThis.CarifyRender;
  const D = globalThis.CarifyDefaults;
  const h = R.h;

  const KEYS = {
    settings: "carify.offerten.settings",
    docs: "carify.offerten.docs",
    current: "carify.offerten.current",
    me: "carify.offerten.me",
  };

  const TYPE_LABEL = { offer: "Offerte", contract: "Vertrag" };
  const KIND_LABEL = { new: "Vertrag", adjustment: "Vertrag (Anpassung)", takeover: "Vertragsanpassung (Übernahme)" };
  const LANG_OPTIONS = [
    ["de", "Deutsch"],
    ["fr", "Français"],
    ["en", "English"],
  ];
  const FUELS = ["Benzin", "Diesel", "Elektro", "Hybrid", "Plug-in-Hybrid", "Mild-Hybrid-Benzin"];
  const GEARBOXES = ["Automatik", "Manuell"];

  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        const full = err && (err.name === "QuotaExceededError" || err.code === 22);
        toast(full ? "Speicher voll – entferne grosse Bilder in den Einstellungen." : "Speichern im Browser nicht möglich.");
        return false;
      }
    },
  };

  const state = {
    settings: null,
    docs: [],
    doc: null,
    me: "",
    overflowPages: [],
  };

  function loadSettings() {
    try {
      return M.mergeSettings(store.get(KEYS.settings, null));
    } catch {
      return M.mergeSettings(null);
    }
  }

  function loadDocs(settings) {
    const raw = store.get(KEYS.docs, []);
    const docs = [];
    for (const item of Array.isArray(raw) ? raw : []) {
      try {
        docs.push(M.normalizeDocument(item, settings));
      } catch {
        /* skip broken drafts */
      }
    }
    return docs;
  }

  function saveSettings() {
    store.set(KEYS.settings, state.settings);
  }

  function saveDocs() {
    if (store.set(KEYS.docs, state.docs)) {
      setSaveState("Gespeichert");
    }
    store.set(KEYS.current, state.doc?.id || "");
  }

  let saveTimer = 0;
  function scheduleSave() {
    setSaveState("Speichert …");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (state.doc) state.doc.updatedAt = new Date().toISOString();
      saveDocs();
    }, 350);
  }

  function setSaveState(text) {
    $("#save-state").textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  let toastTimer = 0;
  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  const today = () => F.toIsoDate(new Date());

  function defaultOwner() {
    const team = state.settings.team;
    return team.find((m) => m.id === state.me)?.id || team[0]?.id || "";
  }

  function addDoc(doc) {
    state.docs.unshift(doc);
    openDoc(doc.id);
    scheduleSave();
  }

  function newDoc(type) {
    const doc = M.newDocument(type, state.settings, today());
    doc.ownerId = defaultOwner();
    addDoc(doc);
    toast(type === "offer" ? "Neue Offerte angelegt" : "Neuer Vertrag angelegt");
    focusFirstField();
  }

  function openDoc(id) {
    const doc = state.docs.find((d) => d.id === id);
    if (!doc) return;
    state.doc = doc;
    store.set(KEYS.current, id);
    renderEditor();
    schedulePreview(0);
  }

  function deleteDoc(id) {
    const idx = state.docs.findIndex((d) => d.id === id);
    if (idx < 0) return;
    state.docs.splice(idx, 1);
    if (state.doc?.id === id) {
      if (!state.docs.length) state.docs.push(Object.assign(M.newDocument("offer", state.settings, today()), { ownerId: defaultOwner() }));
      openDoc(state.docs[0].id);
    }
    saveDocs();
    renderDrafts();
  }

  function docTitle(doc) {
    const firm = doc.customer.company.trim();
    const label = doc.type === "offer" ? "Offerte" : KIND_LABEL[doc.contract.kind] || "Vertrag";
    return firm ? `${label} · ${firm}` : `${label} (ohne Kunde)`;
  }

  // Every change goes through here: mutate, save, re-render the preview, and – for changes that
  // add or remove inputs – rebuild the form.
  function update(mutate, opts) {
    mutate(state.doc);
    scheduleSave();
    schedulePreview();
    if (opts?.structural) renderEditor();
    else refreshChecklist();
  }

  function updateSettings(mutate, opts) {
    mutate(state.settings);
    saveSettings();
    schedulePreview();
    if (opts?.editor) renderEditor();
    if (opts?.settings) renderSettings();
    updateBanner();
  }

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  let previewTimer = 0;
  let fontsReady = null;

  function schedulePreview(delay = 140) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, delay);
  }

  function loadFonts() {
    if (!fontsReady) {
      const faces = ["400 15px Inter", "italic 400 15px Inter", "500 15px Inter", "600 15px Inter", "700 15px Inter"];
      fontsReady = Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready);
    }
    return fontsReady;
  }

  async function renderPreview() {
    if (!state.doc) return;
    await loadFonts();
    const root = $("#doc-root");
    const stage = $("#preview-stage");
    const preview = $("#preview");
    // Pagination measures the pages, so they must be laid out even when the preview tab is hidden.
    const hidden = getComputedStyle(preview).display === "none";
    if (hidden) preview.style.cssText = "display:block;position:absolute;visibility:hidden;left:-10000px;top:0";
    try {
      state.overflowPages = R.render(root, state.doc, state.settings).overflowPages;
    } catch (err) {
      console.error(err);
      state.overflowPages = [];
      root.replaceChildren(h("p", { class: "hint", text: "Vorschau nicht möglich – bitte Eingaben prüfen." }));
    }
    if (hidden) preview.style.cssText = "";
    const pages = root.querySelectorAll(".doc-page").length;
    $("#page-count").textContent = pages === 1 ? "1 Seite A4" : `${pages} Seiten A4`;
    $("#doc-filename").textContent = `${M.fileName(state.doc, state.settings)}.pdf`;
    $("#contract-from-offer").hidden = state.doc.type !== "offer";
    fitPreview(stage);
    refreshChecklist();
  }

  function fitPreview(stage = $("#preview-stage")) {
    const scaler = $("#preview-scaler");
    const root = $("#doc-root");
    const pageWidth = 793.7; // 210mm at 96dpi
    const available = stage.clientWidth - parseFloat(getComputedStyle(stage).paddingLeft) - parseFloat(getComputedStyle(stage).paddingRight);
    const scale = Math.min(1, Math.max(0.2, available / pageWidth));
    scaler.style.transform = `scale(${scale})`;
    scaler.style.width = `${pageWidth}px`;
    scaler.style.height = `${root.offsetHeight * scale}px`;
    scaler.style.marginLeft = `${Math.max(0, (available - pageWidth * scale) / 2)}px`;
  }

  // ---------------------------------------------------------------------------
  // Form building blocks
  // ---------------------------------------------------------------------------

  let fieldCounter = 0;
  const nextId = () => `f${++fieldCounter}`;

  function field(label, control, opts) {
    const id = control.id || (control.id = nextId());
    const wrap = h("div", { class: "field", dataset: { field: opts?.field || "" } },
      h("label", { class: "field-label", for: id, text: label }),
      control,
      opts?.hint ? h("span", { class: "field-hint", text: opts.hint }) : null);
    return wrap;
  }

  function textInput(value, onInput, attrs) {
    const input = h("input", { class: "input", type: "text", value: value ?? "", autocomplete: "off", ...attrs });
    input.addEventListener("input", () => onInput(input.value));
    return input;
  }

  function text(label, value, onInput, opts) {
    return field(label, textInput(value, onInput, opts?.attrs), opts);
  }

  // Number input that accepts Swiss formats; invalid input is highlighted and not stored.
  function numberInput(value, onValue, attrs) {
    const shown = F.isNum(value) ? String(value) : value ?? "";
    const input = h("input", { class: "input", type: "text", inputmode: "decimal", value: shown, autocomplete: "off", ...attrs });
    input.addEventListener("input", () => {
      const raw = input.value.trim();
      const n = F.parseNumber(raw);
      input.classList.toggle("is-invalid", raw !== "" && n === null);
      if (raw === "" || n !== null) onValue(raw === "" ? null : n);
    });
    return input;
  }

  function number(label, value, onValue, opts) {
    return field(label, numberInput(value, onValue, opts?.attrs), opts);
  }

  // Number or free text (e.g. "12 + Verlängerung")
  function numberOrText(label, value, onValue, opts) {
    const input = textInput(F.isNum(value) ? String(value) : value ?? "", (raw) => {
      const trimmed = raw.trim();
      const n = /^[\d\s’'.,]+$/.test(trimmed) ? F.parseNumber(trimmed) : null;
      onValue(trimmed === "" ? null : n ?? trimmed);
    }, opts?.attrs);
    return field(label, input, opts);
  }

  function dateField(label, value, onInput, opts) {
    const input = h("input", { class: "input", type: "date", value: value || "" });
    input.addEventListener("change", () => onInput(input.value));
    input.addEventListener("input", () => onInput(input.value));
    return field(label, input, opts);
  }

  function textarea(label, value, onInput, opts) {
    const area = h("textarea", { class: "input", rows: opts?.rows || 5 });
    area.value = value ?? "";
    area.addEventListener("input", () => onInput(area.value));
    return field(label, area, opts);
  }

  function select(label, options, value, onChange, opts) {
    const sel = h("select", { class: "input" }, options.map(([v, l]) => h("option", { value: v, text: l, selected: v === value })));
    sel.addEventListener("change", () => onChange(sel.value));
    return field(label, sel, opts);
  }

  function segmented(label, options, value, onChange, opts) {
    const name = nextId();
    const group = h("div", { class: "segmented", role: "radiogroup", "aria-label": label },
      options.map(([v, l]) => {
        const input = h("input", { type: "radio", name, value: v, checked: v === value });
        input.addEventListener("change", () => input.checked && onChange(v));
        return h("label", {}, input, h("span", { text: l }));
      }));
    return h("div", { class: "field", dataset: { field: opts?.field || "" } }, h("span", { class: "field-label", text: label }), group, opts?.hint ? h("span", { class: "field-hint", text: opts.hint }) : null);
  }

  function checkbox(label, checked, onChange) {
    const input = h("input", { type: "checkbox", checked: !!checked });
    input.addEventListener("change", () => onChange(input.checked));
    return h("label", { class: "check" }, input, h("span", { text: label }));
  }

  function datalist(values) {
    const id = nextId();
    return { id, el: h("datalist", { id }, values.map((v) => h("option", { value: v }))) };
  }

  function withList(fieldEl, values) {
    const list = datalist(values);
    fieldEl.querySelector("input").setAttribute("list", list.id);
    fieldEl.append(list.el);
    return fieldEl;
  }

  function section(title, children, opts) {
    const details = h("details", { class: "section", open: opts?.open !== false, id: opts?.id || null },
      h("summary", {}, h("span", { text: title }), opts?.sub ? h("span", { class: "section-sub", text: opts.sub }) : null),
      h("div", { class: "section-body" }, children));
    return details;
  }

  function iconButton(label, symbol, onClick, cls) {
    const btn = h("button", { type: "button", class: `btn btn-ghost btn-sm btn-icon ${cls || ""}`, "aria-label": label, title: label, text: symbol });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function button(label, onClick, cls) {
    const btn = h("button", { type: "button", class: `btn ${cls || ""}`, text: label });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function move(list, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
  }

  // ---------------------------------------------------------------------------
  // Editor
  // ---------------------------------------------------------------------------

  function renderEditor() {
    const doc = state.doc;
    const editor = $("#editor");
    const scroll = editor.scrollTop;
    const openState = new Map([...editor.querySelectorAll("details.section[id]")].map((d) => [d.id, d.open]));
    fieldCounter = 0;
    const head = h("div", { class: "editor-head" },
      h("div", {},
        h("span", { class: "type-chip", text: doc.type === "offer" ? "Offerte" : KIND_LABEL[doc.contract.kind] }),
        h("h1", { class: "editor-title", id: "editor-title", text: doc.customer.company.trim() || "Neuer Kunde" })),
      button("Duplizieren", () => {
        addDoc(M.duplicateDocument(doc, today()));
        toast("Kopie erstellt");
      }, "btn-sm"));
    const sections = doc.type === "offer" ? offerSections(doc) : contractSections(doc);
    editor.replaceChildren(head, h("div", { id: "checklist" }), ...sections);
    for (const [id, open] of openState) {
      const el = editor.querySelector(`#${id}`);
      if (el) el.open = open;
    }
    editor.scrollTop = scroll;
    refreshChecklist();
  }

  function refreshChecklist() {
    const issues = M.validate(state.doc, state.settings);
    for (const n of state.overflowPages) issues.push({ field: "", message: `Seite ${n}: Inhalt ist zu lang und wird abgeschnitten – Text kürzen.` });
    const box = $("#checklist");
    if (!box) return;
    $("#editor-title").textContent = state.doc.customer.company.trim() || "Neuer Kunde";
    for (const el of document.querySelectorAll(".field.is-missing")) el.classList.remove("is-missing");
    if (!issues.length) {
      box.replaceChildren(h("div", { class: "checklist is-done", text: "Alles erfasst – bereit für das PDF." }));
      return;
    }
    for (const issue of issues) if (issue.field) document.querySelector(`.field[data-field="${CSS.escape(issue.field)}"]`)?.classList.add("is-missing");
    box.replaceChildren(h("div", { class: "checklist" },
      h("strong", { text: `Noch offen (${issues.length})` }),
      h("ul", {}, issues.map((issue) => {
        if (!issue.field) return h("li", { text: issue.message });
        const btn = h("button", { type: "button", text: issue.message });
        btn.addEventListener("click", () => focusField(issue.field));
        return h("li", {}, btn);
      }))));
  }

  function focusField(name) {
    if (name.startsWith("settings") || name === "ownerId" && !state.settings.team.length) {
      openSettings(name === "ownerId" ? "team" : "company");
      return;
    }
    const el = document.querySelector(`.field[data-field="${CSS.escape(name)}"]`);
    if (!el) return;
    const details = el.closest("details");
    if (details) details.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  }

  function focusFirstField() {
    setTimeout(() => $("#editor input")?.focus(), 50);
  }

  function teamOptions() {
    const team = state.settings.team;
    if (!team.length) return [["", "– noch kein Team erfasst –"]];
    return team.map((m) => [m.id, m.role ? `${m.name} · ${m.role}` : m.name]);
  }

  function customerFields(doc, opts) {
    const c = doc.customer;
    const k = doc.contact;
    const items = [
      text("Firma", c.company, (v) => update((d) => (d.customer.company = v)), { field: "customer.company", attrs: { autocomplete: "organization" } }),
    ];
    if (opts.contactFirst) {
      items.push(
        segmented("Anrede", [["Herr", "Herr"], ["Frau", "Frau"], ["", "Keine"]], k.salutation, (v) => update((d) => (d.contact.salutation = v))),
        h("div", { class: "row" },
          text("Vorname", k.firstName, (v) => update((d) => (d.contact.firstName = v))),
          text("Nachname", k.lastName, (v) => update((d) => (d.contact.lastName = v)), { field: "contact.lastName" })));
    }
    items.push(
      text("Strasse, Nr.", c.street, (v) => update((d) => (d.customer.street = v)), { field: "customer.address", hint: opts.addressHint }),
      h("div", { class: "row row-zip" },
        text("PLZ", c.zip, (v) => update((d) => (d.customer.zip = v)), { attrs: { inputmode: "numeric" } }),
        text("Ort", c.city, (v) => update((d) => (d.customer.city = v)))),
      text("Land", c.country, (v) => update((d) => (d.customer.country = v)), { hint: "Kürzel wie im Vertrag, z. B. CH oder DE" }));
    if (!opts.contactFirst) {
      items.push(
        segmented("Kontaktperson: Anrede", [["Herr", "Herr"], ["Frau", "Frau"], ["", "Keine"]], k.salutation, (v) => update((d) => (d.contact.salutation = v)), { hint: "Nur für den E-Mail-Text, erscheint nicht im Vertrag." }),
        h("div", { class: "row" },
          text("Vorname", k.firstName, (v) => update((d) => (d.contact.firstName = v))),
          text("Nachname", k.lastName, (v) => update((d) => (d.contact.lastName = v)))));
    }
    items.push(text("E-Mail der Kontaktperson", k.email, (v) => update((d) => (d.contact.email = v)), { attrs: { type: "email", autocomplete: "email" }, hint: "Für «Im Mailprogramm öffnen»." }));
    return items;
  }

  // ---- Offer

  function offerSections(doc) {
    const o = doc.offer;
    return [
      section("Kunde", customerFields(doc, { contactFirst: true, addressHint: "Adresse ist optional, erscheint im Briefkopf." }), { id: "sec-customer" }),
      section("Offerte", [
        h("div", { class: "row" },
          dateField("Datum", doc.date, (v) => update((d) => (d.date = v)), { field: "date" }),
          number("Gültig (Tage)", o.validityDays, (v) => update((d) => (d.offer.validityDays = v ?? 0)), { hint: o.validityDays ? `bis ${F.date(F.addDays(doc.date, Number(o.validityDays) || 0))}` : "" })),
        select("Ansprechpartner/in", teamOptions(), doc.ownerId, (v) => update((d) => (d.ownerId = v)), { field: "ownerId" }),
        segmented("Sprache", LANG_OPTIONS, doc.lang, (v) => update((d) => (d.lang = v), { structural: true })),
        segmented("Preise anzeigen", [["excl", "exkl. MwSt"], ["incl", "inkl. MwSt"], ["both", "beides"]], o.vatMode, (v) => update((d) => (d.offer.vatMode = v)), { hint: "Preise immer exkl. MwSt erfassen – inkl. rechnet die App." }),
        segmented("Versicherungs-Aufpreis", [["none", "nicht zeigen"], ["column", "als Spalte"], ["note", "beim Fahrzeug"]], o.insuranceDisplay, (v) => update((d) => (d.offer.insuranceDisplay = v))),
        number("Zuschlag Privatbuchung (CHF/Monat)", o.privateSurcharge, (v) => update((d) => (d.offer.privateSurcharge = v)), { hint: "Leer lassen, wenn nicht nötig." }),
        h("div", { class: "checks" },
          checkbox("Indikative Offerte", o.indicative, (v) => update((d) => (d.offer.indicative = v))),
          checkbox("Laufzeiten ohne Preis ausblenden", o.hideEmptyRows, (v) => update((d) => (d.offer.hideEmptyRows = v)))),
      ], { id: "sec-offer" }),
      section("Seiten", [
        h("div", { class: "checks" },
          checkbox("Deckblatt", o.sections.cover, (v) => update((d) => (d.offer.sections.cover = v))),
          checkbox("Begleitbrief", o.sections.letter, (v) => update((d) => (d.offer.sections.letter = v))),
          checkbox("Warum Auto-Abo?", o.sections.why, (v) => update((d) => (d.offer.sections.why = v))),
          checkbox("Preistabelle", o.sections.prices, (v) => update((d) => (d.offer.sections.prices = v))),
          (M.texts(state.settings, doc.lang).options || []).length
            ? checkbox("Zusatzoptionen", o.sections.options, (v) => update((d) => (d.offer.sections.options = v)))
            : null),
      ], { id: "sec-pages", open: false }),
      section("Fahrzeuge & Preise", vehicleEditor(doc), { id: "sec-vehicles", sub: `${o.vehicles.length} Fahrzeug${o.vehicles.length === 1 ? "" : "e"}` }),
    ];
  }

  function vehicleEditor(doc) {
    const o = doc.offer;
    const children = [];
    const catalog = state.settings.catalog;
    if (catalog.length) {
      const sel = h("select", { class: "input" },
        h("option", { value: "", text: `Aus Katalog hinzufügen (${catalog.length}) …` }),
        catalog.map((v) => h("option", { value: v.id, text: [v.model, v.year, v.stand ? `Stand ${v.stand}` : ""].filter(Boolean).join(" · ") })));
      sel.addEventListener("change", () => {
        const item = catalog.find((v) => v.id === sel.value);
        if (!item) return;
        const copy = M.normalizeVehicle(M.clone(item));
        copy.id = M.uid("veh");
        update((d) => {
          // replace the untouched starter vehicle instead of adding next to it
          const first = d.offer.vehicles[0];
          if (d.offer.vehicles.length === 1 && !first.model.trim() && !M.offerOptions(d).length) d.offer.vehicles = [copy];
          else d.offer.vehicles.push(copy);
        }, { structural: true });
        toast(`${item.model || "Fahrzeug"} übernommen – Preise kurz prüfen.`);
      });
      children.push(field("Fahrzeugkatalog", sel));
    }
    o.vehicles.forEach((v, i) => children.push(vehicleCard(v, i, o.vehicles.length, (fn, opts) => update((d) => fn(d.offer.vehicles[i], d), opts), {
      remove: () => update((d) => d.offer.vehicles.splice(i, 1), { structural: true }),
      up: () => update((d) => move(d.offer.vehicles, i, -1), { structural: true }),
      down: () => update((d) => move(d.offer.vehicles, i, 1), { structural: true }),
      duplicate: () => update((d) => {
        const copy = M.clone(d.offer.vehicles[i]);
        copy.id = M.uid("veh");
        d.offer.vehicles.splice(i + 1, 0, copy);
      }, { structural: true }),
      toCatalog: () => saveToCatalog(v),
    }, `vehicles.${i}`)));
    if (!o.vehicles.length) children.push(h("p", { class: "empty", text: "Noch kein Fahrzeug – füge eines hinzu." }));
    children.push(button("＋ Fahrzeug hinzufügen", () => update((d) => d.offer.vehicles.push(M.newVehicle(state.settings, d.offer.vehicles.at(-1)?.kms, d.offer.vehicles.at(-1)?.rows.map((r) => r.months))), { structural: true }), "add-row btn-sm"));
    return children;
  }

  function saveToCatalog(vehicle) {
    if (!vehicle.model.trim()) {
      toast("Zuerst ein Modell erfassen.");
      return;
    }
    updateSettings((s) => {
      const copy = M.normalizeVehicle(M.clone(vehicle));
      copy.stand = F.date(today());
      const idx = s.catalog.findIndex((c) => c.model.trim().toLowerCase() === vehicle.model.trim().toLowerCase() && c.year === vehicle.year);
      if (idx >= 0) {
        copy.id = s.catalog[idx].id;
        s.catalog[idx] = copy;
      } else {
        copy.id = M.uid("cat");
        s.catalog.push(copy);
      }
    }, { editor: true });
    toast("Im Fahrzeugkatalog gespeichert");
  }

  // Shared by the offer editor and the catalog in the settings.
  function vehicleCard(v, i, total, change, actions, fieldPrefix) {
    const d = state.settings.defaults;
    const kmOptions = [...new Set([...d.kmPackages, ...v.kms])].sort((a, b) => a - b);
    const termOptions = [...new Set([...d.terms, ...v.rows.map((r) => r.months)])].filter((n) => n > 0).sort((a, b) => a - b);

    const toggleKm = (km) => change((veh) => {
      if (veh.kms.includes(km)) {
        veh.kms = veh.kms.filter((k) => k !== km);
        veh.rows.forEach((r) => delete r.prices[km]);
      } else {
        veh.kms = [...veh.kms, km].sort((a, b) => a - b);
        veh.rows.forEach((r) => (r.prices[km] = null));
      }
    }, { structural: true });

    const toggleTerm = (months) => change((veh) => {
      if (veh.rows.some((r) => r.months === months)) veh.rows = veh.rows.filter((r) => r.months !== months);
      else {
        const prices = {};
        veh.kms.forEach((k) => (prices[k] = null));
        veh.rows = [...veh.rows, { months, prices, insurance: null }].sort((a, b) => a.months - b.months);
      }
    }, { structural: true });

    const addCustom = (placeholder, onAdd) => {
      const input = h("input", { class: "chip-add", type: "text", inputmode: "numeric", placeholder, "aria-label": placeholder });
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const n = F.parseNumber(input.value);
        if (n && n > 0) onAdd(Math.round(n));
      });
      input.addEventListener("change", () => {
        const n = F.parseNumber(input.value);
        if (n && n > 0) onAdd(Math.round(n));
      });
      return input;
    };

    const chip = (label, pressed, onClick) => {
      const btn = h("button", { type: "button", class: "chip", "aria-pressed": pressed ? "true" : "false", text: label });
      btn.addEventListener("click", onClick);
      return btn;
    };

    const tools = [
      actions.up && i > 0 ? iconButton("Nach oben", "↑", actions.up) : null,
      actions.down && i < total - 1 ? iconButton("Nach unten", "↓", actions.down) : null,
      actions.duplicate ? iconButton("Duplizieren", "⧉", actions.duplicate) : null,
      actions.toCatalog ? iconButton("Im Katalog speichern", "☆", actions.toCatalog) : null,
      actions.remove ? iconButton("Entfernen", "✕", () => {
        if (!v.model.trim() || confirm(`${v.model} entfernen?`)) actions.remove();
      }, "btn-danger") : null,
    ];

    return h("div", { class: "card" },
      h("div", { class: "card-head" }, h("span", { class: "card-title", text: v.model.trim() || `Fahrzeug ${i + 1}` }), h("div", { class: "card-tools" }, tools)),
      text("Modell", v.model, (val) => change((veh) => (veh.model = val)), { field: `${fieldPrefix}.model`, attrs: { placeholder: "z. B. MARKE Modell 1.5 TSI Sportline" } }),
      h("div", { class: "row row-3" },
        text("Jahrgang", v.year, (val) => change((veh) => (veh.year = val)), { attrs: { placeholder: "z. B. 2026" } }),
        withList(text("Treibstoff", v.fuel, (val) => change((veh) => (veh.fuel = val))), FUELS),
        withList(text("Getriebe", v.gearbox, (val) => change((veh) => (veh.gearbox = val))), GEARBOXES)),
      text("Link zum Fahrzeug (optional)", v.link, (val) => change((veh) => (veh.link = val)), { field: `${fieldPrefix}.link`, attrs: { type: "url", placeholder: "https://…" }, hint: "Im PDF klickbar." }),
      h("div", { class: "field" },
        h("span", { class: "field-label", text: "KM-Pakete pro Monat" }),
        h("div", { class: "chips" }, kmOptions.map((km) => chip(F.number(km), v.kms.includes(km), () => toggleKm(km))), addCustom("+ km", (km) => !v.kms.includes(km) && toggleKm(km)))),
      h("div", { class: "field" },
        h("span", { class: "field-label", text: "Mindestlaufzeiten (Monate)" }),
        h("div", { class: "chips" }, termOptions.map((m) => chip(String(m), v.rows.some((r) => r.months === m), () => toggleTerm(m))), addCustom("+ Mte", (m) => !v.rows.some((r) => r.months === m) && toggleTerm(m)))),
      priceGrid(v, change, fieldPrefix));
  }

  function priceGrid(v, change, fieldPrefix) {
    if (!v.kms.length || !v.rows.length) {
      return h("p", { class: "empty", text: "KM-Pakete und Laufzeiten wählen – dann erscheint die Preistabelle." });
    }
    const inputs = [];
    const table = h("table", { class: "price-grid" },
      h("caption", { class: "sr-only", text: "Preise in CHF pro Monat, exkl. MwSt" }),
      h("thead", {}, h("tr", {},
        h("th", { scope: "col", text: "Mte \\ km" }),
        v.kms.map((km) => h("th", { scope: "col", text: F.number(km) })),
        h("th", { scope: "col", class: "col-ins", text: "Vers. +", title: "Versicherungs-Aufpreis pro Monat (optional)" }))),
      h("tbody", {}, v.rows.map((row, r) => h("tr", {},
        h("th", { scope: "row", text: String(row.months) }),
        v.kms.map((km, c) => {
          const input = numberInput(row.prices[km], (val) => change((veh) => (veh.rows[r].prices[km] = val)), { "aria-label": `${row.months} Monate, ${F.number(km)} km` });
          inputs.push({ input, r, c });
          return h("td", {}, input);
        }),
        h("td", { class: "col-ins" }, numberInput(row.insurance, (val) => change((veh) => (veh.rows[r].insurance = val)), { "aria-label": `${row.months} Monate, Versicherungs-Aufpreis` }))))));

    // Paste a block from Excel / Google Sheets: tabs = columns, new lines = rows.
    for (const { input, r, c } of inputs) {
      input.addEventListener("paste", (e) => {
        const raw = e.clipboardData?.getData("text") || "";
        if (!/[\t\n]/.test(raw.trim())) return;
        e.preventDefault();
        const grid = raw.replace(/\r/g, "").trim().split("\n").map((line) => line.split("\t"));
        change((veh) => {
          grid.forEach((cells, dr) => cells.forEach((cell, dc) => {
            const row = veh.rows[r + dr];
            const km = veh.kms[c + dc];
            if (row && km != null) row.prices[km] = F.parseNumber(cell.trim());
          }));
        }, { structural: true });
        toast("Preise eingefügt");
      });
    }
    return h("div", { class: "field", dataset: { field: `${fieldPrefix}.prices` } },
      h("span", { class: "field-label", text: "Preise CHF/Monat exkl. MwSt" }),
      h("div", { class: "grid-wrap" }, table),
      h("span", { class: "field-hint", text: "Tipp: Preise aus Excel oder Google Sheets markieren, kopieren und ins erste Feld einfügen." }));
  }

  // ---- Contract

  function contractSections(doc) {
    const c = doc.contract;
    const d = state.settings.defaults;
    const startLabel = { new: "Geplanter Abobeginn", adjustment: "Mindestlaufzeit bis", takeover: "Änderungsdatum" }[c.kind];
    return [
      section("Vertrag", [
        segmented("Art", [["new", "Neuer Vertrag"], ["adjustment", "Anpassung"], ["takeover", "Übernahme"]], c.kind, (v) => update((x) => (x.contract.kind = v), { structural: true }), {
          hint: { new: "Auto-Abo Vertrag mit neuer Vertragsnummer.", adjustment: "Bestehender Vertrag wird mit neuen Konditionen neu ausgestellt.", takeover: "Firma übernimmt bestehende Abos («Vertragsanpassung»)." }[c.kind],
        }),
        h("div", { class: "row" },
          c.kind !== "takeover" ? text("Vertragsnummer", c.number, (v) => update((x) => (x.contract.number = v)), { field: "contract.number", attrs: { inputmode: "numeric" } }) : text("Fahrzeug-ID(s)", c.vehicleIds, (v) => update((x) => (x.contract.vehicleIds = v)), { hint: "Mehrere mit Komma trennen." }),
          dateField("Datum", doc.date, (v) => update((x) => (x.date = v)), { field: "date", hint: "Steht bei der CARIFY-Unterschrift." })),
        segmented("Sprache", LANG_OPTIONS, doc.lang, (v) => update((x) => (x.lang = v), { structural: true })),
        h("div", { class: "row" },
          select("Ansprechpartner/in", teamOptions(), doc.ownerId, (v) => update((x) => (x.ownerId = v)), { hint: "Für den E-Mail-Text." }),
          text("Unterzeichnet für CARIFY (optional)", c.signatory, (v) => update((x) => (x.contract.signatory = v)))),
      ], { id: "sec-contract" }),
      section("Abo-Nehmer", customerFields(doc, { contactFirst: false }), { id: "sec-customer" }),
      section("Konditionen", [
        h("div", { class: "row" },
          dateField(startLabel, c.start, (v) => update((x) => (x.contract.start = v)), { field: "contract.start" }),
          h("div", { class: "field" }, h("span", { class: "field-label", text: "Anzeige" }), checkbox("Nur Monat und Jahr", c.startMonthOnly, (v) => update((x) => (x.contract.startMonthOnly = v))))),
        h("div", { class: "row" },
          withList(numberOrText("KM-Package pro Monat", c.km, (v) => update((x) => (x.contract.km = v)), { field: "contract.km" }), d.kmPackages.map(String)),
          withList(numberOrText("Mindestlaufzeit (Monate)", c.months, (v) => update((x) => (x.contract.months = v)), { field: "contract.months", hint: "Zahl oder Text, z. B. «12 + Verlängerung»" }), d.terms.map(String))),
        h("div", { class: "row" },
          withList(text("Insurance-Package", c.insurance, (v) => update((x) => (x.contract.insurance = v))), d.insurancePackages),
          number("Versicherungs-Upgrade (CHF/Monat)", c.insuranceSurcharge, (v) => update((x) => (x.contract.insuranceSurcharge = v)), { hint: "Nur wenn separat verrechnet." })),
        h("div", { class: "row" },
          withList(text("Package Type", c.packageType, (v) => update((x) => (x.contract.packageType = v))), d.packageTypes),
          number("Package-Aufpreis (CHF/Monat)", c.packageSurcharge, (v) => update((x) => (x.contract.packageSurcharge = v)))),
        segmented("Preise", [["excl", "exkl. MwSt"], ["incl", "inkl. MwSt"]], c.vatMode, (v) => update((x) => (x.contract.vatMode = v))),
        h("div", { class: "row" },
          numberOrText("Kündigungsfrist (Tage)", c.noticePeriod, (v) => update((x) => (x.contract.noticePeriod = v)), { hint: "Zahl = Tage, wird übersetzt" }),
          number("Anzahlung (CHF, optional)", c.downPayment, (v) => update((x) => (x.contract.downPayment = v)))),
        c.kind !== "takeover" ? text("Fahrzeug-ID(s) (optional)", c.vehicleIds, (v) => update((x) => (x.contract.vehicleIds = v))) : null,
      ], { id: "sec-terms" }),
      section("Fahrzeuge & Aborate", contractItems(doc), { id: "sec-items", sub: `${c.items.reduce((n, it) => n + (Number(it.qty) || 1), 0)} Fahrzeug(e)` }),
    ];
  }

  function contractItems(doc) {
    const c = doc.contract;
    const rows = c.items.map((it, i) => h("div", { class: "card" },
      h("div", { class: "card-head" },
        h("span", { class: "card-title", text: it.model.trim() || `Modell ${i + 1}` }),
        h("div", { class: "card-tools" }, c.items.length > 1 ? iconButton("Entfernen", "✕", () => update((x) => x.contract.items.splice(i, 1), { structural: true }), "btn-danger") : null)),
      h("div", { class: "item-row" },
        number("Anzahl", it.qty, (v) => update((x) => (x.contract.items[i].qty = Math.max(1, Math.round(v || 1))))),
        text("Fahrzeugmodell", it.model, (v) => update((x) => (x.contract.items[i].model = v)), { field: `items.${i}.model`, attrs: { placeholder: "MARKE Modell - Automatik & Benzin" } }),
        h("span")),
      h("div", { class: "row" },
        number("Aborate je Fahrzeug (CHF/Monat)", it.rate, (v) => update((x) => (x.contract.items[i].rate = v)), { field: `items.${i}.rate` }),
        number("Mehrkilometer (CHF/km)", it.extraKmRate, (v) => update((x) => (x.contract.items[i].extraKmRate = v)), { field: `items.${i}.extraKmRate`, attrs: { placeholder: "0.50" } }))));
    return [
      ...rows,
      h("p", { class: "field-hint", text: "Ein Eintrag pro Modell. Gleiche Modelle mit «Anzahl» zusammenfassen (erscheint als «2x …»)." }),
      button("＋ Weiteres Modell", () => update((x) => x.contract.items.push(M.newContractItem(state.settings)), { structural: true }), "add-row btn-sm"),
    ];
  }

  // ---------------------------------------------------------------------------
  // Drafts dialog
  // ---------------------------------------------------------------------------

  function renderDrafts() {
    const q = $("#drafts-search").value.trim().toLowerCase();
    const list = $("#draft-list");
    const docs = [...state.docs].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    const filtered = docs.filter((d) => !q || [docTitle(d), d.contact.lastName, d.contact.firstName, d.contract?.number].join(" ").toLowerCase().includes(q));
    $("#drafts-count").textContent = String(state.docs.length);
    list.replaceChildren(...filtered.map((d) => {
      const open = h("button", { type: "button", class: "draft-open" },
        h("strong", { text: docTitle(d) }),
        h("span", { text: `${F.date(d.date)} · ${M.fileName(d, state.settings)}` }));
      open.addEventListener("click", () => {
        openDoc(d.id);
        $("#drafts-dialog").close();
      });
      return h("li", { class: `draft ${d.id === state.doc?.id ? "is-current" : ""}` },
        open,
        h("div", { class: "draft-tools" },
          iconButton("Duplizieren", "⧉", () => {
            addDoc(M.duplicateDocument(d, today()));
            renderDrafts();
            toast("Kopie erstellt");
          }),
          iconButton("Löschen", "✕", () => {
            if (confirm(`«${docTitle(d)}» löschen?`)) deleteDoc(d.id);
          }, "btn-danger")));
    }));
    if (!filtered.length) list.replaceChildren(h("li", { class: "empty", text: q ? "Nichts gefunden." : "Noch keine Entwürfe." }));
  }

  // ---------------------------------------------------------------------------
  // Contract from offer
  // ---------------------------------------------------------------------------

  function openContractDialog() {
    const offer = state.doc;
    const options = M.offerOptions(offer);
    const box = $("#contract-options");
    const create = $("#contract-create");
    create.disabled = true;
    if (!options.length) {
      box.replaceChildren(h("p", { class: "empty", text: "Die Offerte hat noch keine Preise." }));
    } else {
      const groups = new Map();
      for (const o of options) {
        if (!groups.has(o.vehicleId)) groups.set(o.vehicleId, []);
        groups.get(o.vehicleId).push(o);
      }
      box.replaceChildren(...[...groups.values()].map((opts) => h("div", { class: "option-group" },
        h("h3", { text: opts[0].model || "Fahrzeug" }),
        opts.map((o) => {
          const input = h("input", { type: "checkbox", value: o.key });
          input.addEventListener("change", () => {
            create.disabled = !box.querySelector("input:checked");
          });
          return h("label", { class: "check" }, input, h("span", { text: `${o.months} Monate · ${F.number(o.km)} km/Monat · ${F.chf(o.price)}${o.insurance != null ? ` (Vers. +${o.insurance})` : ""}` }));
        }))));
    }
    $("#contract-dialog").showModal();
  }

  function createContractFromDialog() {
    const keys = [...$("#contract-options").querySelectorAll("input:checked")].map((i) => i.value);
    const doc = M.contractFromOffer(state.doc, keys, state.settings, today());
    const mismatch = doc.contractMismatch;
    delete doc.contractMismatch;
    $("#contract-dialog").close();
    addDoc(doc);
    toast(mismatch ? "Vertrag erstellt – Laufzeit/KM unterscheiden sich, bitte prüfen." : "Vertrag erstellt – Vertragsnummer und Abobeginn ergänzen.");
  }

  // ---------------------------------------------------------------------------
  // E-mail
  // ---------------------------------------------------------------------------

  function openEmailDialog() {
    const isOffer = state.doc.type === "offer";
    $("#email-template-field").hidden = !isOffer;
    if (!isOffer) $("#email-template").value = "send";
    fillEmail();
    $("#email-dialog").showModal();
  }

  function fillEmail() {
    const mail = M.emailText(state.doc, state.settings, $("#email-template").value);
    $("#email-subject").value = mail.subject;
    $("#email-body").value = mail.body;
    updateMailto();
  }

  function updateMailto() {
    const to = state.doc.contact.email.trim();
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent($("#email-subject").value)}&body=${encodeURIComponent($("#email-body").value)}`;
    $("#email-open").href = href;
  }

  async function copyEmail() {
    const textValue = `${$("#email-subject").value}\n\n${$("#email-body").value}`;
    try {
      await navigator.clipboard.writeText(textValue);
      toast("Text kopiert");
    } catch {
      $("#email-body").select();
      toast("Kopieren nicht erlaubt – Text ist markiert (Ctrl/Cmd + C).");
    }
  }

  // ---------------------------------------------------------------------------
  // Print / PDF
  // ---------------------------------------------------------------------------

  let titleBeforePrint = document.title;

  async function printDoc() {
    clearTimeout(previewTimer);
    await renderPreview();
    window.print();
  }

  function beforePrint() {
    titleBeforePrint = document.title;
    // Chrome and Edge use the document title as the default PDF file name.
    if (state.doc) document.title = M.fileName(state.doc, state.settings);
  }

  function afterPrint() {
    document.title = titleBeforePrint;
  }

  // ---------------------------------------------------------------------------
  // Import / export
  // ---------------------------------------------------------------------------

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let fileHandler = null;
  function pickFile(handler) {
    fileHandler = handler;
    const input = $("#file-input");
    input.value = "";
    input.click();
  }

  async function onFilePicked() {
    const file = $("#file-input").files?.[0];
    if (!file || !fileHandler) return;
    try {
      const data = JSON.parse(await file.text());
      fileHandler(data);
    } catch (err) {
      toast(err instanceof SyntaxError ? "Die Datei ist kein gültiges JSON." : err.message || "Import fehlgeschlagen.");
    }
  }

  function importSettings(data) {
    const merged = M.mergeSettings(data);
    const hadData = state.settings.company.street || state.settings.team.length;
    if (hadData && !confirm("Bestehende Einstellungen in diesem Browser ersetzen?")) return;
    state.settings = merged;
    saveSettings();
    if (!state.settings.team.some((m) => m.id === state.me)) state.me = "";
    if (state.doc && !state.doc.ownerId) state.doc.ownerId = defaultOwner();
    renderEditor();
    schedulePreview(0);
    updateBanner();
    if ($("#settings-dialog").open) renderSettings();
    toast(`Einstellungen importiert${merged.label ? `: ${merged.label}` : ""}`);
  }

  function exportSettings() {
    download(`carify-einstellungen-${today()}.json`, { ...state.settings, label: state.settings.label || "CARIFY" });
    toast("Einstellungen exportiert – nur intern teilen, nicht ins Repo.");
  }

  function exportDrafts() {
    download(`carify-entwuerfe-${today()}.json`, { schema: "carify-offerten-entwuerfe/1", docs: state.docs });
  }

  function importDrafts(data) {
    if (data?.schema !== "carify-offerten-entwuerfe/1" || !Array.isArray(data.docs)) throw new Error("Das ist kein Entwürfe-Backup.");
    let added = 0;
    for (const raw of data.docs) {
      try {
        const doc = M.normalizeDocument(raw, state.settings);
        if (state.docs.some((d) => d.id === doc.id)) continue;
        state.docs.push(doc);
        added += 1;
      } catch {
        /* skip */
      }
    }
    saveDocs();
    renderDrafts();
    toast(`${added} Entwürfe importiert`);
  }

  // ---------------------------------------------------------------------------
  // Settings dialog
  // ---------------------------------------------------------------------------

  const SETTINGS_TABS = [
    ["company", "Firma"],
    ["team", "Team"],
    ["defaults", "Standards"],
    ["texts", "Texte"],
    ["design", "Design"],
    ["catalog", "Fahrzeugkatalog"],
    ["data", "Daten & Import"],
  ];
  let settingsTab = "company";
  let textsLang = "de";

  function openSettings(tab) {
    if (tab) settingsTab = tab;
    renderSettings();
    if (!$("#settings-dialog").open) $("#settings-dialog").showModal();
  }

  function renderSettings() {
    const nav = $("#settings-tabs");
    nav.replaceChildren(...SETTINGS_TABS.map(([id, label]) => {
      const btn = h("button", { type: "button", role: "tab", "aria-selected": id === settingsTab ? "true" : "false", text: label });
      btn.addEventListener("click", () => {
        settingsTab = id;
        renderSettings();
      });
      return btn;
    }));
    const body = $("#settings-body");
    const scroll = body.scrollTop;
    fieldCounter = 1000;
    const builders = { company: settingsCompany, team: settingsTeam, defaults: settingsDefaults, texts: settingsTexts, design: settingsDesign, catalog: settingsCatalog, data: settingsData };
    body.replaceChildren(...builders[settingsTab]());
    body.scrollTop = scroll;
  }

  const set = (mutate, opts) => updateSettings(mutate, opts);

  function settingsCompany() {
    const c = state.settings.company;
    return [
      h("p", { class: "lead", text: "Erscheint im Vertrag (Parteien und Fusszeile). Bleibt nur in diesem Browser gespeichert." }),
      h("div", { class: "row" },
        text("Name (kurz)", c.name, (v) => set((s) => (s.company.name = v))),
        text("Rechtlicher Name", c.legalName, (v) => set((s) => (s.company.legalName = v)), { hint: "z. B. «… AG»" })),
      text("Strasse, Nr.", c.street, (v) => set((s) => (s.company.street = v))),
      h("div", { class: "row row-zip" }, text("PLZ", c.zip, (v) => set((s) => (s.company.zip = v))), text("Ort", c.city, (v) => set((s) => (s.company.city = v)))),
      h("div", { class: "row" }, text("Land", c.country, (v) => set((s) => (s.company.country = v))), text("Website", c.web, (v) => set((s) => (s.company.web = v)))),
    ];
  }

  function settingsTeam() {
    const team = state.settings.team;
    const cards = team.map((m, i) => h("div", { class: "card" },
      h("div", { class: "card-head" },
        h("span", { class: "card-title", text: m.name || `Person ${i + 1}` }),
        h("div", { class: "card-tools" },
          checkbox("Das bin ich", state.me === m.id, (v) => {
            state.me = v ? m.id : "";
            store.set(KEYS.me, state.me);
            renderSettings();
          }),
          iconButton("Entfernen", "✕", () => confirm(`${m.name || "Person"} entfernen?`) && set((s) => s.team.splice(i, 1), { settings: true, editor: true }), "btn-danger"))),
      h("div", { class: "row" },
        text("Name", m.name, (v) => set((s) => (s.team[i].name = v))),
        text("Funktion", m.role, (v) => set((s) => (s.team[i].role = v)), { attrs: { placeholder: "Key Account Manager/in" } })),
      h("div", { class: "row" },
        text("Telefon", m.phone, (v) => set((s) => (s.team[i].phone = v)), { attrs: { type: "tel" } }),
        text("E-Mail", m.email, (v) => set((s) => (s.team[i].email = v)), { attrs: { type: "email" } }))));
    return [
      h("p", { class: "lead", text: "Wer Offerten verschickt. Name, Funktion und Kontakt stehen im Begleitbrief. «Das bin ich» gilt nur in diesem Browser." }),
      ...cards,
      button("＋ Person hinzufügen", () => set((s) => s.team.push({ id: M.uid("team"), name: "", role: "", phone: "", email: "" }), { settings: true, editor: true }), "add-row btn-sm"),
    ];
  }

  const listToNumbers = (v) => v.split(/[,;\s]+/).map((x) => F.parseNumber(x)).filter((n) => n && n > 0);
  const listToStrings = (v) => v.split(",").map((x) => x.trim()).filter(Boolean);

  function settingsDefaults() {
    const d = state.settings.defaults;
    return [
      h("p", { class: "lead", text: "Startwerte für neue Dokumente. Bestehende Entwürfe ändern sich nicht." }),
      text("KM-Pakete (km/Monat, mit Komma)", d.kmPackages.join(", "), (v) => set((s) => (s.defaults.kmPackages = listToNumbers(v)))),
      text("Mindestlaufzeiten (Monate, mit Komma)", d.terms.join(", "), (v) => set((s) => (s.defaults.terms = listToNumbers(v)))),
      h("div", { class: "row" },
        number("MwSt-Satz (%)", d.vatRate, (v) => set((s) => (s.defaults.vatRate = v ?? 0))),
        number("Gültigkeit Offerte (Tage)", d.offerValidityDays, (v) => set((s) => (s.defaults.offerValidityDays = v ?? 0)))),
      h("div", { class: "row" },
        select("Preise in Offerten", [["excl", "exkl. MwSt"], ["incl", "inkl. MwSt"], ["both", "beides"]], d.vatMode, (v) => set((s) => (s.defaults.vatMode = v))),
        select("Versicherungs-Aufpreis", [["none", "nicht zeigen"], ["column", "als Spalte"], ["note", "beim Fahrzeug"]], d.insuranceDisplay, (v) => set((s) => (s.defaults.insuranceDisplay = v)))),
      checkbox("Offerten als «indikativ» bezeichnen", d.offerIndicative, (v) => set((s) => (s.defaults.offerIndicative = v))),
      h("div", { class: "row" },
        number("Mehrkilometer (CHF/km)", d.extraKmRate, (v) => set((s) => (s.defaults.extraKmRate = v))),
        numberOrText("Kündigungsfrist (Tage)", d.noticePeriod, (v) => set((s) => (s.defaults.noticePeriod = v)))),
      text("Insurance-Packages (mit Komma)", d.insurancePackages.join(", "), (v) => set((s) => (s.defaults.insurancePackages = listToStrings(v)))),
      text("Package Types (mit Komma)", d.packageTypes.join(", "), (v) => set((s) => (s.defaults.packageTypes = listToStrings(v)))),
    ];
  }

  // Labels for the text editor, grouped. Keys not listed here are still kept in the file.
  const TEXT_GROUPS = [
    ["Offerte – Deckblatt", [["coverIntro", "Einleitung", 7], ["coverButton", "Button"], ["coverClaim", "Claim (ohne Deckblatt-Bild)"]]],
    ["Offerte – Begleitbrief", [["letterTitle", "Titel"], ["letterBody", "Brieftext", 10], ["letterContactLabel", "Kontakt-Label"], ["salutationMr", "Anrede Herr"], ["salutationMrs", "Anrede Frau"], ["salutationNone", "Anrede ohne Person"], ["vehicleSingular", "«zum gewünschten Fahrzeug»"], ["vehiclePlural", "«zu den gewünschten Fahrzeugen»"]]],
    ["Offerte – Warum Auto-Abo", [["whyTitle", "Titel"], ["whyLead", "Text im orangen Kasten", 4]]],
    ["Offerte – Preistabelle", [["pricesTitle", "Titel (für Inhaltsliste)"], ["colVehicle", "Spalte Fahrzeug"], ["colTerm", "Spalte Laufzeit"], ["colKm", "Spalte KM"], ["colPrice", "Spalte Preis"], ["colPriceExcl", "Spalte Preis exkl."], ["colPriceIncl", "Spalte Preis inkl."], ["colInsurance", "Spalte Versicherung"], ["insuranceNote", "Hinweis Versicherung beim Fahrzeug"], ["privateSurchargeNote", "Hinweis Privatbuchung"], ["validityNote", "Gültigkeit & Reservation", 3], ["indicativeWord", "Wort «indikative»"], ["vatExcl", "Hinweis exkl. MwSt"], ["vatIncl", "Hinweis inkl. MwSt"], ["vatBoth", "Hinweis exkl. & inkl."], ["footnoteTerm", "Fussnote *"], ["footnoteKm", "Fussnote **"], ["bestPriceTitle", "Bestpreis-Band: Titel (leer = kein Band)"], ["bestPriceText", "Bestpreis-Band: Text", 3], ["footerClaim", "Fussband: Claim"]]],
    ["Vertrag", [["contractTitle", "Titel"], ["contractNumberLabel", "«Vertrag Nr.»"], ["contractAdjustmentSuffix", "Zusatz bei Anpassung"], ["contractTakeoverSubtitle", "Untertitel Übernahme"], ["contractBetween", "«zwischen»"], ["contractCarifyAlias", "Rolle CARIFY"], ["contractCustomerLabel", "Label Kunde", 2], ["contractCustomerNote", "Hinweis beim Kunden (z. B. ID-Kopie)"], ["contractCustomerAlias", "Rolle Kunde"], ["contractVehiclesIntro", "Einleitung (neu)"], ["contractVehiclesIntroAdjustment", "Einleitung (Anpassung)"], ["contractVehiclesIntroTakeover", "Einleitung (Übernahme)"], ["contractFieldModel", "Feld Fahrzeugmodell"], ["contractFieldStart", "Feld Abobeginn"], ["contractFieldStartAdjustment", "Feld Datum (Anpassung)"], ["contractFieldStartTakeover", "Feld Datum (Übernahme)"], ["contractFieldVehicleId", "Feld Fahrzeug-ID"], ["contractFieldKm", "Feld KM-Package"], ["contractFieldTerm", "Feld Mindestlaufzeit"], ["contractFieldInsurance", "Feld Insurance"], ["contractFieldPackage", "Feld Package Type"], ["contractReplacement", "Ersatzlösung", 2], ["contractRateTitle", "Titel Aborate"], ["contractRateText", "Text Aborate", 7], ["contractRateOne", "Satz: 1 Fahrzeug"], ["contractRateEach", "Satz: je Fahrzeug"], ["contractRateGroups", "Satz: mehrere Modelle"], ["contractRateFor", "Teil: Betrag für Modell"], ["contractSurchargeText", "Satz: Aufpreise"], ["contractSurchargeInsurance", "Teil: Versicherungs-Upgrade"], ["contractSurchargePackage", "Teil: Package-Aufpreis"], ["contractDownPaymentText", "Satz: Anzahlung", 2], ["contractExtraKmOne", "Satz: Mehrkilometer"], ["contractExtraKmGroups", "Satz: Mehrkilometer je Modell"], ["contractVatExcl", "«exkl. MwSt»"], ["contractVatIncl", "«inkl. MwSt»"], ["contractEach", "«je» vor KM"], ["listAnd", "« und »"], ["contractSignaturesTitle", "Titel Unterschriften"], ["contractSignCarifyRole", "Unterschrift CARIFY"], ["contractSignCustomer", "Kopf Kunde"], ["contractSignPlaceDate", "Zeile Ort, Datum"], ["contractSignName", "Zeile Name"], ["contractSignSignature", "Zeile Unterschrift"], ["contractSignSignatureNote", "Hinweis Zeichnungsberechtigung"], ["contractFootnote", "Fussnote", 2]]],
    ["E-Mail", [["emailSubjectOffer", "Betreff Offerte"], ["emailOffer", "Text Offerte", 8], ["emailSubjectFollowUp", "Betreff Nachfassen"], ["emailFollowUp", "Text Nachfassen", 8], ["emailSubjectContract", "Betreff Vertrag"], ["emailContract", "Text Vertrag", 8]]],
  ];

  function settingsTexts() {
    const lang = textsLang;
    const t = M.texts(state.settings, lang);
    const setText = (key, value) => set((s) => {
      s.texts[lang] = s.texts[lang] || {};
      s.texts[lang][key] = value;
    });
    const groups = TEXT_GROUPS.map(([title, keys]) => section(title, keys.map(([key, label, rows]) => (rows
      ? textarea(label, t[key], (v) => setText(key, v), { rows })
      : text(label, t[key], (v) => setText(key, v)))), { open: false }));
    const listEditor = (title, key, fields) => section(title, [
      ...(t[key] || []).map((item, i) => h("div", { class: "row" },
        ...fields.map(([f, label]) => text(label, item[f], (v) => set((s) => {
          s.texts[lang] = s.texts[lang] || {};
          const list = M.clone(M.texts(s, lang)[key] || []);
          list[i] = { ...list[i], [f]: v };
          s.texts[lang][key] = list;
        }))))),
      h("div", { class: "card-tools" },
        button("＋ Zeile", () => set((s) => {
          s.texts[lang] = s.texts[lang] || {};
          s.texts[lang][key] = [...M.clone(M.texts(s, lang)[key] || []), Object.fromEntries(fields.map(([f]) => [f, ""]))];
        }, { settings: true }), "btn-sm"),
        button("Letzte entfernen", () => set((s) => {
          s.texts[lang] = s.texts[lang] || {};
          s.texts[lang][key] = M.clone(M.texts(s, lang)[key] || []).slice(0, -1);
        }, { settings: true }), "btn-sm btn-ghost")),
    ], { open: false });
    const chart = t.whyChart || { items: [] };
    const setChart = (fn) => set((s) => {
      s.texts[lang] = s.texts[lang] || {};
      const c = M.clone(M.texts(s, lang).whyChart || { items: [] });
      fn(c);
      s.texts[lang].whyChart = c;
    });
    return [
      h("p", { class: "lead", text: "Platzhalter in {{…}} werden automatisch ersetzt, z. B. {{briefanrede}}, {{firma}}, {{zum_fahrzeug}}, {{gueltig_tage}}, {{gueltig_bis}}, {{ansprechpartner}}. **fett** wird fett. Leerzeile = neuer Absatz, «• » = Aufzählung, {{inhalt}} = Inhaltsliste der Offerte." }),
      segmented("Sprache", LANG_OPTIONS, lang, (v) => {
        textsLang = v;
        renderSettings();
      }),
      ...groups,
      listEditor("Offerte – Inklusivleistungen (Warum-Seite)", "included", [["title", "Titel"], ["text", "Text"]]),
      listEditor("Offerte – Vorteile (Warum-Seite)", "usps", [["title", "Titel"], ["text", "Text"]]),
      section("Offerte – Zusatzoptionen (optionale Seite)", [
        text("Titel der Seite", t.optionsTitle, (v) => setText("optionsTitle", v)),
        textarea("Einleitung", t.optionsIntro, (v) => setText("optionsIntro", v), { rows: 3 }),
        ...(t.options || []).map((opt, i) => {
          const setOpt = (f, v) => set((s) => {
            s.texts[lang] = s.texts[lang] || {};
            const list = M.clone(M.texts(s, lang).options || []);
            list[i] = { ...list[i], [f]: v };
            s.texts[lang].options = list;
          });
          return h("div", { class: "card" },
            h("div", { class: "row" }, text("Option", opt.title, (v) => setOpt("title", v)), text("Preiszeile", opt.price, (v) => setOpt("price", v))),
            textarea("Text", opt.text, (v) => setOpt("text", v), { rows: 3 }),
            textarea("Aufzählung (eine Zeile pro Punkt)", (opt.bullets || []).join("\n"), (v) => setOpt("bullets", v.split("\n").map((x) => x.trim()).filter(Boolean)), { rows: 3 }),
            button("Option entfernen", () => set((s) => {
              s.texts[lang] = s.texts[lang] || {};
              s.texts[lang].options = M.clone(M.texts(s, lang).options || []).filter((_, j) => j !== i);
            }, { settings: true }), "btn-sm btn-ghost btn-danger"));
        }),
        button("＋ Option", () => set((s) => {
          s.texts[lang] = s.texts[lang] || {};
          s.texts[lang].options = [...M.clone(M.texts(s, lang).options || []), { title: "", price: "", text: "", bullets: [] }];
        }, { settings: true }), "add-row btn-sm"),
      ], { open: false }),
      section("Offerte – Grafik Kosten vs. Bindung", [
        h("div", { class: "row" },
          text("Achse Y", chart.yAxis, (v) => setChart((c) => (c.yAxis = v))),
          text("Achse X", chart.xAxis, (v) => setChart((c) => (c.xAxis = v)))),
        ...(chart.items || []).map((it, i) => h("div", { class: "row" },
          text(`Punkt ${i + 1}`, it.label, (v) => setChart((c) => (c.items[i].label = v))),
          text("Dauer", it.range, (v) => setChart((c) => (c.items[i].range = v))))),
        h("p", { class: "field-hint", text: "Der Punkt mit «Abo» im Namen wird orange hervorgehoben." }),
      ], { open: false }),
    ];
  }

  // Images are downscaled in the browser and stored as data URLs.
  function readImage(file, maxWidth, keepAlpha) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
        reject(new Error("Bitte ein PNG, JPG, WebP oder SVG wählen."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      reader.onload = () => {
        const dataUrl = String(reader.result);
        if (file.type === "image/svg+xml") {
          resolve(dataUrl);
          return;
        }
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86));
        };
        img.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function imageField(label, hint, value, onChange, opts) {
    const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", hidden: true });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        onChange(await readImage(file, opts?.maxWidth || 1600, opts?.alpha));
      } catch (err) {
        toast(err.message);
      }
    });
    const pick = button(value ? "Ersetzen" : "Bild wählen", () => input.click(), "btn-sm");
    const remove = value ? button("Entfernen", () => onChange(""), "btn-sm btn-ghost") : null;
    return h("div", { class: "field" },
      h("span", { class: "field-label", text: label }),
      h("div", { class: "image-field" },
        h("div", { class: "image-thumb" }, value ? h("img", { src: value, alt: "" }) : "kein Bild"),
        h("div", {}, h("div", { class: "image-actions" }, pick, remove, input), h("span", { class: "field-hint", text: hint }))));
  }

  function settingsDesign() {
    const b = state.settings.branding;
    const badgeTypes = [["swiss", "Swiss made"], ["seal", "Siegel"], ["rating", "Bewertung"]];
    return [
      h("p", { class: "lead", text: "Farben und Schrift sind fix im CARIFY-Design. Hier kommen Logo, Bilder und Vertrauenselemente dazu." }),
      imageField("Logo", "Schwarzes CARIFY-Logo, transparent (PNG oder SVG). Ohne Logo wird der Schriftzug gesetzt.", b.logo, (v) => set((s) => (s.branding.logo = v), { settings: true }), { maxWidth: 1200, alpha: true }),
      imageField("Bild Deckblatt", "z. B. die App-Screens aus Canva als PNG. Ohne Bild: orange Grafik.", b.coverImage, (v) => set((s) => (s.branding.coverImage = v), { settings: true }), { maxWidth: 1600, alpha: true }),
      imageField("Bild «Warum Auto-Abo»", "z. B. Auto mit Inklusivleistungen. Ohne Bild: Icons.", b.whyImage, (v) => set((s) => (s.branding.whyImage = v), { settings: true }), { maxWidth: 1400, alpha: true }),
      text("Referenzen im Fussband (mit Komma)", b.references.join(", "), (v) => set((s) => (s.branding.references = listToStrings(v))), { hint: "Nur wenn keine Referenz-Logos hochgeladen sind." }),
      h("div", { class: "field" },
        h("span", { class: "field-label", text: "Referenz-Logos (weiss, transparent)" }),
        h("div", { class: "image-actions" },
          ...b.referenceLogos.map((src, i) => h("span", { class: "image-thumb" }, h("img", { src, alt: "" }), iconButton("Entfernen", "✕", () => set((s) => s.branding.referenceLogos.splice(i, 1), { settings: true })))),
          imageField("", "", "", (v) => v && set((s) => s.branding.referenceLogos.push(v), { settings: true }), { maxWidth: 600, alpha: true }))),
      h("h3", { text: "Vertrauens-Badges" }),
      ...b.badges.map((badge, i) => h("div", { class: "row row-3" },
        select("Typ", badgeTypes, badge.type, (v) => set((s) => (s.branding.badges[i].type = v))),
        text("Text", badge.label, (v) => set((s) => (s.branding.badges[i].label = v))),
        h("div", { class: "item-row" }, text("Wert", badge.value || "", (v) => set((s) => (s.branding.badges[i].value = v)), { hint: "nur Bewertung" }), h("span"), iconButton("Entfernen", "✕", () => set((s) => s.branding.badges.splice(i, 1), { settings: true }), "btn-danger")))),
      button("＋ Badge", () => set((s) => s.branding.badges.push({ type: "swiss", label: "", value: "" }), { settings: true }), "add-row btn-sm"),
    ];
  }

  function settingsCatalog() {
    const catalog = state.settings.catalog;
    const cards = catalog.map((v, i) => vehicleCard(v, i, catalog.length, (fn, opts) => set((s) => fn(s.catalog[i], s), opts?.structural ? { settings: true } : undefined), {
      remove: () => set((s) => s.catalog.splice(i, 1), { settings: true, editor: true }),
      up: () => set((s) => move(s.catalog, i, -1), { settings: true }),
      down: () => set((s) => move(s.catalog, i, 1), { settings: true }),
    }, `catalog.${i}`));
    return [
      h("p", { class: "lead", text: "Fahrzeuge mit Preisen für die schnelle Auswahl in Offerten. Tipp: In einer Offerte beim Fahrzeug auf ☆ klicken, um es hier zu speichern." }),
      ...(cards.length ? cards : [h("p", { class: "empty", text: "Noch keine Fahrzeuge im Katalog." })]),
      button("＋ Fahrzeug", () => set((s) => s.catalog.push(Object.assign(M.newVehicle(s), { id: M.uid("cat") })), { settings: true, editor: true }), "add-row btn-sm"),
    ];
  }

  function settingsData() {
    return [
      h("p", { class: "lead", text: "Alles wird nur in diesem Browser gespeichert – es gibt keinen Server. Für Kolleg:innen die Einstellungen exportieren und intern (z. B. Google Drive) teilen. Nie öffentlich ablegen." }),
      h("h3", { text: "Einstellungen" }),
      h("div", { class: "image-actions" },
        button("Einstellungen importieren", () => pickFile(importSettings), "btn-primary btn-sm"),
        button("Einstellungen exportieren", exportSettings, "btn-sm")),
      h("h3", { text: "Entwürfe" }),
      h("div", { class: "image-actions" },
        button("Backup exportieren", exportDrafts, "btn-sm"),
        button("Backup importieren", () => pickFile(importDrafts), "btn-sm")),
      h("h3", { text: "Zurücksetzen" }),
      h("div", { class: "image-actions" },
        button("Einstellungen auf Standard zurücksetzen", () => {
          if (!confirm("Alle Einstellungen in diesem Browser löschen? Entwürfe bleiben.")) return;
          state.settings = M.mergeSettings(null);
          saveSettings();
          renderSettings();
          renderEditor();
          schedulePreview(0);
          updateBanner();
        }, "btn-sm btn-danger")),
    ];
  }

  // ---------------------------------------------------------------------------
  // Shell
  // ---------------------------------------------------------------------------

  function updateBanner() {
    const s = state.settings;
    $("#setup-banner").hidden = Boolean(s.company.street || s.team.length);
  }

  function setView(view) {
    $("#workspace").dataset.view = view;
    $("#tab-edit").setAttribute("aria-selected", String(view === "edit"));
    $("#tab-preview").setAttribute("aria-selected", String(view === "preview"));
    if (view === "preview") requestAnimationFrame(() => fitPreview());
  }

  function toggleMenu(open) {
    const list = $("#new-menu-list");
    const show = open ?? list.hidden;
    list.hidden = !show;
    $("#new-button").setAttribute("aria-expanded", String(show));
    if (show) list.querySelector("button")?.focus();
  }

  function bind() {
    $("#new-button").addEventListener("click", () => toggleMenu());
    for (const btn of document.querySelectorAll("[data-new]")) {
      btn.addEventListener("click", () => {
        toggleMenu(false);
        newDoc(btn.dataset.new);
      });
    }
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#new-menu")) toggleMenu(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#new-menu-list").hidden) {
        toggleMenu(false);
        $("#new-button").focus();
      }
    });

    $("#drafts-button").addEventListener("click", () => {
      $("#drafts-search").value = "";
      renderDrafts();
      $("#drafts-dialog").showModal();
    });
    $("#drafts-search").addEventListener("input", renderDrafts);
    $("#drafts-export").addEventListener("click", exportDrafts);
    $("#drafts-import").addEventListener("click", () => pickFile(importDrafts));

    $("#settings-button").addEventListener("click", () => openSettings());
    $("#settings-dialog").addEventListener("close", () => renderEditor());
    $("#banner-import").addEventListener("click", () => pickFile(importSettings));
    $("#banner-settings").addEventListener("click", () => openSettings("company"));
    $("#file-input").addEventListener("change", onFilePicked);

    $("#print-button").addEventListener("click", printDoc);
    $("#email-button").addEventListener("click", openEmailDialog);
    $("#email-template").addEventListener("change", fillEmail);
    $("#email-subject").addEventListener("input", updateMailto);
    $("#email-body").addEventListener("input", updateMailto);
    $("#email-copy").addEventListener("click", copyEmail);
    $("#contract-from-offer").addEventListener("click", openContractDialog);
    $("#contract-create").addEventListener("click", createContractFromDialog);

    $("#tab-edit").addEventListener("click", () => setView("edit"));
    $("#tab-preview").addEventListener("click", () => setView("preview"));

    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => fitPreview(), 80);
    });
    // Another tab changed the data: reload so nothing gets overwritten silently.
    window.addEventListener("storage", (e) => {
      if (e.key === KEYS.settings) {
        state.settings = loadSettings();
        renderEditor();
        schedulePreview(0);
      } else if (e.key === KEYS.docs) {
        const current = state.doc?.id;
        state.docs = loadDocs(state.settings);
        state.doc = state.docs.find((d) => d.id === current) || state.docs[0] || null;
        if (state.doc) {
          renderEditor();
          schedulePreview(0);
        }
      }
    });
  }

  function init() {
    state.settings = loadSettings();
    state.docs = loadDocs(state.settings);
    state.me = store.get(KEYS.me, "");
    if (!state.docs.length) {
      const doc = M.newDocument("offer", state.settings, today());
      doc.ownerId = defaultOwner();
      state.docs.push(doc);
      store.set(KEYS.docs, state.docs);
    }
    const current = store.get(KEYS.current, "");
    state.doc = state.docs.find((d) => d.id === current) || state.docs[0];
    bind();
    setView("edit");
    updateBanner();
    $("#drafts-count").textContent = String(state.docs.length);
    renderEditor();
    renderPreview().then(() => {
      document.body.dataset.ready = "1";
    });
  }

  init();
})();
