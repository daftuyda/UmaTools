# Local Data and Share Links

UmaTools is primarily a static, client-side application. Tool inputs and preferences are kept in the browser with `localStorage`; shareable configurations are encoded into a URL only when a tool supports URL state.

This distinction matters when debugging a report, changing a schema, or explaining privacy behavior:

- `localStorage` is scoped to the site's origin and is not included in normal page requests.
- Query strings are part of the requested URL and may appear in browser history, server logs, or copied links.
- URL fragments (everything after `#`) stay in the browser during the HTTP request, but are visible to scripts, browser history, screenshots, and anyone receiving the complete link.

No application account is required to save these values. Clearing site data, using a different browser/profile, or opening a private window produces a separate state store.

## Storage inventory

### Shared preferences and interface state

| Key                            | Owner             | Contents                                              |
| ------------------------------ | ----------------- | ----------------------------------------------------- |
| `umatools-theme`               | `theme-toggle.js` | `light`, `dark`, or `oled`.                           |
| `umasearch-darkmode`           | `theme-toggle.js` | Legacy light/dark compatibility preference.           |
| `umatoolsServer`               | `nav.js`          | Global (`en`) or JP (`jp`) data mode.                 |
| `umatoolsSiteLanguage`         | `i18n-core.js`    | English (`en`) or Japanese (`jp`) interface language. |
| `umatools.changelog.dismissed` | `changelog.js`    | Last dismissed changelog version.                     |
| `giveaway-banner-dismissed`    | `nav.js`          | Whether the current promotional banner was dismissed. |
| `umafools-off`                 | `nav.js`          | April Fools display opt-out.                          |
| `umatools.tutorial.optimizer`  | `tutorial.js`     | Optimizer tutorial progress and completion.           |
| `umatools.tutorial.calculator` | `tutorial.js`     | Calculator tutorial progress and completion.          |

### Tool state

| Key                             | Owner              | Contents                                                                   |
| ------------------------------- | ------------------ | -------------------------------------------------------------------------- |
| `optimizerState`                | `optimizer.js`     | Active rows, budget, mode, race configuration, targets, and rating inputs. |
| `umatools-saved-builds`         | `optimizer.js`     | Named optimizer build snapshots.                                           |
| `optimizerOfficialEnglishOnly`  | `optimizer.js`     | Optimizer official-English filter.                                         |
| `umatools-calculator`           | `calculator.js`    | Skills, race configuration, rating inputs, and language/filter state.      |
| `calculatorOfficialEnglishOnly` | `calculator.js`    | Calculator official-English filter.                                        |
| `umatools-deck`                 | `deck.js`          | Active character, supports, and limit breaks.                              |
| `umatools-saved-decks`          | `deck.js`          | Named deck snapshots.                                                      |
| `stamina-checker-state`         | `stamina.js`       | Stamina form values and selected unique recoveries.                        |
| `umatools-token-planner-v1`     | `token-planner.js` | Preset, filters, held tokens, and song state.                              |
| `exclude_support_slugs`         | `random.js`        | Support cards excluded from random generation.                             |
| `umasearch-scantime`            | `ocr.js`           | Legacy OCR/video scan interval, read with a 3000 ms fallback.              |

Umadle does not persist guesses. Its optional `target` query parameter selects a target for that page load; without it, the page chooses from the server-filtered character pool.

## Shareable URL state

### Deck Builder

The Deck Builder uses query parameters:

| Parameter | Contents                                                                            |
| --------- | ----------------------------------------------------------------------------------- |
| `c`       | Character ID or slug.                                                               |
| `s`       | Comma-separated support IDs or slugs.                                               |
| `lb`      | Comma-separated limit-break stops, included only when at least one card is not MLB. |

Opening a valid deck URL takes precedence over the browser's active `umatools-deck` state for that load. The shared link does not include named saved decks.

### Skill Optimizer

The optimizer writes compact state to the URL fragment. Its short parameter names are:

| Parameter | Contents                                                          |
| --------- | ----------------------------------------------------------------- |
| `b`       | Compressed/encoded skill rows and hint levels.                    |
| `k`       | Skill-point budget.                                               |
| `f`       | Fast Learner enabled.                                             |
| `oe`      | Official-English-only override.                                   |
| `sl`      | Skill/server language override.                                   |
| `m`       | Optimization mode when not the default Rating mode.               |
| `c`       | Ten comma-separated surface, distance, and style aptitude grades. |
| `r`       | URL-encoded rating inputs.                                        |
| `t`       | Comma-separated automatic-build targets.                          |

Long aliases such as `build`, `budget`, `mode`, `cfg`, `rating`, and `targets` remain accepted when reading links. The Deck Builder's **Open in Skill Optimizer** action uses this format to transfer aggregated hint levels and character aptitudes.

### Support Hint Finder

The Hint Finder keeps its active state in the query string:

| Parameter | Contents                             |
| --------- | ------------------------------------ |
| `hints`   | Comma-separated selected hint names. |
| `mode`    | `AND` or `OR`.                       |
| `rar`     | Enabled support rarities, or `none`. |

The page updates the current history entry as filters change, which makes the address bar itself a reproducible link.

### Other query-driven pages

| Route     | Parameter | Purpose                                                                           |
| --------- | --------- | --------------------------------------------------------------------------------- |
| `/events` | `q`       | Runs the event search on load.                                                    |
| `/umadle` | `target`  | Selects a character by normalized label when it exists in the active server pool. |

## Schema-change rules

Treat local values and shared URLs as small public data formats. Users may return with months-old browser state or bookmarks.

When changing one:

1. Prefer stable IDs or slugs over display names.
2. Validate parsed values against current datasets and allowed ranges.
3. Keep missing fields optional so older records still load.
4. Add a versioned key or migration for incompatible local-state changes.
5. Continue accepting old URL aliases when compacting a format.
6. Never place secrets, account tokens, private images, or personal data in either storage or a URL.
7. Test malformed JSON and unknown IDs; loading should fall back safely instead of blocking the page.

## Inspecting and resetting state

For development, browser DevTools exposes these values under **Application > Local Storage**. A single tool can be reset without clearing every preference:

```js
localStorage.removeItem('stamina-checker-state');
location.reload();
```

To inspect a value without changing it:

```js
JSON.parse(localStorage.getItem('umatools-deck') || '{}');
```

Use the UI's Clear or Delete controls when they exist. They preserve unrelated site preferences and make the intended scope clearer than clearing all site data.
