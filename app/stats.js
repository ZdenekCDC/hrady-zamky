// Statistics view: how much of the data set has been visited, by region, kind, family and year.
import { ACCESS, KIND, esc, familyName, isInstitution } from "./data.js";

let D;
let root;

/** Groups places by key(p) and counts visited ones; rows sorted by visited count, then total. */
function group(places, key) {
  const m = new Map();
  for (const p of places) {
    const k = key(p);
    if (k == null) continue;
    const g = m.get(k) || m.set(k, { key: k, visited: 0, total: 0 }).get(k);
    g.total++;
    if (p.visited) g.visited++;
  }
  return [...m.values()];
}

const byVisited = (a, b) => b.visited - a.visited || b.total - a.total;

function barRows(rows, label) {
  return `<ul class="bars">${rows.map((r) => `
    <li><span class="bar-label">${label(r)}</span>
      <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${r.total ? (100 * r.visited) / r.total : 0}%"></span></span>
      <span class="bar-n">${r.visited} / ${r.total}</span></li>`).join("")}</ul>`;
}

function html() {
  const places = D.places;
  const visited = places.filter((p) => p.visited);
  const open = places.filter((p) => p.access === "vstupne");
  const openVisited = open.filter((p) => p.visited).length;
  const pct = (a, b) => (b ? (100 * a / b).toLocaleString("cs", { maximumFractionDigits: 1 }) : "0");
  const rated = visited.map((p) => p.visit?.rating).filter(Boolean);
  const avg = rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toLocaleString("cs", { maximumFractionDigits: 1 }) : "-";

  const kraje = group(places, (p) => p.kraj || "bez kraje").sort(byVisited);
  const kinds = group(places, (p) => p.kind).sort(byVisited);
  const access = group(places, (p) => p.access).sort(byVisited);
  const years = group(visited, (p) => p.visit?.date?.slice(0, 4) || "bez data").sort((a, b) => String(b.key).localeCompare(String(a.key)));

  const famVisited = new Map();
  for (const f of Object.values(D.families)) {
    if (!f.place_count || isInstitution(f.id)) continue;
    const ids = new Set(f.places.map((o) => o.place));
    const v = [...ids].filter((id) => D.byId.get(id)?.visited).length;
    if (v) famVisited.set(f.id, { key: f.id, visited: v, total: ids.size });
  }
  const families = [...famVisited.values()].sort(byVisited).slice(0, 15);

  const tile = (n, text) => `<div class="tile"><b>${n}</b><span>${text}</span></div>`;
  return `<div class="stats-page">
    <h2>Statistiky navštíveného</h2>
    <div class="tiles">
      ${tile(`${visited.length} / ${places.length}`, `všech míst (${pct(visited.length, places.length)} %)`)}
      ${tile(`${openVisited} / ${open.length}`, `míst se vstupným (${pct(openVisited, open.length)} %)`)}
      ${tile(avg, `průměrné hodnocení (${rated.length} hodnocených)`)}
    </div>
    ${visited.length ? "" : `<p class="empty">Zatím žádná navštívená místa - označ je v detailu na mapě.</p>`}
    <div class="stats-grid">
      <section><h4>Podle kraje</h4>${barRows(kraje, (r) => esc(r.key))}</section>
      <section><h4>Podle typu</h4>${barRows(kinds, (r) => esc(KIND[r.key] || r.key))}
        <h4>Podle přístupnosti</h4>${barRows(access, (r) => esc(ACCESS[r.key]?.legend || r.key))}
        <h4>Podle roku návštěvy</h4>${years.length ? `<ul class="bars">${years.map((r) => `<li><span class="bar-label">${esc(r.key)}</span>
          <span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:${(100 * r.visited) / Math.max(...years.map((y) => y.visited))}%"></span></span>
          <span class="bar-n">${r.visited}</span></li>`).join("")}</ul>` : `<p class="empty">-</p>`}</section>
      <section><h4>Podle rodu (rody, jejichž objekty jsi navštívil)</h4>
        ${families.length ? barRows(families, (r) => `<a href="#/rod/${esc(r.key)}">${esc(familyName(D.families, r.key))}</a>`) : `<p class="empty">Žádný navštívený objekt zatím nemá zpracovanou historii vlastníků.</p>`}
        <p class="muted" style="font-size:12px">Počítá se každý objekt, který rod někdy držel; ze zpracovaných historií.</p></section>
    </div></div>`;
}

export function initStats(data) {
  D = data;
  root = document.getElementById("view-stats");
  window.addEventListener("visits-changed", () => { if (!root.hidden) root.innerHTML = html(); });
}

export function showStats() {
  root.innerHTML = html();
}
