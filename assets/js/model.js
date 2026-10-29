// Pure, DOM-free domain logic: the CAF reference dataset flattened for
// lookup, and the suggestion/scoring rules. Nothing here touches
// localStorage or the page — see storage.js / dom.js for those.
//
// Per-outcome result shape:
//   {
//     checks:   { "<not|partial|achieved>-<index>": true, ... },
//     override: null | 'not' | 'partial' | 'achieved' | 'na',
//     notes:    "free text",
//     progress: null | 'wip' | 'review',
//     question: true | false
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
//
// "progress" and "question" are review flags for managing the work, and
// never affect the suggested status or the score. "progress" is a single
// value because an outcome can't be both still in progress and ready for
// review; "question" can be set alongside either.

import { fingerprint } from './utils.js';

function fetchJson(file) {
  return fetch(new URL('../' + file, import.meta.url)).then(function (r) {
    if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
    return r.json();
  });
}

// The plain-English summaries are optional extra help — if they fail to
// load, the app still works with just the official wording.
const [dataset, plainEnglish] = await Promise.all([
  fetchJson('data.json'),
  fetchJson('plain-english.json').catch(function () { return {}; })
]);

export const DATASET = dataset;

export const STATUS_LABEL = {
  not: 'Not achieved',
  partial: 'Partially achieved',
  achieved: 'Achieved',
  na: 'Not applicable',
  unset: 'Not yet assessed'
};

// Baseline targets only ever use these three tiers (a target is either
// not expected, partially expected, or fully expected — "not applicable"
// and "not yet assessed" don't make sense as a *target*).
export const BASELINE_TIERS = ['not', 'partial', 'achieved'];

export const FLAG_LABEL = {
  wip: 'In progress',
  review: 'Ready for review',
  question: 'Question'
};
export const FLAG_KEYS = ['wip', 'review', 'question'];

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

// The unofficial plain-English summary of one IGP, or null if there isn't
// one. A summary written for different wording (NCSC have since revised
// that IGP) is treated as missing rather than shown against the new text.
export function plainEnglishFor(outcomeId, key, idx, officialText) {
  var entry = ((plainEnglish[outcomeId] || {})[key] || [])[idx];
  if (!entry || entry.src !== fingerprint(officialText)) return null;
  return entry.text;
}

export function normalizeResult(raw) {
  if (!raw) return { checks: {}, override: null, notes: '', progress: null, question: false };
  return {
    checks: raw.checks || {},
    override: raw.override || null,
    notes: raw.notes || '',
    progress: (raw.progress === 'wip' || raw.progress === 'review') ? raw.progress : null,
    question: raw.question === true
  };
}

// The flag keys ('wip', 'review', 'question') set on one result.
export function flagsOf(result) {
  var flags = [];
  if (result.progress) flags.push(result.progress);
  if (result.question) flags.push('question');
  return flags;
}

// Outcome IDs carrying each flag, in framework order.
export function flaggedOutcomes(entries, results) {
  var flagged = { wip: [], review: [], question: [] };
  entries.forEach(function (entry) {
    flagsOf(normalizeResult(results[entry.outcome.id])).forEach(function (flag) {
      flagged[flag].push(entry.outcome.id);
    });
  });
  return flagged;
}

function computeSuggestedStatus(outcome, checks) {
  checks = checks || {};
  function ticked(key) { return function (_, i) { return checks[key + '-' + i]; }; }
  var achieved = outcome.achieved || [];

  if ((outcome.not || []).some(ticked('not'))) return 'not';
  if (achieved.length && achieved.every(ticked('achieved'))) return 'achieved';
  // Some positive evidence, but not the complete "achieved" set. Only
  // three-column outcomes have a partial tier to suggest.
  if (outcome.type === 3 && (achieved.some(ticked('achieved')) || (outcome.partial || []).some(ticked('partial')))) {
    return 'partial';
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
