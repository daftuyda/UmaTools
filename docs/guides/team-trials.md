# Team Trials: Activation-First Skill Selection

This document explains how UmaTools selects Team Trials skills, including measured course coverage, Wisdom checks, dependencies, and the expected-value knapsack solver.

## 1. Objective

Team Trials awards base points when skills activate. Ordinary skills award 500 points and gold skills award 1,200 points. The effect itself does not change that activation award, so rarity, cost, applicability, and activation probability are the important inputs.

| Skill type | Activation points | Skill Value (SV) |
| ---------- | ----------------: | ---------------: |
| Gold       |             1,200 |               12 |
| Ordinary   |               500 |                5 |

One gold is worth 2.4 ordinary activations. Three inexpensive ordinary skills can therefore outscore one gold when all three fit the same SP budget and activate reliably.

The optimizer maximizes expected SV within the entered SP budget:

```text
expected SV = base SV × activation probability
```

Cost is not included again in this formula. The knapsack budget already accounts for it.

## 2. Activation probability

The model separates three questions that were previously blended into one heuristic score:

```text
activation probability
  = course eligibility
  × conditional trigger chance
  × Wisdom check (when applicable)
```

### 2.1 Observed course pool

The supplied workbook lists 83 course entries: Sprint 17, Mile 17, Medium 21, Long 12, and Dirt 16. Each listed entry has equal weight within its category. These are course-pool entries, not recorded race occurrence counts. Duplicate venue/distance entries map to distinct inner/outer layouts.

Fixed conditions are enumerated over the actual GlobalSim course IDs, so direction, exact distance, venue, surface, and alternative branches are evaluated together. Niigata's straight 1,000 m course is neither left-handed nor right-handed.

The workbook's condition marginals are:

- Seasons: Spring 40%, Summer 20%, Autumn 20%, Winter 20%.
- Weather: Sunny 59%, Cloudy 30%, Rain 10%, Snow 1%.
- Ground: Firm 77%, Good 12%, Soft 6%, Heavy 5%.

Season, weather, and ground are treated as independent because joint observations were not supplied. When several categories are selected, each category receives equal weight; a category with more courses or simulation samples does not dominate.

Green skills still need at least 40% activation coverage to pass the existing conservative filter. Venue-specific greens now have measured pool coverage rather than being unconditionally treated as unknown.

### 2.2 Simulated trigger reliability

For covered Global skills, GlobalSim measures whether the skill activates at least once per race, across every listed course and all four running styles. Repeated activations of the same skill are counted once. The offline run uses 32 seeds per course and style, giving 384–672 trials per skill/category/style. Static-only skills use exact course enumeration instead.

The model uses a 12-runner field with three runners per style, rotating gates, four relative-strength scenarios, A aptitudes, and a small background skill deck. Each runner receives one tested skill plus Corner Adept, Straightaway Adept, and Corner Recovery, excluding an overlapping skill family. Skills retain their actual effects; the test does not equip every candidate simultaneously.

The stored rate already includes course eligibility. It replaces the old timing/placement heuristics and tier adjustments rather than multiplying them again. Wisdom lottery flags are explicitly disabled in the calibration-only skill definitions and applied once from the user's current Wisdom afterward. Background skills also bypass the lottery in this baseline.

The result labels each estimate as **simulated**, **course coverage**, or **heuristic**. Unknown skills, changed condition definitions, undersampled contexts, and JP data keep the heuristic fallback. Skills requiring particular activation counts, raw stat thresholds, or post numbers also stay on fallback because the baseline does not adequately represent those inputs. Sample counts, per-course hit counts, individual-context Wilson intervals, and scenario ranges are retained in the calibration artifact.

These estimates describe the configured field and background deck, not every possible opponent or full build. Skills that depend on other activations, stamina, passing, or blocking can change with the build and opponents. Sampling intervals do not include that model uncertainty or simulator error. The optimizer sums individual expected scores; it does not re-simulate every complete candidate build.

### 2.3 Wisdom check

