// Base map layers shared by the main map and the family mini-map.
// "Jen města" is drawn locally from data/basemap (no tile server, works offline) so castle glyphs stand out;
// "Krajina + města" adds Stadia's label-free terrain (forests, relief, rivers) underneath;
// OSM and OpenTopoMap need no API key; Mapy.com appears only when MAPY_API_KEY is set in config.js.
import { MAPY_API_KEY } from "./config.js";

const OSM_ATTR = "© přispěvatelé <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>";
const DEFAULT = "Krajina + města";
const STADIA_ATTR = "© <a href='https://stadiamaps.com/'>Stadia Maps</a> © <a href='https://stamen.com/'>Stamen Design</a> © <a href='https://openmaptiles.org/'>OpenMapTiles</a> " + "© OpenStreetMap";
const STORE = "hz-basemap";

let basemapData = null; // shared promise: {cities, borders}
function loadBasemapData() {
  basemapData ??= Promise.all([
    fetch("data/basemap/cities.json").then((r) => r.json()),
    fetch("data/basemap/borders.json").then((r) => r.json()),
  ]).then(([cities, borders]) => ({ cities, borders }));
  return basemapData;
}

// smallest town population labelled at a zoom level
function minPop(zoom) {
  if (zoom <= 7) return 90000;
  if (zoom <= 8) return 35000;
  if (zoom <= 9) return 15000;
  if (zoom <= 10) return 8000;
  return 0;
}

/** Own vector overlay (borders, towns). terrain=true puts it over Stadia's label-free terrain background
 * (forests, relief, rivers) and dims everything outside Czechia; otherwise Czechia is a plain white shape. */
function citiesLayer({ terrain = false } = {}) {
  const group = L.layerGroup();
  const attr = "hranice © <a href='https://www.cuzk.cz'>ČÚZK</a> (CC BY 4.0), města Wikidata";
  group.getAttribution = () => (terrain ? `${STADIA_ATTR} | ${attr}` : attr);
  if (terrain) {
    // localhost needs no key; a public domain must be registered (free) at stadiamaps.com - see README
    L.tileLayer("https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(group);
  }
  let map = null;
  let labels = [];
  const update = () => {
    if (!map) return;
    const limit = minPop(map.getZoom());
    for (const { marker, pop } of labels) {
      const show = pop >= limit;
      if (show && !group.hasLayer(marker)) group.addLayer(marker);
      if (!show && group.hasLayer(marker)) group.removeLayer(marker);
    }
  };
  group.on("add", async () => {
    map = group._map;
    if (!terrain) map.getContainer().classList.add("bm-cities");
    if (!map.getPane("bmCities")) {
      map.createPane("bmBorders").style.zIndex = 250;
      map.createPane("bmCities").style.zIndex = 450;
      map.getPane("bmCities").style.pointerEvents = "none";
    }
    if (!labels.length) {
      const { cities, borders } = await loadBasemapData();
      if (terrain) {
        const world = [[85, -180], [85, 180], [-85, 180], [-85, -180]];
        L.polygon([world, ...borders.country], { pane: "bmBorders", interactive: false, stroke: false, fillColor: "#ecebe6", fillOpacity: 0.8 }).addTo(group);
      } else {
        L.polygon(borders.country, { pane: "bmBorders", interactive: false, stroke: false, fillColor: "#fcfcfb", fillOpacity: 1 }).addTo(group);
      }
      for (const l of borders.kraje) L.polyline(l, { pane: "bmBorders", interactive: false, color: terrain ? "#8f8e88" : "#c3c2b7", weight: 1, opacity: terrain ? 0.6 : 1 }).addTo(group);
      for (const l of borders.country) L.polyline(l, { pane: "bmBorders", interactive: false, color: "#898781", weight: 1.5 }).addTo(group);
      labels = cities.map((c) => ({
        pop: c.pop,
        marker: L.marker([c.lat, c.lon], {
          pane: "bmCities", interactive: false, keyboard: false,
          icon: L.divIcon({
            className: "city-label" + (c.pop >= 90000 ? " big" : c.pop >= 20000 ? " mid" : ""),
            html: `<span class="dot"></span><span class="t">${c.name}</span>`,
            iconSize: [0, 0], iconAnchor: [0, 0],
          }),
        }),
      }));
    }
    update();
    map.on("zoomend", update);
  });
  group.on("remove", () => {
    map?.getContainer().classList.remove("bm-cities");
    map?.off("zoomend", update);
  });
  return group;
}

export function baseLayers() {
  const layers = {
    [DEFAULT]: citiesLayer({ terrain: true }),
    "Jen města": citiesLayer(),
    "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_ATTR }),
    "Turistická (OpenTopoMap)": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, subdomains: "abc", attribution: `${OSM_ATTR}, SRTM | styl © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    }),
  };
  if (MAPY_API_KEY) {
    const mapy = (set) => L.tileLayer(`https://api.mapy.com/v1/maptiles/${set}/256/{z}/{x}/{y}?apikey=${encodeURIComponent(MAPY_API_KEY)}`, {
      maxZoom: 19, attribution: "<a href='https://api.mapy.com/copyright' target='_blank'>© Seznam.cz a.s. a další</a>",
    });
    Object.assign(layers, { "Mapy.com turistická": mapy("outdoor"), "Mapy.com základní": mapy("basic") });
  }
  return layers;
}

/** Adds the remembered (or default) base layer and a layer switcher; remembers the user's choice. */
export function attachBaseLayers(map, { control = true } = {}) {
  const layers = baseLayers();
  const saved = localStorage.getItem(STORE);
  const name = layers[saved] ? saved : DEFAULT;
  layers[name].addTo(map);
  if (control) {
    L.control.layers(layers, null, { position: "topleft" }).addTo(map);
    map.on("baselayerchange", (e) => localStorage.setItem(STORE, e.name));
  }
  if (MAPY_API_KEY) addMapyLogo(map);
}

function addMapyLogo(map) {
  // Mapy.com terms require their logo on the map while their tiles are shown.
  const Logo = L.Control.extend({
    onAdd() {
      const a = L.DomUtil.create("a");
      a.href = "https://mapy.com/";
      a.target = "_blank";
      a.innerHTML = '<img src="https://api.mapy.com/img/api/logo.svg" alt="Mapy.com" style="height:22px;display:block">';
      return a;
    },
  });
  new Logo({ position: "bottomleft" }).addTo(map);
}
