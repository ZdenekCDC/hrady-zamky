// Visits are personal: every visitor starts with an empty map. Where they are stored, first match wins:
//  1. "server": scripts/serve.py runs (GET/PUT api/visited) -> data/visited.json of the local checkout.
//  2. "file":   a visited.json on the user's disk connected via the File System Access API (Chromium);
//               every change is written straight into it, the handle is remembered in IndexedDB.
//  3. "browser": localStorage only. Export / import move the data between browsers and people.
// Outside server mode localStorage always holds the full working copy, so the map works even while a
// connected file needs its permission renewed; changes made meanwhile are replayed into the file later.
const LS_VISITS = "hz-visits-v2"; // [visit] working copy
const LS_DIRTY = "hz-visits-dirty-v2"; // {id: visit | null} changes not yet written to the connected file
const IDB = { db: "hz", store: "kv", key: "visits-file" };
const PICKER = { types: [{ description: "Návštěvy (JSON)", accept: { "application/json": [".json"] } }] };

let D;
let mode = "browser";
const V = new Map(); // id -> visit, the source of truth (also keeps ids that are not in places.json)
const file = { handle: null, granted: false };
let writing = Promise.resolve();

/* ---------- visit records ---------- */

/** Normalized visit or null for an invalid record. */
function norm(v) {
  if (!v || typeof v !== "object" || !/^Q\d+$/.test(String(v.id))) return null;
  const rating = Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 5 ? v.rating : null;
  const date = typeof v.date === "string" && v.date.trim() ? v.date.trim() : null;
  return { id: v.id, name: String(v.name ?? D.byId.get(v.id)?.name ?? ""), date, rating, note: typeof v.note === "string" ? v.note : "" };
}

function list() {
  return [...V.values()].sort((a, b) => a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id));
}

/** Same layout as the hand-edited file: one visit per line. */
function serialize(items) {
  return items.length ? "[\n" + items.map((v) => " " + JSON.stringify(v)).join(",\n") + "\n]\n" : "[]\n";
}

function parse(text) {
  const raw = text.trim() ? JSON.parse(text) : [];
  if (!Array.isArray(raw)) throw new Error("Soubor neobsahuje seznam návštěv (JSON pole).");
  const items = raw.map(norm);
  return { items: items.filter(Boolean), invalid: items.filter((v) => !v).length };
}

function replaceAll(items) {
  V.clear();
  for (const v of items) V.set(v.id, v);
}

function applyToPlaces() {
  for (const p of D.places) {
    p.visit = V.get(p.id) || null;
    p.visited = !!p.visit;
  }
}

/* ---------- browser storage ---------- */

function readLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveLocal() {
  localStorage.setItem(LS_VISITS, JSON.stringify(list()));
}

function addDirty(changes) {
  localStorage.setItem(LS_DIRTY, JSON.stringify({ ...readLS(LS_DIRTY, {}), ...changes }));
}

function idb(fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB.db, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB.store);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB.store, "readwrite");
      const req = fn(tx.objectStore(IDB.store));
      tx.oncomplete = () => { open.result.close(); resolve(req.result); };
      tx.onerror = () => { open.result.close(); reject(tx.error); };
    };
  });
}

/* ---------- connected file ---------- */

function writeFile() {
  const text = serialize(list());
  writing = writing.catch(() => {}).then(async () => {
    const w = await file.handle.createWritable();
    await w.write(text);
    await w.close();
  });
  return writing;
}

/** Bring the file and the browser copy together, then write the result into the file.
 *  first = the file was just connected: keep everything from both sides, the file wins on conflicts.
 *  otherwise: the file is the base (it may have changed on another device) and the changes made
 *  in this browser while the file was unavailable are replayed on top, removals included. */
async function syncFile(first) {
  let text, fromFile;
  try {
    text = await (await file.handle.getFile()).text();
    fromFile = new Map(parse(text).items.map((v) => [v.id, v]));
  } catch (e) {
    const why = e.name === "NotFoundError" ? "soubor už neexistuje nebo byl přesunut"
      : e instanceof SyntaxError ? "není to platný JSON" : e.message;
    throw new Error(`Soubor ${file.handle.name} nejde načíst: ${why}. Oprav ho, nebo ho odpoj a připoj jiný; návštěvy zatím zůstávají v prohlížeči.`);
  }
  if (first) {
    for (const v of V.values()) if (!fromFile.has(v.id)) fromFile.set(v.id, v);
  } else {
    for (const [id, v] of Object.entries(readLS(LS_DIRTY, {}))) {
      if (v) fromFile.set(id, v);
      else fromFile.delete(id);
    }
  }
  replaceAll(fromFile.values());
  if (serialize(list()) !== text) await writeFile(); // don't touch an unchanged file (sync clients)
  localStorage.removeItem(LS_DIRTY);
  saveLocal();
  applyToPlaces();
}

