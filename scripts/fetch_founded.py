"""Estimate the start of every place without a Wikidata inception from the intro of its cs.wiki article.

Downloads the beginning of each article (plain text from wikitext, max 12000 chars) to data/raw/cswiki_intro.json
(cached; delete to refresh), then writes data/founded.json:
{QID: {"year"|"century": ..., "kind": "built"|"first_mention", "text": sentence}} for places where a pattern matched.
build_places.py uses it only when Wikidata has no inception.
"""
import html
import re
import sys
import time
from urllib.parse import unquote

from common import DATA, RAW, get, load, save, sparql

CENTURY = re.compile(r"(\d{1,2})\. (?:století|stol\.)")
BUILT = r"(?:postaven\w*|vybudován\w*|založen\w*|vystavěn\w*|vznikl\w*|zbudován\w*|vzniku|založení|výstavb\w+)"
APPROX = r"(?:(?:kolem|okolo|asi|zřejmě|pravděpodobně|přibližně|nejspíše|snad)\s+)?"
BUILT_YEAR = re.compile(rf"\b{BUILT}\b[^.;]{{0,60}}?{APPROX}(?:roku|v roce|r\.)\s+(\d{{4}})\b", re.I)
BUILT_CENT = re.compile(rf"\b{BUILT}\b[^.;]{{0,60}}?(?:v|ve|na počátku|na konci|koncem|počátkem|v první polovině|v druhé polovině|v polovině|na přelomu)\s+(\d{{1,2}})\. (?:století|stol\.)", re.I)
FIRST_MENTION = re.compile(r"(?:poprvé|první (?:písemn\w+ )?(?:zmínk\w+|doložen\w+)|písemn\w+ zmínk\w+)[^.;]{0,80}?(?:roku|v roce|z roku|r\.)\s+(\d{4})\b", re.I)
FIRST_MENTION2 = re.compile(r"(?:zmiňován\w*|zmíněn\w*|připomín\w+|doložen\w*)\s+(?:poprvé\s+)?(?:již\s+)?(?:roku|v roce|r\.)\s+(\d{4})\b", re.I)


def titles(places):
    out = {}
    for p in places:
        if p.get("cswiki"):
            out[p["id"]] = unquote(p["cswiki"].rsplit("/wiki/", 1)[1]).replace("_", " ")
    return out


def plain(wikitext):
    t = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", wikitext, flags=re.S)
    for _ in range(6):  # nested templates
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\{\|.*?\|\}", "", t, flags=re.S)
    t = re.sub(r"\[\[(?:Soubor|File|Kategorie|Category|Obrázek):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]", "", t, flags=re.I)
    t = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"'{2,}|<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    t = re.sub(r"==+\s*([^=\n]+?)\s*==+", r"\n\1.\n", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()[:12000]


def download(want):
    cache = load(RAW / "cswiki_intro.json") if (RAW / "cswiki_intro.json").exists() else {}
    todo = sorted(t for t in set(want.values()) if t not in cache)
    for i in range(0, len(todo), 40):
        chunk = todo[i:i + 40]
        r = get("https://cs.wikipedia.org/w/api.php", params={
            "action": "query", "titles": "|".join(chunk), "prop": "revisions", "rvprop": "content", "rvslots": "main",
            "redirects": 1, "format": "json", "formatversion": 2}).json()["query"]
        alias = {t: t for t in chunk}
        for n in r.get("normalized", []):
            alias[n["from"]] = n["to"]
        redir = {x["from"]: x["to"] for x in r.get("redirects", [])}
        pages = {p["title"]: plain(p["revisions"][0]["slots"]["main"]["content"]) if p.get("revisions") else ""
                 for p in r["pages"]}
        for t in chunk:
            cache[t] = pages.get(redir.get(alias[t], alias[t]), "")
        print(f"{i + len(chunk)}/{len(todo)}", file=sys.stderr)
        save(RAW / "cswiki_intro.json", cache)
        time.sleep(1.5)
    return cache


def sentence(text, m):
    a = text.rfind(".", 0, m.start()) + 1
    b = text.find(".", m.end())
    return text[a:b if b > 0 else None].strip()[:240]


