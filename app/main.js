// Entry point: load data, hash routing, search, stats.
import { KIND, esc, loadAll } from "./data.js";
import { initFamilies, showFamilies } from "./families.js";
import { initMap, invalidate, showMapHome, showPlace } from "./map.js";
import { initStats, showStats } from "./stats.js";
import { initVisits } from "./visits.js";

let D;

function setView(name) {
  document.getElementById("view-map").hidden = name !== "map";
  document.getElementById("view-families").hidden = name !== "families";
  document.getElementById("view-stats").hidden = name !== "stats";
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.view === name));
  if (name === "map") invalidate();
}

function route() {
  const [, kind, id] = location.hash.replace(/^#/, "").split("/");
  if (kind === "misto" && id) { setView("map"); showPlace(decodeURIComponent(id)); }
  else if (kind === "statistiky") { setView("stats"); showStats(); }
  else if (kind === "rody") { setView("families"); showFamilies(null); }
  else if (kind === "rod" && id) { setView("families"); showFamilies(decodeURIComponent(id)); }
  else { setView("map"); showMapHome(); }
}

function renderStats() {
  const open = D.places.filter((p) => p.access === "vstupne");
  const visitedOpen = open.filter((p) => p.visited).length;
  const visited = D.places.filter((p) => p.visited).length;
  document.getElementById("stats").innerHTML =
    `navštíveno <b>${visited}</b> · z míst se vstupným <b>${visitedOpen}</b> / ${open.length}`;
}

function initSearch() {
  const input = document.getElementById("search");
  const list = document.getElementById("search-results");
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const placeIdx = D.places.map((p) => ({ p, key: norm(`${p.name} ${p.obec || ""} ${p.wd_label || ""}`) }));
  let items = [];
  let sel = 0;
  const go = (it) => { location.hash = it.href; input.value = ""; list.hidden = true; input.blur(); };
  const draw = () => {
    list.innerHTML = items.map((it, i) => `<li class="${i === sel ? "sel" : ""}" data-i="${i}">${it.html}</li>`).join("");
    list.hidden = !items.length;
    list.querySelectorAll("li").forEach((li) => li.addEventListener("mousedown", (e) => { e.preventDefault(); go(items[+li.dataset.i]); }));
  };
  input.addEventListener("input", () => {
    const q = norm(input.value.trim());
    sel = 0;
    if (q.length < 2) { items = []; draw(); return; }
    const rank = (p) => (p.visited ? 0 : p.access === "vstupne" ? 1 : p.access === "volne" ? 2 : 3);
    const places = placeIdx.filter((x) => x.key.includes(q)).map((x) => x.p)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "cs")).slice(0, 12)
      .map((p) => ({ href: `#/misto/${p.id}`, html: `${esc(p.name)} <span class="muted">${KIND[p.kind]}, ${esc(p.obec || "")}</span>` }));
    const fams = Object.values(D.families).filter((f) => f.place_count && norm(f.name).includes(q)).slice(0, 5)
      .map((f) => ({ href: `#/rod/${f.id}`, html: `${esc(f.name)} <span class="muted">rod, ${f.place_count} obj.</span>` }));
    items = [...fams, ...places];
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && items[sel]) go(items[sel]);
    else if (e.key === "Escape") list.hidden = true;
  });
  input.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
}

async function main() {
  try {
    D = await loadAll();
  } catch (e) {
    document.querySelector("main").innerHTML = `<p style="padding:24px">${esc(e.message)}</p>`;
    throw e;
  }
  await initVisits(D);
  initMap(D);
  initFamilies(D);
  initStats(D);
  initSearch();
  renderStats();
  window.addEventListener("hashchange", route);
  window.addEventListener("visits-changed", renderStats);
  route();
}

main();
