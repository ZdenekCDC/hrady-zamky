// Map view: markers, filters, time machine, legend and place detail.
import {
  ACCESS, HOW, KIND, NOW, century, commonsThumb, distanceKm, esc, familyName, isInstitution,
  ownerAt, ownerColor, photoCredit, placeThumb, yearRange,
} from "./data.js";
import { attachBaseLayers } from "./basemaps.js";
import { hideTooltip, renderGantt } from "./gantt.js";
import {
  canConnect, createFile, disconnectFile, exportVisits, importVisits, openFile, restoreAccess, saveVisit, storageInfo,
} from "./visits.js";

const STORE = "hz-filters-v1";
const DEFAULTS = {
  layers: { vstupne: true, volne: true, neznamo: false },
  kinds: { hrad: true, zamek: true, hradozamek: true, zricenina: true },
  kraj: "",
  manager: "",
  cFrom: "",
  cTo: "",
  visits: "", // "" all | "yes" only visited | "no" only unvisited
  onlyHistory: false,
  tm: false,
  year: 1600,
  families: [],
  radius: 25,
};

let D; // data bundle
let map;
let state;
let selected = null;
const markers = new Map(); // id -> {marker, key}
let layer;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE)) || {};
    if (typeof s.family === "string") s.families = s.family ? [s.family] : []; // single-select from v1
    delete s.family;
    return { ...structuredClone(DEFAULTS), ...s, layers: { ...DEFAULTS.layers, ...s.layers }, kinds: { ...DEFAULTS.kinds, ...s.kinds } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

/* ---------- marker glyphs ---------- */

// Pictograms in a unit box (x, y in -1..1, y down); drawn scaled to the marker, the outline keeps its px width.
const PICTOGRAMS = {
  // tower with battlements
  hrad: "M-.72 1V-.5H-.92V-1H-.54V-.74H-.19V-1H.19V-.74H.54V-1H.92V-.5H.72V1Z",
  // chateau: wide house with a roof and a domed turret
  zamek: "M-1 .8V-.05L-.82-.4H-.28V-.58C-.28-1.02 .28-1.02 .28-.58V-.4H.82L1-.05V.8Z",
  // castle keep with a chateau wing
  hradozamek: "M-1 1V-1H-.77V-.8H-.53V-1H-.3V-.26L.02-.56H.68L1-.24V1Z",
  // broken walls with a jagged top
  zricenina: "M-.95 1V-.46H-.7V-.92H-.44V-.3L-.16-.06L.1-.44L.34 0V-.6H.6V-.28H.95V1Z",
};

// pictograms need more room than the old circles / squares to stay readable; sizes elsewhere stay as they were
const PICTO_SCALE = 1.35;

/** Pixel size of the square SVG that glyph() draws for a style size. */
export function glyphBox(size) {
  return Math.round(size * PICTO_SCALE) + 4;
}

export function glyph(kind, { size, fill, stroke, strokeWidth = 2, check = false, opacity = 1, halo = true }) {
  const box = glyphBox(size);
  const r = (box - 4) / 2 - strokeWidth / 2;
  const c = box / 2;
  const d = PICTOGRAMS[kind] || PICTOGRAMS.zamek;
  const t = r * 0.42; // tick in the solid lower half of every pictogram
  const tick = check ? `<path d="M${-t} ${r * 0.42} l${t * 0.7} ${t * 0.7} l${t * 1.3} ${-t * 1.3}" fill="none" stroke="#fff" stroke-width="${Math.max(1.6, r * 0.24)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  return `<svg width="${box}" height="${box}" viewBox="${-c} ${-c} ${box} ${box}" style="opacity:${opacity}">
    ${halo ? /* white ring lifts the marker off the terrain tiles */ `<path d="${d}" transform="scale(${r})" fill="none" stroke="var(--mk-bg)" stroke-width="${strokeWidth + 2.5}" vector-effect="non-scaling-stroke" stroke-linejoin="round" opacity=".9"/>` : ""}
    <path d="${d}" transform="scale(${r})" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${tick}</svg>`;
}

/** First highlighted family that ever owned the place (or null). */
function highlightedOwner(p) {
  const owners = p.history?.owners;
  return owners ? state.families.find((f) => owners.some((o) => o.owner === f)) || null : null;
}

const kindFill = (kind, soft = false) => `var(--mk-kind-${kind}${soft ? "-soft" : ""})`;
// outline = access: bold black with admission, thin grey for free ruins (shared by the map and the legend)
const ACCESS_STYLE = {
  vstupne: { size: 15, stroke: "var(--mk-ink)", strokeWidth: 2.25 },
  volne: { size: 13, stroke: "var(--mk-free)", strokeWidth: 1.5 },
};

function markerStyle(p) {
  const fams = state.families;
  if (state.tm) {
    const o = ownerAt(p, state.year);
    const dim = fams.length && (!o || !fams.includes(o.owner));
    if (!o) return { size: 8, fill: "var(--mk-nodata)", stroke: "var(--mk-bg)", strokeWidth: 1, opacity: dim ? 0.3 : 0.9 };
    const color = ownerColor(D.families, o.owner, true);
    return {
      size: p.visited ? 18 : 15,
      fill: color,
      stroke: p.visited ? "var(--mk-ink)" : "var(--mk-bg)",
      strokeWidth: p.visited ? 2.5 : 2,
      opacity: dim ? 0.2 : 1,
    };
  }
  const hl = fams.length ? highlightedOwner(p) : null;
  const dim = fams.length && !hl;
  if (p.visited) return { size: 20, fill: hl ? ownerColor(D.families, hl, true) : "var(--mk-accent)", stroke: "var(--mk-bg)", check: true, opacity: dim ? 0.25 : 1 };
  if (hl) return { size: 17, fill: kindFill(p.kind), stroke: ownerColor(D.families, hl, true), strokeWidth: 3 };
  if (ACCESS_STYLE[p.access]) return { ...ACCESS_STYLE[p.access], fill: kindFill(p.kind, p.access === "volne"), opacity: dim ? 0.2 : 1 };
  return { size: 9, fill: "var(--mk-muted)", stroke: "var(--mk-bg)", strokeWidth: 1, opacity: dim ? 0.15 : 0.8 };
}

/* ---------- filtering ---------- */

function passes(p) {
  if (!p.visited && !state.layers[p.access]) return false;
  if (!state.kinds[p.kind]) return false;
  if (state.kraj && p.kraj !== state.kraj) return false;
  if (state.manager === "npu" && p.manager !== "NPÚ") return false;
  if (state.manager === "other" && p.manager === "NPÚ") return false;
  if (state.visits === "yes" && !p.visited) return false;
  if (state.visits === "no" && p.visited) return false;
  if (state.onlyHistory && !p.history) return false;
  const c = century(p.foundedYear);
  if (state.cFrom && (c == null || c < +state.cFrom)) return false;
  if (state.cTo && (c == null || c > +state.cTo)) return false;
  if (state.tm) {
    if (p.foundedYear != null && p.foundedYear > state.year) return false;
    if (!p.history && !state.onlyHistory && p.access === "neznamo") return false;
  }
  return true;
}

let pending = false;
function refresh() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const counts = { vstupne: 0, volne: 0, neznamo: 0 };
    for (const p of D.places) {
      const m = markers.get(p.id);
      const show = passes(p);
      if (show) counts[p.access]++;
      if (!show) {
        if (layer.hasLayer(m.marker)) layer.removeLayer(m.marker);
        continue;
      }
      const st = markerStyle(p);
      const key = JSON.stringify(st) + (selected === p.id);
      if (m.key !== key) {
        m.marker.setIcon(icon(p, st));
        m.key = key;
      }
      m.marker.setZIndexOffset(p.visited ? 1000 : p.access === "vstupne" ? 500 : 0);
      if (!layer.hasLayer(m.marker)) layer.addLayer(m.marker);
    }
    for (const [k, n] of Object.entries(counts)) {
      const el = document.querySelector(`[data-count="${k}"]`);
      if (el) el.textContent = n;
    }
    renderLegend();
  });
}

/** Leaflet icon of a place glyph, anchored at its centre. */
export function glyphIcon(kind, st, className = "mk") {
  const box = glyphBox(st.size);
  return L.divIcon({ className, html: glyph(kind, st), iconSize: [box, box], iconAnchor: [box / 2, box / 2] });
}

function icon(p, st) {
  return glyphIcon(p.kind, st, "mk" + (selected === p.id ? " sel" : ""));
}

/* ---------- sidebar: filters + legend ---------- */

function renderFilters() {
  const kraje = [...new Set(D.places.map((p) => p.kraj).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  const fams = Object.values(D.families).filter((f) => f.place_count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const centuries = Array.from({ length: 11 }, (_, i) => i + 10);
  const el = document.getElementById("panel-filters");
  el.innerHTML = `
    <div class="filters-head"><b>Filtry</b><button id="f-reset" class="link" title="vrátit všechny filtry na výchozí">resetovat vše</button></div>
    <div class="filter-group"><div class="label">Vrstvy</div>
      ${Object.entries(ACCESS).map(([k, a]) => `
        <label class="check"><input type="checkbox" data-layer="${k}" ${state.layers[k] ? "checked" : ""}>
        ${a.label}<span class="count" data-count="${k}"></span></label>`).join("")}
    </div>
    <div class="filter-group"><div class="label">Typ</div>
      <div class="row">${Object.entries(KIND).map(([k, label]) => `
        <label class="check"><input type="checkbox" data-kind="${k}" ${state.kinds[k] ? "checked" : ""}>
        ${glyph(k, { size: 12, fill: kindFill(k), stroke: "var(--mk-ink)", strokeWidth: 1.5 })}${label}</label>`).join("")}</div>
    </div>
    <div class="filter-group"><div class="label">Kraj a správce</div>
      <div class="row">
        <select id="f-kraj"><option value="">všechny kraje</option>${kraje.map((k) => `<option ${state.kraj === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <select id="f-manager">
          <option value="">každý správce</option>
          <option value="npu" ${state.manager === "npu" ? "selected" : ""}>NPÚ (státní)</option>
          <option value="other" ${state.manager === "other" ? "selected" : ""}>ostatní</option>
        </select>
      </div>
    </div>
    <div class="filter-group"><div class="label">Století vzniku</div>
      <div class="row">
        <select id="f-cfrom"><option value="">od</option>${centuries.map((c) => `<option value="${c}" ${+state.cFrom === c ? "selected" : ""}>${c}. stol.</option>`).join("")}</select>
        <select id="f-cto"><option value="">do</option>${centuries.map((c) => `<option value="${c}" ${+state.cTo === c ? "selected" : ""}>${c}. stol.</option>`).join("")}</select>
      </div>
    </div>
    <div class="filter-group">
      <label class="check">Návštěvy <select id="f-visits">
        <option value="">všechny</option>
        <option value="yes" ${state.visits === "yes" ? "selected" : ""}>jen navštívené</option>
        <option value="no" ${state.visits === "no" ? "selected" : ""}>jen nenavštívené</option>
      </select></label>
      <label class="check"><input type="checkbox" id="f-history" ${state.onlyHistory ? "checked" : ""}> jen s historií vlastníků</label>
    </div>
    <div class="filter-group" id="v-store">${storageHtml()}</div>
    <div class="timemachine">
      <label class="check"><input type="checkbox" id="f-tm" ${state.tm ? "checked" : ""}> <b>Stroj času</b></label>
      <div class="muted" style="font-size:12px;margin-bottom:6px">Obarví hrady a zámky podle vlastníka v daném roce (jen objekty se zpracovanou historií).</div>
      <div id="tm-body" ${state.tm ? "" : "hidden"}>
        <div class="row"><span class="year" id="tm-year">${state.year}</span>
          <button id="tm-minus" title="o 10 let zpět">-10</button><button id="tm-plus" title="o 10 let dál">+10</button>
          <button id="tm-play" title="přehrát">▶</button></div>
        <input type="range" id="f-year" min="1100" max="${NOW}" step="1" value="${state.year}">
      </div>
    </div>
    <div class="filter-group"><div class="label">Zvýraznit rody
        <button id="f-fam-reset" class="link" ${state.families.length ? "" : "hidden"}>zrušit výběr</button></div>
      <div class="chips" id="fam-chips">${state.families.map((id) => `
        <span class="chip"><span class="swatch" style="background:${ownerColor(D.families, id, true)}"></span>${esc(familyName(D.families, id))}
        <button data-unfam="${id}" title="odebrat" aria-label="odebrat ${esc(familyName(D.families, id))}">×</button></span>`).join("")}</div>
      <select id="f-family" style="width:100%"><option value="">+ přidat rod…</option>
        ${fams.filter((f) => !state.families.includes(f.id)).map((f) => `<option value="${f.id}">${esc(f.name)} (${f.place_count})</option>`).join("")}
      </select>
    </div>
    <div class="filter-group"><div class="label">Legenda</div><div id="legend" class="legend"></div></div>
    <p class="muted" style="font-size:12px">Zdroje: Wikidata, Wikipedie (CC BY-SA), NPÚ, statistika NIPOS 2025, © přispěvatelé OpenStreetMap.</p>`;

  const on = (sel, ev, fn) => el.querySelector(sel).addEventListener(ev, (e) => { fn(e); saveState(); refresh(); });
  el.querySelectorAll("[data-layer]").forEach((i) => i.addEventListener("change", () => { state.layers[i.dataset.layer] = i.checked; saveState(); refresh(); }));
  el.querySelectorAll("[data-kind]").forEach((i) => i.addEventListener("change", () => { state.kinds[i.dataset.kind] = i.checked; saveState(); refresh(); }));
  on("#f-kraj", "change", (e) => (state.kraj = e.target.value));
  on("#f-manager", "change", (e) => (state.manager = e.target.value));
  on("#f-cfrom", "change", (e) => (state.cFrom = e.target.value));
  on("#f-cto", "change", (e) => (state.cTo = e.target.value));
  on("#f-visits", "change", (e) => (state.visits = e.target.value));
  on("#f-history", "change", (e) => (state.onlyHistory = e.target.checked));
  const setFamilies = (list) => { state.families = list; saveState(); renderFilters(); refresh(); };
  el.querySelector("#f-family").addEventListener("change", (e) => { if (e.target.value) setFamilies([...state.families, e.target.value]); });
  el.querySelectorAll("[data-unfam]").forEach((b) => b.addEventListener("click", () => setFamilies(state.families.filter((f) => f !== b.dataset.unfam))));
  el.querySelector("#f-fam-reset").addEventListener("click", () => setFamilies([]));
  el.querySelector("#f-reset").addEventListener("click", () => {
    state = { ...structuredClone(DEFAULTS), radius: state.radius };
    saveState(); renderFilters(); refresh();
  });
  bindStorage(el.querySelector("#v-store"));
  on("#f-tm", "change", (e) => {
    state.tm = e.target.checked;
    el.querySelector("#tm-body").hidden = !state.tm;
  });
  const setYear = (y) => {
    state.year = Math.max(1100, Math.min(NOW, y));
    el.querySelector("#f-year").value = state.year;
    el.querySelector("#tm-year").textContent = state.year;
    saveState();
    refresh();
    if (selected) renderDetail(D.byId.get(selected), false);
  };
  el.querySelector("#f-year").addEventListener("input", (e) => setYear(+e.target.value));
  el.querySelector("#tm-minus").addEventListener("click", () => setYear(state.year - 10));
  el.querySelector("#tm-plus").addEventListener("click", () => setYear(state.year + 10));
  let timer = null;
  el.querySelector("#tm-play").addEventListener("click", (e) => {
    if (timer) { clearInterval(timer); timer = null; e.target.textContent = "▶"; return; }
    e.target.textContent = "❚❚";
    if (state.year >= NOW) setYear(1100);
    timer = setInterval(() => {
      if (state.year >= NOW) { clearInterval(timer); timer = null; e.target.textContent = "▶"; return; }
      setYear(state.year + 5);
    }, 120);
  });
}

function renderLegend() {
  const el = document.getElementById("legend");
  if (!el) return;
  const item = (svg, label, fam) =>
    `<div class="item ${state.families.length && fam && !state.families.includes(fam) ? "dim" : ""}" ${fam ? `data-fam="${fam}" title="kliknutím zvýraznit / zrušit"` : ""}>${svg}<span>${esc(label)}</span></div>`;
  let html = "";
  if (state.tm) {
    const slotted = Object.values(D.families).filter((f) => f.color_slot).sort((a, b) => a.color_slot - b.color_slot);
    const dot = (fill, extra = {}) => glyph("zamek", { size: 14, fill, stroke: "var(--mk-bg)", strokeWidth: 1, ...extra });
    html += slotted.map((f) => item(dot(`var(--mk-series-${f.color_slot})`), f.name, f.id)).join("");
    html += item(dot("var(--mk-other)"), "ostatní rody");
    html += item(dot("var(--mk-institution)"), "koruna, stát, církev, město");
    html += item(glyph("zamek", { size: 8, fill: "var(--mk-nodata)", stroke: "var(--mk-bg)", strokeWidth: 1 }), "bez dat o vlastníkovi");
    html += item(dot("var(--mk-bg)", { stroke: "var(--mk-ink)", strokeWidth: 2.5 }), "navštíveno (tmavý okraj)");
  } else {
    for (const f of state.families) {
      html += item(glyph("zamek", { size: 15, fill: "var(--mk-bg)", stroke: ownerColor(D.families, f, true), strokeWidth: 3 }), familyName(D.families, f), f);
    }
    html += item(glyph("zamek", { size: 20, fill: "var(--mk-accent)", stroke: "var(--mk-bg)", check: true }), "navštíveno");
    html += item(glyph("zamek", { ...ACCESS_STYLE.vstupne, fill: "var(--mk-bg)" }), ACCESS.vstupne.legend);
    html += item(glyph("zamek", { ...ACCESS_STYLE.volne, fill: "var(--mk-bg)" }), ACCESS.volne.legend);
    html += item(glyph("zamek", { size: 9, fill: "var(--mk-muted)", stroke: "var(--mk-bg)", strokeWidth: 1 }), ACCESS.neznamo.legend);
    for (const [k, label] of Object.entries(KIND)) html += item(glyph(k, { size: 12, fill: kindFill(k), stroke: "var(--mk-ink)", strokeWidth: 1.5 }), label);
  }
  el.innerHTML = html;
  el.querySelectorAll("[data-fam]").forEach((i) => i.addEventListener("click", () => {
    const f = i.dataset.fam;
    state.families = state.families.includes(f) ? state.families.filter((x) => x !== f) : [...state.families, f];
    saveState();
    renderFilters();
    refresh();
  }));
}

/* ---------- detail ---------- */

/** Consecutive periods of the same owner collapse into one Gantt row; persons go to the tooltip. */
function ownerRows(p) {
  const groups = [];
  for (const o of p.history?.owners || []) {
    const last = groups[groups.length - 1];
    if (last && last.owner === o.owner) last.items.push(o);
    else groups.push({ owner: o.owner, items: [o] });
  }
  return groups.map(({ owner, items }) => {
    const name = familyName(D.families, owner);
    const first = items[0];
    const lastTo = items.some((o) => o.to == null) ? null : Math.max(...items.map((o) => o.to));
    const lastItem = items.find((o) => o.to === lastTo) || items[items.length - 1];
    const span = { from: first.from, to: lastTo, from_approx: first.from_approx, to_approx: lastItem.to_approx };
    const persons = items.map((o) => o.person).filter(Boolean);
    const detail = items.map((o) =>
      `${o.person ? esc(o.person) + ", " : ""}${esc(yearRange(o))} <span class="muted">(${esc(HOW[o.how] || o.how)})</span>${o.note ? "<br><span class='muted'>" + esc(o.note) + "</span>" : ""}`).join("<br>");
    return {
      label: name,
      sub: [persons.length > 1 ? `${persons.length} ${persons.length < 5 ? "držitelé" : "držitelů"}` : persons[0], yearRange(span)].filter(Boolean).join(", "),
      color: ownerColor(D.families, owner),
      from: span.from, to: span.to, fromApprox: span.from_approx, toApprox: span.to_approx,
      href: `#/rod/${owner}`,
      tooltip: `<div class="t">${esc(name)}</div>${detail}`,
    };
  });
}

function hoverHtml(p) {
  const img = placeThumb(p);
  const credit = photoCredit(p);
  const founded = p.history?.founded?.text ? (p.history.founded.year ?? p.founded_text ?? "") : p.founded_text;
  const fams = [...new Set((p.history?.owners || []).map((o) => o.owner).filter((o) => !isInstitution(o)))];
  const o = state.tm ? ownerAt(p, state.year) : null;
  return `<div class="hov">
    ${img ? `<img src="${img}" alt="" onerror="this.remove()">` : ""}
    <div class="hov-body">
      <div class="t">${esc(p.name)}${p.visited ? ' <span class="badge visited">navštíveno</span>' : ""}</div>
      <div class="muted">${KIND[p.kind]} · ${esc(p.obec || "")}${founded ? " · vznik " + esc(founded) : ""}</div>
      <div class="muted">${ACCESS[p.access].short}${p.manager ? " · " + esc(p.manager) : ""}${p.visit?.rating ? " · " + "★".repeat(p.visit.rating) : ""}</div>
      ${o ? `<div>V roce ${state.year}: <b>${esc(familyName(D.families, o.owner))}</b></div>` : ""}
      ${fams.length ? `<div class="secondary">${fams.slice(0, 4).map((f) => esc(familyName(D.families, f))).join(", ")}${fams.length > 4 ? " a další" : ""}</div>` : ""}
      ${img && credit ? `<div class="credit">Foto: ${esc(credit)}</div>` : ""}
    </div></div>`;
}

function visitFormHtml(p) {
  const v = p.visit || {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date || "") ? v.date : "";
  return `<form id="d-visit-form" class="visit-form">
      <label>Datum <input type="date" name="date" value="${p.visited ? date : new Date().toISOString().slice(0, 10)}"></label>
      ${v.date && !date ? `<span class="muted">(uloženo „${esc(v.date)}“)</span>` : ""}
      <div class="stars" role="radiogroup" aria-label="hodnocení">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" data-star="${n}" class="${(v.rating || 0) >= n ? "on" : ""}" aria-label="${n} z 5">★</button>`).join("")}
        <input type="hidden" name="rating" value="${v.rating || ""}"></div>
      <textarea name="note" rows="2" placeholder="poznámka (nepovinné)">${esc(v.note || "")}</textarea>
      <div class="row">
        <button class="primary" type="submit">${p.visited ? "Uložit změny" : "Označit jako navštívené"}</button>
        ${p.visited ? `<button type="button" class="link" id="d-unvisit">odebrat návštěvu</button>` : ""}
      </div>
      <div class="hint" id="d-visit-msg" hidden></div>
    </form>`;
}

/* ---------- where visits are stored: status, connected file, export / import ---------- */

function storageHtml(msg = "") {
  const s = storageInfo();
  const name = `<b>${esc(s.fileName || "")}</b>`;
  const status = s.mode === "server" ? "Ukládají se do <code>data/visited.json</code> (lokální server)."
    : s.mode === "file" ? `Ukládají se do souboru ${name}.`
    : s.needsPermission ? `Soubor ${name} je připojený, ale prohlížeč potřebuje znovu povolit zápis.${s.pending ? ` Na zápis čeká ${s.pending} ${s.pending === 1 ? "změna" : s.pending < 5 ? "změny" : "změn"}.` : ""}`
    : canConnect() ? "Jsou uložené jen v tomto prohlížeči. Připoj soubor na disku (třeba ve složce Google Drive, OneDrive nebo Dropbox) a web do něj bude ukládat sám."
    : "Jsou uložené jen v tomto prohlížeči (ten neumí zapisovat přímo do souboru). Zálohu si občas stáhni tlačítkem Exportovat.";
  return `<div class="label">Moje návštěvy (${s.count})</div>
    <div class="muted" style="font-size:12px">${status}</div>
    <div class="row" style="margin-top:6px">
      ${s.needsPermission ? `<button id="v-grant" class="primary">Povolit zápis</button>` : ""}
      ${s.mode === "browser" && !s.needsPermission && canConnect() ? `<button id="v-create" title="založit nový soubor s návštěvami">Vytvořit soubor…</button><button id="v-open" title="připojit dříve uložený soubor">Otevřít soubor…</button>` : ""}
      ${s.fileName ? `<button id="v-disconnect" class="link" title="přestat ukládat do souboru, návštěvy zůstanou v prohlížeči">odpojit soubor</button>` : ""}
    </div>
    <div class="row" style="margin-top:6px">
      <button id="v-export" ${s.count ? "" : "disabled"} title="stáhnout návštěvy jako JSON">Exportovat</button>
      <button id="v-import" title="přidat návštěvy ze souboru JSON (stejné místo přepíše)">Importovat…</button>
      <input type="file" id="v-import-file" accept=".json,application/json" hidden>
    </div>
    ${msg ? `<div class="hint" id="v-msg">${msg}</div>` : ""}`;
}

function bindStorage(box, msg) {
  if (msg !== undefined) box.innerHTML = storageHtml(msg);
  const act = (sel, fn) => box.querySelector(sel)?.addEventListener("click", async () => {
    try { visitsChanged(await fn()); } catch (err) {
      if (err.name === "AbortError") return; // file picker cancelled
      bindStorage(box, esc(err.message));
      console.error(err);
    }
  });
  act("#v-create", createFile);
  act("#v-open", openFile);
  act("#v-grant", restoreAccess);
  act("#v-disconnect", disconnectFile);
  box.querySelector("#v-export").addEventListener("click", exportVisits);
  const input = box.querySelector("#v-import-file");
  box.querySelector("#v-import").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const r = await importVisits(f);
      const parts = [`${r.added} ${r.added === 1 ? "nová" : r.added > 1 && r.added < 5 ? "nové" : "nových"}`, `${r.updated} změněn${r.updated === 1 ? "á" : r.updated > 1 && r.updated < 5 ? "é" : "ých"}`];
      if (r.invalid) parts.push(`${r.invalid} neplatn${r.invalid === 1 ? "á přeskočena" : "ých přeskočeno"}`);
      if (r.unknown) parts.push(`${r.unknown} mimo mapu`);
      visitsChanged(null, `Import ${esc(f.name)}: ${parts.join(", ")}.`);
    } catch (err) {
      bindStorage(box, esc(err.message));
      console.error(err);
    }
  });
}

/** Re-render everything that shows visits (markers, filters with the storage box, stats). */
function visitsChanged(_, msg) {
  for (const m of markers.values()) m.key = null;
  renderFilters();
  refresh();
  window.dispatchEvent(new CustomEvent("visits-changed"));
  if (msg) bindStorage(document.getElementById("v-store"), msg);
}

function visitSaved(p, info) {
  markers.get(p.id).key = null;
  renderFilters(); // storage status
  refresh();
  window.dispatchEvent(new CustomEvent("visits-changed"));
  renderDetail(p, false);
  const msg = document.getElementById("d-visit-msg");
  msg.hidden = false;
  msg.textContent = info.mode === "server" ? "Uloženo do data/visited.json."
    : info.mode === "file" ? `Uloženo do souboru ${info.fileName}.`
    : info.needsPermission ? `Uloženo v prohlížeči. Do souboru ${info.fileName} se zapíše po povolení zápisu (panel filtrů).`
    : "Uloženo v tomto prohlížeči. Aby se návštěvy neztratily, připoj si v panelu filtrů soubor nebo je exportuj.";
}

function nearby(p) {
  return D.places
    .filter((q) => q.id !== p.id && !q.visited && q.access !== "neznamo")
    .map((q) => ({ q, d: distanceKm(p, q) }))
    .filter((x) => x.d <= state.radius)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10);
}

function renderDetail(p, pan = true) {
  const el = document.getElementById("panel-detail");
  document.getElementById("panel-filters").hidden = true;
  el.hidden = false;
  const h = p.history;
  const founded = h?.founded?.text || p.founded_text || (p.foundedYear ? String(p.foundedYear) : null);
  const img = commonsThumb(p.image);
  const visitors = p.visitors ? Object.entries(p.visitors).filter(([, v]) => v).sort()[Object.entries(p.visitors).filter(([, v]) => v).length - 1] : null;
  const mapy = `https://mapy.com/fnc/v1/showmap?center=${p.lon},${p.lat}&zoom=15&marker=true`;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
  const near = nearby(p);
  const tmOwner = state.tm ? ownerAt(p, state.year) : null;

  el.innerHTML = `
    <div class="detail-head"><h2>${esc(p.name)}</h2><button class="close" title="zavřít" id="d-close">×</button></div>
    <div class="badges">
      ${p.visited ? `<span class="badge visited">navštíveno${p.visit?.date ? " " + esc(p.visit.date) : ""}</span>` : ""}
      <span class="badge">${KIND[p.kind]}</span>
      <span class="badge">${ACCESS[p.access].short}</span>
      ${p.manager ? `<span class="badge">${esc(p.manager)}</span>` : ""}
      ${p.nkp ? `<span class="badge">národní kulturní památka</span>` : ""}
      ${p.unesco ? `<span class="badge">UNESCO</span>` : ""}
    </div>
    ${img ? `<figure class="hero"><img class="hero-img" src="${img}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentNode.remove()">
      <figcaption class="credit">Foto: ${photoCredit(p) ? esc(photoCredit(p)) + (p.photo.license_url ? ` (<a href="${esc(p.photo.license_url)}" target="_blank" rel="noopener">licence</a>)` : "") + ", " : ""}<a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.image)}" target="_blank" rel="noopener">Wikimedia Commons</a></figcaption></figure>` : ""}
    <dl class="facts">
      <dt>Obec</dt><dd>${esc(p.obec || "?")}${p.kraj ? ", " + esc(p.kraj) : ""}</dd>
      ${founded ? `<dt>Vznik</dt><dd>${esc(founded)}</dd>` : ""}
      ${visitors ? `<dt>Návštěvnost</dt><dd>${visitors[1].toLocaleString("cs")} (${visitors[0]}, NIPOS)</dd>` : ""}
      ${tmOwner ? `<dt>V roce ${state.year}</dt><dd>${esc(familyName(D.families, tmOwner.owner))}${tmOwner.person ? " (" + esc(tmOwner.person) + ")" : ""}</dd>` : ""}
    </dl>
    ${h?.summary ? `<p>${esc(h.summary)}</p>` : ""}
    <div class="links">
      ${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">web objektu</a>` : ""}
      ${p.cswiki ? `<a href="${esc(p.cswiki)}" target="_blank" rel="noopener">Wikipedie</a>` : ""}
      <a href="${mapy}" target="_blank" rel="noopener">Mapy.com</a>
      <a href="${gmaps}" target="_blank" rel="noopener">navigovat (Google)</a>
      <a href="https://www.wikidata.org/wiki/${p.id}" target="_blank" rel="noopener">Wikidata</a>
    </div>

    <h4>Vlastníci</h4>
    ${h?.owners?.length ? `<div id="d-gantt"></div>` : `<p class="empty">Historie vlastníků zatím není zpracovaná.</p>`}
    ${h?.events?.length ? `<h4>Události</h4><ul class="events">${h.events.map((e) => `<li><span class="y">${e.year ?? ""}</span><span>${esc(e.text)}</span></li>`).join("")}</ul>` : ""}
    ${h?.sources?.length ? `<p class="muted" style="font-size:12px">Zdroje: ${h.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(decodeURIComponent(s.replace(/^https?:\/\//, "")).slice(0, 48))}</a>`).join(", ")}</p>` : ""}

    <h4>Co je poblíž</h4>
    <div class="row"><span class="secondary">nenavštívené do</span>
      <select id="d-radius">${[10, 25, 50, 100].map((r) => `<option value="${r}" ${state.radius === r ? "selected" : ""}>${r} km</option>`).join("")}</select></div>
    ${near.length ? `<ul class="nearby">${near.map(({ q, d }) => `<li>${glyph(q.kind, markerStyle({ ...q, visited: false }))}<a href="#/misto/${q.id}">${esc(q.name)}</a><span class="muted">${KIND[q.kind]}</span><span class="d">${d.toFixed(1)} km</span></li>`).join("")}</ul>` : `<p class="empty">Nic v okruhu ${state.radius} km.</p>`}

    <h4>Návštěva</h4>
    ${visitFormHtml(p)}`;

  el.querySelector("#d-close").addEventListener("click", () => { location.hash = "#/"; });
  el.querySelector("#d-radius").addEventListener("change", (e) => { state.radius = +e.target.value; saveState(); renderDetail(p, false); });
  const form = el.querySelector("#d-visit-form");
  form.querySelectorAll("[data-star]").forEach((b) => b.addEventListener("click", () => {
    const n = +b.dataset.star;
    const cur = +form.rating.value || 0;
    const val = cur === n ? 0 : n; // clicking the current rating clears it
    form.rating.value = val || "";
    form.querySelectorAll("[data-star]").forEach((x) => x.classList.toggle("on", +x.dataset.star <= val));
  }));
  const fail = (err) => {
    const msg = form.querySelector("#d-visit-msg");
    msg.hidden = false;
    msg.textContent = err.message;
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const visit = { date: form.date.value || null, rating: form.rating.value ? +form.rating.value : null, note: form.note.value.trim() };
    try { visitSaved(p, await saveVisit(p, visit)); } catch (err) { fail(err); }
  });
  form.querySelector("#d-unvisit")?.addEventListener("click", async () => {
    if (!confirm(`Odebrat návštěvu místa ${p.name}?`)) return;
    try { visitSaved(p, await saveVisit(p, null)); } catch (err) { fail(err); }
  });
  const g = el.querySelector("#d-gantt");
  if (g) renderGantt(g, ownerRows(p), h.events || [], { marker: state.tm ? state.year : null });
  if (pan) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 10), { animate: true });
}

