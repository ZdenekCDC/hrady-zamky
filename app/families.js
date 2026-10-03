// Families view: list, overview timeline, family detail with mini-map and relations.
import { HOW, KIND, NOW, commonsThumb, esc, familyName, isInstitution, ownerColor, yearRange } from "./data.js";
import { attachBaseLayers } from "./basemaps.js";
import { renderGantt } from "./gantt.js";
import { glyphIcon } from "./map.js";

let D;
let familyMap = null;
let filter = { q: "", sort: "count", showInst: false };

function sorted() {
  const list = Object.values(D.families).filter((f) => f.place_count > 0 && (filter.showInst || !isInstitution(f.id)));
  const q = filter.q.trim().toLowerCase();
  const hit = q ? list.filter((f) => f.name.toLowerCase().includes(q)) : list;
  const first = (f) => Math.min(...f.places.map((p) => p.from ?? NOW));
  const cmp = {
    count: (a, b) => b.place_count - a.place_count || a.name.localeCompare(b.name, "cs"),
    name: (a, b) => a.name.localeCompare(b.name, "cs"),
    oldest: (a, b) => first(a) - first(b),
  }[filter.sort];
  return hit.sort(cmp);
}

function listHtml(activeId) {
  return sorted().map((f) => `
    <li><a href="#/rod/${f.id}" class="${f.id === activeId ? "active" : ""}">
      ${f.coat_of_arms ? `<img class="coa" src="${commonsThumb(f.coat_of_arms, 60)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="swatch" style="background:${ownerColor(D.families, f.id)}"></span>`}
      <span>${esc(f.name)}</span><span class="n">${f.place_count}</span></a></li>`).join("");
}

function span(f) {
  const froms = f.places.map((p) => p.from).filter((y) => y != null);
  const tos = f.places.map((p) => p.to ?? NOW);
  return [Math.min(...froms), Math.max(...tos)];
}

function overviewHtml() {
  return `<div class="family-detail">
    <h2>Přehled rodů</h2>
    <p class="secondary">Období, kdy rod držel alespoň jedno ze zpracovaných míst. Délka pruhu = od prvního nabytí po poslední ztrátu; číslo = počet objektů. Klikni na rod pro detail.</p>
    <div id="overview-gantt"></div></div>`;
}

function renderOverview() {
  const top = sorted().slice(0, 40);
  const rows = top.map((f) => {
    const [a, b] = span(f);
    return {
      label: f.name, sub: `${f.place_count} obj., ${a} - ${b >= NOW ? "dosud" : b}`,
      color: ownerColor(D.families, f.id), from: a, to: b, href: `#/rod/${f.id}`,
      tooltip: `<div class="t">${esc(f.name)}</div>${f.place_count} objektů<br>${a} - ${b >= NOW ? "dosud" : b}`,
    };
  });
  renderGantt(document.getElementById("overview-gantt"), rows, [], { labelWidth: 210, min: D.tmMin });
}

function transfersHtml(f) {
  const got = new Map();
  const gave = new Map();
  for (const t of f.transfers || []) {
    if (t.to === f.id && t.from !== f.id) (got.get(t.from) || got.set(t.from, []).get(t.from)).push(t);
    if (t.from === f.id && t.to !== f.id) (gave.get(t.to) || gave.set(t.to, []).get(t.to)).push(t);
  }
  const block = (m, verb) => [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([other, ts]) => `
    <li><span class="swatch" style="background:${ownerColor(D.families, other)}"></span>
      ${verb} <a href="#/rod/${other}">${esc(familyName(D.families, other))}</a>:
      ${ts.map((t) => `<a href="#/misto/${t.place}">${esc(D.byId.get(t.place)?.name || t.place)}</a> <span class="muted">(${t.year ?? "?"}, ${esc(HOW[t.how] || t.how)})</span>`).join("; ")}</li>`).join("");
  const a = block(got, "od");
  const b = block(gave, "komu:");
  return `
    <h4>Získali majetek</h4>${a ? `<ul class="transfers">${a}</ul>` : `<p class="empty">Žádné zaznamenané převody.</p>`}
    <h4>Předali majetek</h4>${b ? `<ul class="transfers">${b}</ul>` : `<p class="empty">Žádné zaznamenané převody.</p>`}`;
}

