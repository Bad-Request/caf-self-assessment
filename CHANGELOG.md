# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

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
