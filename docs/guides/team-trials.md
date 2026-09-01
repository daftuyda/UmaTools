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

### 2.1 Course eligibility

Fixed course conditions use the supplied Team Trials track data instead of receiving a blanket penalty. The optimizer chooses the relevant row from the selected target or aptitude.

| Category | Downhill | Uphill | Right-handed | Non-standard |
| -------- | -------: | -----: | -----------: | -----------: |
| Sprint   |      59% |    71% |          65% |          47% |
| Mile     |      76% |    82% |          71% |          59% |
| Medium   |      76% |    76% |          57% |          29% |
| Long     |      75% |    92% |          83% |          83% |
| Dirt     |      45% |    64% |          50% |          75% |

The global pool frequencies are:

- Seasons: Spring 40%, Summer 22%, Autumn 12%, Winter 26%
- Weather: Sunny 58%, Cloudy 30%, Rain 11%, Snow 1%
- Ground: Firm 77%, Good 11%, Soft 7%, Heavy 5%

Exact-distance conditions use the observed distance counts for the selected category. Multiple simultaneous fixed conditions are multiplied, while alternative activation groups use the best eligible branch. For example, a Medium right-handed + Firm condition has estimated coverage of `0.57 × 0.77 = 43.89%`.

These are aggregate estimates, not exact race simulations. Conditions tied to a specific track or course ID remain on the conservative fallback model because the aggregate sheet cannot resolve them.

Green skills must reach at least 40% coverage for the selected build. The threshold is applied after choosing the target distance/surface context, so a condition can be rejected for one build and retained for another. Racecourse-specific greens are excluded because the aggregate pool cannot establish reliable coverage for them.

### 2.2 Conditional trigger chance

Once a race is eligible, non-fixed requirements are estimated from the skill metadata in `skills_all.json`. The heuristic considers:

- timing breadth, such as always-on, phase, corner, straight, and random windows;
- placement breadth, such as first-only versus a wider order range;
- situational requirements, such as being blocked, overtaking, or changing position;
- multiple activation groups, which can provide fallback opportunities;
- Team Trials consistency tags produced by the skill scorer.

This portion remains an estimate. It is used for conditions that cannot be derived from the track pool alone.

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

Strategy tags are global restrictions even when a skill also has activation-condition groups. General skills without a strategy tag are checked against their expected race position: front-half conditions favor Front Runner/Pace Chaser, while rear-half conditions favor Late Surger/End Closer. This prevents recommendations such as `Trick (Rear)` for a Front Runner.

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
