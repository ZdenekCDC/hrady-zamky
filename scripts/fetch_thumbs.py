"""Download hover-preview thumbnails of place photos from Wikimedia Commons into data/thumbs/<QID>.webp.

Usage: .venv/bin/python scripts/fetch_thumbs.py [limit]   (limit = only the first N new images, for a trial)

The site then loads the small local file instead of asking Commons on every hover. Commons only serves
standard thumbnail widths (20, 40, 60, 120, 250, 330, 500, 960, 1280...), so the script takes the 500px
thumbnail via the API and crops it locally to the preview box (240x130 CSS px, stored at 1.5x).
Author and license of every photo go to data/build/thumbs.json (the UI shows them as the photo credit).
Incremental: only places whose image changed or has no thumbnail yet are downloaded; stale files are removed.
"""
import html
import io
import re
import sys
import time

from PIL import Image, ImageOps

from common import DATA, get, load, save

OUT = DATA / "thumbs"
META = DATA / "build" / "thumbs.json"
API = "https://commons.wikimedia.org/w/api.php"
SOURCE_WIDTH = 500  # standard Commons thumbnail step
SIZE = (360, 195)  # 1.5x the .hov img box (240x130) in app/style.css: sharp enough, ~16 kB
QUALITY = 60
PAUSE = 1  # s between downloads, one at a time: Commons answers 429 to faster thumbnail requests


def plain(value):
    """extmetadata values are HTML snippets: keep the text."""
    text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", value or "")).split())
    return re.sub(r"\s+([),.;])", r"\1", re.sub(r"\(\s+", "(", text))  # tags leave "( name )"


def image_info(files):
    """{file name: {"thumb": url, "artist": ..., "license": ..., "license_url": ...}} for up to 50 files."""
    r = get(API, params={
        "action": "query", "format": "json", "formatversion": 2, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": SOURCE_WIDTH,
        "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl",
        "titles": "|".join("File:" + f for f in files),
    })
    q = r.json()["query"]
    # the API normalizes titles (underscores, first letter); map them back to the names in places.json
    back = {n["to"]: n["from"] for n in q.get("normalized", [])}
    out = {}
    for page in q["pages"]:
        info = (page.get("imageinfo") or [None])[0]
        name = back.get(page["title"], page["title"]).removeprefix("File:")
        if not info:
            print(f"WARN no imageinfo for {name} (missing on Commons?)")
            continue
        meta = info.get("extmetadata", {})
        out[name] = {
            "thumb": info.get("thumburl") or info["url"],
            "artist": plain(meta.get("Artist", {}).get("value")) or None,
            "license": plain(meta.get("LicenseShortName", {}).get("value")) or None,
            "license_url": meta.get("LicenseUrl", {}).get("value") or None,
        }
    return out


def make_thumb(data, path):
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = ImageOps.fit(img, SIZE, Image.Resampling.LANCZOS)  # center crop like object-fit: cover
    img.save(path, "WEBP", quality=QUALITY, method=6)


def download(qid, f, info):
    """Thumbnail file + its thumbs.json record, or None when the download failed (the next run retries)."""
    try:
        make_thumb(get(info["thumb"]).content, OUT / f"{qid}.webp")
    except Exception as e:  # one broken image must not stop the whole run
        print(f"WARN {qid} {f}: {e}", flush=True)
        return None
    time.sleep(PAUSE)
    return {"file": f, **{k: info[k] for k in ("artist", "license", "license_url")}}


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    places = load(DATA / "places.json")
    meta = load(META) if META.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)

    wanted = {p["id"]: p["image"] for p in places if p.get("image")}
    todo = [(qid, f) for qid, f in wanted.items()
            if meta.get(qid, {}).get("file") != f or not (OUT / f"{qid}.webp").exists()]
    if limit is not None:
        todo = todo[:limit]
    print(f"places with a photo {len(wanted)}, to download {len(todo)}")

    done = failed = 0
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        infos = image_info([f for _, f in chunk])
        for qid, f in chunk:
            res = download(qid, f, infos[f]) if f in infos else None
            if res:
                meta[qid] = res
                done += 1
            else:
                failed += 1
        print(f"  {min(i + 50, len(todo))}/{len(todo)}", flush=True)
        save(META, dict(sorted(meta.items())))  # keep progress if the run is interrupted

    stale = [p for p in OUT.glob("*.webp") if p.stem not in wanted]
    for p in stale:
        p.unlink()
    meta = {q: m for q, m in meta.items() if q in wanted and (OUT / f"{q}.webp").exists()}
    save(META, dict(sorted(meta.items())))
    size = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"downloaded {done}, failed {failed}, removed stale {len(stale)}; "
          f"{len(meta)} thumbnails, {size / 1e6:.1f} MB in {OUT.relative_to(DATA.parent)}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
