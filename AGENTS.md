# Notes for AI agents working on this repo

This is a fully static app (see README.md) that follows Semantic Versioning
with a hand-maintained `CHANGELOG.md` and a version string shown in the UI.
Both are easy to forget mid-task — check this list before opening a PR.

## Every change that a user of the app would notice

- [ ] Bump the version in **both** places — they must match:
  - `CHANGELOG.md` — add a new `## [x.y.z] - YYYY-MM-DD` section at the top
    (above the previous latest release), following [Keep a
    Changelog](https://keepachangelog.com/en/1.1.0/): `Added` / `Changed` /
    `Fixed` / `Removed` subsections, newest first.
  - `index.html` — the `<p class="version-tag">vX.Y.Z</p>` line.
- [ ] Pick the version bump by semver: breaking change (e.g. the app no
  longer works the way it used to, a stored data format changes
  incompatibly) → major; new capability or non-breaking behaviour change →
  minor; bug fix only → patch.
- [ ] A pure refactor with zero observable difference (rename a variable,
  reformat) doesn't need a version bump or changelog entry. When in doubt —
  e.g. it changed what ships even if the UI looks the same — bump it.

## Editing the CAF reference dataset

- [ ] Never hand-edit `assets/data.js` — edit `assets/data.json` (schema in
  `docs/data-schema.md`) and regenerate with `node tools/build-data.js`.
  Commit both files in the same commit.
- [ ] `node tools/build-data.js --check` should pass before committing.
- [ ] If re-extracting from a new CAF PDF via `tools/extract_caf_pdf.py`,
  hand-review the full diff against the previous `data.json` — the tool's
  own docstring lists its known failure modes (page-break splits, dropped
  glyphs). Don't trust it silently.

## General

- [ ] This app has no build step for its own runtime code (`assets/js/`) —
  don't introduce one. `tools/` scripts are dev-only maintenance utilities,
  not part of what ships to the browser, so it's fine for them to have
  their own dependencies (e.g. `tools/extract_caf_pdf.py` needs PyMuPDF).
- [ ] The app must be served over `http(s)://`, not opened via `file://`
  (native ES module imports are blocked from the filesystem). Don't "fix"
  this by reintroducing a bundler or reverting to non-module scripts.
