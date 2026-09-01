# Data tooling

These utilities maintain the runtime datasets in `public/assets/`. Run commands from the
repository root so relative output paths remain predictable.

## Maintained commands

| Command | Owner | Output |
| --- | --- | --- |
| `npm run sync:skills-all` | `gametora.js` | `skills_all.json` |
| `npm run sync:uma` | `gametora.js` | `uma_data.json` and character thumbnails |
| `npm run sync:supports` | `gametora.js` | support data, hints, and thumbnails |
| `npm run sync:races` | `gametora.js` | `races.json` |
| `npm run sync:uma-skills` | `gamewith-skills.js` | Global and JP skill CSV files |
| `npm run sync:accel-compat` | `generate-accel-compat.js` | acceleration compatibility data |
| `npm run sync:event-hints` | `backfill-event-hints.py` | event-derived support hints |

The JavaScript acceleration command is a small cross-platform wrapper around the Python
generator. Set `PYTHON` when the executable is not available as `python`.

## Browser fallback

`gametora-browser.py` is the older Selenium importer. It is not used by the scheduled workflow,
but remains available for datasets such as `career.json` that are not yet covered by the
maintained Node importer. Install its optional dependencies only when this fallback is needed:

```bash
python -m pip install -r scripts/data/requirements.txt
python scripts/data/gametora-browser.py --help
```

Local HTML and metadata caches belong in `.cache_gametora/` or `.cache_gamewith/`; both are
ignored and must not be committed.
