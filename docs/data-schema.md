# CAF dataset schema — `assets/data.json`

`assets/data.json` is the source of truth for the NCSC Cyber Assessment
Framework (CAF) reference content shown in the app. It is **not** loaded
directly by the browser — run `node tools/build-data.js` after editing it,
which regenerates `assets/data.js` (the `window.CAF_DATASET` global the app
actually loads). Commit both files together.

## Shape

```
Objective[]
```

### Objective

| Field | Type | Notes |
|---|---|---|
| `id` | string | Single letter: `"A"`, `"B"`, `"C"`, `"D"`. |
| `title` | string | e.g. `"Managing security risk"`. |
| `description` | string | The objective's summary paragraph from the CAF document. |
| `principles` | `Principle[]` | |

### Principle

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `"A1"`, `"B4"`. |
| `title` | string | e.g. `"Governance"`. |
| `description` | string | The principle's summary paragraph. |
| `outcomes` | `Outcome[]` | The principle's contributing outcomes. |
| `ncscUrl` | string | Link to the principle's page on ncsc.gov.uk. |

### Outcome (a "contributing outcome", e.g. `B4.a`)

| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `"B4.a"`. |
| `title` | string | e.g. `"Secure by Design"`. |
| `description` | string | The outcome's "You ..." summary sentence(s). |
| `type` | `2 \| 3` | `2` = two-column table (Not Achieved / Achieved only). `3` = three-column table (Not Achieved / Partially Achieved / Achieved). Determines whether `partial` is present. |
| `not` | `string[]` | Indicators of Good Practice (IGPs) for **Not Achieved**. In the PDF this column is headed "At least one of the following statements is true" — any one of these being true means the outcome is not achieved. |
| `partial` | `string[]` | IGPs for **Partially Achieved**. Only present when `type` is `3`. Headed "All the following statements are true" in the PDF. |
| `achieved` | `string[]` | IGPs for **Achieved**. Headed "All the following statements are true" in the PDF. |

Each IGP string is one bullet/statement, exactly as worded in the CAF PDF,
with whitespace normalised to single spaces and line-wrap hyphenation
rejoined. Do not paraphrase or summarise IGP text — the app relies on the
official wording.

## Invariants a reviewer should check before committing an update

- Every outcome's `not`/`partial`/`achieved` arrays contain **only** bullets
  that belong to that column in the source PDF for that specific outcome —
  the most common defect (see `tools/extract-caf-pdf.py`'s validation
  report) is a bullet bleeding into the neighbouring column, usually because
  the PDF table's row heights differ between columns.
- No outcome should have `partial` and `achieved` arrays containing the same
  set of bullets — this indicates a botched split (both columns still hold
  everything, unsplit).
- No IGP bullet should be an exact duplicate of another bullet in the *same*
  column of the *same* outcome (bullets legitimately repeat verbatim across
  a `partial`→`achieved` pair sometimes — e.g. "Generic, shared, default
  name and built-in accounts have been removed or disabled..." can appear
  in both `partial` and `achieved` for the same outcome in the official
  document — but never twice within one column).
- `type: 2` outcomes must not have a `partial` key at all (omit it, don't
  set `[]`).
- Counts are a useful smoke test but not proof of correctness — always spot
  check wording against the PDF for any outcome the tool flags.
