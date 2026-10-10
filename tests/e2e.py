"""Smoke test of the web app in headless Chromium: loads views, clicks through, reports console errors.

Usage: .venv/bin/python tests/e2e.py [out_dir]   (screenshots go to out_dir, default $TMPDIR/hz-e2e)
Env CHROMIUM=/path/to/chrome overrides the browser binary.
Env E2E_FETCH_EXTERNAL=1 loads map tiles and photos through Python (for sandboxes where the browser has no network).
"""
import functools
import json
import shutil
import http.server
import os
import re
import sys
import tempfile
import threading
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TMPDIR", "/tmp"), "hz-e2e"))
OUT.mkdir(parents=True, exist_ok=True)


sys.path.insert(0, str(ROOT / "scripts"))
import serve as app_server  # noqa: E402  (the real server, with its write API)

DATA_PLACES = json.loads((ROOT / "data" / "places.json").read_text(encoding="utf-8"))
DATA_HISTORY = json.loads((ROOT / "data" / "build" / "history.json").read_text(encoding="utf-8"))
DATA_FAMILIES = json.loads((ROOT / "data" / "build" / "families.json").read_text(encoding="utf-8"))
KIND_LABELS = set(re.findall(r'^\s+\w+: "([^"]+)",?$', (ROOT / "app" / "data.js").read_text(encoding="utf-8").split("export const KIND = {")[1].split("};")[0], re.M))
INSTITUTIONS = {"koruna", "stat", "cirkev", "mesto", "soukromnik", "neznamo"}

VISITED_COPY = OUT / "visited.json"  # the test never writes the real data/visited.json


# sidebar sections start collapsed (except layers / more filters): open them all so the tests can reach every control
OPEN_SECTIONS = """
if (!localStorage.getItem('hz-filters-v1')) localStorage.setItem('hz-filters-v1', JSON.stringify(
  {kindsV: 2, openV: 2, open: {layers: true, kinds: true, more: true, fams: true, visits: true, legend: true}}));
"""