function detailHtml(f) {
  const related = (f.related || []).map((r) => `<li><a href="#/rod/${r.family}">${esc(familyName(D.families, r.family))}</a> - ${esc(r.relation)}</li>`).join("");
  return `<div class="family-detail">
    <div class="family-head">
      ${f.coat_of_arms ? `<img src="${commonsThumb(f.coat_of_arms, 200)}" alt="erb ${esc(f.name)}" onerror="this.remove()">` : ""}
      <div>
        <h2>${esc(f.name)}</h2>
        <div class="badges">
          ${f.type === "instituce" ? `<span class="badge">instituce</span>` : ""}
          ${f.period ? `<span class="badge">${esc(f.period)}</span>` : ""}
          ${f.origin ? `<span class="badge">původ: ${esc(f.origin)}</span>` : ""}
          <span class="badge">${f.place_count} objektů</span>
        </div>
        ${f.summary ? `<p>${esc(f.summary)}</p>` : ""}
        <div class="links">${f.cswiki ? `<a href="${esc(f.cswiki)}" target="_blank" rel="noopener">Wikipedie</a>` : ""}
          ${f.wikidata ? `<a href="https://www.wikidata.org/wiki/${esc(f.wikidata)}" target="_blank" rel="noopener">Wikidata</a>` : ""}</div>
      </div>
    </div>
    <div class="family-grid">
      <div><h4>Místa v držení rodu</h4><div id="family-gantt"></div>
        ${transfersHtml(f)}
        ${related ? `<h4>Příbuzné rody</h4><ul class="transfers">${related}</ul>` : ""}
      </div>
      <div><h4>Mapa</h4><div id="family-map"></div>
        <p class="muted" style="font-size:12px">Plná značka = navštíveno.</p></div>
    </div></div>`;
}

function renderFamilyCharts(f) {
  const byPlace = new Map();
  for (const o of f.places) (byPlace.get(o.place) || byPlace.set(o.place, []).get(o.place)).push(o);
  const rows = [...byPlace.entries()].map(([id, periods]) => {
    periods.sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
    const p = D.byId.get(id);
    const name = p?.name || id;
    const persons = [...new Set(periods.map((o) => o.person).filter(Boolean))];
    const span = { from: periods[0].from, to: periods.some((o) => o.to == null) ? null : Math.max(...periods.map((o) => o.to)) };
    return {
      label: name, sub: [persons.length > 1 ? `${persons.length} ${persons.length < 5 ? "držitelé" : "držitelů"}` : persons[0], yearRange(span)].filter(Boolean).join(", "),
      color: ownerColor(D.families, f.id), from: span.from, to: span.to,
      segments: periods.map((o) => ({ from: o.from, to: o.to, fromApprox: o.from_approx, toApprox: o.to_approx, toUnknown: o.to_unknown })),
      href: `#/misto/${id}`,
      tooltip: `<div class="t">${esc(name)}</div>` + periods.map((o) =>
        `${o.person ? esc(o.person) + ", " : ""}${esc(yearRange(o))} <span class="muted">(${esc(HOW[o.how] || o.how)})</span>`).join("<br>"),
    };
  }).sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
  renderGantt(document.getElementById("family-gantt"), rows, [], { labelWidth: 170 });

  if (familyMap) familyMap.remove();
  familyMap = L.map("family-map", { scrollWheelZoom: false });
  attachBaseLayers(familyMap, { control: false });
  const pts = [];
  for (const id of new Set(f.places.map((o) => o.place))) {
    const p = D.byId.get(id);
    if (!p) continue;
    pts.push([p.lat, p.lon]);
    const st = p.visited
      ? { size: 18, fill: ownerColor(D.families, f.id, true), stroke: "var(--mk-ink)", strokeWidth: 2.5 }
      : { size: 15, fill: `var(--mk-kind-${p.kind})`, stroke: ownerColor(D.families, f.id, true), strokeWidth: 3 };
    L.marker([p.lat, p.lon], {
      title: p.name,
      icon: glyphIcon(p.kind, st),
    }).on("click", () => { location.hash = `#/misto/${p.id}`; }).bindTooltip(`${p.name} (${KIND[p.kind]})`).addTo(familyMap);
  }
  if (pts.length) familyMap.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  else familyMap.setView([49.8, 15.5], 7);
}

export function initFamilies(data) {
  D = data;
}

export function showFamilies(id) {
  const root = document.getElementById("view-families");
  const f = id ? D.families[id] : null;
  if (id && !f) { location.hash = "#/rody"; return; }
  root.innerHTML = `<div class="families-layout">
    <div class="family-list">
      <input id="fam-q" type="search" placeholder="Filtrovat rody…" value="${esc(filter.q)}">
      <select id="fam-sort">
        <option value="count" ${filter.sort === "count" ? "selected" : ""}>podle počtu objektů</option>
        <option value="name" ${filter.sort === "name" ? "selected" : ""}>abecedně</option>
        <option value="oldest" ${filter.sort === "oldest" ? "selected" : ""}>podle nejstaršího držení</option>
      </select>
      <label class="check"><input type="checkbox" id="fam-inst" ${filter.showInst ? "checked" : ""}> i instituce (koruna, stát, církev…)</label>
      <p><a href="#/rody">Přehled všech rodů</a></p>
      <ul id="fam-list">${listHtml(id)}</ul>
    </div>
    ${f ? detailHtml(f) : overviewHtml()}</div>`;
  const rerender = () => {
    root.querySelector("#fam-list").innerHTML = listHtml(id);
    if (!f) renderOverview();
  };
  root.querySelector("#fam-q").addEventListener("input", (e) => { filter.q = e.target.value; rerender(); });
  root.querySelector("#fam-sort").addEventListener("change", (e) => { filter.sort = e.target.value; rerender(); });
  root.querySelector("#fam-inst").addEventListener("change", (e) => { filter.showInst = e.target.checked; rerender(); });
  if (f) renderFamilyCharts(f);
  else renderOverview();
}
