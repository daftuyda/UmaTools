# Reproducing Team Trials activation calibration

The browser uses `public/assets/team-trials-calibration.json`. It does not run Rust or start simulations in a visitor's browser.

## Inputs

- The supplied `track data.xlsx`, credited in the workbook primarily to Ruben.
- `public/assets/skills_all.json`: Global candidate availability and condition signatures.
- Current local GlobalSim source and its `examples/v76-race.jsonl` skill table/settings.
- `public/assets/team-trials-tracks.json`: 83 individually mapped course entries.

Import the workbook with Python's standard library:

```powershell
python scripts/data/import-team-trials-tracks.py "path/to/track data.xlsx" --sim ../GlobalSim --out public/assets/team-trials-tracks.json
```

The importer fails on missing or ambiguous layouts. It maps repeated Kyoto/Niigata venue-distance entries to separate layouts; it does not silently drop duplicates or invent observed race counts.

Build the current engine into UmaTools scratch space, leaving GlobalSim's existing binaries untouched:

```powershell
cargo build --manifest-path ../GlobalSim/Cargo.toml --release --locked --offline --no-default-features --target-dir .tmp-team-trials/target
node scripts/data/calibrate-team-trials.js --sim ../GlobalSim --engine .tmp-team-trials/target/release/race_engine_rs_v2.exe --seeds 32 --workers 6
```

Use the platform's executable filename on non-Windows systems. A matching Rust toolchain/linker and cached dependencies are required for the offline build.

## Experiment

There are 346 Global ordinary/gold candidate definitions present in the reference engine table. Of these, 45 have only static conditions and are enumerated exactly over courses and the spreadsheet's condition marginals. The remaining 301 are simulated.

Each tested skill receives 32 seeds on each course for each of four running styles: 384 samples per Long context, 512 Dirt, 544 Sprint/Mile, and 672 Medium. The complete run consists of 276,224 races and 3,197,824 tested runner-skill observations. Static enumeration is additional and is not counted as simulated races.

Every race has 12 runners with three runners per style. Each runner has one tested skill and three background skills, with same-family upgrades removed. Skill effects remain enabled. Gates rotate over four configurations. Four strength scenarios vary speed/power relative to other runners. Each skill is counted at most once per runner/race, even if it activates repeatedly.

Wisdom checks are disabled both in the request and explicitly via \`wisdomCheck: 0\` in the calibration-only definitions. The retail initialization path ignores the top-level disable flag, so relying on that flag alone incorrectly includes a Wisdom lottery. A 128-race preflight verifies guaranteed straight-skill activation and zero corner activations on Niigata 1,000 m before the sweep starts. Background skills also bypass the lottery in this baseline. The optimizer applies the skill table's lottery flag and the entered Wisdom once afterward. Weather, season, and ground are sampled independently from the workbook marginals. Exact static evaluation preserves course-property correlations and OR branches.

This is a reusable baseline, not a full-build optimizer or empirical opponent model. Activation-count, recovery-count, passing, blocking, and stamina-dependent conditions can vary with the actual build and opponents. The four-scenario range is retained to help inspect sensitivity. Wilson intervals describe finite sampling, not engine fidelity, environmental clustering, or opponent-model error.

## Integrity and recovery

The artifact records the engine binary SHA-256, source revision/worktree status, skill-table hash, pool hash, run size, per-course hits, and sample counts. The binary hash is authoritative when the local GlobalSim worktree has uncommitted changes.

Workers are periodically restarted. If an engine process crashes, the exact request is retained under `.tmp-team-trials` and retried in a fresh worker. A repeated failure aborts the run. Failed or partial batches never contribute zero-hit samples. Checkpoints preserve only complete batches and validate input hashes before resuming.

The browser requires a matching condition signature and all requested category/style contexts. Simulated contexts must have at least 256 samples. Missing, stale, or insufficient entries use the existing heuristic; JP always uses that fallback. Multiple selected categories/styles receive equal weight rather than being weighted by differing sample counts.

## Checks

```powershell
npm run test:team-trials
npm run test:optimizer-functions
node tests/browser/team-trials-calibration.js
npm run check:guides
npm run check:static
```

The calibration tests check every generated context and its course totals, stale/missing data handling, measured zero rates, exact coverage, category weighting, and single application of the Wisdom roll. Browser checks cover loading, visible evidence labels, unavailable-data fallback, and JP isolation.

## Completed validation

The 276,224-race calibration was checked against 31,872 same-seed races in fresh engine processes. All 720 audited contexts for 36 skills, including 11,952 per-course counters, matched exactly. These repeats verify reproducibility and do not increase the independent sample size. The final calibration recovered one engine capacity-overflow crash by replaying the exact batch; the fresh-process audit had no crashes. The audit evidence is in `team-trials-validation.json`.

Twelve measured definitions involving other-skill activation counts, raw stat thresholds, or post numbers are deliberately not consumed by the optimizer. Their rates depend on inputs the baseline deck, stats, or four gate layouts do not represent adequately. They retain heuristic estimates; the other matching contexts can use measured evidence.

Reproduce the independent audit with:

```powershell
node scripts/data/calibrate-team-trials.js --sim ../GlobalSim --engine .tmp-team-trials/target/release/race_engine_rs_v2.exe --seeds 32 --workers 4 --audit --out .tmp-team-trials/calibration-audit.json
node scripts/audit/team-trials-calibration.js
```
