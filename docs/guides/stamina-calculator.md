# Stamina Calculator

The Stamina Calculator (`/stamina`) estimates whether a stat line and recovery setup can cover the energy cost of a particular race. It models the course in phases, applies race conditions and aptitudes, and reports both the required and effective actual stamina.

This is a planning estimate. It does not simulate every in-race event, position change, skill trigger condition, or opponent interaction.

## Inputs

The calculation uses four groups of inputs:

| Group     | Inputs                                                                     |
| --------- | -------------------------------------------------------------------------- |
| Race      | Distance, surface, track condition, running style, and mood.               |
| Aptitudes | Turf, dirt, four distance aptitudes, and four style aptitudes.             |
| Stats     | Speed, stamina, power, guts, and wisdom.                                   |
| Recovery  | Counts of 1.5%, 3.5%, and 5.5% recoveries plus optional unique recoveries. |

The site-wide server setting also affects the stat inputs: Global mode caps the shared stat fields at 1200, while JP mode restores their page-defined maximum.

## Distance buckets

Distance determines which aptitude is used:

|         Distance | Bucket |
| ---------------: | ------ |
|     Below 1500 m | Sprint |
|      1500-1999 m | Mile   |
|      2000-2499 m | Medium |
| 2500 m and above | Long   |

Named intermediate distances in the implementation preserve compatibility with the source spreadsheet, but the bucket changes occur at 1500, 2000, and 2500 metres.

## Stat adjustments

Mood multiplies all five stats:

| Mood   | Multiplier |
| ------ | ---------: |
| Great  |       1.04 |
| Good   |       1.02 |
| Normal |       1.00 |
| Bad    |       0.98 |
| Awful  |       0.96 |

The active running-style aptitude additionally scales wisdom. Distance aptitude affects speed and, at the lowest grades, acceleration. Surface aptitude scales acceleration. Track condition can reduce effective speed or power and can increase HP consumption; the modifiers differ between turf and dirt.

Running style supplies its own HP and phase-speed coefficients. As a result, the same visible stamina and recovery setup can produce a different requirement after changing style.

## Wisdom-derived rates

Effective wisdom drives two displayed probabilities.

Skill proc rate is:

```text
max(100 - 9000 / effectiveWisdom, 20) / 100
```

Rushing rate is:

```text
min((6.5 / log10(0.1 * effectiveWisdom + 1))^2 / 100, 1)
```

These values are shown even when they are not being applied. **Consider skill proc rate** multiplies non-unique recovery by the proc rate; unique recovery is not scaled by that switch.

The rushing selector behaves as follows:

- **Never** uses a rushing factor of 0.
- **Always** uses a factor of 1.
- **Auto (Wisdom)** uses the calculated rushing rate.

## Recovery model

Standard recovery is additive:

```text
standardRecovery = whiteCount * 1.5%
                 + otherCount * 3.5%
                 + goldCount * 5.5%
```

When proc-rate consideration is enabled, the entire standard total is multiplied by the skill proc rate.

Unique recovery choices represent base recovery sizes of 3.5%, 5.5%, and 7.5%. Each level after level 1 adds 2% of that unique's base value:

```text
uniqueRecovery = baseRecovery * (1 + 0.02 * (level - 1))
```

Multiple unique selections are added together. The generic choices are deliberate placeholders; the player must look up the actual recovery strength of the character's unique before selecting the matching value.

## Calculation pipeline

The implementation is a direct, cell-shaped port of a spreadsheet model. At a high level it:

1. Applies mood, style aptitude, surface condition, and aptitude multipliers.
2. Calculates base race speed, HP, acceleration, proc rate, and rushing rate.
3. Estimates time, distance, and HP consumption through the opening, middle, and final race phases.
4. Adds standard and unique recovery to the available HP pool.
5. Solves backwards for the visible stamina stat required by the modeled race.

Several internal variable names mirror spreadsheet cells (`B31`, `G45`, and similar). Preserve that correspondence when validating a port against the original sheet; renaming only part of the pipeline makes future comparisons harder.

## Result states

The page compares mood-adjusted actual stamina with calculated stamina needed:

| State      | Rule                                                |
| ---------- | --------------------------------------------------- |
| Not Enough | `actual + 1 < needed`                               |
| Borderline | Not short, but `actual / needed < 1.10`             |
| Enough     | At least a 10% margin over the modeled requirement. |

The one-point tolerance prevents tiny floating-point differences from flipping the result to Not Enough. The Borderline state is intentional: it distinguishes barely passing the model from carrying a more comfortable buffer.

## Persistence and reset behavior

Every input and the list of unique recoveries are stored under `stamina-checker-state` in `localStorage`. The page restores them on the next visit and recalculates immediately. There is currently no dedicated reset button; clearing site data or removing this key restores HTML defaults.

## Maintenance checklist

When changing the model:

1. Compare representative Sprint, Mile, Medium, and Long cases with the reference spreadsheet.
2. Cover every mood, surface condition, and running style affected by the change.
3. Check the proc-rate switch and all three rushing modes independently.
4. Verify the Global stat cap and JP maximum.
5. Update this guide when a coefficient, recovery tier, boundary, or status threshold changes.

## Source files

| File                      | Responsibility                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| `public/stamina.html`     | Inputs, result cards, and defaults.                              |
| `public/js/stamina.js`    | Coefficients, persistence, phase calculations, and status rules. |
| `public/js/nav.js`        | Server-dependent stat cap.                                       |
| `public/js/i18n-pages.js` | Stamina page translations.                                       |
| `public/css/air.css`      | Shared and stamina-specific presentation.                        |
