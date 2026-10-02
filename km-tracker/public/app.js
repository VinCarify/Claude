// CARIFY KM-Tracking – vanilla JS, no dependencies.
// All dynamic content is created with DOM APIs (textContent / createElement),
// never via innerHTML.

"use strict";

(() => {
  const STORAGE_KEY = "carify.km-tracking.pw";
  const API_URL = "/api/data";
  const EPOCH_MS = Date.UTC(1899, 11, 30); // spreadsheet serial day 0
  const DAY_MS = 86_400_000;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const TEXT = {
    wrongPassword: "Hoppla, das Passwort stimmt leider nicht.",
    emptyPassword: "Gib bitte zuerst dein Passwort ein.",
    generic: "Wir kommen gerade nicht an deine Daten. Versuch’s in einem Moment nochmals.",
    offline: "Wir erreichen den Server gerade nicht. Check kurz deine Verbindung und versuch’s nochmals.",
    limited: "Ganz schön viele Versuche. Gönn dir eine Minute Pause und versuch’s dann nochmals.",
    noCheckpoint: "Noch kein KM-Stand da – sobald wir einen haben, siehst du hier deinen Verlauf.",
    noVehicles: "Aktuell ist hier kein aktives Abo hinterlegt. Bei Fragen sind wir gerne für dich da.",
  };

  // -------------------------------------------------------------------------
  // Formatting helpers
  // -------------------------------------------------------------------------

  const nf0 = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Non-breaking space: amounts never wrap away from their unit.
  const NBSP = "\u00a0";
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  // `n === 0` is also true for -0, which Intl would print as "-0".
  const fmt0 = (n) => nf0.format(n === 0 ? 0 : n);
  const num = (n) => (isNum(n) ? fmt0(n) : "–");
  const km = (n) => (isNum(n) ? `${fmt0(n)}${NBSP}km` : "–");
  const chf = (n) => (isNum(n) ? `CHF${NBSP}${fmt0(n)}` : "–");
  const chfPerKm = (rp) => (isNum(rp) ? `CHF${NBSP}${nf2.format(rp / 100)}${NBSP}/${NBSP}km` : "–");
  const months = (n) => `${num(n)}${NBSP}${n === 1 ? "Monat" : "Monate"}`;

  function serialToDate(serial) {
    return new Date(EPOCH_MS + serial * DAY_MS);
  }

  function fmtDate(serial) {
    if (!isNum(serial)) return "–";
    const d = serialToDate(serial);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.${d.getUTCFullYear()}`;
  }

  function fmtDateShort(serial) {
    const d = serialToDate(serial);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}.`;
  }

  function todaySerial() {
    const now = new Date();
    return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - EPOCH_MS) / DAY_MS);
  }

  function prettyLabel(raw) {
    if (!raw) return "–";
    const s = String(raw).replace(/_/g, " ").trim().toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const STATUS = {
    on_lease: { label: "Aktiv", tone: "ok" },
    notice_given: { label: "Gekündigt", tone: "neutral" },
  };

  function isEmail(value) {
    return typeof value === "string" && /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i.test(value);
  }

  // -------------------------------------------------------------------------
  // DOM helpers
  // -------------------------------------------------------------------------

  const $ = (sel, root = document) => root.querySelector(sel);

  function appendChildren(node, children) {
    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  function setProps(node, props) {
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.setAttribute("class", value);
      else if (key === "text") node.textContent = String(value);
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2), value);
      } else if (key === "style") {
        throw new Error("inline style attributes are not allowed (CSP)");
      } else node.setAttribute(key, value === true ? "" : String(value));
    }
    return node;
  }

  function h(tag, props, children) {
    return appendChildren(setProps(document.createElement(tag), props), children ?? []);
  }

  function s(tag, props, children) {
    return appendChildren(setProps(document.createElementNS(SVG_NS, tag), props), children ?? []);
  }

  const ICONS = {
    check: ["M20 6 9 17l-5-5"],
    alert: ["M12 9v4", "M12 17h.01", "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"],
    bulb: ["M9 18h6", "M10 22h4", "M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"],
    gauge: ["M12 14l4-4", "M3.3 19a10 10 0 1 1 17.4 0"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
    arrow: ["M5 12h14", "m13 6 6 6-6 6"],
    mail: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "m3 7 9 6 9-6"],
  };

  function icon(name, cls = "icon") {
    return s(
      "svg",
      { class: cls, viewBox: "0 0 24 24", width: 24, height: 24, "aria-hidden": "true", focusable: "false" },
      (ICONS[name] || []).map((d) => s("path", { d })),
    );
  }

  let uid = 0;
  const nextId = (prefix) => `${prefix}-${++uid}`;

  // -------------------------------------------------------------------------
  // Session storage (may be unavailable – always guarded)
  // -------------------------------------------------------------------------

  const store = {
    get() {
      try {
        return window.sessionStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore – login just won't survive a reload */
      }
    },
    clear() {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    },
  };

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  // Header values must be ISO-8859-1; anything else can't be the password.
  const HEADER_SAFE = /^[ -~ -ÿ]+$/;

  async function fetchData(password) {
    if (!HEADER_SAFE.test(password)) return { kind: "unauthorized" };
    let res;
    try {
      res = await fetch(API_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${password}`, Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch {
      return { kind: "offline" };
    }
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status === 429) return { kind: "limited" };
    if (!res.ok) return { kind: "error", status: res.status };
    try {
      const data = await res.json();
      if (!data || !Array.isArray(data.vehicles)) throw new Error("shape");
      return { kind: "ok", data };
    } catch {
      return { kind: "error" };
    }
  }

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------

  const views = {
    login: $("#view-login"),
    loading: $("#view-loading"),
    error: $("#view-error"),
    dashboard: $("#view-dashboard"),
  };
  const headerTitle = $("#header-title");
  const logoutButton = $("#logout");
  const form = $("#login-form");
  const input = $("#password");
  const loginError = $("#login-error");
  const submit = $("#login-submit");

  let chartObservers = [];

  function showView(name) {
    for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
    const loggedIn = name === "dashboard";
    headerTitle.hidden = !loggedIn;
    logoutButton.hidden = !loggedIn;
    document.body.dataset.view = name;
  }

  function setLoginError(message) {
    loginError.textContent = message || "";
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function setBusy(busy) {
    submit.disabled = busy;
    submit.setAttribute("aria-busy", busy ? "true" : "false");
    $(".btn-label", submit).textContent = busy ? "Einen Moment …" : "Los geht’s";
  }

  function resetDashboard() {
    for (const ro of chartObservers) ro.disconnect();
    chartObservers = [];
    views.dashboard.replaceChildren();
    headerTitle.textContent = "";
    document.title = "CARIFY · KM-Tracking";
  }

  function logout() {
    store.clear();
    resetDashboard();
    setLoginError("");
    input.value = "";
    showView("login");
    input.focus();
  }

  function showError(message) {
    $("#error-text").textContent = message;
    showView("error");
    $("#error-title").focus();
  }

  function showDashboard(data) {
    renderDashboard(data);
    showView("dashboard");
    window.scrollTo(0, 0);
    const heading = $("#dash-title");
    if (heading) heading.focus({ preventScroll: true });
  }

  async function loginWithStored() {
    const password = store.get();
    if (!password) {
      showView("login");
      return;
    }
    showView("loading");
    const result = await fetchData(password);
    if (result.kind === "ok") return showDashboard(result.data);
    if (result.kind === "unauthorized") {
      store.clear();
      showView("login");
      return;
    }
    showError(failureText(result));
  }

  function failureText(result) {
    if (result.kind === "offline") return TEXT.offline;
    if (result.kind === "limited") return TEXT.limited;
    return TEXT.generic;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = input.value;
    if (!password) {
      setLoginError(TEXT.emptyPassword);
      input.focus();
      return;
    }
    setLoginError("");
    setBusy(true);
    const result = await fetchData(password);
    setBusy(false);

    if (result.kind === "ok") {
      store.set(password);
      input.value = "";
      showDashboard(result.data);
      return;
    }
    if (result.kind === "unauthorized") setLoginError(TEXT.wrongPassword);
    else setLoginError(failureText(result));
    input.focus();
    input.select();
  });

  input.addEventListener("input", () => {
    if (loginError.textContent) setLoginError("");
  });

  logoutButton.addEventListener("click", logout);
  $("#error-logout").addEventListener("click", logout);
  $("#retry").addEventListener("click", loginWithStored);

  // -------------------------------------------------------------------------
  // Vehicle analysis (only display logic – all numbers come from the sheet)
  // -------------------------------------------------------------------------

  function analyse(v) {
    const hasCheckpoint = isNum(v.checkpoint_date) && isNum(v.current_km);
    const driven = isNum(v.driven_km)
      ? v.driven_km
      : hasCheckpoint && isNum(v.handover_km)
        ? v.current_km - v.handover_km
        : null;
    const allowance = isNum(v.included_km) && isNum(v.handover_km) ? v.included_km - v.handover_km : null;
    const diff = isNum(v.diff_km)
      ? v.diff_km
      : hasCheckpoint && isNum(v.included_km)
        ? v.current_km - v.included_km
        : null;
    const kmCost = (n) => (isNum(v.extra_km_price_rp) ? Math.round((Math.max(0, n) * v.extra_km_price_rp) / 100) : null);
    let cost = isNum(v.extra_km_cost_chf) ? v.extra_km_cost_chf : null;
    if (cost === null && isNum(diff)) cost = kmCost(diff);

    // Paid extra-km deposit, in km (contract: open_extra_km = diff_km − deposit km).
    const depositKm = isNum(diff) && isNum(v.open_extra_km) ? Math.max(0, diff - v.open_extra_km) : 0;
    const over = isNum(diff) && diff > 0;
    const openKm = isNum(diff) ? Math.max(0, diff - depositKm) : null;
    const openCost = depositKm > 0 ? kmCost(openKm) : cost;

    const pd = v.projected_diff_end;
    const projOpenKm = isNum(pd) ? Math.max(0, pd - depositKm) : null;
    let projCost = null;
    if (isNum(pd)) {
      projCost = depositKm === 0 && isNum(v.projected_cost_end_chf) ? v.projected_cost_end_chf : kmCost(projOpenKm);
    }

    return {
      hasCheckpoint: hasCheckpoint && isNum(driven),
      driven,
      allowance,
      diff,
      cost,
      over,
      depositKm,
      openKm,
      openCost,
      // over the package and not (fully) covered by the deposit
      owes: over && openKm > 0,
      // over the package, but the deposit covers all of it
      covered: over && openKm === 0,
      projOpenKm,
      projCost,
      status: STATUS[v.status] || { label: prettyLabel(v.status), tone: "neutral" },
    };
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  function renderDashboard(data) {
    resetDashboard();
    const root = views.dashboard;
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "KM-Tracking";
    const contactEmail = isEmail(data.contactEmail) ? data.contactEmail : null;
    const vehicles = data.vehicles.filter((v) => v && v.vehicle && v.plate);

    headerTitle.textContent = title;
    document.title = `${title} · CARIFY`;

    const many = vehicles.length > 1;
    root.append(
      h("div", { class: "dash-intro" }, [
        h("h1", { id: "dash-title", class: "dash-title", tabindex: "-1" }, [
          "Hallo! Hier ist dein ",
          h("span", { class: "nowrap" }, "KM-Stand."),
        ]),
        h("p", { class: "dash-lead" }, [
          many
            ? "Alle deine Fahrzeuge auf einen Blick – basierend auf dem letzten erfassten "
            : "Alles Wichtige zu deinem Abo auf einen Blick – basierend auf dem letzten erfassten ",
          h("span", { class: "nowrap" }, "KM-Stand."),
        ]),
      ]),
    );

    if (vehicles.length === 0) {
      root.append(h("div", { class: "card empty-card" }, [icon("gauge", "icon icon-lg"), h("p", {}, TEXT.noVehicles)]));
      return;
    }

    const analysed = vehicles.map((v, i) => ({ v, a: analyse(v), id: `fahrzeug-${i + 1}` }));
    if (many) root.append(renderFleet(analysed));
    for (const item of analysed) root.append(renderVehicle(item, { contactEmail, many }));

    if (contactEmail) {
      root.append(
        h("p", { class: "dash-contact" }, [
          icon("mail", "icon icon-sm"),
          "Fragen zu deinem Abo? ",
          h("a", { href: `mailto:${contactEmail}` }, "Schreib uns"),
          " – wir sind gerne für dich da.",
        ]),
      );
    }
  }

  function renderFleet(items) {
    const totalDriven = items.reduce((sum, { a }) => sum + (isNum(a.driven) ? a.driven : 0), 0);
    const overCount = items.filter(({ a }) => a.owes).length;
    const titleId = nextId("fleet");

    const stat = (value, label, tone) =>
      h("li", { class: `fleet-stat${tone ? ` fleet-stat--${tone}` : ""}` }, [
        h("span", { class: "fleet-value" }, value),
        h("span", { class: "fleet-label" }, label),
      ]);

    const list = h(
      "ul",
      { class: "fleet-list" },
      items.map(({ v, a, id }) => {
        let state;
        let tone;
        let note = null;
        if (!a.hasCheckpoint || !isNum(a.diff)) {
          state = "Noch kein KM-Stand";
          tone = "neutral";
        } else if (a.owes) {
          state = `${km(a.diff)} über Paket`;
          tone = "warn";
        } else if (a.covered) {
          state = `${km(a.diff)} über Paket`;
          note = "durch Depot gedeckt";
          tone = "ok";
        } else if (a.diff === 0) {
          state = "Punktgenau im Paket";
          tone = "ok";
        } else {
          state = `${km(Math.abs(a.diff))} Puffer`;
          tone = "ok";
        }
        return h("li", {}, [
          h("a", { class: "fleet-item", href: `#${id}` }, [
            h("span", { class: `dot dot--${tone}`, "aria-hidden": "true" }),
            h("span", { class: "fleet-item-main" }, [
              h("span", { class: "fleet-item-name" }, v.vehicle),
              h("span", { class: "fleet-item-plate" }, v.plate),
            ]),
            h("span", { class: `fleet-item-state tone-${tone}` }, [
              state,
              note ? h("span", { class: "fleet-item-note" }, note) : null,
            ]),
            icon("arrow", "icon icon-sm fleet-item-arrow"),
          ]),
        ]);
      }),
    );

    return h("section", { class: "card fleet", "aria-labelledby": titleId }, [
      h("h2", { id: titleId, class: "section-title" }, "Deine Flotte"),
      h("ul", { class: "fleet-stats" }, [
        stat(num(items.length), items.length === 1 ? "Fahrzeug" : "Fahrzeuge"),
        stat(num(totalDriven), "km gefahren"),
        stat(num(overCount), overCount === 1 ? "Fahrzeug über Paket" : "Fahrzeuge über Paket", overCount > 0 ? "warn" : "ok"),
      ]),
      list,
    ]);
  }

  function renderVehicle({ v, a, id }, ctx) {
    const titleId = `${id}-title`;
    const head = h("header", { class: "vehicle-head" }, [
      h("div", { class: "vehicle-head-main" }, [
        h("h2", { id: titleId, class: "vehicle-title" }, v.vehicle),
        h("div", { class: "vehicle-chips" }, [
          h("span", { class: "plate", "aria-label": `Kennzeichen ${v.plate}` }, v.plate),
          h("span", { class: `chip chip--${a.status.tone}` }, [
            h("span", { class: `dot dot--${a.status.tone}`, "aria-hidden": "true" }),
            a.status.label,
          ]),
        ]),
      ]),
      a.hasCheckpoint ? h("p", { class: "vehicle-stand" }, `Stand: ${fmtDate(v.checkpoint_date)}`) : null,
    ]);

    const article = h("article", { class: "card vehicle", id, "aria-labelledby": titleId }, [head]);

    if (!a.hasCheckpoint) {
      article.append(
        h("div", { class: "empty-state" }, [icon("gauge", "icon icon-lg"), h("p", {}, TEXT.noCheckpoint)]),
        renderBasicKpis(v, a),
        renderDetails(v, a),
      );
      return article;
    }

    article.append(
      h("div", { class: "vehicle-top" }, [renderHero(v, a), renderStatus(v, a), renderKpis(v, a)]),
      renderChart(v, a),
    );
    const tip = renderTip(v, a, ctx);
    if (tip) article.append(tip);
    article.append(renderDetails(v, a));
    return article;
  }

  function renderHero(v, a) {
    const main = h("div", { class: "hero-main" }, [
      h("p", { class: "hero-number" }, [
        h("span", { class: "hero-value" }, num(a.driven)),
        " ",
        h("span", { class: "hero-unit" }, "km gefahren"),
      ]),
    ]);
    const hero = h("section", { class: "hero", "aria-label": "Gefahrene Kilometer" }, [main]);

    if (isNum(a.allowance)) {
      main.append(h("p", { class: "hero-sub" }, `${km(a.allowance)} inklusive bis heute`));
      const meterWrap = h("div", { class: "hero-meter" });
      hero.append(meterWrap);

      const allowance = Math.max(0, a.allowance);
      const driven = Math.max(0, a.driven);
      const scale = Math.max(allowance, driven, 1);
      const within = Math.min(driven, allowance) / scale;
      const overShare = driven > allowance ? (driven - allowance) / scale : 0;
      const pct = allowance > 0 ? Math.round((driven / allowance) * 100) : null;

      const meter = h("div", {
        class: `meter${overShare > 0 ? " meter--over" : ""}`,
        role: "progressbar",
        "aria-label": "Gefahrene Kilometer im Vergleich zu den inklusiven Kilometern",
        "aria-valuemin": "0",
        "aria-valuemax": String(Math.round(scale)),
        "aria-valuenow": String(Math.round(driven)),
        "aria-valuetext": `${km(a.driven)} von ${km(a.allowance)} inklusive`,
      }, [h("span", { class: "meter-fill" }), h("span", { class: "meter-over" }), h("span", { class: "meter-mark" })]);
      // CSSOM custom properties are CSP-safe (no inline style attribute).
      meter.style.setProperty("--within", `${(within * 100).toFixed(2)}%`);
      meter.style.setProperty("--over", `${(overShare * 100).toFixed(2)}%`);
      meterWrap.append(meter);

      if (pct !== null) {
        meterWrap.append(
          h("p", { class: "hero-foot" }, [
            h("span", {}, `${num(pct)}${NBSP}% deiner Inklusiv-Kilometer`),
            isNum(v.km_package) ? h("span", {}, `Paket ${km(v.km_package)} / Monat`) : null,
          ]),
        );
      }
    }
    return hero;
  }

  function depositLabel(v) {
    return isNum(v.deposit_chf) && v.deposit_chf > 0 ? ` von ${chf(v.deposit_chf)}` : "";
  }

  function calloutNote(text) {
    return h("p", { class: "callout-note" }, [icon("shield", "icon icon-sm"), h("span", {}, text)]);
  }

  function callout(tone, iconName, body) {
    return h("div", { class: `callout callout--${tone}` }, [
      h("span", { class: "callout-icon" }, icon(iconName)),
      h("div", { class: "callout-body" }, body),
    ]);
  }

  function renderStatus(v, a) {
    if (!isNum(a.diff)) {
      return callout("neutral", "gauge", [
        h("p", { class: "callout-text" }, "Sobald alle Werte da sind, siehst du hier deinen Status."),
      ]);
    }
    const deposit = depositLabel(v);

    if (!a.over) {
      const body = [
        h(
          "p",
          { class: "callout-text" },
          a.diff === 0
            ? [h("strong", {}, "Punktgenau im Paket"), " – du bist genau auf deinen Inklusiv-Kilometern."]
            : [h("strong", {}, "Alles im grünen Bereich"), ` – du hast noch ${km(Math.abs(a.diff))} Puffer.`],
        ),
      ];
      if (a.depositKm > 0) {
        body.push(calloutNote(`Dazu kommt dein Mehrkilometer-Depot${deposit}: Das deckt nochmals ${km(a.depositKm)} ab.`));
      }
      return callout("ok", "check", body);
    }

    if (a.covered) {
      const left = a.depositKm - a.diff;
      return callout("ok", "check", [
        h("p", { class: "callout-text" }, [
          h("strong", {}, `Du liegst ${km(a.diff)} über deinem Paket.`),
          ` Kein Stress: Dein Mehrkilometer-Depot${deposit} deckt das komplett ab.`,
          left > 0 ? ` Im Depot sind sogar noch ${km(left)} übrig.` : "",
        ]),
      ]);
    }

    let costText = "";
    if (isNum(a.openCost)) {
      costText = a.depositKm > 0 ? ` (Stand heute noch offen: ca. ${chf(a.openCost)})` : ` (Stand heute ca. ${chf(a.openCost)})`;
    }
    const body = [
      h("p", { class: "callout-text" }, [
        h("strong", {}, `Du liegst ${km(a.diff)} über deinem Paket.`),
        ` Kein Stress: Mehrkilometer werden erst am Ende der Laufzeit abgerechnet${costText}.`,
      ]),
    ];
    if (a.depositKm > 0) {
      body.push(
        calloutNote(
          `Dein Mehrkilometer-Depot${deposit} deckt davon bereits ${km(a.depositKm)} ab – offen sind noch ${km(a.openKm)}.`,
        ),
      );
    }
    return callout("warn", "alert", body);
  }

  function kpiTile({ label, value, sub, tone, badge }) {
    return h("li", { class: `kpi${tone ? ` kpi--${tone}` : ""}` }, [
      h("p", { class: "kpi-label" }, label),
      h("p", { class: "kpi-value" }, value),
      sub ? h("p", { class: "kpi-sub" }, sub) : null,
      badge ? h("span", { class: `badge badge--${tone || "neutral"}` }, badge) : null,
    ]);
  }

  function minTermTile(v) {
    let value = "–";
    let sub = null;
    if (isNum(v.min_duration_left)) {
      if (v.min_duration_left > 0) {
        value = `noch ${months(v.min_duration_left)}`;
        sub = isNum(v.min_term_end) ? `bis ${fmtDate(v.min_term_end)}` : null;
      } else {
        value = "erfüllt";
        if (isNum(v.min_term_end)) {
          sub = v.min_term_end <= todaySerial() ? `seit ${fmtDate(v.min_term_end)}` : `bis ${fmtDate(v.min_term_end)}`;
        }
      }
    }
    return kpiTile({ label: "Mindestlaufzeit", value, sub });
  }

  function priceTile(v) {
    return kpiTile({
      label: "Preis pro Mehrkilometer",
      value: chfPerKm(v.extra_km_price_rp),
      sub: "nur für km über deinem Paket",
    });
  }

  function renderKpis(v, a) {
    const tiles = [];

    // Ø pro Monat
    const avgOver = isNum(v.avg_km_month) && isNum(v.km_package) && v.avg_km_month > v.km_package;
    tiles.push(
      kpiTile({
        label: "Ø pro Monat",
        value: km(v.avg_km_month),
        sub: isNum(v.km_package) ? `Paket: ${km(v.km_package)}` : null,
        tone: isNum(v.avg_km_month) && isNum(v.km_package) ? (avgOver ? "warn" : "ok") : null,
        badge: isNum(v.avg_km_month) && isNum(v.km_package) ? (avgOver ? "über Paket" : "im Rahmen") : null,
      }),
    );

    tiles.push(minTermTile(v));

    // Prognose Laufzeitende – or, once the minimum term is over, today's balance
    const pd = v.projected_diff_end;
    const termAhead = isNum(v.min_term_end) && isNum(v.checkpoint_date) && v.min_term_end > v.checkpoint_date;
    const label = termAhead ? "Prognose Laufzeitende" : "Bilanz heute";
    if (isNum(pd)) {
      const over = pd > 0;
      const owes = isNum(a.projOpenKm) && a.projOpenKm > 0;
      const subParts = [];
      if (owes && isNum(a.projCost) && a.projCost > 0) {
        subParts.push(`ca. ${chf(a.projCost)} Mehrkosten${a.depositKm > 0 ? " nach Depot" : ""}`);
      } else if (over) {
        subParts.push("durch dein Depot gedeckt");
      }
      if (termAhead) subParts.push(`bei gleichem Tempo bis ${fmtDate(v.min_term_end)}`);
      else if (subParts.length === 0) subParts.push(`Stand ${fmtDate(v.checkpoint_date)}`);
      let badge;
      if (termAhead) badge = owes ? "Paket prüfen" : "passt";
      else badge = owes ? "über Paket" : "im Rahmen";
      tiles.push(
        kpiTile({
          label,
          value: over ? `${km(pd)} drüber` : `${km(Math.abs(pd))} Puffer`,
          sub: subParts.join(" · "),
          tone: owes ? "warn" : "ok",
          badge,
        }),
      );
    } else {
      tiles.push(kpiTile({ label, value: "–", sub: "Noch zu wenig Daten" }));
    }

    tiles.push(priceTile(v));

    return h("ul", { class: "kpis", "aria-label": "Kennzahlen" }, tiles);
  }

  /** Reduced KPI list for vehicles without a checkpoint (no km values yet). */
  function renderBasicKpis(v, a) {
    const tiles = [minTermTile(v)];
    if (isNum(a.allowance)) {
      tiles.push(
        kpiTile({
          label: "Inklusive bis heute",
          value: km(a.allowance),
          sub: isNum(v.km_package) ? `Paket: ${km(v.km_package)} / Monat` : null,
        }),
      );
    }
    tiles.push(priceTile(v));
    return h("ul", { class: "kpis kpis--basic", "aria-label": "Kennzahlen" }, tiles);
  }

  function renderTip(v, a, ctx) {
    if (!(isNum(v.recommended_package) && isNum(v.km_package) && isNum(a.projOpenKm))) return null;
    if (!(v.recommended_package > v.km_package && a.projOpenKm > 0)) return null;

    const pkg = h("span", { class: "nowrap" }, `${num(v.recommended_package)}-km-Paket`);
    const rest = " – wir passen das gerne für dich an.";
    let cta = "Schreib uns";
    if (ctx.contactEmail) {
      const subject = encodeURIComponent(`KM-Paket anpassen (${v.plate})`);
      cta = h("a", { href: `mailto:${ctx.contactEmail}?subject=${subject}` }, "Schreib uns");
    }
    return h("aside", { class: "tip", "aria-label": "Tipp" }, [
      h("span", { class: "tip-icon" }, icon("bulb")),
      h("p", {}, [h("strong", {}, "Tipp:"), " Mit dem ", pkg, " bist du auf der sicheren Seite. ", cta, rest]),
    ]);
  }

  function renderDetails(v, a) {
    const titleId = nextId("details");
    const rows = [
      ["Fahrzeug", v.vehicle],
      ["Kennzeichen", v.plate],
      ["KM-Paket", isNum(v.km_package) ? `${km(v.km_package)} / Monat` : "–"],
      ["Versicherung", prettyLabel(v.insurance)],
      ["Preis / Monat", chf(v.monthly_price_chf)],
      ["Übergabe", joinParts(fmtDate(v.handover_date), km(v.handover_km))],
      ["Letzter Stand", a.hasCheckpoint ? joinParts(fmtDate(v.checkpoint_date), km(v.current_km)) : "–"],
      ["Mindestlaufzeit", isNum(v.min_duration_months) ? months(v.min_duration_months) : "–"],
      ["Mindestlaufzeit bis", fmtDate(v.min_term_end)],
    ];
    if (isNum(v.deposit_chf) && v.deposit_chf > 0) rows.push(["Mehrkilometer-Depot", chf(v.deposit_chf)]);
    return h("section", { class: "details", "aria-labelledby": titleId }, [
      h("h3", { id: titleId, class: "section-title" }, "Details"),
      h(
        "dl",
        { class: "details-list" },
        rows.map(([label, value]) => h("div", { class: "details-row" }, [h("dt", {}, label), h("dd", {}, value)])),
      ),
    ]);
  }

  function joinParts(...parts) {
    const filtered = parts.filter((p) => p && p !== "–");
    return filtered.length ? filtered.join(" · ") : "–";
  }

  // -------------------------------------------------------------------------
  // Chart (inline SVG, no library)
  // -------------------------------------------------------------------------

  function niceStep(raw) {
    const exp = 10 ** Math.floor(Math.log10(raw));
    const f = raw / exp;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * exp;
  }

  function chartModel(v, a) {
    if (!isNum(v.handover_date) || !isNum(v.handover_km)) return null;
    const x0 = v.handover_date;
    const xc = Math.max(v.checkpoint_date, x0);
    const incNow = a.allowance;
    const incEnd = isNum(v.included_km_end) ? v.included_km_end - v.handover_km : null;
    const projEnd = isNum(v.projected_km_end) ? v.projected_km_end - v.handover_km : null;
    const driven = a.driven;
    // Only extend the x axis to the term end when there is something to show there.
    const hasEnd = isNum(v.min_term_end) && v.min_term_end > xc && (isNum(projEnd) || isNum(incEnd));
    const xe = hasEnd ? v.min_term_end : Math.max(xc, x0 + 1);

    const inc = [[x0, 0]];
    if (isNum(incNow) && xc > x0 && xc < xe) inc.push([xc, incNow]);
    if (hasEnd && isNum(incEnd)) inc.push([xe, incEnd]);
    else if (isNum(incNow) && !hasEnd) inc.push([xe, incNow]);

    const drive = [[x0, 0], [xc, driven]];
    const proj = hasEnd && isNum(projEnd) ? [[xc, driven], [xe, projEnd]] : null;

    // included_km is "as of today" (sheet date), not as of the checkpoint.
    const keys = [
      { x: x0, title: `Übergabe · ${fmtDate(x0)}`, rows: [["drive", "Gefahren", 0], ["inc", "Inklusive", 0]] },
      { x: xc, title: `Stand · ${fmtDate(xc)}`, rows: [["drive", "Gefahren", driven], ["inc", "Inklusive bis heute", incNow]] },
    ];
    if (hasEnd) {
      keys.push({
        x: xe,
        title: `Laufzeitende · ${fmtDate(xe)}`,
        rows: [["proj", "Prognose", projEnd], ["inc", "Inklusive", incEnd]],
      });
    }

    const values = [incNow, incEnd, driven, projEnd].filter(isNum);
    const maxVal = Math.max(100, ...values);
    const step = niceStep(maxVal / 4);
    const yMax = Math.ceil((maxVal * 1.04) / step) * step;

    return { x0, xc, xe, hasEnd, inc, drive, proj, keys, step, yMax, incEnd, projEnd, incNow, driven };
  }

  function renderChart(v, a) {
    const model = chartModel(v, a);
    if (!model) return null;

    const titleId = nextId("chart-title");
    const descId = nextId("chart-desc");
    const plot = h("div", {
      class: "chart-plot",
      tabindex: "0",
      role: "group",
      "aria-label": model.hasEnd
        ? "Diagramm. Mit den Pfeiltasten wechselst du zwischen Übergabe, Stand und Laufzeitende."
        : "Diagramm. Mit den Pfeiltasten wechselst du zwischen Übergabe und Stand.",
    });
    const tooltip = h("div", { class: "chart-tip", hidden: true, "aria-live": "polite" });

    const legendItem = (cls, label) =>
      h("li", {}, [h("span", { class: `key key--${cls}`, "aria-hidden": "true" }), label]);

    const descParts = [
      `Seit der Übergabe am ${fmtDate(model.x0)} bist du ${km(model.driven)} gefahren`,
      isNum(model.incNow) ? `, inklusive sind bis heute ${km(model.incNow)}.` : ".",
    ];
    if (model.proj && isNum(model.incEnd)) {
      descParts.push(
        ` Prognose bis ${fmtDate(model.xe)}: ${km(model.projEnd)} gefahren bei ${km(model.incEnd)} inklusive.`,
      );
    }
    const description = descParts.join("");

    const figure = h("figure", { class: "chart-card" }, [
      h("div", { class: "chart-head" }, [
        h("div", {}, [
          h("h3", { class: "section-title" }, "Dein Verlauf"),
          h("p", { class: "chart-sub" }, "Kilometer seit Übergabe"),
        ]),
        h("ul", { class: "legend", "aria-label": "Legende" }, [
          legendItem("inc", "Inklusive km"),
          legendItem("drive", "Gefahren"),
          model.proj ? legendItem("proj", "Prognose") : null,
        ]),
      ]),
      appendChildren(plot, [tooltip]),
      model.proj ? h("figcaption", { class: "chart-caption" }, "Prognose: wenn du so weiterfährst wie bisher.") : null,
    ]);

    let lastWidth = 0;
    let active = -1;
    let api = null;

    const draw = (width) => {
      const svgEl = plot.querySelector("svg");
      if (svgEl) svgEl.remove();
      api = drawChart(plot, tooltip, model, width, { title: `KM-Verlauf ${v.vehicle}`, description, titleId, descId });
      if (active >= 0) api.show(active);
    };

    const ro = new ResizeObserver((entries) => {
      const width = Math.floor(entries[0].contentRect.width);
      if (width > 0 && Math.abs(width - lastWidth) >= 1) {
        lastWidth = width;
        draw(width);
      }
    });
    ro.observe(plot);
    chartObservers.push(ro);

    const setActive = (i) => {
      active = i;
      if (api) {
        if (i < 0) api.hide();
        else api.show(i);
      }
    };

    plot.addEventListener("pointermove", (e) => api && setActive(api.nearest(e.clientX)));
    plot.addEventListener("pointerdown", (e) => api && setActive(api.nearest(e.clientX)));
    plot.addEventListener("pointerleave", () => {
      if (document.activeElement !== plot) setActive(-1);
    });
    plot.addEventListener("focus", () => setActive(active >= 0 ? active : Math.min(1, model.keys.length - 1)));
    plot.addEventListener("blur", () => setActive(-1));
    plot.addEventListener("keydown", (e) => {
      const last = model.keys.length - 1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setActive(Math.min(last, Math.max(0, active + 1)));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setActive(Math.max(0, active - 1));
      else if (e.key === "Home") setActive(0);
      else if (e.key === "End") setActive(last);
      else if (e.key === "Escape") setActive(-1);
      else return;
      e.preventDefault();
    });

    return figure;
  }

  function drawChart(host, tooltip, model, width, meta) {
    const narrow = width < 520;
    const height = narrow ? 230 : 290;
    const m = { top: 34, right: narrow ? 12 : 20, bottom: 34, left: narrow ? 50 : 60 };
    const pw = Math.max(40, width - m.left - m.right);
    const ph = height - m.top - m.bottom;
    const span = Math.max(1, model.xe - model.x0);
    const X = (d) => m.left + ((d - model.x0) / span) * pw;
    const Y = (val) => m.top + ph - (val / model.yMax) * ph;
    const pts = (list) => list.map(([d, val]) => `${X(d).toFixed(1)},${Y(val).toFixed(1)}`).join(" ");

    const svgEl = s("svg", {
      class: "chart-svg",
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: "img",
      "aria-labelledby": `${meta.titleId} ${meta.descId}`,
    });
    svgEl.append(s("title", { id: meta.titleId }, meta.title), s("desc", { id: meta.descId }, meta.description));

    // Grid + y labels
    const grid = s("g", { class: "chart-grid" });
    for (let val = 0; val <= model.yMax + 0.5; val += model.step) {
      const y = Y(val).toFixed(1);
      grid.append(
        s("line", { x1: m.left, x2: m.left + pw, y1: y, y2: y, class: val === 0 ? "grid-base" : "grid-line" }),
        s("text", { x: m.left - 10, y, class: "axis-label", "text-anchor": "end", "dominant-baseline": "middle" }, num(val)),
      );
    }
    svgEl.append(grid);

    // X labels (start / end)
    const xLabelY = m.top + ph + 22;
    svgEl.append(
      s("text", { x: m.left, y: xLabelY, class: "axis-label", "text-anchor": "start" }, narrow ? fmtDate(model.x0) : `Übergabe ${fmtDate(model.x0)}`),
      s(
        "text",
        { x: m.left + pw, y: xLabelY, class: "axis-label", "text-anchor": "end" },
        narrow
          ? fmtDate(model.hasEnd ? model.xe : model.xc)
          : model.hasEnd
            ? `Laufzeitende ${fmtDate(model.xe)}`
            : `Stand ${fmtDate(model.xc)}`,
      ),
    );

    // "Heute" marker at checkpoint
    const xcPx = X(model.xc);
    const markerAnchor = xcPx > m.left + pw - 36 ? "end" : xcPx < m.left + 36 ? "start" : "middle";
    svgEl.append(
      s("line", { x1: xcPx, x2: xcPx, y1: m.top - 6, y2: m.top + ph, class: "chart-today" }),
      s("text", { x: xcPx, y: m.top - 12, class: "chart-today-label", "text-anchor": markerAnchor }, `Stand ${fmtDateShort(model.xc)}`),
    );

    // Inklusive: area wash + line
    if (model.inc.length > 1) {
      const last = model.inc[model.inc.length - 1];
      const area = `${X(model.x0).toFixed(1)},${Y(0).toFixed(1)} ${pts(model.inc)} ${X(last[0]).toFixed(1)},${Y(0).toFixed(1)}`;
      svgEl.append(
        s("polygon", { points: area, class: "series-inc-area" }),
        s("polyline", { points: pts(model.inc), class: "series-line series-inc" }),
      );
    }

    // Prognose (dashed) + Gefahren
    if (model.proj) {
      svgEl.append(s("polyline", { points: pts(model.proj), class: "series-line series-proj" }));
      const [d, val] = model.proj[1];
      svgEl.append(s("circle", { cx: X(d), cy: Y(val), r: 4, class: "series-proj-end" }));
    }
    svgEl.append(s("polyline", { points: pts(model.drive), class: "series-line series-drive" }));
    svgEl.append(s("circle", { cx: xcPx, cy: Y(model.driven), r: 5.5, class: "series-drive-dot" }));

    // Hover layer
    const cross = s("line", { x1: 0, x2: 0, y1: m.top, y2: m.top + ph, class: "chart-cross", visibility: "hidden" });
    const hoverDots = s("g", { class: "chart-hover-dots", visibility: "hidden" });
    svgEl.append(cross, hoverDots);
    host.prepend(svgEl);

    const keyXs = model.keys.map((k) => X(k.x));

    function nearest(clientX) {
      const rect = svgEl.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      let best = 0;
      keyXs.forEach((x, i) => {
        if (Math.abs(x - px) < Math.abs(keyXs[best] - px)) best = i;
      });
      return best;
    }

    function show(i) {
      const key = model.keys[i];
      if (!key) return hide();
      const x = keyXs[i];
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      cross.setAttribute("visibility", "visible");
      hoverDots.replaceChildren(
        ...key.rows
          .filter(([, , val]) => isNum(val))
          .map(([cls, , val]) => s("circle", { cx: x, cy: Y(val), r: 5, class: `hover-dot hover-dot--${cls}` })),
      );
      hoverDots.setAttribute("visibility", "visible");

      tooltip.replaceChildren(
        h("p", { class: "chart-tip-title" }, key.title),
        h(
          "ul",
          {},
          key.rows.filter(([, , val]) => isNum(val)).map(([cls, label, val]) =>
            h("li", {}, [
              h("span", { class: `key key--${cls}`, "aria-hidden": "true" }),
              h("strong", {}, km(val)),
              h("span", { class: "chart-tip-label" }, label),
            ]),
          ),
        ),
      );
      tooltip.hidden = false;
      const tipWidth = tooltip.offsetWidth;
      const scaleX = svgEl.getBoundingClientRect().width / width || 1;
      const xPx = x * scaleX;
      let left = xPx + 12;
      if (left + tipWidth > host.clientWidth - 4) left = xPx - tipWidth - 12;
      left = Math.max(4, Math.min(left, host.clientWidth - tipWidth - 4));
      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(m.top * scaleX)}px`;
    }

    function hide() {
      cross.setAttribute("visibility", "hidden");
      hoverDots.setAttribute("visibility", "hidden");
      tooltip.hidden = true;
    }

    return { nearest, show, hide };
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  // Defensive: never keep a password in the address bar / history (e.g. from an
  // old bookmark or a native form submit before this script was loaded).
  if (new URLSearchParams(window.location.search).has("password")) {
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }
  // The button ships disabled in the HTML so the form can't be submitted natively.
  submit.disabled = false;
  loginWithStored();
})();
