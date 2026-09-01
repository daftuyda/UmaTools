# Grand Live Token Planner

The Grand Live Token Planner (`/token-planner`) tracks which songs a player wants, which have already been bought, and how many of each Performance token remain to be saved.

The planner is entirely client-side. Song costs, effects, presets, technique requirements, and saved state all live in the browser code.

## Token types

The five tracked resources are:

| Internal key | Short label | Display name |
| ------------ | ----------- | ------------ |
| `da`         | Da          | Dance        |
| `pa`         | Pa          | Passion      |
| `vo`         | Vo          | Vocal        |
| `vi`         | Vi          | Visual       |
| `me`         | Co          | Composure    |

`me` is retained as the internal key even though the English UI abbreviates the resource as Co. Changing that key would require a stored-state migration.

## Song states

Each of the 21 songs has a stable ID, year group, title, effect description, and five token costs. The two checkboxes have an enforced relationship:

- Marking **Got** also marks the song as **Want**.
- Clearing **Want** also clears **Got**.
- A song contributes to the remaining total only when it is wanted and not bought.

The summary counts wanted, bought, and open songs. For each token type:

```text
Save = sum(cost for every wanted song that is not bought)
After Held = max(Save - tokens already held, 0)
```

Held tokens affect only **After Held**. They do not change song state or the raw Save total.

## Presets

The page currently includes four presets:

| Preset                 | Initial plan                           |
| ---------------------- | -------------------------------------- |
| Planner / Year 1 Sheet | Three Year 1 songs.                    |
| Year 2 Sheet           | The configured Year 2 milestone songs. |
| Year 3 Sheet           | Six Year 3 songs.                      |
| Blank Plan             | No wanted or bought songs.             |

Selecting a preset replaces the current wanted and bought sets. **Reset Preset** reapplies the selected preset, while **Clear All** empties song selections without changing held-token values.

## Filters and bulk actions

The view filter can show all songs, a particular year, or only wanted songs that have not been bought. Search matches the song title and effect text.

Bulk actions operate on the currently visible songs:

- **Want Visible** marks every visible song as wanted.
- **Clear Visible** clears both Want and Got for every visible song.

This makes the order of filtering and bulk selection significant. For example, selecting Year 2 and choosing Want Visible changes only Year 2 songs.

## Technique requirement reference

The technique requirement chips are a static quick reference:

| Concert stage             | Techniques required per song |
| ------------------------- | ---------------------------- |
| Before 1st Concert        | `1-2-3-4-4-2-3`              |
| Before 2nd to 4th Concert | `2-2-2-4-5-2-2`              |
| Before Grand Concert      | `2-2-2-4-3-2-2`              |

They do not participate in token totals. If the source planning sheet changes, update the technique requirement data independently from song costs.

## Persistence

State is saved under `umatools-token-planner-v1` and contains:

- the selected preset;
- the active year/remaining filter and search text;
- held amounts for the five token types;
- wanted and bought maps keyed by song ID.

On load, state is sanitized against the known song IDs, preset names, filters, and non-negative integer token amounts. Unknown songs are discarded. The `v1` suffix is the schema boundary: use a new version or an explicit migration when making incompatible changes.

## Updating the planner

Song and preset data are currently constants in `public/js/token-planner.js`; there is no generated JSON dataset. When adding or changing content:

1. Give every song a permanent, unique ID.
2. Supply all costs through the `song()` helper so missing token types normalize to zero.
3. Keep preset references limited to known song IDs.
4. Update the visible song count in the HTML if the total changes.
5. Check old saved state still loads safely.
6. Verify totals by hand for at least one mixed wanted/bought/held plan.

## Source files

| File                         | Responsibility                                                          |
| ---------------------------- | ----------------------------------------------------------------------- |
| `public/token-planner.html`  | Planner controls, summary, table, and visible song count.               |
| `public/js/token-planner.js` | Songs, costs, presets, state rules, filtering, totals, and persistence. |
| `public/css/air.css`         | Shared and token-planner presentation.                                  |
