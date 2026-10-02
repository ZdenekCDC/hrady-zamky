"""Local web server for the map with write access to data/visited.json.

Usage: .venv/bin/python scripts/serve.py [port]   (default 8000, binds 127.0.0.1 only)

Static files are served from the project root. The UI saves visits via:
  GET /api/visited   -> {"iconTheme": ..., "visits": [...]} from data/visited.json (empty when the file doesn't exist yet)
  PUT /api/visited   -> body = the full document; validated and written to data/visited.json
On a static host (GitHub Pages) the endpoint doesn't exist and every visitor starts with an empty map; the UI
then stores visits in the browser or in a file the visitor connects (see app/visits.js).
"""
import functools
import http.server
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VISITED = ROOT / "data" / "visited.json"
FIELDS = ("id", "name", "date", "rating", "note")


def validate(doc):
    if not isinstance(doc, dict):
        raise ValueError('expected {"iconTheme": ..., "visits": [...]}')
    theme, items = doc.get("iconTheme"), doc.get("visits")
    if theme is not None and not isinstance(theme, str):
        raise ValueError("iconTheme must be a string or null")
    if not isinstance(items, list):
        raise ValueError("visits must be a JSON list")
    out = []
    for i, v in enumerate(items):
        if not isinstance(v, dict) or not str(v.get("id", "")).startswith("Q"):
            raise ValueError(f"item {i}: missing Wikidata id (Q...)")
        r = v.get("rating")
        if r is not None and (not isinstance(r, int) or not 1 <= r <= 5):
            raise ValueError(f"item {i} ({v['id']}): rating must be 1-5 or null")
        out.append({k: v.get(k) if k != "note" else (v.get(k) or "") for k in FIELDS})
    return {"iconTheme": theme or None, "visits": out}


def load():
    if not VISITED.exists():
        return {"iconTheme": None, "visits": []}
    doc = json.loads(VISITED.read_text(encoding="utf-8"))
    return {"iconTheme": None, "visits": doc} if isinstance(doc, list) else doc  # a plain list = older file


def dump(doc):
    # one visit per line, same layout as the hand-edited file
    theme = f' "iconTheme": {json.dumps(doc["iconTheme"], ensure_ascii=False)},\n' if doc["iconTheme"] else ""
    lines = ["  " + json.dumps(v, ensure_ascii=False) for v in doc["visits"]]
    visits = "[\n" + ",\n".join(lines) + "\n ]" if lines else "[]"
    return f'{{\n{theme} "visits": {visits}\n}}\n'


class Handler(http.server.SimpleHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/visited":
            return self._json(200, load())
        return super().do_GET()

    def do_PUT(self):
        if self.path != "/api/visited":
            return self._json(404, {"error": "unknown endpoint"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            doc = validate(json.loads(self.rfile.read(n) or b"null"))
        except (ValueError, json.JSONDecodeError) as e:
            return self._json(400, {"error": f"invalid visits: {e}"})
        tmp = VISITED.with_suffix(".json.tmp")
        tmp.write_text(dump(doc), encoding="utf-8")
        tmp.replace(VISITED)  # atomic swap, never a half-written file
        self._json(200, {"saved": len(doc["visits"])})

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"http://localhost:{port}  (visits are saved to {VISITED.relative_to(ROOT)})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
