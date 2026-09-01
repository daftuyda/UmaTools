# Valid Accel Checker

This document explains how the Accel Checker page works — its architecture, data pipeline, matching logic, and timing evaluation system. Whether you're a player trying to understand why a skill was marked "Invalid" or a developer maintaining the code, this should cover everything.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Pipeline](#2-data-pipeline)
3. [Race Setup and Context](#3-race-setup-and-context)
4. [Skill Filtering](#4-skill-filtering)
5. [Timing Evaluation](#5-timing-evaluation)
6. [Uncertainty Scoring](#6-uncertainty-scoring)
7. [Expected Impact](#7-expected-impact)
8. [Position Conditions](#8-position-conditions)
9. [Result Sorting](#9-result-sorting)
10. [Server and Language Handling](#10-server-and-language-handling)
11. [Source Files](#11-source-files)

---

## 1. Overview

The Accel Checker answers one question: **which acceleration skills can activate in the final phase of a given race?**

In Uma Musume, acceleration skills only matter if they fire during the "last spurt" (final phase) of a race. A skill that triggers too early or too late relative to the last spurt point (`ls`) provides no meaningful acceleration benefit. The checker evaluates every accel skill against a specific race configuration and classifies each one by timing validity, uncertainty, and expected distance impact.

### Key Concepts

| Term | Meaning |
| --- | --- |
| **ls** (Last Spurt) | The distance mark where the final phase begins. Typically ~2/3 of total race distance. |
| **fc** (Final Corner) | The distance mark where the last corner starts. Course-specific. |
| **fs** (Final Straight) | The distance mark where the last straight begins. Course-specific. |
| **VAC** | Valid Accel Checker — the timing logic that determines if an accel skill fires at a useful time. |
| **Segment** | A single activation condition clause parsed from the game's raw condition string. |

---

## 2. Data Pipeline

### Data Generation (Offline)

The skill timing database is generated from the game's `master.mdb` SQLite database using `scripts/data/generate-accel-compat.py`. This script:

1. Reads the `skill_data` table from `master.mdb`
2. Parses each skill's `precondition` and `condition` fields
3. Extracts effect values, filtering by acceleration-related effect types (priority order: types 31, 27, 22, 29, 21)
4. Classifies activation conditions into typed segments (fixed, random, slope, always, exclude)
5. Parses filter constraints (distance type, ground type, ground condition, track ID, mood, course distance)
6. Computes an uncertainty score based on random activation variables
7. Enriches with JP names and rarity from `skills_all.json`
8. Outputs `public/assets/accel_skills_compat.json`

### Data Format (`accel_skills_compat.json`)

Each skill entry contains:

```json
{
  "n": "JP skill name",
  "e": "JP description",
  "dt": [1, 2],         // distance types (1=sprint, 2=mile, 3=mid, 4=long)
  "gt": [1],             // ground types (1=turf, 2=dirt)
  "gc": [],              // ground conditions (1=firm, 2=good, 3=soft, 4=heavy)
  "mv": null,            // minimum mood (1-5, null=any)
  "track": [],           // specific track IDs
  "cd_ge": null,         // minimum course distance
  "cd_le": null,         // maximum course distance
  "cd_eq": null,         // exact course distances
  "tm": {},              // primary timing segment
  "segs": [],            // all timing segments (OR logic)
  "raw": "...",          // raw condition string
  "qty": 3500,           // effect value (×10000)
  "dur": 30000,          // effect duration (×10000)
  "rar": 2,              // rarity (1=white, 2=gold, 3=sub-unique, 4/5=unique, 6=evolution)
  "rr": [],              // race-runtime random variables
  "rv": [],              // race-value random variables
  "unc": 0,              // pre-computed uncertainty score
  "id": 200732           // skill ID
}
```

### Race Data (`races.json`)

Contains all race courses with metadata:

| Field | Description |
| --- | --- |
| `name` / `name_en` | JP and EN race names |
| `venue` | Racecourse name (JP) |
| `track_id` | Numeric track identifier (used for group classification) |
| `distance` | Race distance in meters |
| `gt` | Ground type (1=turf, 2=dirt) |
| `ls` | Last spurt start distance |
| `fc` | Final corner distance |
| `fs` | Final straight distance |
| `us` | Uphill sections as `[start, end]` pairs |
| `ds` | Downhill sections as `[start, end]` pairs |

### Skill Metadata (`skills_all.json`)

The checker loads `skills_all.json` to:
- Map JP skill names to EN names (fan and official translations)
- Determine which skills exist on the Global (EN) server via `name_en` presence
- Provide popup data (descriptions, sources)

---

## 3. Race Setup and Context

When the user clicks "Search Valid Acceleration", the page builds a **race context** object:

```js
{
  distance: 2400,         // from distance dropdown
  ls: 1600,               // manual override or preset value
  fc: 1800,               // final corner (null if not entered)
  fs: 2000,               // final straight (null if not entered)
  us: [[400, 600]],       // uphill sections
  ds: [[1200, 1400]],     // downhill sections
  gt: 1,                  // ground type
  venue: "東京",           // racecourse name
  name: "Japan Cup"        // display name
}

```

The `ls` value defaults to `floor(distance × 2/3)` when not manually entered. Race presets from `races.json` populate all fields automatically.

---

## 4. Skill Filtering

Before timing evaluation, skills pass through two filter stages:

### Server Filter

- **EN server**: Only skills with an official English name (`name_en` in `skills_all.json`) are shown
- **JP server**: All skills are shown

### Condition Filters

Each skill is checked against the race context:

| Filter | Logic |
| --- | --- |
| Distance type | Skill's `dt` array must include the race's distance type, or be empty (any) |
| Ground type | Skill's `gt` must include race's ground type, or be empty |
| Ground condition | Skill's `gc` must include selected condition, or be empty |
| Mood | Selected mood must be ≥ skill's minimum mood (`mv`) |
| Track ID | Skill's `track` must include one of the venue's track IDs, or be empty |
| Course distance | Race distance must satisfy `cd_ge` (≥), `cd_le` (≤), or `cd_eq` (exact match) |
| Rarity | Skill rarity must match the active rarity filter |
| Name search | If a search query is entered, at least one of JP name, EN name, or description must contain the query |
| Excluded skills | Skills with all segments of type `exclude` are removed |

---

## 5. Timing Evaluation

This is the core of the checker. Each skill's timing segments are evaluated against the race context to determine if and when the skill would activate relative to the last spurt point.

### Segment Types

The Python generator classifies each activation condition clause into one of these segment types:

#### `always`
Skill activates at any point in the race. Always valid.

#### `fixed`
Skill activates at a deterministic point. The `fixed_point` sub-field specifies the reference:

| Fixed Point | Trigger Location | Notes |
| --- | --- | --- |
| `ls` | Last spurt start | Always fastest (offset = 0) |
| `finalcorner` | Final corner distance (`fc`) | Requires `fc` input |
| `finalstraight` | Final straight distance (`fs`) | Requires `fs` input |
| `remain` | `distance - rv` meters from start | Computed from remaining distance |
| `distance_rate` | `floor(distance × rv / 100)` meters | Percentage-based position |
| `phase2_corner` | `max(fc, ls)` | Corner in/after final phase |
| `phase2_straight` | `max(fs, ls)` | Straight in/after final phase |
| `phase2_front_straight` | `ls` (only if `ls < fc`) | Far straight at final phase entry |
| `phase2_corner_nonfinal` | Course-dependent | Non-final corner in final phase |

#### `slope_up` / `slope_down`
Skill activates on an uphill or downhill section. Valid if the `ls` point falls within any slope section of that type.

#### `slope_up_later_half`
Skill activates on an uphill in the latter half. Three outcomes:
- **Valid**: `ls` is currently on an uphill
- **Random**: An uphill exists after `ls` (may or may not trigger)
- **Invalid**: No uphills at or after `ls`

#### `random`
Skill activates at a semi-random point within a zone. Subtypes include:

| Subtype | Zone |
| --- | --- |
| `fq` | First quarter of final phase |
| `fh` | First half of final phase |
| `lh` | Mid-phase latter half |
| `phase2` | Entire final phase |
| `finalcorner_random` | Random point in final corner |
| `finalcorner_lh` | Final corner latter half |
| `phase_corner` | Final phase corner sections |
| `phase_straight` | Final phase straight sections |
| `all_corner` | Any corner |
| `straight_random` | Any straight |
| `after50` | After 50% of race |
| `remain_range` | Within a remaining-distance range |
| `remain_lte` | When remaining distance ≤ threshold |

#### `exclude`
Segment is excluded from evaluation (empty/invalid condition).

### Offset Judgment

For `fixed` type segments, the checker computes the **offset** between the activation point and `ls`:

```
offset = activation_point - ls
```

The offset is then classified:

| Offset Range | Classification | CSS Class | Priority |
| ---: | --- | --- | ---: |
| -50 to 0 | **Fastest** — activates at or just before ls | `b-fast` | 0 |
| +1 to +100 | **Semi-Fast** — activates shortly after ls | `b-semi` | 1 |
| < -50 | **Invalid** — activates too early | `b-inv` | 90 |
| > +100 | **Invalid** — activates too late | `b-inv` | 91 |

### Multi-Segment Evaluation

Skills can have multiple condition clauses joined by `@` (OR logic). The checker evaluates each segment independently and picks the **best** result (lowest priority number). If all segments are excluded, the skill shows as "Excluded Skill".

---

## 6. Uncertainty Scoring

Uncertainty measures how much a skill's activation depends on unpredictable race conditions. The score is computed from two categories of random variables found in the skill's raw activation condition:

### Race-Value Variables (`rv`)
Variables that depend on pre-race setup. Each non-fixed variable adds **+4** to the score.

| Variable | Meaning |
| --- | --- |
| `motivation` | Mood variation |
| `post_number` | Gate number |

**Fixed** (score 0): `popularity`

### Race-Runtime Variables (`rr`)
Variables that depend on in-race state. Each adds **+2** to the score, except weak variables which add **+1**.

| Category | Variables |
| --- | --- |
| **Standard (+2)** | `blocked_front`, `blocked_front_continuetime`, `blocked_side_continuetime`, `is_overtake`, `is_move_lane`, `compete_fight_count`, `change_order_onetime`, `change_order_up_middle`, `bashin_diff_behind`, `bashin_diff_infront`, `distance_diff_rate`, `distance_diff_top`, `activate_count_all_team`, `activate_count_heal`, `activate_count_start`, `is_behind_in`, `is_used_skill_id`, `overtake_target_time`, `temptation_count` |
| **Weak (+1)** | `infront_near_lane_time`, `behind_near_lane_time` |

**Fixed** (score 0): `hp_per`, `order`, `order_rate`

### Uncertainty Tiers

| Score | Tier | Label |
| ---: | --- | --- |
| 0 | Certain | No random conditions |
| 1-2 | Low | Minor randomness |
| 3-4 | Medium | Moderate randomness |
| 5-6 | High | Significant randomness |
| 7+ | Very High | Highly unpredictable |

---

## 7. Expected Impact

The checker estimates a skill's impact as distance gained and equivalent time saved, assuming a reference speed at 1200 SPD stat:

### Reference Speed Calculation

```
baseSpeed = 20 - (distance - 2000) / 1000
speedBonus = sqrt(500 × 1200) × 0.002
referenceSpeed = baseSpeed + speedBonus
```

### Impact Calculation

```
accel = effectValue / 10000
duration = clamp(rawDuration / 10000, 0.1, 10)  // default 3s if missing
distanceDelta = 0.5 × accel × duration²
timeDelta = |distanceDelta| / referenceSpeed
```

A positive `distanceDelta` means the skill gains distance (good). Negative means it loses distance (deceleration skill).

---

## 8. Position Conditions

Some skills have position-based activation conditions (`order_rate` comparisons). The checker parses these from the raw condition string and translates them into position ranges for two race formats:

| Format | Runners | Abbreviation |
| --- | --- | --- |
| Champions Meeting | 9 | CM |
| League of Heroes | 12 | LoH |

For example, `order_rate<=33` means "top 33% by position", which translates to:
- CM: Top `ceil(33/100 × 9)` = Top 3
- LoH: Top `ceil(33/100 × 12)` = Top 4

---

## 9. Result Sorting

Results are sorted by three criteria in order:

1. **Effect bucket** (ascending): Positive effect → flat → negative effect
2. **Timing priority** (ascending): Fastest (0) → Semi-Fast (1) → Always (2) → Random Valid (20-36) → Course-dependent (40-50) → Invalid (90-99)
3. **Uncertainty** (ascending): Certain skills first
4. **Effect value** (descending): Stronger effects first
5. **Name** (JP locale sort): Alphabetical tiebreaker

This means fastest-activating, most reliable, strongest skills appear at the top.

---

## 10. Server and Language Handling

The checker is a self-contained IIFE with its own bilingual copy system (`COPY.en` / `COPY.ja`), independent of the site-wide `i18n.js`. However, it integrates with the site's server and language settings:

- **Server mode** (`umatoolsServer` localStorage key): Controls which skills are shown (EN = global-only, JP = all)
- **Site language** (`umatoolsSiteLanguage` localStorage key or `data-site-language` attribute): Controls UI text language
- Listens for `umatools:server-change`, `umatools:site-language-change`, and `i18n:changed` events to re-render

Skill names are displayed using metadata from `skills_all.json`:
- JP site language → JP name from metadata
- EN site language → Official EN name (`name_en`) if available, otherwise fan EN name (`enname`)

---

## 11. Source Files

| File | Role |
| --- | --- |
| `public/js/accel.js` | Page logic — UI, filtering, timing evaluation, rendering |
| `public/css/air.css` | Shared and Accel Checker-specific styles |
| `public/accel.html` | Page markup |
| `public/assets/accel_skills_compat.json` | Skill timing database (generated) |
| `public/assets/races.json` | Race course data with slopes and landmarks |
| `public/assets/skills_all.json` | Skill metadata for name resolution and server filtering |
| `scripts/data/generate-accel-compat.py` | Data generator — reads `master.mdb`, outputs skill compat JSON |