function closeDetail() {
  document.getElementById("panel-detail").hidden = true;
  document.getElementById("panel-filters").hidden = false;
  hideTooltip();
}

/* ---------- public ---------- */

export function initMap(data) {
  D = data;
  state = loadState();
  map = L.map("map", { zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90 }).fitBounds([[48.55, 12.09], [51.06, 18.86]]);
  attachBaseLayers(map);
  L.control.scale({ imperial: false }).addTo(map);
  layer = L.layerGroup().addTo(map);
  for (const p of D.places) {
    const m = L.marker([p.lat, p.lon], { keyboard: false });
    m.on("click", () => { location.hash = `#/misto/${p.id}`; });
    m.bindTooltip(() => hoverHtml(p), { direction: "top", offset: [0, -8], className: "hz-hover", opacity: 1 });
    markers.set(p.id, { marker: m, key: null });
  }
  renderFilters();
  refresh();
}

export function showPlace(id) {
  const p = D.byId.get(id);
  if (!p) { location.hash = "#/"; return; }
  const prev = selected;
  selected = id;
  if (prev) markers.get(prev).key = null;
  markers.get(id).key = null;
  refresh();
  renderDetail(p);
}

export function showMapHome() {
  if (selected) markers.get(selected).key = null;
  selected = null;
  closeDetail();
  refresh();
}

export function invalidate() {
  map?.invalidateSize();
}
