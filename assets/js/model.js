// Pure, DOM-free domain logic: the CAF reference dataset flattened for
// lookup, and the suggestion/scoring rules. Nothing here touches
// localStorage or the page — see storage.js / dom.js for those.
//
// Per-outcome result shape:
//   {
//     checks:   { "<not|partial|achieved>-<index>": true, ... },
//     override: null | 'not' | 'partial' | 'achieved' | 'na',
//     notes:    "free text"
//   }
//
// "checks" records which individual IGP statements the assessor has
// ticked as true for their organisation. From these, a status is
// SUGGESTED for the outcome:
//   - any ticked "Not achieved" indicator  -> suggestion is "Not achieved",
//     no matter what else is ticked (an outcome cannot score higher than
//     its lowest ticked indicator).
//   - otherwise, every "Achieved" indicator ticked -> suggestion "Achieved".
//   - otherwise, any "Achieved"/"Partially achieved" indicator ticked
//     -> suggestion "Partially achieved" (three-column outcomes only).
//   - otherwise -> no suggestion yet ("Not yet assessed").
//
// "override" lets the assessor set the final status by hand instead of
// accepting the suggestion (the CAF is explicit that IGPs support expert
// judgement rather than replace it). When set, override always wins.

export const DATASET = window.CAF_DATASET || [];

export const STATUS_META = {
  not: { label: 'Not achieved' },
  partial: { label: 'Partially achieved' },
  achieved: { label: 'Achieved' },
  na: { label: 'Not applicable' },
  unset: { label: 'Not yet assessed' }
};

// Baseline targets only ever use these three tiers (a target is either
// not expected, partially expected, or fully expected — "not applicable"
// and "not yet assessed" don't make sense as a *target*).
export const BASELINE_TIERS = ['not', 'partial', 'achieved'];

export const allOutcomes = [];
export const outcomesById = {};
DATASET.forEach(function (objective) {
  objective.principles.forEach(function (principle) {
    principle.outcomes.forEach(function (outcome) {
      var entry = { objectiveId: objective.id, principleId: principle.id, outcome: outcome };
      allOutcomes.push(entry);
      outcomesById[outcome.id] = outcome;
    });
  });
});

export function normalizeResult(raw) {
  if (!raw) return { checks: {}, override: null, notes: '' };
  return { checks: raw.checks || {}, override: raw.override || null, notes: raw.notes || '' };
}

export function computeSuggestedStatus(outcome, checks) {
  checks = checks || {};

  var notItems = outcome.not || [];
  for (var i = 0; i < notItems.length; i++) {
    if (checks['not-' + i]) return 'not';
  }

  var achievedItems = outcome.achieved || [];
  var achievedTickedCount = 0;
  for (var j = 0; j < achievedItems.length; j++) {
    if (checks['achieved-' + j]) achievedTickedCount++;
  }
  var allAchievedTicked = achievedItems.length > 0 && achievedTickedCount === achievedItems.length;
  if (allAchievedTicked) return 'achieved';

  var anyPartialTicked = false;
  if (outcome.type === 3) {
    var partialItems = outcome.partial || [];
    for (var k = 0; k < partialItems.length; k++) {
      if (checks['partial-' + k]) { anyPartialTicked = true; break; }
    }
  }

  if (achievedTickedCount > 0 || anyPartialTicked) {
    // Some positive evidence, but not the complete "achieved" set.
    // Only three-column outcomes have a partial tier to suggest.
    return outcome.type === 3 ? 'partial' : null;
  }

  return null; // nothing meaningful ticked yet
}

export function effectiveStatus(outcome, result) {
  return result.override || computeSuggestedStatus(outcome, result.checks);
}

export function scoreFor(entries, results) {
  var applicable = 0;
  var points = 0;
  var counts = { achieved: 0, partial: 0, not: 0, na: 0, unset: 0 };
  entries.forEach(function (entry) {
    var r = normalizeResult(results[entry.outcome.id]);
    var status = effectiveStatus(entry.outcome, r);
    if (status === 'na') { counts.na++; return; }
    applicable++;
    if (status === 'achieved') { points += 1; counts.achieved++; }
    else if (status === 'partial') { points += 0.5; counts.partial++; }
    else if (status === 'not') { counts.not++; }
    else { counts.unset++; }
  });
  return {
    pct: applicable ? Math.round((points / applicable) * 100) : 0,
    counts: counts
  };
}
