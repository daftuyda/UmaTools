# Data tooling

These utilities maintain the runtime datasets in `public/assets/`. Run commands from the
repository root so relative output paths remain predictable.

## Maintained commands

Use `npm run refresh:data` for the validated, independent provider pipelines. Individual
`sync:*` commands remain available for targeted maintenance.

| Command                                              | Owner                      | Output                                    |
| ---------------------------------------------------- | -------------------------- | ----------------------------------------- |
| `npm run sync:skills-all`                            | `gametora.js`              | `skills_all.json`                         |
| `npm run sync:uma`                                   | `gametora.js`              | `uma_data.json` and character thumbnails  |
| `npm run sync:supports`                              | `gametora.js`              | support data, hints, and thumbnails       |
| `npm run sync:races`                                 | `gametora.js`              | `races.json`                              |
| `npm run sync:uma-skills`                            | `gamewith-skills.js`       | Global and JP skill CSV files             |
| `npm run sync:accel-compat`                          | `generate-accel-compat.js` | acceleration compatibility data           |
| `npm run sync:event-hints`                           | `backfill-event-hints.py`  | event-derived support hints               |
| `npm run sync:master -- --global <path> --jp <path>` | `import-master.py`         | separate Global/JP master skill snapshots |

## Game master data API

Import skills directly from installed game databases, without a third-party API:

```powershell
npm run sync:master -- --global "C:\Program Files (x86)\Steam\steamapps\common\UmamusumePrettyDerby" --jp "F:\SteamLibrary\steamapps\common\UmamusumePrettyDerby_Jpn"
```

Each argument accepts a game installation directory, a `Persistent` directory, or
a `master.mdb` file. Either server can be imported independently. Python's standard
library is sufficient. The importer reads the database without modifying it and
uses SQLite backup to obtain a consistent snapshot. It validates required tables
and columns and replaces each output atomically. Reimporting an identical database
does not change the output. Server identity comes from the explicit CLI argument;
do not pass a JP database to `--global` or vice versa.

Generated files are `public/assets/master/global.json` and `jp.json`. The build
stages both into `runtime-assets/master/` for the existing FastAPI deployment.
Run `npm run build:api-assets` after importing when using staged assets locally.
Commit the generated JSON files and deploy normally to update the hosted API.
The installed databases and their absolute paths are not published.

| Endpoint                                        | Result                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `/api/data/v1/global/status`                    | Source metadata and skill count                          |
| `/api/data/v1/global/skills?limit=100&offset=0` | Paginated raw skill records                              |
| `/api/data/v1/global/skills?q=Studious`         | Case-insensitive name substring or exact skill ID search |
| `/api/data/v1/global/skills/201432`             | One skill with source metadata                           |

Replace `global` with `jp` for Japanese data. Pagination allows 1–1000 rows per
request. Unknown skills return 404, invalid parameters return 422, and missing
server snapshots return 503 without substituting another server's data. The static
JSON files provide full bulk downloads.

Records preserve every `skill_data` column, including `grade_value`, raw conditions,
effect values, dates, and flags. Names/descriptions come from `text_data` categories
47/48; `need_skill_point` comes from `single_mode_skill_need_point` and remains null
when no cost row exists. Raw effect values retain the game's units. The catalog
includes all database rows, including disabled or unreleased entries; presence is
not a promise that a skill can currently be obtained.

Local-import metadata distinguishes the database file modification time, import
time, and SHA-256 of the consistent SQLite backup. These timestamps do **not**
establish the latest game release: `game_version` is null for local imports.
Start/update each game before importing locally.

### Automatic Global refresh

```bash
python -m pip install -r scripts/data/requirements-master.txt
npm run sync:master:remote
npm run test:master
```

The downloader reads the community version feed at <https://uma.moe/api/ver>,
then follows the Global game's public CDN root, Windows, and master manifests.
It checks each referenced resource's size and xxHash64, decompresses the database,
checks SQLite integrity, and runs the same validated atomic exporter. No installed
game or game login is needed. Protocol reference:
<https://github.com/uma-moe/umamoe-resources>.

CDN snapshots record the app/resource version, version provider and its reported
timestamp, manifest/database URLs, and downloaded database SHA-256. The community
feed can lag the game; a successful download is not proof of the newest release.
`file_modified_at` is null because a download has no known original file timestamp.
Identical database content and provenance produce no repository changes.

The daily workflow runs independent GameTora, GameWith and Global-master pipelines.
Each uses `node scripts/data/refresh-provider.js <provider>` to generate into a
private temporary directory, validate nonempty outputs and unexpected count drops,
and publish only a successful pipeline. Failed pipelines keep their last good
files while successful providers can publish. Updates include races, both skill
CSVs, core indexes, thumbnails and acceleration compatibility. The acceleration
generator accepts the saved JP master snapshot, so CI needs no local game install.

JP currently requires a local import. No verified automatic JP manifest source
has been configured, so a Global refresh never overwrites `jp.json`. The Global
version feed may lag; recorded versions and source timestamps are provenance,
not a guarantee of freshness.

The API covers skills: `/api/data/v1/{global|jp}/status`, `/catalog`, `/skills`,
and `/skills/{id}`. Missing server snapshots return 503 without substituting the
other server. Build/deploy generated assets to expose refreshed data.

`public/js/skill-data.js` supplies calculator, optimizer and skill library data.
It prefers compact master snapshots (then the catalog API), overlays ratings and
costs by ID, and retains legacy aliases, conditions and relationships. CSV joins
use unambiguous aliases; unmatched records keep community values. The UI shows
the selected server and source. This does not invent metadata for master-only
skills. Full skill metadata loads on demand in the optimizer.

Aptitude products now use float32 arithmetic: 85 × 0.7 yields 60 after rounding.
The existing half-up midpoint rule is retained; exact game midpoint behavior
(including 95 × 0.7) still needs a game-backed reference fixture.

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
