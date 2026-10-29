# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [2.9.0] - 2026-10-29

### Added

- Contradiction warnings (pilot): if you tick two IGPs that appear to
  contradict each other — for example "access is not limited to the minimum
  necessary" and "access is limited to the minimum necessary" — the outcome
  card shows a warning, and each of the two statements says what it appears
  to contradict. Nothing is blocked or unticked, and the warning doesn't
  change the suggested status or score. Only outcomes A1.a, B2.a and C1.a
  have been reviewed so far. The pairings are this project's own reading
  of the NCSC wording, and warnings are left out of printouts.

## [2.8.0] - 2026-10-29

### Added

- Review flags on each contributing outcome: mark it as **In progress** or
  **Ready for review** (one at a time — choosing one clears the other), and
  separately flag a **Question** for review. Flagged outcomes get a coloured
  stripe on their card, a corner marker on their outcome grid tile, and are
  counted and listed in a new "Flagged for review" panel on the dashboard,
  where selecting an ID jumps to that outcome. Flags are saved and exported
  with the assessment, don't affect the score or suggested status, and are
  left out of printouts.

## [2.7.1] - 2026-10-26

### Fixed

- The main content now fills the full width beside the sidebar on wide
  screens, rather than stopping at a fixed maximum and leaving empty space
  on the right. A right-hand gutter keeps content clear of the back to top
  button on tablet and desktop widths.

## [2.7.0] - 2026-10-26

### Added

- Plain English mode (Appearance → Plain English): shows a short,
  unofficial summary under each Indicator of Good Practice, alongside the
  official NCSC wording, to help with the more densely worded indicators.
  Off by default, remembered per browser, and never printed. Summaries
  cover all 558 indicators.

## [2.6.0] - 2026-10-26

### Added

- Each tile on the dashboard's outcome grid is now labelled with its
  contributing outcome ID (e.g. A1.a), and the grid is laid out with one
  row per objective and a gap between principles. Tiles are larger to fit
  the label.

### Changed

- Achieved and Not applicable tiles on the outcome grid use a slightly
  darker fill in the light theme so their labels stay readable.
- A profile's baseline target now shows as an outer ring around each
  outcome grid tile, separated from the fill by a gap, instead of a border
  inside it. The target is now visible when it matches the tile's status
  colour (e.g. an Achieved outcome with an Achieved target).

### Fixed

- The "Outcome grid" heading, its hint and the profile key were white or
  pale grey on white when printed; they now print in black.

## [2.5.1] - 2026-10-04

### Changed

- The CAF dataset is now fetched directly from `assets/data.json`; the
  generated `assets/data.js` and `tools/build-data.js` are gone, so there
  is no longer a regenerate step after editing the dataset.
- Internal simplification of the app's modules (shared JSON import,
  storage and helper code; `assets/js/download.js` folded into
  `utils.js`). App behaviour is unchanged.

## [2.5.0] - 2026-10-03

### Added

- Each principle now has a collapsible "Guidance & references" section
  listing the NCSC guidance and external resources (standards, NPSA,
  RITICS, NIST, etc.) from NCSC's Consolidated view of CAF Guidance
  (issue #19). It is collapsed by default and left out of printouts.
- `tools/extract_ncsc_guidance.js`, a dev-only script that refreshes these
  links from a saved copy of the NCSC page.

### Changed

- `tools/extract_caf_pdf.py --merge-from` now carries each principle's
  `guidance` over from the existing dataset, alongside `ncscUrl`.

## [2.4.0] - 2026-08-10

### Changed

- Renamed "Baseline Profiles" to "Profiles" throughout the UI, exported
  filenames, and documentation (issue #22).
- The sidebar footer (reference note, version, GitHub link) now flows with
  the rest of the sidebar content instead of being anchored to the bottom,
  where it was easy to miss (issue #21).
- Increased the default text size slightly, from 15px to 16px (with the
  "Large"/"Larger" options shifting up to match, 18px/20px) (issue #20).

## [2.3.1] - 2026-07-23

### Fixed

- Outcome grid boxes now retain their status fill color when printed.
  Previously browsers stripped the background color by default, leaving
  only the baseline target outline visible on the printed page.

## [2.3.0] - 2026-07-23

### Added

- A "back to top" button that appears once you've scrolled down the page
  (e.g. through a long outcome/framework list) and smooth-scrolls back to
  the top on select. Hidden when printing.

## [2.2.0] - 2026-07-23

### Added

- Converted the app into an installable Progressive Web App: a web app
  manifest and app icons so it can be added to the home screen / installed
  as a standalone app, and a service worker that caches the app shell
  (HTML, CSS, JS, dataset, icons) so it keeps working offline after the
  first visit. Since everything already runs client-side with data in
  `localStorage`, this makes no difference to how assessments are stored —
  it only removes the need for a live network connection to load the app.

## [2.1.0] - 2026-07-23

### Fixed

- Several outcomes had Indicators of Good Practice (IGPs) misclassified
  between the Partially Achieved and Achieved columns — bullets that
  belong to Achieved were sitting in Partially Achieved (or, for one
  outcome, duplicated across both). Affected outcomes: `B4.a`, `B4.b`,
  `B6.b`, `B3.e`, `B5.a`, `C1.f`, `D1.a`. Found and corrected by
  cross-referencing every outcome's IGPs against the official CAF 4.0 PDF.

### Changed

- `assets/data.js` is no longer hand-edited directly. The CAF reference
  dataset now lives in `assets/data.json` (schema documented in
  `docs/data-schema.md`), with `assets/data.js` generated from it via
  `tools/build-data.js`. App behaviour is unchanged.

### Added

- `tools/extract_caf_pdf.py`, which rebuilds a draft `data.json` from a CAF
  PDF (using positioned text blocks clustered by column, to correctly
  reconstruct the Not/Partially/Achieved table columns), plus a `validate`
  subcommand that flags known defect patterns. Intended for updating the
  dataset when NCSC publish a future CAF revision.

## [2.0.0] - 2026-07-23

### Changed

- **Breaking:** app logic now loads as native ES modules (`assets/js/`),
  which browsers only load over `http(s)://`. Opening `index.html` directly
  via a `file://` URL — previously documented as a supported way to run the
  tool — no longer works; the app must be served, e.g. with
  `python3 -m http.server`, or hosted on any static host.
- Split the single `assets/app.js` script into focused modules: `model`,
  `storage`, `dom`, `ui-shell`, `assessments`, `baselines`, `framework`,
  `dashboard`, `utils`, `download`, and an `app.js` entry point that wires
  them together.
- Consolidated three separate ad-hoc debounce implementations (outcome
  notes, baseline name, assessment name/org/assessor) into one shared
  `debounce()` helper at a consistent 300ms delay.
- De-duplicated the assessment/baseline JSON "download as file" logic into
  one shared helper.

### Fixed

- Typing a note on an outcome, then switching to a different saved
  assessment before the notes field's debounce window elapsed, could write
  the note into the newly-selected assessment instead of the one being
  edited. Notes now apply to the in-memory assessment immediately on every
  keystroke; only the persistence step is debounced.

### Removed

- Migration code for two early, never-widely-used data formats: baseline
  targets keyed by principle id instead of by individual outcome id, and a
  plain `status` field on results predating the per-outcome checkbox model.

## [1.3.0] and earlier

Released prior to this changelog being introduced. See the git history for
details of individual changes.
