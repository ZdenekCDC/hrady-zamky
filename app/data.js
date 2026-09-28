// Data loading and shared domain helpers.

export const NOW = new Date().getFullYear();

export const KIND = {
  hrad: "hrad",
  zamek: "zámek",
  hradozamek: "hrad a zámek",
  zricenina: "zřícenina",
};

// label = layer switch in the filters, legend = map legend, short = badges and hover
export const ACCESS = {
  vstupne: { label: "Se vstupným (prohlídky, expozice)", legend: "se vstupným", short: "vstupné" },
  volne: { label: "Volně přístupné zříceniny", legend: "volně přístupné", short: "volně přístupné" },
  neznamo: { label: "Ostatní (přístupnost neznámá)", legend: "přístupnost neznámá", short: "přístupnost neznámá" },
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
  }
  return { places, byId, families, history };
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

export function century(year) {
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