def serve():
    if app_server.VISITED.exists():
        shutil.copy(app_server.VISITED, VISITED_COPY)
    else:
        VISITED_COPY.write_text("[]\n", encoding="utf-8")
    app_server.VISITED = VISITED_COPY
    app_server.Handler.log_message = lambda *a: None
    handler = functools.partial(app_server.Handler, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class StaticHandler(http.server.SimpleHTTPRequestHandler):
    """Like GitHub Pages: plain files, no api/visited."""
    def log_message(self, *a):
        pass


def serve_static():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(StaticHandler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# The native file dialog can't be driven headless: hand out a file from the origin-private file system
# instead, it has the same FileSystemFileHandle interface (and permission is always granted).
FAKE_PICKER = """
window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle("navstevy.json", {create: true});
window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle("navstevy.json", {create: true})];
// localStorage "e2e-perm" = "prompt" simulates a browser that forgot the permission after a restart
FileSystemHandle.prototype.queryPermission = async () => localStorage.getItem("e2e-perm") || "granted";
FileSystemHandle.prototype.requestPermission = async () => { localStorage.removeItem("e2e-perm"); return "granted"; };
"""


def kind_color(page):
    return page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--mk-kind-hrad').trim()")


def opfs_doc(page):
    return json.loads(page.evaluate("""async () => {
        const h = await (await navigator.storage.getDirectory()).getFileHandle("navstevy.json");
        return (await h.getFile()).text();
    }"""))


def opfs_read(page):
    return opfs_doc(page)["visits"]


def opfs_write(page, items, icon_theme=None):
    page.evaluate("""async (text) => {
        const h = await (await navigator.storage.getDirectory()).getFileHandle("navstevy.json", {create: true});
        const w = await h.createWritable(); await w.write(text); await w.close();
    }""", json.dumps({"iconTheme": icon_theme, "visits": items}, ensure_ascii=False))


def static_visits(pw, opts, errors):
    """Public-site behaviour: empty start, browser storage, export / import, connected file."""
    srv = serve_static()
    base = f"http://127.0.0.1:{srv.server_port}/"
    # a real profile: Chromium crashes reading an OPFS file handle back from IndexedDB in an incognito context
    profile = Path(tempfile.mkdtemp(prefix="profile-", dir=OUT))
    ctx = pw.chromium.launch_persistent_context(profile, **opts, viewport={"width": 1440, "height": 900},
                                                accept_downloads=True)
    ctx.add_init_script(FAKE_PICKER)
    ctx.add_init_script(OPEN_SECTIONS)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror (static): {e}"))
    visited = lambda: page.evaluate("JSON.parse(document.querySelector('#stats b').textContent)")  # noqa: E731
    store = lambda: page.inner_text("#v-store")  # noqa: E731

    page.goto(base)
    page.wait_for_selector(".mk")
    assert visited() == 0, f"public site must start with an empty map, got {visited()} visited"
    assert "uložené jen v prohlížeči" in store(), store()

    page.goto(base + "#/misto/Q655633")  # Pernštejn
    page.wait_for_selector("#d-visit-form")
    page.click("[data-star='5']")
    page.click("#d-visit-form button[type=submit]")
    page.wait_for_selector("#d-visit-msg:not([hidden])")
    assert "v tomto prohlížeči" in page.inner_text("#d-visit-msg"), page.inner_text("#d-visit-msg")
    page.goto(base + "#/")
    page.reload()
    page.wait_for_selector("#v-store")
    assert visited() == 1, "visit not kept in the browser across reload"

    with page.expect_download() as dl:
        page.click("#v-export")
    exported = json.loads(Path(dl.value.path()).read_text(encoding="utf-8"))["visits"]
    assert [v["id"] for v in exported] == ["Q655633"] and exported[0]["rating"] == 5, exported
    print("static: export", exported)

    imp = OUT / "import.json"
    imp.write_text(json.dumps([
        {"id": "Q1701829", "name": "Karlova Koruna", "date": "2024-05-01", "rating": 4, "note": "z importu"},
        {"id": "Q655633", "name": "Pernštejn", "date": None, "rating": 2, "note": ""},
        {"name": "bez id"},
    ], ensure_ascii=False), encoding="utf-8")
    page.set_input_files("#v-import-file", str(imp))
    page.wait_for_selector("#v-msg")
    print("static: import", page.inner_text("#v-msg"))
    assert "1 nová, 1 změněná, 1 neplatná přeskočena" in page.inner_text("#v-msg"), page.inner_text("#v-msg")
    assert visited() == 2

    # "Nahradit vším": places missing from the file are removed, then a merge import brings one back
    rep = OUT / "replace.json"
    rep.write_text(json.dumps([{"id": "Q655633", "name": "Pernštejn", "date": None, "rating": 2, "note": ""}],
                              ensure_ascii=False), encoding="utf-8")
    page.once("dialog", lambda d: d.accept())
    page.click("#v-replace")  # opens the picker only in a real browser; feed the file directly
    page.set_input_files("#v-import-file", str(rep))
    page.wait_for_function("document.querySelector('#v-msg')?.innerText.startsWith('Nahrazeno')")
    print("static: replace", page.inner_text("#v-msg"))
    assert "0 nových, 0 změněných, 1 odstraněná" in page.inner_text("#v-msg"), page.inner_text("#v-msg")
    assert visited() == 1
    page.set_input_files("#v-import-file", str(imp))
    page.wait_for_function("document.querySelector('#v-msg').innerText.startsWith('Import')")
    assert "1 nová, 0 změněných, 1 neplatná přeskočena" in page.inner_text("#v-msg"), page.inner_text("#v-msg")
    assert visited() == 2

    page.click("#v-create")
    page.wait_for_selector("#v-disconnect")
    assert "navstevy.json" in store(), store()
    in_file = {v["id"]: v for v in opfs_read(page)}
    assert set(in_file) == {"Q655633", "Q1701829"} and in_file["Q655633"]["rating"] == 2, in_file

    page.goto(base + "#/misto/Q2164885")  # Litomyšl
    page.wait_for_selector("#d-visit-form")
    page.click("#d-visit-form button[type=submit]")
    page.wait_for_selector("#d-visit-msg:not([hidden])")
    assert "navstevy.json" in page.inner_text("#d-visit-msg"), page.inner_text("#d-visit-msg")
    assert "Q2164885" in {v["id"] for v in opfs_read(page)}, "visit not written into the connected file"

    # icon theme travels with the visits file
    page.goto(base + "#/")
    page.wait_for_selector("#f-icons")
    page.select_option("#f-icons", "syta")
    page.wait_for_function("document.documentElement.dataset.iconTheme === 'syta'")
    assert kind_color(page) == "#f2b705", kind_color(page)
    for _ in range(20):
        if opfs_doc(page).get("iconTheme") == "syta":
            break
        page.wait_for_timeout(100)
    assert opfs_doc(page).get("iconTheme") == "syta", opfs_doc(page)
    page.reload()
    page.wait_for_selector("#f-icons")
    assert page.eval_on_selector("#f-icons", "e => e.value") == "syta", "theme not kept in the connected file / browser"
    print("icon theme: static + file ok")

    # the file changed elsewhere (e.g. synced from another device): it wins on the next load
    opfs_write(page, [{"id": "Q1701829", "name": "Karlova Koruna", "date": None, "rating": None, "note": ""}])
    page.goto(base + "#/")
    page.reload()
    page.wait_for_selector("#v-disconnect")
    assert visited() == 1, f"connected file not re-read on load: {visited()} visited"

    # permission lost: changes go to the browser and are replayed into the file after "Povolit zápis",
    # on top of what another device wrote into the file meanwhile
    page.evaluate("localStorage.setItem('e2e-perm', 'prompt')")
    page.reload()
    page.wait_for_selector("#v-grant")
    page.goto(base + "#/misto/Q1701829")  # Karlova Koruna: remove
    page.wait_for_selector("#d-unvisit")
    page.once("dialog", lambda d: d.accept())
    page.click("#d-unvisit")
    page.wait_for_selector("#d-visit-msg:not([hidden])")
    assert "po povolení zápisu" in page.inner_text("#d-visit-msg"), page.inner_text("#d-visit-msg")
    page.goto(base + "#/misto/Q655633")  # Pernštejn: add
    page.wait_for_selector("#d-visit-form")
    page.click("#d-visit-form button[type=submit]")
    page.wait_for_selector("#d-visit-msg:not([hidden])")
    opfs_write(page, opfs_read(page) + [{"id": "Q2164885", "name": "Litomyšl", "date": None, "rating": 3, "note": ""}])
    page.goto(base + "#/")
    page.wait_for_selector("#v-grant")
    assert "čeká 2 změny" in store(), store()
    page.click("#v-grant")
    page.wait_for_selector("#v-grant", state="detached")  # gone once the replay has been written
    ids = sorted(v["id"] for v in opfs_read(page))
    assert ids == ["Q2164885", "Q655633"], f"replay after permission gave {ids}"
    assert visited() == 2, visited()
    print("static: permission restore + replay ok", ids)
    page.click("#v-disconnect")
    page.wait_for_selector("#v-create")
    assert visited() == 2, "disconnecting must keep the visits in the browser"
    print("static: connected file ok ->", store().splitlines()[0])
    page.locator("#v-store").scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / "08-static-visits.png"))
    print("screenshot", OUT / "08-static-visits.png")
    ctx.close()
    shutil.rmtree(profile)
    srv.shutdown()


