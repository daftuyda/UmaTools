# UmaTools Architecture

## Overview

UmaTools is a multi-page static web suite with a small Vercel-hosted Python API. It intentionally avoids a framework runtime: each page loads shared browser modules and its own page controller directly from the deployment root.

The repository separates deployable files from maintenance code:

- `public/` is the complete static website and Vercel output directory.
- `api/` contains serverless FastAPI routes.
- `scripts/audit/` contains repository and browser compatibility checks.
- `scripts/build/` contains deterministic asset and data build steps.
- `scripts/data/` contains external data importers and generators.
- `tests/fixtures/` and `tests/unit/` separate test inputs from executable tests.
- `docs/guides/` and `docs/images/` separate maintained guidance from its diagrams.

## Public application

### Pages

Each `public/*.html` file is an independent entry point. Vercel clean URLs expose `public/optimizer.html` as `/optimizer`, for example. Absolute browser paths such as `/js/nav.js` and `/assets/skills_all.json` are resolved from `public/`.

Keeping page entry points at the top of `public/` makes static hosting, service-worker caching, clean URLs, and local previews predictable.

### Styling

`public/css/air.css` is the canonical stylesheet. It owns:

- design tokens and theme variables;
- shared page shells, navigation, footer, controls, cards, and dialogs;
- responsive and reduced-motion behavior;
- page-specific layouts where a component is unique to one tool.

The previous page-level stylesheets and Tailwind experiment were removed because no page loaded them. New styles should be added to the appropriate layer or clearly labelled page section in `air.css`.

### JavaScript

`public/js/` contains browser code in three broad groups:

- shared infrastructure such as navigation, themes, localization, tutorials, scrolling, skill details, and rating math;
- page controllers such as `optimizer.js`, `deck.js`, and `token-planner.js`;
- focused engines such as Team Trials scoring, OCR matching, and skill scoring.

Pages currently load source modules directly. Generated bundles were removed because no page referenced them. Do not reintroduce checked-in bundles unless the HTML is changed to consume them and the build owns their lifecycle.

### Shared UI rules

- Use the shared `main.container` shell and standard workspace heading.
- Use existing card, button, field, dialog, and race-configuration patterns before adding a new variant.
- Mount blocking dialogs to the viewport and keep their close controls keyboard accessible.
- Mark interactive skill names with `data-skill-name` or `data-skill-id` so the shared detail dialog works consistently.
- Preserve light, dark, OLED, mobile, and reduced-motion behavior.

### Service worker

`public/sw.js` precaches only files that exist in the deployed output. Increment `CACHE_VERSION` whenever a cached HTML, CSS, JavaScript, manifest, or brand asset changes.

## Data flow

Runtime data lives in `public/assets/` and is requested by browser code through `/assets/...` URLs. Important datasets include:

- `skills_all.json` and generated category/core subsets;
- `uma_data.json`;
- `support_card.json` and `support_hints.json`;
- `races.json` and acceleration compatibility data;
- rating badge, character, and support-card images.

Maintenance scripts write to `public/assets/` while keeping browser-facing URLs unchanged. PNG and WebP files with the same stem are intentional: WebP is preferred and PNG remains the compatibility fallback.

The scheduled GameTora workflow refreshes core data and commits changed outputs.
The maintained Node importer is `scripts/data/gametora.js`. The isolated
`scripts/data/gametora-browser.py` Selenium implementation is retained only as a manual fallback
for data, including `career.json`, that the scheduled importer does not currently regenerate.
See `scripts/data/README.md` for ownership and setup details.

## API

`api/[...path].py` provides event endpoints and generated Open Graph images. It reads fonts, icons, and datasets from `public/assets/`. `vercel.json` includes those files with the serverless function and routes `/api/og/:page.png` to the image endpoint.

## Build and validation

The build performs three deterministic checks/transforms:

1. Parse `public/css/air.css` to catch invalid CSS.
2. Split/minify runtime JSON datasets in `public/assets/`.
3. Create missing WebP companions for raster images.

Use `npm run check` for linting, unit tests, data/manifest parsing, markup and static-reference
validation, and route smoke tests. Use
`npm run audit:lighthouse` when reviewing performance or major layout changes, and
`npm run audit:ios` before changes that affect mobile browser behavior. The audit tools serve and
inspect `public/`, not the repository root.

The local audit server negotiates Brotli or gzip so Lighthouse measures the same kind of compressed
transfer the deployment host provides. Set `LIGHTHOUSE_PAGES` to a comma-separated subset of
`skills,hints,optimizer,calculator` for focused iteration.

`npm run test:smoke` starts an ephemeral local server with production-style clean URL resolution,
then requests every HTML entry point and the critical shared assets. It is included in
`npm run check` so broken routes are caught before deployment.

The same check pipeline validates required HTML document metadata, duplicate element IDs, and
every deployed JSON dataset or manifest. This catches malformed generated data and structural
markup errors without requiring a browser session.

## Maintenance rules

1. Keep deployable files under `public/`; keep tooling and documentation outside it.
2. Preserve public routes and absolute asset URLs when reorganizing source files.
3. Do not check in generated JavaScript bundles that are not consumed by pages.
4. Do not delete PNG/WebP pairs solely because their stems match.
5. Update the README and relevant technical document whenever behavior, ownership, data sources, or commands change.
6. Run the build, lint, tests, and a static reference check before merging a structural change.
