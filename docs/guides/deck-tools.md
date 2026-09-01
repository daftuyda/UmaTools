# Deck Builder

The **Deck Builder** (`/deck`) is an interactive workspace for one character and up to six support cards. It explains a deck the player has chosen through combined effects, skill hints, compatibility scoring, and scenario templates.

## Data sources

| Dataset                            | Used for                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `public/assets/support_hints.json` | Support identity, rarity, type, effects, unique effects, hints, and images.                 |
| `public/assets/uma_data.json`      | Character identity, stat bonuses, and aptitudes in the Deck Builder.                        |
| `public/assets/skills_all.json`    | Lazy-loaded skill conditions used to categorize hints and score style or distance affinity. |

The builder follows the site's Global/JP data preference. The preference changes displayed names; deck records continue to use stable IDs or slugs.

## Limit breaks and effect values

Each card stores an 11-value effect progression for levels 1, 5, 10, and every five levels through 50. A displayed limit-break stop maps to a different level for each rarity:

| Stop | SSR |  SR |   R |
| ---- | --: | --: | --: |
| LB0  |  30 |  25 |  20 |
| LB1  |  35 |  30 |  25 |
| LB2  |  40 |  35 |  30 |
| LB3  |  45 |  40 |  35 |
| MLB  |  50 |  45 |  40 |

A support's unique effects count only when the selected stop reaches the unique effect's unlock level. The mapping and summary logic live in `public/js/deck.js`.

## Building and inspecting a deck

The character picker can filter by distance, surface, and strategy aptitude. The support picker can filter by support type and rarity, search by name, and sort by an effect. Clicking a filled support slot opens its effect panel; the level slider there is for inspecting progression, while the LB buttons on the deck slot define the value used by the deck summary.

The combined summary includes:

- the selected character's stat bonuses;
- combined support effects at the selected limit breaks;
- unique and shared skill hints, grouped by activation category;
- support-type coverage and the sources of shared hints;
- the effective shared hint level and its capped discount.

Shared hint levels are added across their source cards, capped at level 5. The displayed discount is 10% per effective level, capped at 40%.

### Compatibility score

The builder's grade is a heuristic for **Grand Live / Grand Concert, Team Stadium Class 6**. It is not a universal deck-strength score. Four equally sized components contribute up to 25 points each:

| Component       | What it rewards                                                                         |
| --------------- | --------------------------------------------------------------------------------------- |
| Type balance    | Grand Live type distributions, including the scenario-defining Light Hello friend card. |
| Effect stacking | Training Effectiveness, Race Bonus, Fan Bonus, and breadth of initial-stat effects.     |
| Hint synergy    | A large hint pool and hints shared by multiple supports.                                |
| Character fit   | Support types matching the character's bonuses and strongest distance.                  |

The raw total is capped according to the average limit-break stop of the selected cards. The interpolated caps run from 55 at LB0 to 100 at MLB. Grades are then assigned from F through S.

Because the assumptions are scenario-specific and dated, update the comments, templates, document, and UI copy together when replacing the underlying statistics.

### Templates and hand-offs

Meta Templates replace the current six supports with a recorded Grand Live template at MLB. Template usage percentages and card lists are defined directly in `public/js/deck.js`.

The builder connects to the rest of the suite in two ways:

- **Copy Share Link** encodes the character, supports, and non-MLB limit breaks in the `/deck` query string.
- **Open in Skill Optimizer** combines support hints, caps their effective levels, adds character aptitudes, and opens `/optimizer` with an encoded build in the URL fragment.

The active deck and named saved decks remain separate. Editing the active deck does not rewrite a named snapshot until the user saves another copy.

## Persistence

| Key                    | Contents                                       |
| ---------------------- | ---------------------------------------------- |
| `umatools-deck`        | Current character, supports, and limit breaks. |
| `umatools-saved-decks` | Named deck snapshots.                          |

Both values are browser-local. See [Local Data and Share Links](persistence-and-sharing.md) for lifecycle and URL details.

## Source files

| File                 | Responsibility                                                        |
| -------------------- | --------------------------------------------------------------------- |
| `public/deck.html`   | Deck Builder markup and dialogs.                                      |
| `public/js/deck.js`  | Builder state, scoring, templates, summaries, sharing, and hand-offs. |
| `public/css/air.css` | Shared and deck-specific presentation.                                |
