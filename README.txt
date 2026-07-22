NCSC CAF Self-Assessment Tool (static edition)
===============================================

WHAT THIS IS
A fully static self-assessment tool for the NCSC Cyber Assessment
Framework (CAF) 4.0 — all 4 objectives, 14 principles and 41
contributing outcomes, with the full Indicators of Good Practice
(IGP) text for each, ticked off individually with checkboxes that
suggest an overall status per outcome.

There is NO server-side component at all: no PHP, no build step, no
database, nothing to install. Just three plain files plus a folder of
assets.

DATA HANDLING — IMPORTANT
Every assessment you create — organisation name, ticks, overrides,
notes — is saved entirely in your browser's localStorage. Baseline
profiles (see FEATURES) are saved the same way, under their own
separate localStorage key. This means:
  - Assessments and baseline profiles are tied to the browser/device
    you created them on.
  - Clearing browser data for this site/folder will delete them.
  - Use "Export assessment (.json)" regularly to back up or move an
    assessment between browsers/devices, and "Import assessment
    (.json)" to load it elsewhere. Baseline profiles have their own
    "Export (.json)" / "Import baseline (.json)" controls, separate
    from the assessment ones, so a baseline can be shared on its own.

HOW TO RUN IT
Genuinely nothing to install. Either:
  1. Double-click index.html to open it directly in your browser, or
  2. Serve the folder with any static file server, e.g.:
       python3 -m http.server 8000
     then open http://localhost:8000, or
  3. Upload the whole folder to any static host — GitHub Pages, S3,
     a shared network drive, an internal web server, whatever you've
     already got. There is no database and no write access required
     on the server; it never needs to run any server-side code.

FILE LAYOUT
    index.html          The app shell.
    assets/data.js       The full CAF 4.0 dataset (read-only reference
                         content, Crown copyright / OGL v3.0) as a
                         plain JS variable — window.CAF_DATASET.
    assets/style.css     Styling.
    assets/app.js        All app logic: localStorage-backed assessment
                         management, rendering, scoring, JSON
                         import/export, print support.

FEATURES
  - Multiple named, saved assessments (e.g. one per organisation/date).
  - A checkbox against every individual Indicator of Good Practice
    (IGP) — tick the ones that genuinely describe your organisation.
  - An automatically SUGGESTED status per contributing outcome, worked
    out from those ticks (see "How suggestions work" below), which you
    can override by hand at any time.
  - Notes/evidence field per outcome.
  - Dashboard: overall % score, per-objective breakdown, and an
    "outcome grid" — one dot per contributing outcome, colour-coded by
    status, click a dot to jump straight to that outcome.
  - Baseline profiles: since a CAF assessment is often measured against
    an agreed baseline rather than "fully achieved" everywhere, you can
    set a target level (Not achieved / Partially achieved / Achieved)
    for each of the 14 principles. Baseline profiles are standalone and
    reusable — create one and apply it to any number of assessments —
    and are exported/imported as their own separate .json files so a
    baseline can be shared or reused independently of any assessment.
    Each outcome dot in the grid gets a coloured BORDER matching the
    baseline target of its principle (red/amber/green, matching the
    fill colours used for actual status), while the dot's own FILL
    colour continues to show the outcome's actual current status.
  - Export/import assessments as JSON.
  - Print / save as PDF (use your browser's print dialog).

HOW SUGGESTIONS WORK
Tick the IGP statements that apply to your organisation for each
outcome. The suggested status is then:
  - Tick even ONE "Not achieved" indicator -> suggestion is "Not
    achieved", whatever else is ticked. An outcome can never be
    suggested at a higher level than its lowest ticked indicator.
  - Otherwise, tick EVERY "Achieved" indicator -> suggestion is
    "Achieved".
  - Otherwise, ticking some (but not all) achieved indicators, or any
    "Partially achieved" indicator, suggests "Partially achieved"
    (only on outcomes that have a partial tier — a few outcomes are
    Not achieved/Achieved only, per the CAF's own document).
  - Nothing meaningful ticked yet -> "Not yet assessed".

You can override the suggestion at any time using the small buttons
beside each outcome (click the same one again to clear the override
and go back to the suggestion). This is deliberate: the CAF document
itself says IGPs are "intended to help inform expert judgement", not
"a checklist to be used in an inflexible assessment process" — so the
tool suggests, but the assessor always has the final say. Overridden
outcomes are marked "· manual" in their status badge so it's clear
when a human has stepped in.

A NOTE ON SCORING
The percentage score gives Achieved = 1 point, Partially achieved =
0.5, Not achieved = 0 (using whichever status is currently in effect —
suggested or overridden). Outcomes marked "Not applicable" are
excluded from the denominator. This is a simple indicative score only
— a cyber oversight body/regulator may define a specific CAF profile
or target level that this percentage does not reflect. Treat it as a
useful at-a-glance indicator, not a compliance verdict.

UPDATING THE REFERENCE DATA
assets/data.js is generated, not hand-written — it's a straight
JSON dump of the CAF dataset. If NCSC publish a revised CAF version in
future, the tidiest way to update this tool is to regenerate that file
from a maintained source of the dataset, rather than hand-editing the
JSON directly.
