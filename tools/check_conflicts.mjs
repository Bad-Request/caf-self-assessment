#!/usr/bin/env node
// Checks assets/conflicts.json (pairs of IGPs that appear to contradict
// each other — see docs/data-schema.md) against assets/data.json.
//
// Dev-only maintenance utility — nothing here ships to the browser.
//
// Usage:
//   node tools/check_conflicts.mjs           check, and report coverage
//   node tools/check_conflicts.mjs list A1.a print one outcome's check keys,
//                                            fingerprints and wording, for
//                                            writing new pairs
//
// The check fails (exit 1) on anything the app would silently ignore or
// mis-apply: an outcome or check key that doesn't exist in data.json, a
// `src` that no longer matches the official wording (NCSC revised the
// IGP — re-judge the pair against the new text, don't just update `src`),
// a pair of an IGP with itself or within one column, a duplicate pair, or
// a missing `why`.

import fs from 'node:fs';
import { fingerprint } from '../assets/js/utils.js';

const COLUMNS = ['not', 'partial', 'achieved'];

const readJson = (file) => JSON.parse(fs.readFileSync(new URL('../assets/' + file, import.meta.url), 'utf8'));
const dataset = readJson('data.json');

const outcomes = {};
for (const objective of dataset) {
  for (const principle of objective.principles) {
    for (const outcome of principle.outcomes) outcomes[outcome.id] = outcome;
  }
}

const igpText = (outcome, key) => {
  const match = /^(not|partial|achieved)-(\d+)$/.exec(key);
  return match ? (outcome[match[1]] || [])[Number(match[2])] : undefined;
};

const [command, arg] = process.argv.slice(2);

if (command === 'list') {
  const outcome = outcomes[arg];
  if (!outcome) {
    console.error('check_conflicts: no outcome "' + arg + '" in data.json');
    process.exit(1);
  }
  for (const key of COLUMNS) {
    (outcome[key] || []).forEach((text, i) => console.log(key + '-' + i + '\t' + fingerprint(text) + '\t' + text));
  }
  process.exit(0);
} else if (command) {
  console.error('check_conflicts: unknown command "' + command + '"');
  process.exit(1);
}

const conflicts = readJson('conflicts.json');
const errors = [];

for (const [outcomeId, entries] of Object.entries(conflicts)) {
  const outcome = outcomes[outcomeId];
  if (!outcome) { errors.push(outcomeId + ': no such outcome in data.json'); continue; }
  const seen = new Set();
  entries.forEach((entry, i) => {
    const where = outcomeId + '[' + i + ']';
    const pair = entry.pair || [];
    const src = entry.src || [];
    if (pair.length !== 2 || src.length !== 2) { errors.push(where + ': needs two `pair` keys and two `src` fingerprints'); return; }
    pair.forEach((key, j) => {
      const text = igpText(outcome, key);
      if (text === undefined) errors.push(where + ': no IGP "' + key + '" on this outcome');
      else if (src[j] !== fingerprint(text)) errors.push(where + ': stale — "' + key + '" wording changed; re-judge against "' + text + '"');
    });
    if (pair[0].split('-')[0] === pair[1].split('-')[0]) errors.push(where + ': both IGPs are in the same column');
    const id = [...pair].sort().join(' ');
    if (seen.has(id)) errors.push(where + ': duplicate pair ' + id);
    seen.add(id);
    if (!entry.why || !entry.why.trim()) errors.push(where + ': missing `why`');
  });
}

const covered = Object.keys(conflicts).filter((id) => outcomes[id]).length;
console.log(covered + '/' + Object.keys(outcomes).length + ' outcomes have been reviewed for conflicting IGPs');

errors.forEach((e) => console.error('error: ' + e));
process.exit(errors.length ? 1 : 0);
