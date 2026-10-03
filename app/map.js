// Map view: markers, filters, time machine, legend and place detail.
import {
  ACCESS, HOW, KIND, NOW, commonsThumb, distanceKm, esc, familyName, fuzzyRank, isInstitution, norm,
  ownerAt, ownerColor, photoCredit, placeThumb, yearRange,
} from "./data.js";
import { attachBaseLayers } from "./basemaps.js";
import { hideTooltip, renderGantt } from "./gantt.js";
import {
  canConnect, createFile, disconnectFile, exportVisits, getIconTheme, importVisits, openFile, restoreAccess, saveVisit, setIconTheme,
  storageInfo,
} from "./visits.js";

const STORE = "hz-filters-v1";
const WIDE_STORE = "hz-detail-wide"; // detail panel widened for the owner timeline
const TABLE_STORE = "hz-detail-table"; // owners shown as a table instead of the timeline
// colour themes of the icons (CSS variables per theme in style.css); the first one is the default
const ICON_THEMES = { zemita: "Zemitá", kamen: "Kámen", syta: "Sytá", pastel: "Pastelová" };
const DEFAULT_ICON_THEME = "zemita";
// castles first; the other kinds (towers, monasteries, fortifications...) are switched on in the filters
const DEFAULT_KINDS = ["hrad", "zamek", "hradozamek", "zricenina"];
const DEFAULTS = {
  layers: { vstupne: true, volne: true, neznamo: false },
  kinds: Object.fromEntries(Object.keys(KIND).map((k) => [k, DEFAULT_KINDS.includes(k)])),
  kindsV: 2, // bumps when the default kinds change, see loadState()
  openV: 2, // same for the default open sections
  open: { layers: true, kinds: false, more: true, fams: true, visits: false, legend: true }, // sidebar sections
  kraj: "",
  manager: "",
  cFrom: "",
  cTo: "",
  visits: "", // "" all | "yes" only visited | "no" only unvisited
  onlyHistory: false,
  tm: false,
  year: 1600,
  tmHideUndated: true, // time machine: hide places without a known founding date (unless visited)
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
    if (!Number.isFinite(s.year)) delete s.year;
    if (s.openV !== DEFAULTS.openV) delete s.open;
    if (s.kindsV !== DEFAULTS.kindsV) delete s.kinds; // before the other kinds were added every kind was on: take the new default once
    return { ...structuredClone(DEFAULTS), ...s, kindsV: DEFAULTS.kindsV, openV: DEFAULTS.openV, layers: { ...DEFAULTS.layers, ...s.layers }, kinds: { ...DEFAULTS.kinds, ...s.kinds }, open: { ...DEFAULTS.open, ...s.open } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function saveState() {
  localStorage.setItem(STORE, JSON.stringify(state));
}

function applyIconTheme() {
  const t = getIconTheme();
  document.documentElement.dataset.iconTheme = ICON_THEMES[t] ? t : DEFAULT_ICON_THEME;
}

/** Search box that adds a family: matches without diacritics and with one typo, Enter takes the first hit. */
function initFamilyPicker(el, add) {
  const input = el.querySelector("#f-family");
  const list = el.querySelector("#f-family-results");
  const candidates = Object.values(D.families).filter((f) => f.place_count > 0 && !state.families.includes(f.id))
    .map((f) => ({ f, key: norm(f.name) }));
  let hits = [];
  let sel = 0;
  const draw = () => {
    list.innerHTML = hits.map(({ f }, i) => `<li class="${i === sel ? "sel" : ""}" data-i="${i}">${esc(f.name)} <span class="muted">${f.place_count}</span></li>`).join("");
    list.hidden = !hits.length;
    list.querySelectorAll("li").forEach((li) => li.addEventListener("mousedown", (e) => { e.preventDefault(); add(hits[+li.dataset.i].f.id); }));
  };
  input.addEventListener("input", () => {
    const q = norm(input.value.trim());
    sel = 0;
    hits = q.length < 2 ? [] : candidates.map((c) => ({ ...c, rank: fuzzyRank(c.key, q) })).filter((c) => c.rank != null)
      .sort((a, b) => a.rank - b.rank || b.f.place_count - a.f.place_count).slice(0, 10);
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && hits[sel]) add(hits[sel].f.id);
    else if (e.key === "Escape") list.hidden = true;
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
}

/* ---------- marker glyphs ---------- */

// Pictograms in a unit box (x, y in -1..1, y down); drawn scaled to the marker, the outline keeps its px width.
// Subpaths are holes (fill-rule evenodd); designs live in piktogramy/index.html (local only).
const PICTOGRAMS = {
  // tower with battlements and a lower curtain wall with a gate
  hrad: "M-.9 1V-1H-.7V-.75H-.55V-1H-.35V-.75H-.2V-1H0V-.1H.15V-.3H.35V-.1H.55V-.3H.75V-.1H1V1ZM.4 1V.55A.2 .2 0 0 1 .8 .55V1Z",
  // several conical-roofed towers of different heights, gate in the middle
  zamek: "M-1 1V-.15L-.825-.6L-.65-.15V0H-.45V-.35L-.25-.85L-.05-.35V-.1H.1V-.55L.3-1L.5-.55V0H.7V-.15L.85-.6L1-.15V1ZM-.2 1V.55A.2 .2 0 0 1 .2 .55V1ZM.2-.3H.4V0H.2Z",
  // battlemented keep on the left, chateau cone towers and a gate on the right
  hradozamek: "M-1 1V-1H-.85V-.82H-.75V-1H-.6V-.82H-.5V-1H-.35V0H.1V-.55L.3-1L.5-.55V0H.7V-.15L.85-.6L1-.15V1ZM-.72-.4H-.62V-.05H-.72ZM-.1 1V.55A.2 .2 0 0 1 .3 .55V1ZM.2-.3H.4V0H.2Z",
  // battlemented tower and a crumbling wall
  zricenina: "M-.9 1V-1H-.7V-.78H-.5V-1H-.3V-.78H-.1V-.4L.1-.5L.15-.1L.4-.15L.5 .25L.75 .2L.95 .6V1ZM-.6-.1H-.4V.3H-.6Z",
  // slim tower with an overhanging top and an arrow slit
  tvrz: "M-.55 1L-.45-.55H-.6V-1H-.3V-.8H-.12V-1H.12V-.8H.3V-1H.6V-.55H.45L.55 1ZM-.08-.2H.08V.25H-.08Z",
  // church with a cross in the middle and two convent wings
  klaster: "M-.95 1V.15H-.35V-.25L-.07-.55V-.65H-.2V-.78H-.07V-1H.07V-.78H.2V-.65H.07V-.55L.35-.25V.15H.95V1ZM-.1 1V.6A.1 .1 0 0 1 .1 .6V1Z",
  // spired tower with a cross, nave attached
  kostel: "M-.8 1V-.05L-.57-.55V-.64H-.7V-.77H-.57V-.97H-.43V-.77H-.3V-.64H-.43V-.55L-.2-.05V.2H.95V1ZM-.58 1V.6A.08 .08 0 0 1 -.42 .6V1ZM.2 .75V.5A.08 .08 0 0 1 .36 .5V.75ZM.6 .75V.5A.08 .08 0 0 1 .76 .5V.75Z",
  // dwelling with a gable roof and a barn
  usedlost: "M-.95 1V-.1L-.4-.7L.1-.1L.55-.5L1-.1V1ZM-.55 1V.4H-.25V1ZM.3 1V.3H.8V1Z",
  // building with a pediment and a cross
  hospital: "M-1 1V-.2H-.5V-.6L0-1L.5-.6V-.2H1V1ZM-.1-.15H.1V.05H.3V.25H.1V.45H-.1V.25H-.3V.05H-.1Z",
  // crossed hammers (mining symbol)
  dul: "M0-.2L.407-.607L.26-.754L.486-.98L.98-.486L.754-.26L.607-.407L.2 0L.8 .6L.6 .8L0 .2L-.6 .8L-.8 .6L-.2 0L-.607-.407L-.754-.26L-.98-.486L-.486-.98L-.26-.754L-.407-.607Z",
  // functionalist blocks with windows
  vila: "M-1 1V.1H-.7V-.3H-.15V-.75H.45V-.4H1V1ZM-.55-.1H-.3V.2H-.55ZM-.05-.55H.3V-.25H-.05ZM.2-.1H.85V.1H.2Z",
  // pavilion with columns and a pediment (colonnade)
  areal: "M-1 1V.7H-.875V-.2H-.95V-.4H-1L0-1L1-.4H.95V-.2H.875V.7H1V1ZM-.625-.2H-.375V.7H-.625ZM-.125-.2H.125V.7H-.125ZM.375-.2H.625V.7H.375Z",
  // tree (chateau and flower gardens)
  zahrada: "M-.18 1L-.1 .29A.65 .65 0 1 1 .1 .29L.18 1Z",
  // star fortress with a courtyard (Terezín, Josefov)
  pevnost: "M0-1L.3-.52L.866-.5L.6 0L.866 .5L.3 .52L0 1L-.3 .52L-.866 .5L-.6 0L-.866-.5L-.3-.52ZM0-.3L.26-.15V.15L0 .3L-.26 .15V-.15Z",
  // town wall with a gate tower
  hradby: "M-1 1V-.4H-.8V-.2H-.65V-.4H-.45V-1H-.25V-.8H-.08V-1H.08V-.8H.25V-1H.45V-.4H.65V-.2H.8V-.4H1V1ZM-.2 1V.2A.2 .2 0 0 1 .2 .2V1Z",
  // skull (Sedlec, Brno, Klatovy)
  kostnice: "M-.7-.1C-.7-.7 -.4-1 0-1C.4-1 .7-.7 .7-.1C.7 .15 .55 .3 .4 .4V.75H.25V1H-.25V.75H-.4V.4C-.55 .3 -.7 .15 -.7-.1ZM-.45-.1A.17 .17 0 1 0 -.11-.1A.17 .17 0 1 0 -.45-.1ZM.11-.1A.17 .17 0 1 0 .45-.1A.17 .17 0 1 0 .11-.1ZM0 .12L.09 .32H-.09Z",
  // vault with a cross
  krypta: "M-.9 1V-.1A.9 .9 0 0 1 .9-.1V1ZM-.45 1V.1A.45 .45 0 0 1 .45 .1V1ZM-.07 0H.07V.15H.2V.28H.07V.75H-.07V.28H-.2V.15H-.07Z",
};

// pictograms need more room than the old circles / squares to stay readable; sizes elsewhere stay as they were
const PICTO_SCALE = 1.35;

/** Pixel size of the square SVG that glyph() draws for a style size. */
export function glyphBox(size) {
  return Math.round(size * PICTO_SCALE) + 4;
}

export function glyph(kind, { size, fill, stroke, strokeWidth = 2, check = false, opacity = 1 }) {
  const box = glyphBox(size);
  const r = (box - 4) / 2 - strokeWidth / 2;
  const c = box / 2;
  const d = PICTOGRAMS[kind] || PICTOGRAMS.zamek;
  const t = r * 0.42; // tick in the solid lower half of every pictogram
  const tick = check ? `<path d="M${-t} ${r * 0.42} l${t * 0.7} ${t * 0.7} l${t * 1.3} ${-t * 1.3}" fill="none" stroke="#fff" stroke-width="${Math.max(1.6, r * 0.24)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  return `<svg width="${box}" height="${box}" viewBox="${-c} ${-c} ${box} ${box}" style="opacity:${opacity}">
    <path d="${d}" transform="scale(${r})" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" stroke-linejoin="round" fill-rule="evenodd"/>${tick}</svg>`;
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
    // dark outlines keep the grey owners legible on light terrain; highlighted families get bigger markers, the rest shrink
    if (!o) return { size: dim ? 7 : 9, fill: "var(--mk-nodata)", stroke: "var(--mk-free)", strokeWidth: 1, opacity: dim ? 0.3 : 0.9 };
    const hit = fams.length && !dim;
    return {
      size: p.visited ? 19 : hit ? 20 : dim ? 10 : 15,
      fill: ownerColor(D.families, o.owner, true),
      stroke: p.visited ? "var(--mk-accent)" : "var(--mk-ink)",
      strokeWidth: p.visited ? 3 : hit ? 2.5 : 1.75,
      opacity: dim ? 0.35 : 1,
    };
  }
  const hl = fams.length ? highlightedOwner(p) : null;
  const dim = fams.length && !hl;
  if (p.visited) return { size: 20, fill: hl ? ownerColor(D.families, hl, true) : "var(--mk-accent)", stroke: "var(--mk-bg)", check: true, opacity: dim ? 0.25 : 1 };
  if (hl) return { size: 21, fill: kindFill(p.kind), stroke: ownerColor(D.families, hl, true), strokeWidth: 3.5 };
  if (ACCESS_STYLE[p.access]) return { ...ACCESS_STYLE[p.access], ...(dim ? { size: 10, strokeWidth: 1.25 } : {}), fill: kindFill(p.kind, p.access === "volne"), opacity: dim ? 0.2 : 1 };
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
  const c = p.foundedCentury;
  if (state.cFrom && (c == null || c < +state.cFrom)) return false;
  if (state.cTo && (c == null || c > +state.cTo)) return false;
  if (state.tm) {
    if (p.startYear != null && p.startYear > state.year) return false; // not built yet
    if (p.startYear == null && state.tmHideUndated && !p.visited) return false;
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
      const sel = selected === p.id;
      const base = markerStyle(p);
      const st = sel ? { ...base, size: Math.max(24, Math.round(base.size * 1.3)), opacity: 1 } : base;
      const key = JSON.stringify(st) + sel;
      if (m.key !== key) {
        m.marker.setIcon(icon(p, st));
        m.key = key;
      }
      m.marker.setZIndexOffset(sel ? 5000 : p.visited ? 1000 : p.access === "vstupne" ? 500 : 0);
      if (!layer.hasLayer(m.marker)) layer.addLayer(m.marker);
    }
    for (const [k, n] of Object.entries(counts)) {
      const el = document.querySelector(`[data-count="${k}"]`);
      if (el) el.textContent = n;
    }
    renderLegend();
    updateSummaries();
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

/** Small "i" marker whose tooltip carries the explanation that would otherwise take up space in the sidebar. */
const info = (text) => `<span class="info" title="${esc(text)}" aria-label="${esc(text)}">ⓘ</span>`;

/** Collapsible sidebar section; its open state is kept in `state.open` (saved with the other filters). */
const section = (key, title, body) => `<details class="sec" data-sec="${key}" ${state.open[key] ? "open" : ""}>
  <summary><span>${title}</span><span class="sum" data-sum="${key}">${sectionSummary(key)}</span></summary>${body}</details>`;

function sectionSummary(key) {
  if (key === "layers") return `${Object.values(state.layers).filter(Boolean).length} z ${Object.keys(ACCESS).length}`;
  if (key === "kinds") return `${Object.values(state.kinds).filter(Boolean).length} z ${Object.keys(KIND).length}`;
  if (key === "fams") return state.families.length ? String(state.families.length) : "";
  if (key === "more") {
    const n = [state.kraj, state.manager, state.cFrom, state.cTo, state.visits, state.onlyHistory].filter(Boolean).length;
    return n ? `${n} aktivní` : "";
  }
  return "";
}

function updateSummaries() {
  document.querySelectorAll("#panel-filters [data-sum]").forEach((e) => { e.textContent = sectionSummary(e.dataset.sum); });
}

function renderFilters() {
  const kraje = [...new Set(D.places.map((p) => p.kraj).filter(Boolean))].sort((a, b) => a.localeCompare(b, "cs"));
  const fams = Object.values(D.families).filter((f) => f.place_count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
  const centuries = Array.from({ length: 11 }, (_, i) => i + 10);
  const el = document.getElementById("panel-filters");
  el.innerHTML = `
    <div class="filters-head"><b>Filtry</b><button id="f-reset" class="link" title="vrátit všechny filtry na výchozí">resetovat vše</button></div>
    ${section("layers", "Vrstvy", `
      ${Object.entries(ACCESS).map(([k, a]) => `
        <label class="check" title="${esc(a.hint)}"><input type="checkbox" data-layer="${k}" ${state.layers[k] ? "checked" : ""}>
        ${a.label}${info(a.hint)}<span class="count" data-count="${k}"></span></label>`).join("")}`)}
    ${section("kinds", "Typ", `
      <div class="row">${Object.entries(KIND).map(([k, label]) => `
        <label class="check"><input type="checkbox" data-kind="${k}" ${state.kinds[k] ? "checked" : ""}>
        ${glyph(k, { size: 12, fill: kindFill(k), stroke: "var(--mk-ink)", strokeWidth: 1.5 })}${label}</label>`).join("")}</div>
      <div class="quick"><button class="link" data-kinds="castles">jen hrady a zámky</button><button class="link" data-kinds="all">vše</button></div>`)}
    ${section("more", "Další filtry", `
      <div class="row">
        <select id="f-kraj"><option value="">všechny kraje</option>${kraje.map((k) => `<option ${state.kraj === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <select id="f-manager">
          <option value="">každý správce</option>
          <option value="npu" ${state.manager === "npu" ? "selected" : ""}>NPÚ (státní)</option>
          <option value="other" ${state.manager === "other" ? "selected" : ""}>ostatní</option>
        </select>
      </div>
      <div class="row" title="Století vzniku" style="margin-top:6px">
        <select id="f-cfrom"><option value="">vznik od</option>${centuries.map((c) => `<option value="${c}" ${+state.cFrom === c ? "selected" : ""}>${c}. stol.</option>`).join("")}</select>
        <select id="f-cto"><option value="">do</option>${centuries.map((c) => `<option value="${c}" ${+state.cTo === c ? "selected" : ""}>${c}. stol.</option>`).join("")}</select>
      </div>
      <label class="check" style="margin-top:6px">Návštěvy <select id="f-visits">
        <option value="">všechny</option>
        <option value="yes" ${state.visits === "yes" ? "selected" : ""}>jen navštívené</option>
        <option value="no" ${state.visits === "no" ? "selected" : ""}>jen nenavštívené</option>
      </select></label>
      <label class="check"><input type="checkbox" id="f-history" ${state.onlyHistory ? "checked" : ""}> jen s historií vlastníků</label>`)}
    <div class="timemachine">
      <label class="check" title="Obarví místa podle vlastníka v daném roce (jen objekty se zpracovanou historií)."><input type="checkbox" id="f-tm" ${state.tm ? "checked" : ""}> <b>Stroj času</b>${info("Obarví místa podle vlastníka v daném roce (jen objekty se zpracovanou historií).")}</label>
      <div id="tm-body" ${state.tm ? "" : "hidden"}>
        <div class="row"><span class="year" id="tm-year">${state.year}</span>
          <button id="tm-minus" title="o 10 let zpět">-10</button><button id="tm-plus" title="o 10 let dál">+10</button>
          <button id="tm-play" title="přehrát">▶</button></div>
        <label class="check"><input type="checkbox" id="f-undated" ${state.tmHideUndated ? "checked" : ""}> skrýt místa bez data vzniku</label>
        <input type="range" id="f-year" min="${D.tmMin}" max="${NOW}" step="1" value="${state.year}">
      </div>
    </div>
    ${section("fams", "Zvýraznit rody", `
      <div class="chips" id="fam-chips">${state.families.map((id) => `
        <span class="chip"><span class="swatch" style="background:${ownerColor(D.families, id, true)}"></span>${esc(familyName(D.families, id))}
        <button data-unfam="${id}" title="odebrat" aria-label="odebrat ${esc(familyName(D.families, id))}">×</button></span>`).join("")}</div>
      <div class="suggest"><input id="f-family" type="search" placeholder="+ přidat rod…" autocomplete="off">
        <ul id="f-family-results" hidden></ul></div>
      <button id="f-fam-reset" class="link" ${state.families.length ? "" : "hidden"}>zrušit výběr</button>`)}
    <details class="sec" data-sec="visits" id="v-store" ${state.open.visits ? "open" : ""}>${storageHtml()}</details>
    ${section("legend", "Legenda a barvy", `
      <label class="check">Barvy ikon <select id="f-icons">
        ${Object.entries(ICON_THEMES).map(([k, label]) => `<option value="${k}" ${document.documentElement.dataset.iconTheme === k ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
      <div id="legend" class="legend"></div>`)}
    <p class="muted" style="font-size:12px">Zdroje: Wikidata, Wikipedie (CC BY-SA), NPÚ, statistika NIPOS 2025, © přispěvatelé OpenStreetMap.</p>`;

  const on = (sel, ev, fn) => el.querySelector(sel).addEventListener(ev, (e) => { fn(e); saveState(); refresh(); });
  el.querySelectorAll("[data-layer]").forEach((i) => i.addEventListener("change", () => { state.layers[i.dataset.layer] = i.checked; saveState(); refresh(); }));
  el.querySelectorAll("[data-kind]").forEach((i) => i.addEventListener("change", () => { state.kinds[i.dataset.kind] = i.checked; saveState(); refresh(); }));
  el.querySelectorAll("[data-kinds]").forEach((b) => b.addEventListener("click", () => {
    for (const k of Object.keys(KIND)) state.kinds[k] = b.dataset.kinds === "all" || DEFAULT_KINDS.includes(k);
    saveState(); renderFilters(); refresh();
  }));
  el.querySelectorAll("details[data-sec]").forEach((d) => d.addEventListener("toggle", () => { state.open[d.dataset.sec] = d.open; saveState(); }));
  on("#f-kraj", "change", (e) => (state.kraj = e.target.value));
  on("#f-manager", "change", (e) => (state.manager = e.target.value));
  on("#f-cfrom", "change", (e) => (state.cFrom = e.target.value));
  on("#f-cto", "change", (e) => (state.cTo = e.target.value));
  on("#f-visits", "change", (e) => (state.visits = e.target.value));
  on("#f-history", "change", (e) => (state.onlyHistory = e.target.checked));
  const setFamilies = (list) => { state.families = list; saveState(); renderFilters(); refresh(); };
  initFamilyPicker(el, (id) => setFamilies([...state.families, id]));
  el.querySelectorAll("[data-unfam]").forEach((b) => b.addEventListener("click", () => setFamilies(state.families.filter((f) => f !== b.dataset.unfam))));
  el.querySelector("#f-fam-reset").addEventListener("click", () => setFamilies([]));
  el.querySelector("#f-reset").addEventListener("click", () => {
    state = { ...structuredClone(DEFAULTS), radius: state.radius };
    saveState(); renderFilters(); refresh();
  });
  bindStorage(el.querySelector("#v-store"));
  el.querySelector("#f-icons").addEventListener("change", async (e) => {
    try {
      const info = await setIconTheme(e.target.value === DEFAULT_ICON_THEME ? null : e.target.value);
      applyIconTheme();
      visitsChanged(info);
    } catch (err) {
      bindStorage(el.querySelector("#v-store"), esc(err.message));
      console.error(err);
    }
  });
  on("#f-tm", "change", (e) => {
    state.tm = e.target.checked;
    el.querySelector("#tm-body").hidden = !state.tm;
  });
  on("#f-undated", "change", (e) => (state.tmHideUndated = e.target.checked));
  const setYear = (y) => {
    state.year = Math.max(D.tmMin, Math.min(NOW, y));
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
    if (state.year >= NOW) setYear(D.tmMin);
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
    `<div class="item ${state.families.length && fam && !state.families.includes(fam) ? "dim" : ""}" ${fam ? `data-fam="${fam}" title="kliknutím zvýraznit / zrušit"` : ""}><span class="sw">${svg}</span><span>${esc(label)}</span></div>`;
  let html = "";
  if (state.tm) {
    const slotted = Object.values(D.families).filter((f) => f.color_slot).sort((a, b) => a.color_slot - b.color_slot);
    const dot = (fill, extra = {}) => glyph("zamek", { size: 14, fill, stroke: "var(--mk-ink)", strokeWidth: 1.75, ...extra });
    html += slotted.map((f) => item(dot(`var(--mk-series-${f.color_slot})`), f.name, f.id)).join("");
    html += item(dot("var(--mk-other)"), "ostatní rody");
    html += item(dot("var(--mk-institution)"), "koruna, stát, církev, město");
    html += item(glyph("zamek", { size: 9, fill: "var(--mk-nodata)", stroke: "var(--mk-free)", strokeWidth: 1 }), "bez dat o vlastníkovi");
    html += item(dot("var(--mk-bg)", { size: 19, stroke: "var(--mk-accent)", strokeWidth: 3 }), "navštíveno (modrý okraj)");
  } else {
    for (const f of state.families) {
      html += item(glyph("zamek", { size: 15, fill: "var(--mk-bg)", stroke: ownerColor(D.families, f, true), strokeWidth: 3 }), familyName(D.families, f), f);
    }
    html += item(glyph("zamek", { size: 20, fill: "var(--mk-accent)", stroke: "var(--mk-bg)", check: true }), "navštíveno");
    // samples are drawn exactly like the markers: solid fill and dark outline / pale fill and grey outline / small grey
    html += `<div class="legend-head">Přístupnost</div>`;
    html += item(glyph("zamek", { ...ACCESS_STYLE.vstupne, fill: kindFill("zamek") }), ACCESS.vstupne.legend);
    html += item(glyph("zamek", { ...ACCESS_STYLE.volne, fill: kindFill("zamek", true) }), ACCESS.volne.legend);
    html += item(glyph("zamek", { size: 9, fill: "var(--mk-muted)", stroke: "var(--mk-bg)", strokeWidth: 1, opacity: 0.8 }), ACCESS.neznamo.legend);
    html += `<div class="legend-head">Typ</div>`;
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
    const span = { from: first.from, to: lastTo, from_approx: first.from_approx, to_approx: lastItem.to_approx,
      to_unknown: lastTo == null && !items.some((o) => o.to == null && !o.to_unknown) };
    const persons = items.map((o) => o.person).filter(Boolean);
    const detail = items.map((o) =>
      `${o.person ? esc(o.person) + ", " : ""}${esc(yearRange(o))} <span class="muted">(${esc(HOW[o.how] || o.how)})</span>${o.note ? "<br><span class='muted'>" + esc(o.note) + "</span>" : ""}`).join("<br>");
    return {
      label: name,
      sub: [persons.length > 1 ? `${persons.length} ${persons.length < 5 ? "držitelé" : "držitelů"}` : persons[0], yearRange(span)].filter(Boolean).join(", "),
      color: ownerColor(D.families, owner),
      from: span.from, to: span.to, fromApprox: span.from_approx, toApprox: span.to_approx, toUnknown: span.to_unknown,
      href: `#/rod/${owner}`,
      tooltip: `<div class="t">${esc(name)}</div>${detail}`,
    };
  });
}

/** Owner periods as a table: the same data as the timeline, readable without telling colors apart. */
function ownerTableHtml(p) {
  const cur = state.tm ? ownerAt(p, state.year) : null;
  const rows = p.history.owners.map((o) => {
    const name = familyName(D.families, o.owner);
    const from = o.from == null ? "?" : (o.from_approx ? "~" : "") + o.from;
    const to = o.to == null ? (o.to_unknown ? "?" : "dosud") : (o.to_approx ? "~" : "") + o.to;
    const how = o.how && o.how !== "neznamo" ? HOW[o.how] || o.how : "";
    return `<tr${o === cur ? ' class="cur" aria-current="true"' : ""}>
      <td class="yr">${from}</td><td class="yr">${to}</td>
      <td><span class="swatch" style="background:${ownerColor(D.families, o.owner, true)}"></span><a href="#/rod/${esc(o.owner)}">${esc(name)}</a>${o.person ? `<br>${esc(o.person)}` : ""}</td>
      <td>${esc(how)}${o.note ? `${how ? "<br>" : ""}<span class="muted">${esc(o.note)}</span>` : ""}</td></tr>`;
  }).join("");
  return `<table class="owners"><thead><tr><th>Od</th><th>Do</th><th>Rod, osoba</th><th>Způsob, poznámka</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  const where = s.mode === "server" ? "server" : s.mode === "file" ? esc(s.fileName || "soubor") : "prohlížeč";
  const alert = s.needsPermission || msg; // a state that needs attention keeps its text visible
  return `<summary><span>Moje návštěvy</span><span class="sum">${s.count} · ${where}</span></summary>
    <div class="muted" style="font-size:12px" ${alert ? "" : "hidden"}>${status}</div>
    <div class="muted" style="font-size:12px" ${alert ? "hidden" : ""}>${info(status.replace(/<[^>]+>/g, ""))} ${s.mode === "browser" ? "uložené jen v prohlížeči" : "ukládá se průběžně"}</div>
    <div class="row" style="margin-top:6px">
      ${s.needsPermission ? `<button id="v-grant" class="primary">Povolit zápis</button>` : ""}
      ${s.mode === "browser" && !s.needsPermission && canConnect() ? `<button id="v-create" title="založit nový soubor s návštěvami">Vytvořit soubor…</button><button id="v-open" title="připojit dříve uložený soubor">Otevřít soubor…</button>` : ""}
      ${s.fileName ? `<button id="v-disconnect" class="link" title="přestat ukládat do souboru, návštěvy zůstanou v prohlížeči">odpojit soubor</button>` : ""}
    </div>
    <div class="row" style="margin-top:6px">
      <button id="v-export" ${s.count ? "" : "disabled"} title="stáhnout návštěvy jako JSON">Exportovat</button>
      <button id="v-import" title="přidat návštěvy ze souboru JSON (stejné místo přepíše)">Importovat…</button>
      <button id="v-replace" title="nahradit všechny návštěvy obsahem souboru JSON (ostatní se smažou)">Nahradit vším…</button>
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
  let replace = false;
  const pick = (r) => () => { replace = r; input.click(); };
  box.querySelector("#v-import").addEventListener("click", pick(false));
  box.querySelector("#v-replace").addEventListener("click", pick(true));
  input.addEventListener("change", async () => {
    const f = input.files[0];
    input.value = "";
    if (!f) return;
    if (replace && !confirm(`Nahradit všechny návštěvy (${storageInfo().count}) obsahem souboru ${f.name}? Ostatní se smažou.`)) return;
    try {
      const r = await importVisits(f, replace);
      const parts = [`${r.added} ${r.added === 1 ? "nová" : r.added > 1 && r.added < 5 ? "nové" : "nových"}`, `${r.updated} změněn${r.updated === 1 ? "á" : r.updated > 1 && r.updated < 5 ? "é" : "ých"}`];
      if (replace) parts.push(`${r.removed} odstraněn${r.removed === 1 ? "á" : r.removed > 1 && r.removed < 5 ? "é" : "ých"}`);
      if (r.invalid) parts.push(`${r.invalid} neplatn${r.invalid === 1 ? "á přeskočena" : "ých přeskočeno"}`);
      if (r.unknown) parts.push(`${r.unknown} mimo mapu`);
      visitsChanged(null, `${replace ? "Nahrazeno ze souboru" : "Import"} ${esc(f.name)}: ${parts.join(", ")}.`);
    } catch (err) {
      bindStorage(box, esc(err.message));
      console.error(err);
    }
  });
}

/** Re-render everything that shows visits (markers, filters with the storage box, stats). */
function visitsChanged(_, msg) {
  applyIconTheme(); // an import or a re-read file may bring another theme
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
    <div class="detail-head"><h2>${esc(p.name)}</h2>
      <button class="close wide-toggle" id="d-wide"></button>
      <button class="close" title="zavřít" id="d-close">×</button></div>
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
      ${founded ? `<dt>Vznik</dt><dd>${esc(founded)}</dd>` : p.first_mention ? `<dt>První zmínka</dt><dd>${p.first_mention}</dd>` : ""}
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

    <h4>Vlastníci${h?.owners?.length ? ` <span class="seg" role="group" aria-label="zobrazení vlastníků"><button type="button" data-view="gantt">osa</button><button type="button" data-view="table">tabulka</button></span>` : ""}</h4>
    ${h?.owners?.length ? `<div id="d-gantt"></div><div id="d-owners" class="table-wrap" hidden>${ownerTableHtml(p)}</div>` : `<p class="empty">Historie vlastníků zatím není zpracovaná.</p>`}
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
  const drawGantt = () => g && renderGantt(g, ownerRows(p), h.events || [], { marker: state.tm ? state.year : null });
  const ownersTable = el.querySelector("#d-owners");
  const setView = (view) => {
    if (!g) return;
    g.hidden = view === "table";
    ownersTable.hidden = view !== "table";
    el.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    if (view !== "table") drawGantt(); // the chart is measured from the visible container
  };
  el.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    localStorage.setItem(TABLE_STORE, b.dataset.view === "table" ? "1" : "");
    setView(b.dataset.view);
  }));
  const wideBtn = el.querySelector("#d-wide");
  const setWide = (on) => {
    document.getElementById("sidebar").classList.toggle("wide", on);
    wideBtn.textContent = on ? "⤡" : "⤢";
    wideBtn.title = on ? "zúžit panel" : "zvětšit panel (širší osa vlastníků)";
    wideBtn.setAttribute("aria-pressed", on);
    map.invalidateSize();
    if (g && !g.hidden) drawGantt(); // the chart is drawn to the panel width
  };
  wideBtn.addEventListener("click", () => {
    const on = !document.getElementById("sidebar").classList.contains("wide");
    localStorage.setItem(WIDE_STORE, on ? "1" : "");
    setWide(on);
    if (on && g) g.previousElementSibling.scrollIntoView({ block: "start", behavior: "smooth" }); // the "Vlastníci" heading
  });
  setView(localStorage.getItem(TABLE_STORE) === "1" ? "table" : "gantt");
  setWide(localStorage.getItem(WIDE_STORE) === "1");
  if (pan) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 10), { animate: true });
}

function closeDetail() {
  document.getElementById("sidebar").classList.remove("wide");
  map?.invalidateSize();
  document.getElementById("panel-detail").hidden = true;
  document.getElementById("panel-filters").hidden = false;
  hideTooltip();
}

/* ---------- public ---------- */

export function initMap(data) {
  D = data;
  state = loadState();
  applyIconTheme();
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
