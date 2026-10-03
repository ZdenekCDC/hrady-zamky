// Data loading and shared domain helpers.

export const NOW = new Date().getFullYear();

export const KIND = {
  hrad: "hrad",
  zamek: "zámek",
  hradozamek: "hrad a zámek",
  zricenina: "zřícenina",
  tvrz: "tvrz",
  klaster: "klášter",
  kostel: "kostel",
  usedlost: "usedlost",
  hospital: "hospitál",
  dul: "důl",
  vila: "vila",
  areal: "areál",
  zahrada: "zahrada",
  pevnost: "pevnost",
  hradby: "opevnění",
  kostnice: "kostnice",
  krypta: "krypta, katakomby",
};

// label = layer switch in the filters, hint = its tooltip, legend = map legend, short = badges and hover
export const ACCESS = {
  vstupne: { label: "Se vstupným", hint: "Prohlídky, expozice (NPÚ, NIPOS, muzea, OSM)", legend: "se vstupným", short: "vstupné" },
  volne: { label: "Volně přístupné", hint: "Volně přístupné zříceniny", legend: "volně přístupné", short: "volně přístupné" },
  neznamo: { label: "Ostatní", hint: "Přístupnost neznámá, ve výchozím stavu skryté", legend: "přístupnost neznámá", short: "přístupnost neznámá" },
};

export const HOW = {
  zalozeni: "založení / stavba",
  koupe: "koupě",
  dedictvi: "dědictví",
  snatek: "sňatek",
  dar: "dar",
  lenni: "udělení / zástava panovníkem",
  konfiskace: "konfiskace",
  vymena: "výměna",
  restituce: "restituce",
  jine: "jinak",
  neznamo: "neznámo jak",
};

const INSTITUTIONS = new Set(["koruna", "stat", "cirkev", "mesto", "soukromnik", "neznamo"]);

async function json(url, fallback) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Nelze načíst ${url} (HTTP ${r.status}). Spouštíš web přes lokální server? Viz README.`);
  }
  return r.json();
}

/** Earliest year the place is known to exist: founding year, else the start of the "14. stol." / "1920. léta" text,
 *  else the oldest year in its history (owners, events); null when nothing is known. */
function startYear(p) {
  const founded = p.history?.founded?.year ?? p.founded;
  if (founded != null) return founded;
  const m = /^(\d+)\. (stol|léta)/.exec(p.founded_text || "");
  if (m) return m[2] === "stol" ? (+m[1] - 1) * 100 + 1 : +m[1];
  const years = [...(p.history?.owners || []).map((o) => o.from), ...(p.history?.events || []).map((e) => e.year)].filter((y) => y != null);
  return years.length ? Math.min(...years) : null;
}

/** Century of founding: from the founding year, else from the "14. stol." / "1920. léta" text; null when unknown. */
function foundedCentury(p) {
  if (p.foundedYear != null) return century(p.foundedYear);
  const m = /^(\d+)\. (stol|léta)/.exec(p.founded_text || "");
  if (!m) return null;
  return m[2] === "stol" ? +m[1] : century(+m[1]);
}

export async function loadAll() {
  const [places, history, families, thumbs] = await Promise.all([
    json("data/places.json"),
    json("data/build/history.json", {}),
    json("data/build/families.json", {}),
    json("data/build/thumbs.json", {}),
  ]);
  const byId = new Map(places.map((p) => [p.id, p]));
  for (const p of places) {
    p.visited = false; // filled in by initVisits()
    p.visit = null;
    p.photo = thumbs[p.id]?.file === p.image ? thumbs[p.id] : null; // stale thumbnail = image changed since
    p.history = history[p.id] || null;
    const hy = p.history?.founded?.year;
    p.foundedYear = hy ?? p.founded ?? null;
    p.startYear = startYear(p);
    p.foundedCentury = foundedCentury(p);
  }
  // the time axis starts at the oldest owner of any place, rounded down to 50 years (870 -> 850)
  const owned = places.flatMap((p) => (p.history?.owners || []).map((o) => o.from)).filter((y) => y != null);
  const tmMin = Math.floor(Math.min(...owned, 1100) / 50) * 50;
  return { places, byId, families, history, tmMin };
}

/** Owner record of a place in a given year (last matching period wins). */
export function ownerAt(place, year) {
  const owners = place.history?.owners;
  if (!owners) return null;
  let hit = null;
  for (const o of owners) {
    if (o.from == null) continue; // unknown start: cannot place it in time
    const from = o.from;
    const to = o.to ?? (o.to_unknown ? from : NOW);
    if (from <= year && year <= to) hit = o;
  }
  return hit;
}

export function isInstitution(id) {
  return INSTITUTIONS.has(id);
}

/** CSS colour for an owner id: fixed slot for top families, neutral for institutions, muted otherwise. */
export function ownerColor(families, id, onMap = false) {
  const pre = onMap ? "--mk-" : "--";
  if (!id) return onMap ? "var(--mk-nodata)" : "var(--no-data)";
  if (isInstitution(id)) return `var(${pre}institution)`;
  const slot = families[id]?.color_slot;
  return slot ? `var(${pre}series-${slot})` : `var(${onMap ? "--mk-other" : "--other-family"})`;
}

export function familyName(families, id) {
  return families[id]?.name || id;
}

// Commons only serves these thumbnail widths (other sizes are refused since 2026)
const THUMB_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];

/** URL of a Commons thumbnail at least `width` px wide (rounded up to a standard step). */
export function commonsThumb(file, width = 500) {
  const w = THUMB_STEPS.find((s) => s >= width) ?? THUMB_STEPS.at(-1);
  return file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}` : null;
}

/** Hover-sized photo: the local file from scripts/fetch_thumbs.py, else a Commons thumbnail. */
export function placeThumb(p) {
  return p.photo ? `data/thumbs/${p.id}.webp` : commonsThumb(p.image, 250);
}

/** "autor, licence" credit of the place photo (CC BY / BY-SA require it), or "". */
export function photoCredit(p) {
  return p.photo ? [p.photo.artist, p.photo.license].filter(Boolean).join(", ") : "";
}

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Lowercase text without diacritics, for searching. */
export function norm(s) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** True when a and b differ by at most one inserted, deleted or replaced letter. */
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Search rank of a normalised text for a normalised query: 0 = contains it, 1 = every word of the query matches
 *  a word start up to one typo (queries of 4+ letters per word), null = no match. */
export function fuzzyRank(text, query) {
  if (text.includes(query)) return 0;
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const ok = query.split(/\s+/).filter(Boolean).every((t) =>
    t.length >= 4 && words.some((w) => withinOneEdit(w.slice(0, t.length), t) || withinOneEdit(w.slice(0, t.length + 1), t)));
  return ok ? 1 : null;
}

function century(year) {
  return year == null ? null : Math.floor((year - 1) / 100) + 1;
}

export function yearRange(o) {
  const f = o.from == null ? "?" : (o.from_approx ? "~" : "") + o.from;
  const t = o.to == null ? (o.to_unknown ? "?" : "dosud") : (o.to_approx ? "~" : "") + o.to;
  return `${f} - ${t}`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