Skills that use the normal Wisdom activation roll apply:

```text
Wisdom rate = max(1 - 90 / Wisdom, 0.20)
```

Examples:

| Wisdom | Activation roll |
| -----: | --------------: |
|     90 |             20% |
|    180 |             50% |
|    500 |             82% |
|    900 |             90% |
|  1,200 |           92.5% |

Fixed-condition green skills do not use this roll. A Firm-condition green therefore remains at 77% estimated activation whether the entered Wisdom is 100 or 1,200. Ordinary skills still respond live to the Wisdom input.

## 3. Expected score outputs

For each skill:

```text
expected activation points
  = activation probability × (1,200 if gold, otherwise 500)
```

The Team Trials result panel reports:

- **Expected SV**: sum of probability-weighted SV;
- **Total SV**: maximum SV if every selected skill activates;
- **Expected Activations**: sum of individual activation probabilities;
- **SV per SP**: unadjusted total SV divided by spent SP;
- **Estimated Activation Score**: probability-weighted base activation points.

The estimated activation score does not include opponent-strength, ace, support-card, placement, or other race bonuses.

## 4. Applicability and composition

Before optimization, skills are filtered against selected targets and aptitudes:

- distance: Sprint, Mile, Medium, or Long;
- surface: Turf or Dirt;
- strategy: Front, Pace, Late, or End.

Metadata conditions are preferred, with skill type tags used as a fallback. A required skill that cannot apply to the target is omitted rather than consuming SP for zero value.

Strategy tags are global restrictions even when a skill also has activation-condition groups. General skills without calibration or a strategy tag are checked against their expected race position: front-half conditions favor Front Runner/Pace Chaser, while rear-half conditions favor Late Surger/End Closer. This prevents recommendations such as `Trick (Rear)` for a Front Runner.

The optimizer currently works on one character's purchasable skills. Team-wide decisions still need human review. In particular, the source guide recommends avoiding duplicate strategies within the same distance category so more teammates can earn the good-position bonus.

## 5. Dependencies and solver priority

The grouped knapsack solver preserves:

- gold skill and lower-skill dependencies;
- circle/double-circle upgrade relationships;
- explicit parent chains;
- required skills and SP costs;
- deterministic conflict resolution.

Candidate solutions are compared in this order:

1. higher total expected SV;
2. higher maximum total SV;
3. more expected activations;
4. higher rating score;
5. deterministic input order.

This naturally allows several cheap, reliable ordinary skills to beat an expensive gold skill without adding arbitrary skill-count or phase-diversity multipliers.

## 6. Limits and maintenance

- Track percentages are based on the supplied observed pool and should be refreshed if the Team Trials course pool changes.
- Multiplying simultaneous course frequencies assumes independence because the aggregate sheet does not provide every joint distribution.
- Conditional trigger estimates are heuristics, not a frame-by-frame race solver.
- Unique skill activation values vary; the current purchasable-skill optimizer uses the gold/ordinary point model and does not optimize unique skill inheritance.
- Course-specific IDs use a conservative fallback until exact course geometry is added locally.
- Green skills below the configurable 40% selected-course coverage threshold are excluded rather than merely downweighted.

## 7. Implementation map

| File                                       | Responsibility                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `public/js/team-trials-optimizer.js`       | Course model, activation probabilities, expected SV, dependencies, solver, score prediction |
| `public/js/skill-scorer.js`                | Conditional consistency and cost-efficiency metadata                                        |
| `public/js/optimizer.js`                   | UI inputs, target context, Wisdom integration, and result rendering                         |
| `public/assets/skills_all.json`            | Skill conditions, types, descriptions, and dependencies                                     |
| `tests/unit/team-trials-optimizer.test.js` | Course coverage, Wisdom behavior, dependency, filtering, and deterministic regression tests |

## 8. Research sources

- Tracen Trials Team Trials guide and TT Skill Analyzer
- _Basic Umamusume Team Trials Guide_ by Mango Konata
- _Track Data_ Team Trials course-frequency sheet