ORDINALS = {"dvanáctého": 12, "třináctého": 13, "čtrnáctého": 14, "patnáctého": 15, "šestnáctého": 16,
            "sedmnáctého": 17, "osmnáctého": 18, "devatenáctého": 19, "dvacátého": 20}
WORD_CENT = re.compile(rf"\b{BUILT}\b[^.;]{{0,60}}?\b(" + "|".join(ORDINALS) + r")\s+století", re.I)
SUBJECT = re.compile(r"\b(?:zámek|zámku|zámeč\w+|tvrz\w*|hrad\w*|hrádek|hrádku|zřícenin\w+|klášter\w*|pevnost\w*|sídl\w+|opevnění|hradb\w+|kostnic\w+|špitál\w*|usedlost\w*)\b", re.I)
OTHER = re.compile(r"\b(?:ves|vsi|obec|obce|osada|osady|park\w*|škol\w+|gymn\w+|fara|fary|farnost\w*|kostel\w*|pivovar\w*|spolek|ovčín\w*|sýpk\w+|střech\w+|sklep\w*|měst[oa]|městečk\w+|továrn\w+|zahrad\w+)\b", re.I)


def plausible(sent, m):
    if not SUBJECT.search(sent) or OTHER.search(sent):
        return False
    return not re.match(r"\s*(?:nebo|či|až|-|–)", sent[sent.find(m.group(0)) + len(m.group(0)):])


def estimate(text):
    text = html.unescape(text).replace("\xa0", " ")  # cache entries from before plain() unescaped entities
    sents = [x for x in re.split(r"(?<=[.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])", text)]
    for kind, rxs in (("built", (BUILT_YEAR, BUILT_CENT, WORD_CENT)), ("first_mention", (FIRST_MENTION, FIRST_MENTION2))):
        for sent in sents:
            if kind == "first_mention" and re.match(r"\s*(?:další|druh|poslední|následující|nov)", sent, re.I):
                continue
            for rx in rxs:
                m = rx.search(sent)
                if not m or not plausible(sent, m):
                    continue
                g = m.group(1)
                if g.isdigit() and len(g) == 4:
                    return {"year": int(g), "kind": kind, "text": sent.strip()[:240]}
                return {"century": int(g) if g.isdigit() else ORDINALS[g.lower()], "kind": kind, "text": sent.strip()[:240]}
    return None


def wikidata_first_mention(qids):
    """Earliest P1249 (time of earliest written record) year per QID, for places the cs.wiki text gave nothing."""
    out = {}
    for i in range(0, len(qids), 100):
        values = " ".join(f"wd:{q}" for q in qids[i:i + 100])
        rows = sparql(f"SELECT ?i ?t WHERE {{ VALUES ?i {{ {values} }} ?i p:P1249/psv:P1249 ?v . "
                      f"?v wikibase:timeValue ?t ; wikibase:timePrecision ?pr . FILTER(?pr >= 9) }}")
        for b in rows:
            q, year = b["i"]["value"].rsplit("/", 1)[1], int(b["t"]["value"][:4])
            out[q] = min(year, out.get(q, year))
        time.sleep(3)
    return out


def main():
    places = load(DATA / "places.json")
    places = places if isinstance(places, list) else places["places"]
    todo = [p for p in places if p.get("founded") is None and not CENTURY.match(p.get("founded_text") or "")]
    want = titles(todo)
    cache = download(want)
    out = load(DATA / "founded.json") if (DATA / "founded.json").exists() else {}  # keep earlier estimates (delete the file to refresh)
    for qid, t in want.items():
        est = estimate(cache.get(t, ""))
        if est and (est.get("year") is None or 800 <= est["year"] <= 2025):
            out[qid] = est
    rest = [p["id"] for p in todo if p["id"] not in out]
    for qid, year in wikidata_first_mention(rest).items():
        if 800 <= year <= 2025:
            out[qid] = {"year": year, "kind": "first_mention", "text": "Wikidata P1249 (nejstarší písemná zmínka)"}
    save(DATA / "founded.json", out)
    print(f"{len(out)} of {len(todo)} undated places estimated "
          f"({sum(1 for v in out.values() if v['kind'] == 'built')} built, "
          f"{sum(1 for v in out.values() if v['kind'] == 'first_mention')} first mention)")


if __name__ == "__main__":
    main()
