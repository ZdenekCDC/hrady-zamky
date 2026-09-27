"""Print the next batch of accessible places without data/history/<QID>.json, ordered by NIPOS visitors.

Usage: python3 scripts/next_history_batch.py [count=10] [groups=2]
Output: one block per agent with lines "QID | name | kind | obec | cs.wiki URL", ready to paste into the prompt
template in docs/history-batches.md. Places without a cs.wiki article are listed separately (need another source).
"""
import sys

from common import DATA, load


def visitors(p):
    counts = [v for v in (p.get("visitors") or {}).values() if v]
    return max(counts) if counts else 0


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    groups = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    done = {f.stem for f in (DATA / "history").glob("Q*.json")}
    todo = sorted((p for p in load(DATA / "places.json") if p["access"] == "vstupne" and p["id"] not in done),
                  key=visitors, reverse=True)
    batch = [p for p in todo if p.get("cswiki")][:count]
    print(f"remaining {len(todo)}, this batch {len(batch)} in {groups} groups\n")
    for g in range(groups):
        print(f"--- agent {chr(65 + g)} ---")
        for p in batch[g::groups]:
            print(f"{p['id']} | {p['name']} | {p['kind']} | {p.get('obec') or '?'} | {p['cswiki']}")
        print()
    no_wiki = [p for p in todo if not p.get("cswiki")]
    if no_wiki:
        print("without cs.wiki article:", ", ".join(f"{p['id']} {p['name']}" for p in no_wiki))


if __name__ == "__main__":
    main()
