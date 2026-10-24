// CARIFY Offerten & Verträge – renders a document as A4 pages (DOM only, no innerHTML).
//
// Pages have a fixed size (see document.css). Flowing content (price tables, contract clauses)
// is placed block by block; when a block overflows the page body it moves to a fresh page.
// That only works while the pages are attached and visible, so render() always draws into the
// live preview container.

"use strict";

globalThis.CarifyRender = (function () {
  const F = globalThis.CarifyFormat;
  const M = globalThis.CarifyModel;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key === "dataset") Object.assign(el.dataset, value);
      else el.setAttribute(key, value === true ? "" : value);
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null) continue;
      if (key === "text") el.textContent = value;
      else el.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) if (child) el.append(child);
    return el;
  }

  function runsTo(parent, runs) {
    for (const run of runs) parent.append(run.bold ? h("strong", { text: run.text }) : document.createTextNode(run.text));
    return parent;
  }

  // Blocks from CarifyModel.richText → <p>/<ul>
  function rich(blocks, cls) {
    return blocks.map((b) => {
      if (b.type === "list") return h("ul", { class: cls ? `${cls}-list` : null }, b.items.map((runs) => runsTo(h("li"), runs)));
      const p = h("p", { class: cls || null });
      b.lines.forEach((runs, i) => {
        if (i) p.append(h("br"));
        runsTo(p, runs);
      });
      return p;
    });
  }

  // Plain multi-line text → paragraphs (used for footnotes and notes)
  function lines(text, cls) {
    return String(text || "")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => h("p", { class: cls, text: l }));
  }

  // ---------------------------------------------------------------------------
  // Brand elements
  // ---------------------------------------------------------------------------

  function logo(settings, cls) {
    const src = settings.branding.logo;
    if (/^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(src || "")) {
      return h("img", { class: `doc-logo doc-logo--img ${cls || ""}`, src, alt: settings.company.name || "CARIFY" });
    }
    return h("span", { class: `doc-logo ${cls || ""}`, text: (settings.company.name || "CARIFY").toUpperCase() });
  }

  function swissCross() {
    return s("svg", { class: "badge-icon", viewBox: "0 0 20 20", "aria-hidden": "true" },
      s("rect", { width: 20, height: 20, rx: 3, fill: "#e42322" }),
      s("path", { d: "M8.4 4.5h3.2v3.9h3.9v3.2h-3.9v3.9H8.4v-3.9H4.5V8.4h3.9z", fill: "#fff" }));
  }

  function sealIcon() {
    return s("svg", { class: "badge-seal", viewBox: "0 0 40 40", "aria-hidden": "true" },
      s("circle", { cx: 20, cy: 20, r: 17, fill: "none", stroke: "#c9a227", "stroke-width": 2.5 }),
      s("circle", { cx: 20, cy: 20, r: 12.5, fill: "none", stroke: "#c9a227", "stroke-width": 1, "stroke-dasharray": "1.5 2" }),
      s("path", { d: starPath(20, 20, 7, 3), fill: "#c9a227" }));
  }

  let clipCounter = 0;

  function badge(b) {
    const label = String(b.label || "").trim();
    if (b.type === "swiss") return h("span", { class: "doc-badge doc-badge--swiss" }, swissCross(), h("span", { text: label || "swiss made software" }));
    if (b.type === "rating") {
      const value = Math.max(0, Math.min(5, F.parseNumber(String(b.value ?? "")) ?? 0));
      clipCounter += 1;
      const clipId = `stars-clip-${clipCounter}`;
      const stars = s("svg", { class: "badge-stars", viewBox: "0 0 100 20", "aria-hidden": "true" },
        s("defs", {}, s("clipPath", { id: clipId }, s("rect", { width: value * 20, height: 20 }))),
        [0, 1, 2, 3, 4].map((i) => s("path", { d: starPath(10 + i * 20, 10, 9, 4), fill: "#e3e5e8" })),
        s("g", { "clip-path": `url(#${clipId})` }, [0, 1, 2, 3, 4].map((i) => s("path", { d: starPath(10 + i * 20, 10, 9, 4), fill: "#f4b400" }))));
      return h("span", { class: "doc-badge doc-badge--rating" }, h("strong", { text: F.number(value, "de", 1) }), stars, h("span", { text: label }));
    }
    return h("span", { class: "doc-badge doc-badge--seal" }, sealIcon(), h("span", { text: label }));
  }

  function starPath(cx, cy, r1, r2) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      d += `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;
    }
    return `${d}Z`;
  }

  function badges(settings, where) {
    const list = (settings.branding.badges || [])
      .filter((b) => b && (b.label || b.type === "swiss"))
      .filter((b) => where === "cover" || b.type !== "rating");
    return list.length ? h("div", { class: "doc-badges" }, list.map(badge)) : null;
  }

  function peopleIcon() {
    return s("svg", { class: "band-icon", viewBox: "0 0 32 24", "aria-hidden": "true" },
      s("circle", { cx: 16, cy: 6, r: 4.2 }),
      s("circle", { cx: 6.5, cy: 8.5, r: 3.2 }),
      s("circle", { cx: 25.5, cy: 8.5, r: 3.2 }),
      s("path", { d: "M8.5 22c0-4.6 3.4-8 7.5-8s7.5 3.4 7.5 8z" }),
      s("path", { d: "M0.5 22c0-3.7 2.6-6.6 6-6.6 1.3 0 2.5.4 3.4 1.1-1.3 1.5-2.1 3.4-2.3 5.5z" }),
      s("path", { d: "M31.5 22c0-3.7-2.6-6.6-6-6.6-1.3 0-2.5.4-3.4 1.1 1.3 1.5 2.1 3.4 2.3 5.5z" }));
  }

  function footerBand(settings, t) {
    const refs = settings.branding.referenceLogos?.length
      ? settings.branding.referenceLogos.filter((src) => /^data:image\//.test(src)).map((src) => h("img", { class: "band-ref-logo", src, alt: "" }))
      : (settings.branding.references || []).filter(Boolean).map((r) => h("span", { class: "band-ref", text: r }));
    return h("div", { class: "doc-band" },
      t.footerClaim ? h("div", { class: "band-claim" }, peopleIcon(), h("span", { text: t.footerClaim })) : h("span"),
      refs.length ? h("div", { class: "band-refs" }, refs) : null);
  }

  function bestPriceSeal() {
    return s("svg", { class: "bestprice-seal", viewBox: "0 0 80 80", "aria-hidden": "true" },
      s("circle", { cx: 40, cy: 40, r: 37, fill: "#d4af37" }),
      s("circle", { cx: 40, cy: 40, r: 31, fill: "none", stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "2 3" }),
      s("text", { x: 40, y: 37, "text-anchor": "middle", class: "seal-text", text: "BEST" }),
      s("text", { x: 40, y: 51, "text-anchor": "middle", class: "seal-text", text: "PRICE" }));
  }

  function bestPriceBand(t) {
    if (!t.bestPriceTitle) return null;
    return h("div", { class: "doc-bestprice" },
      bestPriceSeal(),
      h("strong", { class: "bestprice-title", text: t.bestPriceTitle }),
      h("div", { class: "bestprice-text" }, lines(t.bestPriceText)));
  }

  // ---------------------------------------------------------------------------
  // Page shell
  // ---------------------------------------------------------------------------

  // kind: cover | letter | why | prices | options | contract
  function pageShell(root, kind, ctx, opts) {
    const page = h("section", { class: `doc-page doc-page--${kind}`, dataset: { kind } });
    if (opts?.id) page.id = opts.id;
    const body = h("div", { class: "doc-body" });
    if (ctx.marketing) {
      page.append(h("header", { class: "doc-header" }, logo(ctx.settings), badges(ctx.settings)));
    } else {
      page.append(h("header", { class: "doc-header doc-header--formal" }, opts?.headerLeft || h("span"), logo(ctx.settings)));
    }
    page.append(body);
    if (opts?.bestPrice) {
      const band = bestPriceBand(ctx.t);
      if (band) {
        page.classList.add("has-bestprice");
        page.append(band);
      }
    }
    if (ctx.marketing) page.append(footerBand(ctx.settings, ctx.t));
    else page.append(h("footer", { class: "doc-footer" }, h("span", { text: ctx.footerText || "" }), h("span", { class: "doc-pageno" })));
    root.append(page);
    return { page, body };
  }

  const overflows = (body) => body.scrollHeight > body.clientHeight + 1;

  // Places blocks onto pages. A block is { el, keepWithNext?, table? } where table = { id, make }
  // for rows (<tr>) that belong into a table with a repeated header.
  function flow(blocks, newPage) {
    let current = newPage();
    const pages = [current];
    let placed = [];

    const place = (block, target) => {
      if (!block.table) {
        target.body.append(block.el);
        return () => block.el.remove();
      }
      let table = target.body.lastElementChild;
      let created = false;
      if (!table || table.dataset.table !== block.table.id) {
        table = block.table.make();
        table.dataset.table = block.table.id;
        target.body.append(table);
        created = true;
      }
      table.tBodies[0].append(block.el);
      return () => {
        block.el.remove();
        if (created) table.remove();
      };
    };

    for (const block of blocks) {
      const undo = place(block, current);
      if (!overflows(current.body) || placed.length === 0) {
        placed.push({ block, undo });
        continue;
      }
      undo();
      // keep headings together with what follows
      const carry = [];
      while (placed.length > 1 && placed[placed.length - 1].block.keepWithNext) {
        const last = placed.pop();
        last.undo();
        carry.unshift(last.block);
      }
      current = newPage();
      pages.push(current);
      placed = [];
      for (const b of [...carry, block]) placed.push({ block: b, undo: place(b, current) });
    }
    return pages;
  }

  function numberPages(root) {
    const all = [...root.querySelectorAll(".doc-pageno")];
    all.forEach((el, i) => {
      el.textContent = all.length > 1 ? `${i + 1} / ${all.length}` : "";
    });
  }

  // ---------------------------------------------------------------------------
  // Offer
  // ---------------------------------------------------------------------------

  // Side view of a generic car, 64 × 28 units.
  function carShapes() {
    return [
      s("path", { class: "car-body", d: "M4 20.5V16c0-1.6 1-3 2.6-3.4l7.6-2 6.2-5.6C21.6 4 23.1 3.5 24.7 3.5h14.6c1.7 0 3.3.7 4.5 2l5.4 6 7.6 1.7c2 .4 3.2 2.1 3.2 4v3.3c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8z" }),
      s("circle", { cx: 17, cy: 21.5, r: 4.6, class: "car-wheel" }),
      s("circle", { cx: 47, cy: 21.5, r: 4.6, class: "car-wheel" }),
    ];
  }

  function carIcon(cls) {
    return s("svg", { class: cls || "car-icon", viewBox: "0 0 64 28", "aria-hidden": "true" }, carShapes());
  }

  const ICONS = {
    shield: "M12 2.5l8 3v6.2c0 4.9-3.4 8.6-8 9.8-4.6-1.2-8-4.9-8-9.8V5.5zM8.5 12l2.4 2.4 4.6-4.8",
    clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7.5V12l3 2",
    car: "M3.5 15.5v-3l2-4.5c.3-.7 1-1 1.7-1h9.6c.7 0 1.4.3 1.7 1l2 4.5v3zM3.5 15.5v2h3v-2M17.5 15.5v2h3v-2M6.5 12.5h1.5M16 12.5h1.5",
    wrench: "M14.7 6.3a4 4 0 0 0-5.3 5.2L4 16.9 7.1 20l5.4-5.4a4 4 0 0 0 5.2-5.3l-2.4 2.4-2.6-.6-.6-2.6z",
    doc: "M6.5 3h8l4 4v14h-12zM14.5 3v4h4M9 12h6M9 15.5h6",
  };
  const ICON_ORDER = ["shield", "clock", "car", "wrench", "doc"];

  function lineIcon(name) {
    return s("svg", { class: "line-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: ICONS[name] || ICONS.shield }));
  }

  function coverPage(root, ctx, doc, view) {
    const { settings, t } = ctx;
    const page = h("section", { class: "doc-page doc-page--cover", dataset: { kind: "cover" } });
    const firm = doc.customer.company.trim();
    const visual = /^data:image\//.test(settings.branding.coverImage || "")
      ? h("img", { class: "cover-image", src: settings.branding.coverImage, alt: "" })
      : h("div", { class: "cover-visual" },
        h("div", { class: "cover-visual-card" },
          h("span", { class: "cover-visual-claim", text: t.coverClaim }),
          carIcon("cover-car"),
          h("div", { class: "cover-visual-chips" }, (t.included || []).slice(0, 5).map((it, i) => h("span", { class: "cover-chip" }, lineIcon(ICON_ORDER[i % ICON_ORDER.length]), h("span", { text: it.title }))))));
    page.append(
      h("div", { class: "cover-top" },
        logo(settings, "doc-logo--cover"),
        firm ? h("p", { class: "cover-for", text: `${t.letterTitle} · ${firm} · ${F.date(doc.date)}` }) : null,
        h("div", { class: "cover-intro" }, rich(M.richText(t.coverIntro, view.vars))),
        view.hasPrices ? h("a", { class: "cover-cta", href: "#doc-prices", text: t.coverButton }) : null),
      visual,
      h("footer", { class: "cover-trust" }, badges(settings, "cover")));
    root.append(page);
  }

  function letterPage(root, ctx, doc, view) {
    const { t } = ctx;
    const { body } = pageShell(root, "letter", ctx);
    const c = doc.contact;
    const recipient = [
      view.vars.anrede,
      [c.firstName.trim(), c.lastName.trim()].filter(Boolean).join(" "),
      doc.customer.company.trim(),
      doc.customer.street.trim(),
      [doc.customer.zip.trim(), doc.customer.city.trim()].filter(Boolean).join(" "),
    ].filter(Boolean);
    const own = view.owner;
    body.append(
      h("div", { class: "letter-recipient" }, recipient.map((l) => h("p", { text: l }))),
      h("div", { class: "letter-titlerow" }, h("h1", { class: "letter-title", text: t.letterTitle }), h("span", { class: "letter-date", text: F.date(doc.date) })),
      h("div", { class: "letter-body" },
        rich(M.richText(t.letterBody, view.vars, { inhalt: view.contents })),
        own ? h("div", { class: "letter-sign" },
          h("p", {}, h("strong", { text: own.name }), own.role ? [h("br"), own.role] : null),
          own.phone || own.email ? h("p", { class: "letter-contact" }, t.letterContactLabel, own.phone ? [h("br"), own.phone] : null, own.email ? [h("br"), own.email] : null) : null) : null));
  }

  function whyChart(t) {
    const items = t.whyChart?.items || [];
    const W = 430, H = 300, x0 = 34, y0 = 262, x1 = 424, y1 = 14;
    const n = Math.max(items.length, 1);
    const pts = items.map((it, i) => ({ it, x: x0 + 42 + (i * (x1 - x0 - 84)) / Math.max(n - 1, 1), y: y1 + 26 + (i * (y0 - y1 - 96)) / Math.max(n - 1, 1) }));
    const hi = items.findIndex((it) => /abo|subscription/i.test(it.label));
    return s("svg", { class: "why-chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${t.whyChart?.yAxis || ""} / ${t.whyChart?.xAxis || ""}` },
      hi >= 0 ? s("rect", { x: pts[hi].x - 44, y: pts[hi].y - 22, width: 88, height: y0 - pts[hi].y + 22, rx: 14, class: "chart-hi" }) : null,
      s("path", { d: `M${x0} ${y1}V${y0}H${x1}`, class: "chart-axis" }),
      s("path", { d: `M${x0 - 4} ${y1 + 8}L${x0} ${y1}L${x0 + 4} ${y1 + 8}M${x1 - 8} ${y0 - 4}L${x1} ${y0}L${x1 - 8} ${y0 + 4}`, class: "chart-axis" }),
      s("text", { x: 12, y: (y0 + y1) / 2, class: "chart-axis-label", transform: `rotate(-90 12 ${(y0 + y1) / 2})`, "text-anchor": "middle", text: t.whyChart?.yAxis || "" }),
      s("text", { x: (x0 + x1) / 2, y: H - 8, class: "chart-axis-label", "text-anchor": "middle", text: t.whyChart?.xAxis || "" }),
      pts.map((p, i) => s("g", { class: i === hi ? "chart-item is-hi" : "chart-item" },
        s("g", { class: "chart-car", transform: `translate(${p.x - 19} ${p.y - 10}) scale(0.6)` }, carShapes()),
        s("text", { x: p.x, y: p.y + 20, "text-anchor": "middle", class: "chart-label", text: p.it.label }),
        s("text", { x: p.x, y: p.y + 32, "text-anchor": "middle", class: "chart-range", text: p.it.range || "" }))));
  }

  function whyPage(root, ctx) {
    const { settings, t } = ctx;
    const { body } = pageShell(root, "why", ctx);
    const services = /^data:image\//.test(settings.branding.whyImage || "")
      ? h("img", { class: "why-image", src: settings.branding.whyImage, alt: "" })
      : h("div", { class: "why-services" }, (t.included || []).map((it, i) => h("div", { class: "why-service" },
        h("span", { class: "why-service-icon" }, lineIcon(ICON_ORDER[i % ICON_ORDER.length])),
        h("strong", { text: it.title }),
        h("span", { text: it.text }))));
    body.append(
      h("h1", { class: "why-title", text: t.whyTitle }),
      h("div", { class: "why-top" }, whyChart(t), h("div", { class: "why-callout" }, rich(M.richText(t.whyLead, {})))),
      services,
      h("div", { class: "why-usps" }, (t.usps || []).map((u) => h("div", { class: "why-usp" }, h("strong", { text: u.title }), h("p", { text: u.text })))));
  }

  function priceTable(view, t) {
    const head = {
      vehicle: t.colVehicle,
      term: t.colTerm,
      km: t.colKm,
      priceExcl: view.columns.includes("priceIncl") ? t.colPriceExcl : t.colPrice + "*",
      priceIncl: view.columns.includes("priceExcl") ? t.colPriceIncl : t.colPrice + "*",
      insurance: t.colInsurance,
    };
    return () => h("table", { class: `price-table cols-${view.columns.length}` },
      h("thead", {}, h("tr", {}, view.columns.map((c) => h("th", { class: `col-${c}`, scope: "col", text: head[c] })))),
      h("tbody"));
  }

  function priceRow(vehicle, row, index, view, t, lang) {
    // The insurance note belongs to one term, so it sits in the term cell (vehicle cells get merged).
    const showNote = view.insuranceDisplay === "note" && row.insurance != null;
    const model = vehicle.link ? h("a", { href: vehicle.link, text: vehicle.model }) : vehicle.model;
    const cells = {
      vehicle: h("td", { class: "col-vehicle" },
        h("strong", { class: "veh-model" }, model),
        vehicle.sub ? h("span", { class: "veh-sub", text: vehicle.sub }) : null),
      term: h("td", { class: "col-term" },
        h("span", { text: String(row.months) }),
        showNote ? h("span", { class: "term-note", text: `→ ${M.fill(t.insuranceNote, { betrag: F.number(row.insurance, lang) })}` }) : null),
      km: h("td", { class: "col-km" }, row.lines.map((l) => h("span", { text: F.number(l.km, lang) }))),
      priceExcl: h("td", { class: "col-price" }, row.lines.map((l) => h("span", { text: F.isNum(l.price) ? F.chfAfter(l.price, lang) : "–" }))),
      priceIncl: h("td", { class: "col-price" }, row.lines.map((l) => h("span", { text: F.isNum(l.priceIncl) ? F.chfAfter(l.priceIncl, lang) : "–" }))),
      insurance: h("td", { class: "col-insurance", text: row.insurance != null ? `+${F.number(row.insurance, lang)}` : "" }),
    };
    return h("tr", { class: index === 0 ? "is-first" : null, dataset: { vehicle: vehicle.id } }, view.columns.map((c) => cells[c]));
  }

  // After pagination: rows of the same vehicle on one page share one vehicle cell.
  function mergeVehicleCells(root) {
    for (const tbody of root.querySelectorAll(".price-table tbody")) {
      let anchor = null;
      let span = 0;
      for (const tr of [...tbody.rows]) {
        if (anchor && tr.dataset.vehicle === anchor.parentElement.dataset.vehicle) {
          span += 1;
          anchor.rowSpan = span;
          tr.querySelector(".col-vehicle")?.remove();
          tr.classList.add("is-continued");
        } else {
          anchor = tr.querySelector(".col-vehicle");
          span = 1;
          tr.classList.add("is-first");
        }
      }
    }
  }

  // Optional page with add-on options (cards with title, price line, text and bullets).
  function optionsPage(root, ctx, view) {
    const { t } = ctx;
    const { body } = pageShell(root, "options", ctx);
    append(body, [
      h("h1", { class: "why-title", text: t.optionsTitle }),
      t.optionsIntro ? h("div", { class: "options-intro" }, rich(M.richText(t.optionsIntro, view.vars))) : null,
      h("div", { class: `options-grid count-${Math.min(view.options.length, 3)}` }, view.options.map((opt) => h("article", { class: "option-card" },
        h("h2", { class: "option-title", text: opt.title }),
        opt.price ? h("p", { class: "option-price", text: opt.price }) : null,
        opt.text ? h("div", { class: "option-text" }, rich(M.richText(opt.text, view.vars))) : null,
        Array.isArray(opt.bullets) && opt.bullets.length ? h("ul", { class: "option-bullets" }, opt.bullets.filter(Boolean).map((b) => h("li", { text: b }))) : null)))]);
  }

  function renderOffer(root, doc, settings) {
    const view = M.offerView(doc, settings);
    const ctx = { settings, t: view.t, marketing: true };
    const o = doc.offer;
    view.hasPrices = o.sections.prices && view.vehicles.length > 0;
    view.insuranceDisplay = o.insuranceDisplay;
    if (o.sections.cover) coverPage(root, ctx, doc, view);
    if (o.sections.letter) letterPage(root, ctx, doc, view);
    if (o.sections.why) whyPage(root, ctx);
    if (o.sections.prices) {
      const make = priceTable(view, view.t);
      const blocks = [];
      view.vehicles.forEach((v) => {
        const rows = v.rows.length ? v.rows : [{ months: "", insurance: null, lines: [] }];
        rows.forEach((row, i) => blocks.push({ el: priceRow(v, row, i, view, view.t, doc.lang), table: { id: "prices", make } }));
      });
      if (!blocks.length) blocks.push({ el: h("p", { class: "doc-empty", text: "Noch keine Fahrzeuge mit Preisen erfasst." }) });
      const tail = [...view.notes.map((n) => h("p", { class: "price-note", text: n })), h("div", { class: "price-footnotes" }, view.footnotes.flatMap((f) => lines(f)))];
      tail.forEach((el) => blocks.push({ el }));
      const pages = flow(blocks, () => pageShell(root, "prices", ctx, { bestPrice: true }));
      pages[0].page.id = "doc-prices";
      mergeVehicleCells(root);
    }
    if (view.options.length) optionsPage(root, ctx, view);
    return view;
  }

  // ---------------------------------------------------------------------------
  // Contract (new, adjustment, takeover)
  // ---------------------------------------------------------------------------

  function formalCtx(doc, settings, t) {
    const carify = settings.company.legalName || settings.company.name;
    const address = M.addressLine(settings.company);
    return { settings, t, marketing: false, footerText: [carify, address.replace(/ \| /g, " · ")].filter(Boolean).join(" · ") };
  }

  function partiesBox(view, t) {
    return h("div", { class: "contract-parties" },
      h("div", { class: "party-label", text: t.contractBetween }),
      h("div", { class: "party-value" }, h("strong", { text: view.carify.name }), view.carify.address ? h("strong", { text: view.carify.address }) : null, h("em", { text: t.contractCarifyAlias })),
      h("div", { class: "party-label" },
        String(t.contractCustomerLabel).split("\n").map((l, i) => [i ? h("br") : null, l]),
        t.contractCustomerNote ? h("span", { class: "party-note", text: t.contractCustomerNote }) : null),
      h("div", { class: "party-value" }, h("strong", { text: view.customer.name || "–" }), view.customer.address ? h("strong", { text: view.customer.address }) : null, h("em", { text: t.contractCustomerAlias })));
  }

  function signatures(view, t) {
    const line = (caption, note) => h("div", { class: "sign-line" }, h("span", { class: "sign-rule" }), h("span", { class: "sign-caption", text: caption }), note ? h("span", { class: "sign-note", text: note }) : null);
    return h("div", { class: "contract-signatures" },
      h("h2", { class: "contract-h2", text: t.contractSignaturesTitle }),
      h("div", { class: "sign-cols" },
        h("div", { class: "sign-col" },
          h("strong", { class: "sign-head", text: view.carify.name }),
          h("span", { class: "sign-meta", text: view.signDate }),
          view.signatory ? h("span", { class: "sign-meta", text: view.signatory }) : null,
          line(t.contractSignCarifyRole)),
        h("div", { class: "sign-col" },
          h("strong", { class: "sign-head", text: t.contractSignCustomer }),
          view.customer.name ? h("span", { class: "sign-meta", text: view.customer.name }) : null,
          line(t.contractSignPlaceDate),
          line(t.contractSignName),
          line(t.contractSignSignature, t.contractSignSignatureNote))));
  }

  function formalPages(root, ctx) {
    let count = 0;
    return () => {
      const shell = pageShell(root, "contract", ctx);
      if (count === 0) shell.page.classList.add("is-first-page");
      count += 1;
      return shell;
    };
  }

  function formalTitle(title, sub) {
    return h("div", { class: "contract-titleblock" }, h("h1", { class: "contract-title", text: title }), sub ? h("p", { class: "contract-number", text: sub }) : null);
  }

  function renderContract(root, doc, settings) {
    const view = M.contractView(doc, settings);
    const t = view.t;
    const ctx = formalCtx(doc, settings, t);
    const blocks = [
      { el: formalTitle(t.contractTitle, view.subtitle) },
      { el: partiesBox(view, t) },
      { el: h("p", { class: "contract-lead", text: view.intro }), keepWithNext: true },
      { el: h("dl", { class: "contract-grid" }, view.grid.map((g) => h("div", { class: "grid-item" }, h("dt", { text: g.label }), h("dd", {}, g.lines.map((l) => h("span", { text: l || "–" })))))) },
      { el: h("p", { class: "contract-small", text: t.contractReplacement }) },
      { el: h("h2", { class: "contract-h2", text: t.contractRateTitle }), keepWithNext: true },
      ...rich(view.rateBlocks, "contract-text").map((el) => ({ el })),
      { el: signatures(view, t) },
      { el: h("p", { class: "contract-footnote", text: t.contractFootnote }) },
    ];
    flow(blocks, formalPages(root, ctx));
    numberPages(root);
    return view;
  }

  // ---------------------------------------------------------------------------

  function render(root, doc, settings) {
    root.replaceChildren();
    root.lang = doc.lang === "fr" ? "fr-CH" : doc.lang === "en" ? "en" : "de-CH";
    if (doc.type === "offer") return renderOffer(root, doc, settings);
    return renderContract(root, doc, settings);
  }

  return { render, h };
})();
