# Hrady a zámky

Statická mapa hradů a zámků ČR (Leaflet + JSON, bez buildu) a Python skripty, které generují `data/`.

## Kam se podívat

- Před úpravou dat nebo skriptů: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (pořadí skriptů, testy, hooky) a [data/SCHEMA.md](data/SCHEMA.md) (pole a jejich nullabilita).
- Před hledáním nového zdroje dat: [docs/open-questions.md](docs/open-questions.md) a [TODO.md](TODO.md), co už se zkoušelo a vyčerpalo.
- Před dávkami historie, přístupnosti nebo data vzniku: [docs/history-batches.md](docs/history-batches.md) (pravidla pro agenty, šablona zadání).
- Před plánem na publikace a lokální model: [docs/publikace-a-lokalni-model.md](docs/publikace-a-lokalni-model.md).

## Pracovní postup

- Po klonu jednorázově `git config core.hooksPath scripts/hooks` (pre-commit: ruff + `tests/test_data.py`; commit-msg odmítne trailer `Co-Authored-By`).
- Před commitem projdou `.venv/bin/ruff check .` a `python3 -I tests/test_data.py`; po změně dat nebo `app/` i `.venv/bin/python tests/e2e.py` (prohlížeč: `CHROMIUM=/cesta/k/chrome`).
- Dočasné soubory patří do `$TMPDIR`; cestu `/tmp/claude-...` nezadávej natvrdo.
- Paměť (`~/.claude/projects/.../memory/`) zapisuj nástrojem Write, ne přes Bash (sandbox ji v shellu vidí jen pro čtení).
