# Team Trials: Activation-First Skill Selection

How Team Trials mode selects skills, why activation consistency and SV efficiency matter more than skill effects, and how the optimizer maximizes your expected activation score.

---

## 1. What is Team Trials Mode?

In Team Trials (Champions Meeting), skills are scored purely on **activation**, not on what they do. Every gold skill that fires earns **1,200 points**. Every white skill that fires earns **500 points**. Whether the skill boosts acceleration, speed, or recovery is irrelevant to the scoring -- only activation matters.

The optimizer's job is to select the set of skills that maximizes **total expected activation points** within your SP budget. This means picking skills that are:

1. **Consistent** -- high probability of actually firing
2. **Cost-efficient** -- high Skill Value (SV) per SP spent
3. **Numerous** -- more skills = more potential activations

The #1 rule from competitive guides: *"What the skill does is NOT as important as its rarity, cost, and consistency."*

---

## 2. Skill Value (SV) System

The fundamental unit of Team Trials skill scoring is **Skill Value (SV)**:

| Skill Type | Activation Points | SV |
| ---------- | ----------------: | -: |
| Gold       |             1,200 | 12 |
| White      |               500 |  5 |

Key implications:

- **1 gold = 2.4 whites** in point value. If a 300 SP gold competes with three 100 SP whites, the whites win (1,500 pts vs 1,200 pts) assuming all activate.
- **Maximize total SV**, not gold count. An uma with 3 golds + 9 whites (81 SV) outscores one with 5 golds + 2 whites (70 SV).
- **Debuffs count as normal activations** -- they award the same points as any other skill.

---

## 3. Priority Order

The optimizer uses a strict priority chain in its DP solver. Each criterion is only considered if the previous one ties:

1. **Maximize total expected value** -- `SV * consistency²` summed across all chosen skills
2. **Maximize total SV** -- rewards gold skills (12 SV) over whites (5 SV)
3. **Maximize expected activations** -- sum of consistency scores
4. **Maximize total rating score** -- traditional rating contribution (tiebreaker)

Expected value is first because it captures the right trade-off: a consistent gold (high SV, high consistency) naturally scores higher than inconsistent alternatives, while cheap consistent whites can collectively outperform an expensive unreliable gold.

---

## 4. Consistency Scoring

![Consistency Score Components](../images/consistency-weights.svg)

Each skill receives a consistency score in the range **[0.05, 0.99]** based on analysis of its trigger conditions. The score is built from three components.

### 4.1 Timing Certainty (weight: 45%)

How reliably the skill activates based on its timing window.

| Timing Pattern                               | Score    | Notes                                |
| -------------------------------------------- | -------- | ------------------------------------ |
| `always == 1` (passive/constant)             | **0.98** | Highest reliability -- always active |
| Last spurt / final corner / last straight    | **0.88** | 0.76 if random variant               |
| Distance rate within 20% window              | **0.82** | Narrow positional trigger            |
| Specific phase (phase 1-4)                   | **0.76** | Predictable but phase-dependent      |
| Distance rate outside 20% window             | **0.72** | Wider positional trigger             |
| Default (unrecognized)                       | **0.68** | Unknown timing pattern               |
| Random timing (phase/corner/straight random) | **0.62** | Lowest -- unpredictable activation   |

### 4.2 Condition Breadth (weight: 30%)

How many race scenarios trigger the skill.

- **`order == 1`** (first place only): capped at **0.18** -- extremely narrow
- **`order <= 5`**: boosted to at least **0.52** -- reasonably broad
- Each complex comparator beyond 4: **-0.05** penalty
- **`near_count >= X`**: contribution calculated as `(10 - X) / 10`

### 4.3 Scenario Dependence (weight: 25%)

Penalty for situational triggers that may not occur. Base score starts at **0.95**.

| Condition                        | Penalty   |
| -------------------------------- | --------- |
| `blocked_front` / `blocked_side` | **-0.22** |
| `is_overtake`                    | **-0.18** |
| `is_surrounded` / `temptation`   | **-0.20** |
| `change_order_onetime`           | **-0.14** |
| `popularity` / `post_number`     | **-0.12** |
| `is_activate_other_skill_detail` | **-0.09** |
| `always == 1` bonus              | **+0.04** |

### 4.4 Group Synthesis

Skills with multiple trigger condition groups (logical OR) are combined:

