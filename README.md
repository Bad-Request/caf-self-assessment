# NCSC CAF Self-Assessment Tool

## What this is

A fully static self-assessment tool for the NCSC Cyber Assessment Framework (CAF) 4.0 — all 4 objectives, 14 principles and 41 contributing outcomes, with the full Indicators of Good Practice (IGP) text for each, ticked off individually with checkboxes that suggest an overall status per outcome.

There is **no server-side component at all**: no PHP, no build step, no database, nothing to install. It's plain HTML/CSS/JS, served as a folder of static files — the app logic is a handful of native ES modules, no bundler required.

It's also an installable Progressive Web App: a service worker caches the app shell after your first visit, so it keeps working offline (or on a flaky connection) after that, and most browsers let you "install" it as a standalone app from the address bar or share menu.

See [CHANGELOG.md](CHANGELOG.md) for release history (this project follows [Semantic Versioning](https://semver.org/)).

## Data handling — important

Every assessment you create — organisation name, ticks, overrides, notes — is saved entirely in your browser's `localStorage`. Baseline profiles (see [Features](#features)) are saved the same way, under their own separate `localStorage` key. This means:

- Assessments and baseline profiles are tied to the browser/device you created them on.
- Clearing browser data for this site/folder will delete them.
- Use **"Export assessment (.json)"** regularly to back up or move an assessment between browsers/devices, and **"Import assessment (.json)"** to load it elsewhere. Baseline profiles have their own **"Export (.json)"** / **"Import baseline (.json)"** controls, separate from the assessment ones, so a baseline can be shared on its own.

## How to run it

Nothing to install, but the app logic loads as native ES modules, which browsers only allow over `http(s)://` — **opening `index.html` directly via a `file://` URL will not work** (module imports are blocked from the local filesystem). Serve the folder instead:

1. Any static file server, e.g.:
   ```
   python3 -m http.server 8000
   ```
   then open http://localhost:8000, or
2. Upload the whole folder to any static host — GitHub Pages, S3, a shared network drive, an internal web server, whatever you've already got. There is no database and no write access required on the server; it never needs to run any server-side code.

## File layout

| File | Purpose |
|---|---|
| `index.html` | The app shell. |
| `manifest.webmanifest` | Web app manifest (name, icons, colours) that makes the app installable. |
| `sw.js` | Service worker — caches the app shell on first visit so the app works offline afterwards. Bump `CACHE_VERSION` inside it whenever a cached file's contents change. |
| `assets/icons/` | App icons for the manifest/home screen, generated from the header's hexagon brand mark. |
| `assets/data.json` | Source of truth for the full CAF 4.0 dataset (read-only reference content, Crown copyright / OGL v3.0). See [docs/data-schema.md](docs/data-schema.md). Edit this, not `data.js`. |
| `assets/data.js` | Generated from `assets/data.json` by `tools/build-data.js` — a plain JS variable, `window.CAF_DATASET`. Loaded as a classic script, before the module entry point. |
| `docs/data-schema.md` | Documents the `assets/data.json` structure and the invariants a reviewer should check after any update. |
| `tools/build-data.js` | Regenerates `assets/data.js` from `assets/data.json`. Run after every edit to the dataset. |
| `tools/extract_caf_pdf.py` | Extracts a draft `data.json` from a CAF PDF, for updating the dataset when NCSC publish a revision. |
| `assets/style.css` | Styling. |
| `assets/js/app.js` | Entry point (`<script type="module">`) — wires the other modules together and handles the cross-cutting UI (new/delete assessment, JSON import/export, print). |
| `assets/js/model.js` | Pure domain logic: the flattened CAF dataset, the IGP-tick → suggested-status rules, and scoring. No DOM, no storage. |
| `assets/js/storage.js` | `localStorage` read/write for assessments and baseline profiles. |
| `assets/js/assessments.js` | Assessment records: in-memory list, the current selection, and the sidebar list of saved assessments. |
| `assets/js/baselines.js` | Baseline profiles: CRUD, the edit modal, and the borders/badges/legend they project onto the framework and outcome grid. |
| `assets/js/framework.js` | Builds the objective/principle/outcome-card tree and the outcome grid, and applies per-outcome state to them. |
| `assets/js/dashboard.js` | The score ring, status counts and per-objective bars. |
| `assets/js/ui-shell.js` | Chrome with no domain knowledge: toast, the generic confirm dialog, sidebar collapse/drawer behaviour, theme and text-size preferences. |
| `assets/js/dom.js` | The single set of DOM element references shared by every module. |
| `assets/js/utils.js` | `uid`/`nowIso`/`debounce` — small helpers with no dependencies. |
| `assets/js/download.js` | Shared "save an object as a downloaded `.json` file" helper (used by both assessment and baseline export). |

## Features

- Multiple named, saved assessments (e.g. one per organisation/date).
- A checkbox against every individual Indicator of Good Practice (IGP) — tick the ones that genuinely describe your organisation.
- An automatically **suggested** status per contributing outcome, worked out from those ticks (see [How suggestions work](#how-suggestions-work) below), which you can override by hand at any time.
- Notes/evidence field per outcome.
- Dashboard: overall % score, per-objective breakdown, and an "outcome grid" — one dot per contributing outcome, colour-coded by status, click a dot to jump straight to that outcome.
- **Baseline profiles**: since a CAF assessment is often measured against an agreed baseline rather than "fully achieved" everywhere, you can set a target level (Not achieved / Partially achieved / Achieved) for each of the 41 individual contributing outcomes (e.g. `A1.a`, `C1.d`) — not just per principle, since a baseline can reasonably expect more of one outcome within a principle than another.
  - Baseline profiles are standalone and reusable — create one and apply it to any number of assessments — and are exported/imported as their own separate `.json` files so a baseline can be shared or reused independently of any assessment.
  - Each outcome dot in the grid gets a coloured **border** matching its own baseline target (red/amber/green, matching the fill colours used for actual status), while the dot's own **fill** colour continues to show the outcome's actual current status.
  - The target is also shown inline as you work through the assessment: each outcome card gets a small "Target: …" badge next to its status badge, and each principle's header shows a summary row of chips for all of its outcomes' targets, so the baseline stays visible without scrolling back up to the dashboard.
- Export/import assessments as JSON.
- Print / save as PDF (use your browser's print dialog).

## How suggestions work

Tick the IGP statements that apply to your organisation for each outcome. The suggested status is then:

- Tick even **one** "Not achieved" indicator → suggestion is **Not achieved**, whatever else is ticked. An outcome can never be suggested at a higher level than its lowest ticked indicator.
- Otherwise, tick **every** "Achieved" indicator → suggestion is **Achieved**.
- Otherwise, ticking some (but not all) achieved indicators, or any "Partially achieved" indicator, suggests **Partially achieved** (only on outcomes that have a partial tier — a few outcomes are Not achieved/Achieved only, per the CAF's own document).
- Nothing meaningful ticked yet → **Not yet assessed**.

You can override the suggestion at any time using the small buttons beside each outcome (click the same one again to clear the override and go back to the suggestion). This is deliberate: the CAF document itself says IGPs are "intended to help inform expert judgement", not "a checklist to be used in an inflexible assessment process" — so the tool suggests, but the assessor always has the final say. Overridden outcomes are marked "· manual" in their status badge so it's clear when a human has stepped in.

## A note on scoring

The percentage score gives Achieved = 1 point, Partially achieved = 0.5, Not achieved = 0 (using whichever status is currently in effect — suggested or overridden). Outcomes marked "Not applicable" are excluded from the denominator. This is a simple indicative score only — a cyber oversight body/regulator may define a specific CAF profile or target level that this percentage does not reflect. Treat it as a useful at-a-glance indicator, not a compliance verdict.

## Updating the reference data

`assets/data.json` is the source of truth for the CAF reference content (objectives, principles, contributing outcomes, IGPs) — its structure is documented in [docs/data-schema.md](docs/data-schema.md). `assets/data.js` (the `window.CAF_DATASET` global the app actually loads) is generated from it and must never be hand-edited directly.

After editing `assets/data.json`, regenerate `assets/data.js` and commit both files together:

```
node tools/build-data.js
```

If NCSC publish a revised CAF version, use `tools/extract_caf_pdf.py` to pull a fresh draft out of the new PDF rather than re-transcribing it by hand — see the tool's own `--help` and header comment for how it works and its known limitations:

```
pip install pymupdf
python3 tools/extract_caf_pdf.py extract path/to/new-caf.pdf \
  --merge-from assets/data.json -o assets/data.new.json
python3 tools/extract_caf_pdf.py validate assets/data.new.json
git diff --no-index assets/data.json assets/data.new.json   # review every change by hand
```

The extraction is a best-effort table-reconstruction over the PDF's text layout, not a guaranteed-correct import — `validate` only catches a handful of known defect patterns (unsplit Partially/Achieved columns, duplicate or suspiciously short bullets). Always read the full diff against the previous `assets/data.json` before replacing it, paying particular attention to outcomes whose IGPs fall right at a page break, since that's where the extraction is most likely to misplace a bullet.
