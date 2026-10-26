#!/usr/bin/env node
// Checks assets/plain-english.json (the unofficial plain-English IGP
// summaries — see docs/data-schema.md) against assets/data.json.
//
// Dev-only maintenance utility — nothing here ships to the browser.
//
// Usage:
//   node tools/check_plain_english.mjs           check, and report coverage
//   node tools/check_plain_english.mjs stub A1.a print a skeleton entry for
//                                                one outcome, with `src`
//                                                fingerprints filled in
//
// The check fails (exit 1) on anything the app would silently hide or
// mis-show: an outcome/column/index that doesn't exist in data.json, a
// `src` that no longer matches the official wording (NCSC revised the
// IGP — re-read it and rewrite the summary, don't just update `src`), or
// an empty summary. Over-long summaries and missing ones are only
// reported, since coverage is allowed to be partial.

import fs from 'node:fs';
import { fingerprint } from '../assets/js/utils.js';

// Summaries aim for about 20 words but may run longer where that's clearer;
// past this they've probably stopped being a summary.
const MAX_WORDS = 30;
const COLUMNS = ['not', 'partial', 'achieved'];

const readJson = (file) => JSON.parse(fs.readFileSync(new URL('../assets/' + file, import.meta.url), 'utf8'));
const dataset = readJson('data.json');

const outcomes = {};
for (const objective of dataset) {
  for (const principle of objective.principles) {
    for (const outcome of principle.outcomes) outcomes[outcome.id] = outcome;
  }
}

const [command, arg] = process.argv.slice(2);

if (command === 'stub') {
  const outcome = outcomes[arg];
  if (!outcome) {
    console.error('check_plain_english: no outcome "' + arg + '" in data.json');
    process.exit(1);
  }
  const stub = {};
  for (const key of COLUMNS) {
    if (outcome[key]) stub[key] = outcome[key].map((text) => ({ src: fingerprint(text), text: '' }));
  }
  console.log(JSON.stringify({ [arg]: stub }, null, 2));
  process.exit(0);
} else if (command) {
  console.error('check_plain_english: unknown command "' + command + '"');
  process.exit(1);
}

const plain = readJson('plain-english.json');
const errors = [];
const warnings = [];

for (const [outcomeId, columns] of Object.entries(plain)) {
  const outcome = outcomes[outcomeId];
  if (!outcome) { errors.push(outcomeId + ': no such outcome in data.json'); continue; }
  for (const [key, entries] of Object.entries(columns)) {
    const official = COLUMNS.includes(key) ? outcome[key] : undefined;
    if (!official) { errors.push(outcomeId + '.' + key + ': no such column on this outcome'); continue; }
    if (entries.length > official.length) {
      errors.push(outcomeId + '.' + key + ': ' + entries.length + ' entries but only ' + official.length + ' IGPs');
    }
    entries.forEach((entry, i) => {
      const where = outcomeId + '.' + key + '[' + i + ']';
      if (!entry) return; // null keeps later entries' indexes aligned
      if (i < official.length && entry.src !== fingerprint(official[i])) {
        errors.push(where + ': stale — official wording changed; rewrite against "' + official[i] + '"');
      }
      if (!entry.text || !entry.text.trim()) {
        errors.push(where + ': empty summary');
      } else if (entry.text.trim().split(/\s+/).length > MAX_WORDS) {
        warnings.push(where + ': over ' + MAX_WORDS + ' words');
      }
    });
  }
}

// Coverage, per objective.
for (const objective of dataset) {
  let total = 0;
  let done = 0;
  for (const principle of objective.principles) {
    for (const outcome of principle.outcomes) {
      for (const key of COLUMNS) {
        (outcome[key] || []).forEach((text, i) => {
          total++;
          const entry = ((plain[outcome.id] || {})[key] || [])[i];
          if (entry && entry.text && entry.src === fingerprint(text)) done++;
        });
      }
    }
  }
  console.log('Objective ' + objective.id + ': ' + done + '/' + total + ' IGPs have a plain-English summary');
}

warnings.forEach((w) => console.warn('warning: ' + w));
errors.forEach((e) => console.error('error: ' + e));
process.exit(errors.length ? 1 : 0);