1. Score each group independently: `timing * 0.45 + breadth * 0.30 + scenario * 0.25 - strictnessPenalty`
2. Combine via miss probability: `1 - product(1 - groupScore * 0.9)`
3. Add fallback bonus: +0.03 per additional group, capped at +0.08

### 4.5 Tier Tag Adjustments

Tags from the skill scorer adjust consistency:

| Tag                     | Effect                             |
| ----------------------- | ---------------------------------- |
| `inconsistent`          | Cap at **0.45**                    |
| `consistent`            | **+0.10** bonus                    |
| `team_trials` or `core` | **+0.12** bonus, floor at **0.65** |

### 4.6 Penalties

**Green skills** (passive stat boosts with volatile race conditions):
- Consistency penalty (configurable, default **-0.05**)
- Expected value reduction (default **-12%**)
- Savvy skills are exempt

**Volatile race conditions** (track_id, ground_condition, weather, season, rotation):
- Consistency penalty (default **-0.22**)
- Expected value reduction (default **-20%**)
- Skills tagged `team_trials` or `core` receive half penalty

---

## 5. Automated Skill Scoring

The skill scorer (`public/js/skill-scorer.js`) analyzes skills from `skills_all.json` and assigns tier tags used by the optimizer. Unlike the old system that scored skills by their effect type (acceleration, speed, etc.), the new scorer focuses entirely on what matters for Team Trials.

### 5.1 Two Scoring Dimensions

| Dimension           | Weight | What it measures                                    |
| ------------------- | -----: | --------------------------------------------------- |
| **Consistency**     |    60% | Reliability of activation from trigger conditions   |
| **Cost Efficiency** |    40% | SV per SP spent (Gold=12 SV, White=5 SV) / cost    |

Effect type, duration, and applicability are **not** scoring dimensions. In TT, a cheap gold that always activates is worth the same 1,200 points as an expensive powerful gold that always activates.

### 5.2 Cost Efficiency Formula

```text
ratio = SV / cost        (where SV = 12 for gold, 5 for white)
score = ratio / 0.1      (normalized so 12 SV / 120 SP = 1.0)
```

Cost bracket modifiers:
- Cost <= 120 SP: **x1.15** (cheap bonus)
- Cost <= 160 SP: **x1.05**
- Cost >= 300 SP: **x0.80** (expensive penalty)
- Cost >= 360 SP: **x0.70**

### 5.3 Tier Markers

| Composite Score | Marker | Meaning      |
| --------------- | ------ | ------------ |
| >= 0.72         | ◎      | Excellent    |
| >= 0.52         | ○      | Good         |
| >= 0.36         | ▲      | Average      |
| >= 0.20         | △      | Below avg    |
| < 0.20          | ✕      | Poor         |

### 5.4 Tunable Weight Sliders

The optimizer UI exposes 2 weight sliders (Consistency and Cost Efficiency) that let users adjust the scorer's dimension weights in real-time.

---

## 6. Expected Value

Expected value represents the **expected activation points** a skill contributes. It combines SV with consistency:

```text
expectedValue = SV * consistency²
```

Where:
- **SV** = 12 for gold, 5 for white
- **consistency** = the skill's consistency score (0.05 to 0.99)

Cost is **not** in this formula -- it's handled by the knapsack budget constraint in the DP solver. This prevents double-counting cost (once in value, once in budget).

### Modifiers

- **Green/volatile penalties**: `expectedValue *= expectedMultiplier` (reduced by green/volatile penalties)
- **Consistent gold bonus**: +0.14 for gold skills with consistency >= 0.58 and no volatile conditions

---

## 7. Predicted Activation Score

The optimizer predicts the base skill activation score you'll earn in a Team Trials race by combining each skill's consistency with the **wisdom proc modifier** and actual point values.

```text
predictedScore = sum( consistency_i * wisdomModifier * points_i )
```

Where `points_i` = 1,200 for gold, 500 for white.

### Wisdom Proc Rate Table

Higher wisdom increases the chance skills fire when their conditions are met:

| Wisdom | Proc Rate |
| -----: | --------: |
|    100 |      ~15% |
|    200 |      ~55% |
|    300 |      ~70% |
|    400 |      ~78% |
|    500 |      ~82% |
|    600 |      ~85% |
|    900 |      ~90% |
|  1200+ |      ~93% |

Values between breakpoints are linearly interpolated. The predicted score updates live as you change the wisdom stat input.