async function useHandle(handle, first) {
  file.handle = handle;
  await idb((s) => s.put(handle, IDB.key));
  file.granted = (await handle.queryPermission({ mode: "readwrite" })) === "granted"
    || (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  if (file.granted) await syncFile(first);
  else if (first) addDirty(Object.fromEntries(V)); // the whole browser copy still has to reach the file
}

/* ---------- public API ---------- */

/** Call once after data load: picks the storage and applies the visits to D.places. */
export async function initVisits(data) {
  D = data;
  try {
    const r = await fetch("api/visited", { cache: "no-store" });
    if (r.ok) {
      mode = "server";
      replaceAll((await r.json()).map(norm).filter(Boolean));
    }
  } catch { /* static host: no api/visited */ }
  if (mode !== "server") replaceAll(readLS(LS_VISITS, []).map(norm).filter(Boolean));
  if (mode !== "server" && canConnect()) {
    try {
      file.handle = (await idb((s) => s.get(IDB.key))) || null;
      if (file.handle) {
        file.granted = (await file.handle.queryPermission({ mode: "readwrite" })) === "granted";
        if (file.granted) await syncFile(false);
      }
    } catch (e) {
      console.warn("Připojený soubor návštěv nelze načíst:", e);
      file.granted = false;
    }
  }
  applyToPlaces();
  const unknown = [...V.values()].filter((v) => !D.byId.has(v.id));
  if (unknown.length) console.warn("Návštěvy míst, která nejsou v places.json:", unknown.map((v) => `${v.id} ${v.name}`).join(", "));
}

export function canConnect() {
  return "showSaveFilePicker" in window && "indexedDB" in window;
}

/** Where visits go now: {mode: "server" | "file" | "browser", fileName, needsPermission, pending, count}. */
export function storageInfo() {
  const connected = mode !== "server" && !!file.handle;
  return {
    mode: mode === "server" ? "server" : connected && file.granted ? "file" : "browser",
    fileName: connected ? file.handle.name : null,
    needsPermission: connected && !file.granted,
    pending: connected ? Object.keys(readLS(LS_DIRTY, {})).length : 0,
    count: V.size,
  };
}

async function persist(changes) {
  if (mode === "server") {
    const r = await fetch("api/visited", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(list()),
    });
    if (!r.ok) throw new Error(`Uložení selhalo: ${(await r.json().catch(() => ({}))).error || r.status}`);
    return;
  }
  saveLocal();
  if (!file.handle) return;
  if (file.granted) {
    try { await writeFile(); return; } catch (e) {
      console.warn("Zápis do připojeného souboru selhal:", e);
      file.granted = false;
    }
  }
  addDirty(changes);
}

/** Save (visit object) or remove (null) a visit; resolves to storageInfo() after the write. */
export async function saveVisit(p, visit) {
  const v = visit ? norm({ id: p.id, name: p.name, ...visit }) : null;
  if (v) V.set(p.id, v);
  else V.delete(p.id);
  applyToPlaces();
  await persist({ [p.id]: v });
  return storageInfo();
}

/** User gesture: create a new file (or pick one to overwrite) and keep saving into it. */
export async function createFile() {
  await useHandle(await window.showSaveFilePicker({ ...PICKER, suggestedName: "navstevy-hradu.json" }), true);
}

/** User gesture: connect an existing visits file; its content is merged with the browser copy. */
export async function openFile() {
  const [handle] = await window.showOpenFilePicker(PICKER);
  await useHandle(handle, true);
}

/** User gesture: the browser forgot the permission (typically after a restart). */
export async function restoreAccess() {
  file.granted = (await file.handle.requestPermission({ mode: "readwrite" })) === "granted";
  if (file.granted) await syncFile(false);
}

/** Stop writing into the file; the visits stay in this browser. */
export async function disconnectFile() {
  await idb((s) => s.delete(IDB.key));
  file.handle = null;
  file.granted = false;
  localStorage.removeItem(LS_DIRTY);
}

/** Download all visits as a JSON file. */
export function exportVisits() {
  const blob = new Blob([serialize(list())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `navstevy-hradu-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Import visits from a File: merge (the imported record wins for the same place), or with `replace` make the
 *  visits exactly the file's content (places missing from the file are removed). */
export async function importVisits(f, replace = false) {
  let parsed;
  try { parsed = parse(await f.text()); } catch (e) {
    throw new Error(`Soubor ${f.name} nejde načíst: ${e instanceof SyntaxError ? "není to platný JSON" : e.message}`);
  }
  const changes = {};
  let added = 0, updated = 0, removed = 0;
  if (replace) {
    const keep = new Set(parsed.items.map((v) => v.id));
    for (const id of [...V.keys()]) {
      if (keep.has(id)) continue;
      V.delete(id);
      changes[id] = null;
      removed++;
    }
  }
  for (const v of parsed.items) {
    const old = V.get(v.id);
    if (!old) added++;
    else if (JSON.stringify(old) !== JSON.stringify(v)) updated++;
    else continue;
    V.set(v.id, v);
    changes[v.id] = v;
  }
  applyToPlaces();
  if (added || updated || removed) await persist(changes);
  return { added, updated, removed, invalid: parsed.invalid, unknown: parsed.items.filter((v) => !D.byId.has(v.id)).length };
}