def main():
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_port}/"
    errors = []
    with sync_playwright() as pw:
        opts = {}
        if os.environ.get("CHROMIUM"):
            opts["executable_path"] = os.environ["CHROMIUM"]
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if proxy:  # Chromium can't read credentials from the env var itself
            u = urlparse(proxy)
            opts["proxy"] = {"server": f"{u.scheme}://{u.hostname}:{u.port}", "username": u.username or "",
                             "password": u.password or "", "bypass": "127.0.0.1,localhost"}
        browser = pw.chromium.launch(**opts)
        if os.environ.get("E2E_FETCH_EXTERNAL"):
            # sandboxed Chromium can't reach tile/photo hosts; fetch them from Python instead
            import requests
            sess = requests.Session()

            def relay(route):
                try:
                    r = sess.get(route.request.url, timeout=30, headers={
                        "User-Agent": "HradyZamky-e2e/0.1", "Referer": base})
                    route.fulfill(status=r.status_code, body=r.content,
                                  headers={"content-type": r.headers.get("content-type", "application/octet-stream")})
                except Exception:
                    route.abort()
            browser.new_context  # noqa: B018  (routes are set per page below)
            _new_page = browser.new_page

            def new_page(**kw):
                pg = _new_page(**kw)
                for host in ("tiles.stadiamaps.com", "tile.openstreetmap.org", "commons.wikimedia.org", "upload.wikimedia.org"):
                    pg.route(f"https://{host}/**", relay)
                return pg
            browser.new_page = new_page
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: m.type in ("error", "warning") and errors.append(f"console.{m.type}: {m.text}"))
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        def shot(name):
            page.wait_for_timeout(1500)
            page.screenshot(path=str(OUT / f"{name}.png"))
            print("screenshot", OUT / f"{name}.png")

        page.goto(base)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_selector(".mk")
        page.wait_for_selector(".city-label", state="attached")

        # defaults: only hrad / zámek / hrad a zámek / zřícenina are on, the other kinds stay off until switched on
        castles = {"hrad", "zamek", "hradozamek", "zricenina"}
        want_default = sum(1 for p in DATA_PLACES if p["access"] != "neznamo" and p["kind"] in castles)
        assert page.locator(".mk").count() == want_default, \
            f"default map shows {page.locator('.mk').count()} markers, data has {want_default} castles with access"
        assert page.locator("details[data-sec=kinds]").get_attribute("open") is None, "kinds section should start collapsed"
        assert page.locator("details[data-sec=layers]").get_attribute("open") is not None, "layers section should start open"
        page.locator("details[data-sec=kinds] summary").click()
        page.click("[data-kinds=all]")
        page.wait_for_function("document.querySelectorAll('.mk').length > %d" % want_default)
        page.reload()  # the opened section and the kinds survive a reload
        page.wait_for_selector(".mk")
        assert page.locator("details[data-sec=kinds]").get_attribute("open") is not None, "section state not kept"
        assert page.locator(".mk").count() > want_default, "kinds not kept after reload"
        page.evaluate("document.querySelectorAll('#panel-filters details').forEach((d) => (d.open = true))")
        print("markers on map:", page.locator(".mk").count(), "| city labels:", page.locator(".city-label").count())
        shot("01-map")

        page.locator(".mk").nth(40).hover(force=True)
        page.wait_for_selector(".hz-hover .hov")
        print("hover:", page.inner_text(".hz-hover .t"))
        # colour alone does not separate the 17 kinds (colour-blind themes): the hover names the kind in words
        kind_line = page.inner_text(".hz-hover .hov-body .muted").split(" · ")[0]
        assert kind_line in KIND_LABELS, f"hover does not name the kind of the place: {kind_line!r}"
        hov_img = page.locator(".hz-hover .hov img")
        if hov_img.count():  # places with a photo use the local thumbnail from scripts/fetch_thumbs.py
            src = hov_img.get_attribute("src")
            assert src.startswith("data/thumbs/"), f"hover photo not from the local thumbnails: {src}"
            assert page.locator(".hz-hover .credit").count(), "hover photo without author / license"
        shot("01b-hover")

        page.fill("#f-family", "pernstein")  # one typo and no diacritics still finds Pernštejnové
        page.wait_for_selector("#f-family-results li")
        assert "Pernštejnové" in page.inner_text("#f-family-results"), "family picker misses a one-typo query"
        page.keyboard.press("Enter")
        page.fill("#f-family", "valdstejn")
        page.wait_for_selector("#f-family-results li")
        page.keyboard.press("Enter")
        print("family chips:", page.locator("#fam-chips .chip").count())
        shot("01c-families")
        page.click("#f-fam-reset")
        assert page.locator("#fam-chips .chip").count() == 0, "reset did not clear family chips"

        n_all = page.locator(".mk").count()
        n_visited = page.evaluate("JSON.parse(document.querySelector('#stats b').textContent)")
        def markers_with_visits(value):  # the map re-renders on the next animation frame
            page.select_option("#f-visits", value)
            page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
            return page.locator(".mk").count()

        n_yes = markers_with_visits("yes")
        n_no = markers_with_visits("no")
        assert markers_with_visits("") == n_all, "resetting the visits filter did not restore all markers"
        print(f"visits filter: all {n_all} | visited {n_yes} | unvisited {n_no}")

        def century_of(p):  # founding year, else the "14. stol." / "1920. léta" text, else the first mention
            year = ((DATA_HISTORY.get(p["id"]) or {}).get("founded") or {}).get("year") or p["founded"]
            if year is not None:
                return (year - 1) // 100 + 1
            m = re.match(r"(\d+)\. (stol|léta)", p["founded_text"] or "")
            if not m:
                return None if p.get("first_mention") is None else (p["first_mention"] - 1) // 100 + 1
            return int(m[1]) if m[2] == "stol" else (int(m[1]) - 1) // 100 + 1
        want = sum(1 for p in DATA_PLACES if p["access"] != "neznamo" and century_of(p) == 14)
        page.select_option("#f-cfrom", "14")
        page.select_option("#f-cto", "14")
        page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
        n_14 = page.locator(".mk").count()
        assert want <= n_14 <= want + n_visited, f"century filter 14. stol. shows {n_14} markers, data has {want} (+ up to {n_visited} visited)"
        print(f"century filter 14: {n_14} markers (data {want})")
        page.select_option("#f-cfrom", "")
        page.select_option("#f-cto", "")
        page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
        assert page.locator(".mk").count() == n_all, "resetting the century filter did not restore all markers"
        assert n_yes == n_visited, f"'jen navštívené' shows {n_yes} markers, expected {n_visited}"
        assert n_yes + n_no == n_all, "visited + unvisited markers do not add up to all"

        if not os.environ.get("E2E_FETCH_EXTERNAL"):  # the detail photo comes from Commons: serve a local stand-in
            photo = (ROOT / "data" / "thumbs" / "Q1416944.webp").read_bytes()
            page.route("https://commons.wikimedia.org/wiki/Special:FilePath/**",
                       lambda route: route.fulfill(body=photo, headers={"content-type": "image/webp"}))
        page.fill("#search", "Kunět")
        page.wait_for_selector("#search-results li")
        page.keyboard.press("Enter")
        page.wait_for_selector("#panel-detail h2")
        print("detail:", page.inner_text("#panel-detail h2"), "| gantt rows:", page.locator("#d-gantt .row").count())
        kunet = next(p for p in DATA_PLACES if p["name"] == page.inner_text("#panel-detail h2").strip())
        assert page.inner_text("#panel-detail h2").strip() == kunet["name"] and kunet["id"] in page.url, page.url
        k_summary = (DATA_HISTORY[kunet["id"]]["summary"] or "")[:40]
        assert k_summary and k_summary in page.inner_text("#panel-detail").replace("\n", " "), \
            f"history summary of {kunet['name']} not shown in the detail"
        credit = page.inner_text("#panel-detail .hero .credit")
        assert credit.startswith("Foto: ") and credit.count(",") >= 2 and "Wikimedia Commons" in credit, \
            f"photo credit without author and license: {credit}"
        print("photo credit:", credit)
        shot("02-detail")
        sel = page.locator(".leaflet-marker-pane .mk.sel")
        assert sel.count() == 1, f"expected one highlighted marker, got {sel.count()}"
        box = sel.bounding_box()
        z = [int(v) for v in page.eval_on_selector_all(".leaflet-marker-pane .mk", "els => els.map(e => e.style.zIndex || 0)")]
        assert box["width"] >= 30 and int(sel.evaluate("e => e.style.zIndex")) == max(z), \
            f"selected marker not enlarged / on top: {box}"
        page.wait_for_timeout(3200)  # let the pulse finish
        page.screenshot(path=str(OUT / "02b-selected-marker.png"),
                        clip={"x": box["x"] - 60, "y": box["y"] - 60, "width": box["width"] + 120, "height": box["height"] + 120})

        narrow = page.eval_on_selector("#d-gantt svg", "e => e.getBoundingClientRect().width")
        page.click("#d-wide")
        wide = page.eval_on_selector("#d-gantt svg", "e => e.getBoundingClientRect().width")
        assert wide > narrow * 1.5, f"widened detail did not redraw the owner timeline wider: {narrow} -> {wide}"
        shot("02c-detail-wide")
        page.goto(base + "#/misto/Q655633")  # the choice sticks for the next place
        page.wait_for_selector("#sidebar.wide #d-gantt svg")
        page.click("#d-wide")
        assert not page.locator("#sidebar.wide").count(), "narrowing the detail did not work"
        print(f"detail timeline: {narrow:.0f} px -> wide {wide:.0f} px")

        page.click("[data-view=table]")  # owners as a table: same periods, no color needed
        assert page.locator("#d-gantt").is_hidden() and page.locator("#d-owners").is_visible(), "table view not shown"
        n_rows = page.locator("#d-owners tbody tr").count()
        assert n_rows > 0, "owners table is empty"
        n_owners = len(DATA_HISTORY["Q655633"]["owners"])
        assert n_rows == n_owners, f"owners table has {n_rows} rows, data/build/history.json has {n_owners} owners"
        assert page.locator("#d-owners tbody tr:first-child td").nth(2).inner_text().strip(), "owner name missing in table"
        shot("02d-detail-table")
        page.click("[data-view=gantt]")
        page.wait_for_selector("#d-gantt svg")
        print("owners table rows:", n_rows)

        page.goto(base + "#/")
        page.wait_for_function("!document.querySelector('.leaflet-marker-pane .mk.sel')", timeout=2000)  # highlight cleared
        page.check("#f-tm")
        page.fill("#f-year", "1550")
        page.dispatch_event("#f-year", "input")
        n_1550 = page.locator(".leaflet-marker-pane .mk").count()
        # the axis starts at the oldest owner (Pražský hrad ~880 -> 850) and places not built yet are hidden
        oldest = min(o["from"] for h in DATA_HISTORY.values() for o in h["owners"] if o["from"] is not None)
        assert page.get_attribute("#f-year", "min") == str(oldest // 50 * 50), page.get_attribute("#f-year", "min")
        page.fill("#f-year", str(oldest))
        page.dispatch_event("#f-year", "input")
        page.wait_for_timeout(300)
        n_870 = page.locator(".leaflet-marker-pane .mk").count()
        assert 1 <= n_870 < n_1550 * 0.5, f"time machine {oldest}: {n_870} markers, 1550: {n_1550}"
        # places without a founding date are hidden by default; the option brings them back
        page.uncheck("#f-undated")
        page.wait_for_timeout(300)
        n_870_all = page.locator(".leaflet-marker-pane .mk").count()
        assert n_870_all > n_870 + 50, f"undated places: {n_870} hidden vs {n_870_all} shown"
        page.check("#f-undated")
        print("time machine markers 870 / 870 with undated / 1550:", n_870, n_870_all, n_1550)
        page.fill("#f-year", "1550")
        page.dispatch_event("#f-year", "input")
        shot("03-timemachine-1550")

        page.goto(base + "#/rody")
        page.wait_for_selector("#overview-gantt svg")
        print("families listed:", page.locator("#fam-list li").count())
        expect_fams = len([f for f in DATA_FAMILIES if f not in INSTITUTIONS])
        assert page.locator("#fam-list li").count() == expect_fams, \
            f"families list shows {page.locator('#fam-list li').count()}, data has {expect_fams} families"
        shot("04-families")

        # a parent family lists the branches that point at it (relation is stored on the branch only)
        page.goto(base + "#/rod/markvartici")
        page.wait_for_selector(".family-detail h2")
        assert "Vartenberkové" in page.inner_text(".family-detail"), "parent family does not list its branches"
        page.goto(base + "#/rody")  # back to the list: the next steps wait for a fresh detail, not this one
        page.wait_for_selector("#overview-gantt svg")
        page.wait_for_selector("#family-gantt", state="detached")

        first = page.locator("#fam-list li a").first
        first.click()
        page.wait_for_selector("#family-gantt svg")
        print("family:", page.inner_text(".family-detail h2"), "| places:", page.locator("#family-gantt .row").count())
        # the list and the detail scroll separately and nothing scrolls the whole view
        scroll = page.evaluate("""() => {
            const v = document.getElementById('view-families'), l = document.querySelector('.family-list'), d = document.querySelector('.family-detail');
            l.scrollTop = 400;
            return { view: v.scrollHeight - v.clientHeight, list: l.scrollTop, detail: d.scrollTop, listCan: l.scrollHeight > l.clientHeight };
        }""")
        assert scroll["view"] <= 1 and scroll["list"] > 0 and scroll["detail"] == 0, f"families view scrolls as one: {scroll}"
        fam_name = page.inner_text(".family-detail h2").strip()
        fam_id = next(i for i, f in DATA_FAMILIES.items() if f["name"] == fam_name)
        fam_places = sum(1 for h in DATA_HISTORY.values() if any(o["owner"] == fam_id for o in h["owners"]))
        assert page.locator("#family-gantt .row").count() == fam_places, \
            f"{fam_name}: {page.locator('#family-gantt .row').count()} rows, data has {fam_places} places"
        shot("05-family")

        page.goto(base + "#/statistiky")
        page.wait_for_selector("#view-stats .tile")
        tiles = page.locator("#view-stats .tile b").all_inner_texts()
        assert tiles[0].split(" / ")[0] == "5", f"stats tile does not match the 5 visited places: {tiles}"
        assert page.locator("#view-stats .bars li").count() > 5, "stats bars missing"
        assert tiles[0].split(" / ")[1] == str(len(DATA_PLACES)), f"stats total places {tiles[0]}, data has {len(DATA_PLACES)}"
        n_open = sum(1 for p in DATA_PLACES if p["access"] == "vstupne")
        assert tiles[1].split(" / ")[1] == str(n_open), f"stats places with admission {tiles[1]}, data has {n_open}"
        print("stats tiles:", tiles)
        shot("04b-stats")

        page.goto(base + "#/misto/Q655633")  # Pernštejn, not visited
        page.wait_for_selector("#d-visit-form")
        page.click("[data-star='4']")
        page.fill("#d-visit-form textarea", "test e2e")
        page.click("#d-visit-form button[type=submit]")
        page.wait_for_selector("#d-visit-msg:not([hidden])")
        print("visit save:", page.inner_text("#d-visit-msg"))
        saved = {v["id"]: v for v in json.loads(VISITED_COPY.read_text(encoding="utf-8"))["visits"]}
        assert saved.get("Q655633", {}).get("rating") == 4, "visit not written by the API"
        assert saved["Q655633"]["date"], "new visit saved without a date"

        page.goto(base + "#/misto/Q2164885")  # Litomyšl, visited without a date
        page.wait_for_selector("#d-visit-form")
        page.fill("#d-visit-form input[name=date]", "2025-07-14")
        page.click("#d-visit-form button[type=submit]")
        page.wait_for_selector("#d-visit-msg:not([hidden])")
        saved = {v["id"]: v for v in json.loads(VISITED_COPY.read_text(encoding="utf-8"))["visits"]}
        assert saved["Q2164885"]["date"] == "2025-07-14", f"date of an existing visit not saved: {saved['Q2164885']}"
        print("visit date edit:", saved["Q2164885"])
        shot("02b-visit-saved")

        # icon theme: switches the marker colours at once and is saved next to the visits
        page.goto(base + "#/")
        page.wait_for_selector("#f-icons")
        assert page.eval_on_selector("#f-icons", "e => e.value") == "zemita", "default icon theme"
        page.select_option("#f-icons", "kamen")
        page.wait_for_function("document.documentElement.dataset.iconTheme === 'kamen'")
        assert kind_color(page) == "#a8a49a", kind_color(page)
        page.wait_for_function("fetch('api/visited').then(r => r.json()).then(d => d.iconTheme === 'kamen')")
        assert json.loads(VISITED_COPY.read_text(encoding="utf-8"))["iconTheme"] == "kamen"
        page.reload()
        page.wait_for_selector("#f-icons")
        assert page.eval_on_selector("#f-icons", "e => e.value") == "kamen", "icon theme not kept after reload"
        shot("02c-theme-kamen")
        page.select_option("#f-icons", "zemita")
        page.wait_for_function("fetch('api/visited').then(r => r.json()).then(d => d.iconTheme === null)")
        print("icon theme: server ok")

        dark = browser.new_page(viewport={"width": 1200, "height": 800}, color_scheme="dark")
        dark.on("pageerror", lambda e: errors.append(f"pageerror (dark): {e}"))
        dark.goto(base + "#/misto/Q1701829")
        dark.wait_for_selector("#panel-detail h2")
        dark.wait_for_timeout(1500)
        dark.screenshot(path=str(OUT / "07-dark.png"))
        print("screenshot", OUT / "07-dark.png")

        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(base + "#/misto/Q2164885")
        page.wait_for_selector("#panel-detail h2")
        shot("06-mobile-detail")
        browser.close()
        static_visits(pw, opts, errors)
    srv.shutdown()
    net = [e for e in errors if "Failed to load resource" in e]
    for e in errors:
        if e not in net:
            print(e)
    print(f"errors: {len(errors) - len(net)} (+{len(net)} failed network loads)")
    sys.exit(1 if any(e.startswith("pageerror") for e in errors) else 0)


if __name__ == "__main__":
    main()