This is the **base score before multipliers** (opponent rating bonus, ace bonus, support card bonus, win streak). The opponent rating bonus alone can add 50-135%+ to this base.

---

## 8. Applicability Filtering

Before optimization, skills are strictly filtered against the race configuration:

- **`distance_type`** -- sprint, mile, medium, long
- **`ground_type`** -- turf, dirt
- **`running_style`** -- front, pace, late, end
- Falls back to **skill type tags** (`mil`, `med`, `lng`, `sho`, `tur`, `dir`, etc.)

Even **required skills** are removed if inapplicable. An out-of-scope skill provides zero value and wastes SP.

---

## 9. Dependency Groups

Team Trials uses the same dependency group system as Rating mode:

- **Gold + lower combos** -- selecting a gold automatically includes its linked lower; gold cost accounts for both
- **Circle skill combos** (◎/○) -- additive cost; ○ can bring ◎ as upgrade
- **Parent chain requirements** -- some skills need prerequisites
- **Standalone skills** -- no dependencies

The grouped knapsack solver handles all of these as atomic selection units.

---

## 10. DP Solver

The solver uses a grouped knapsack algorithm optimized for Team Trials:

```text
better(candidate, current):
  1. Higher expected value?     -> pick candidate
  2. Higher total SV?           -> pick candidate
  3. Higher activations?        -> pick candidate
  4. Higher rating?             -> pick candidate
  5. Lower tie index?           -> pick candidate (deterministic)
```

The solver is a standard knapsack over budget, tracking 4 dimensions per state (expected value, SV, activations, rating). This is simpler than the previous version which tracked 4 core mask states -- since skill effects don't matter for TT scoring, the mask was removed, reducing memory usage by 4x.

---

## 11. Tuning Weights

All weights are configurable via `DEFAULT_WEIGHTS` in `public/js/team-trials-optimizer.js`:

| Weight                                    | Default | Description                                                |
| ----------------------------------------- | ------: | ---------------------------------------------------------- |
| `consistentGoldMinConsistency`            |    0.58 | Minimum consistency for gold priority treatment            |
| `consistentGoldConsistencyBonus`          |    0.06 | Consistency bonus for qualifying gold skills               |
| `consistentGoldExpectedBonus`             |    0.14 | Expected value bonus for qualifying gold skills            |
| `greenSkillConsistencyPenalty`            |    0.05 | Consistency reduction for green-category skills            |
| `greenSkillExpectedPenalty`               |    0.12 | Expected value reduction for green-category skills         |
| `volatileRaceConditionConsistencyPenalty` |    0.22 | Consistency reduction for volatile race conditions         |
| `volatileRaceConditionExpectedPenalty`    |    0.20 | Expected value reduction for volatile race conditions      |
| `tierCorePenaltyReduction`                |    0.50 | Penalty reduction multiplier for team_trials-tagged skills |

---

## 12. Rating Mode vs Team Trials

| Aspect                  | Rating Mode             | Team Trials                                                    |
| ----------------------- | ----------------------- | -------------------------------------------------------------- |
| **Primary goal**        | Maximize rating score   | Maximize expected activation points                            |
| **What matters**        | Skill effect strength   | Activation probability + SV (Gold=12, White=5)                 |
| **DP priority**         | Single criterion: score | Multi-criterion: expected value > SV > activations > rating   |
| **Green skills**        | Normal weight           | Consistency + EV penalties                                     |
| **Volatile conditions** | Normal weight           | Consistency + EV penalties                                     |
| **Skill filtering**     | All available skills    | Strict: must match distance/track/strategy                     |
| **Skill scoring**       | Not used                | 2-dimension scoring (consistency + cost efficiency)            |
| **Predicted score**     | Not shown               | Estimated activation points based on wisdom stat               |
| **Comparison function** | Higher score wins       | 4-level priority chain                                         |

---

## 13. Source Files

| File                          | Responsibility                                                                |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `public/js/team-trials-optimizer.js` | Consistency scoring, expected value, filtering, DP solver, predicted score    |
| `public/js/skill-scorer.js`          | Automated skill scoring: consistency and cost efficiency (SV/SP)              |
| `public/js/optimizer.js`             | UI integration, dependency group construction, mode switching, wisdom listener |
| `public/assets/skills_all.json`      | Skill metadata including trigger conditions, effects, and timing data         |
