#!/usr/bin/env node
// Regenerates assets/data.js (the classic-script global the app loads) from
// assets/data.json (the source of truth — see docs/data-schema.md).
//
// Run this after editing assets/data.json, and commit both files together.
//
// Usage: node tools/build-data.js [--check]
//   --check   Exit non-zero if assets/data.js is out of date instead of
//             overwriting it (useful in CI).

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'assets', 'data.json');
const jsPath = path.join(root, 'assets', 'data.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const output = `window.CAF_DATASET = ${JSON.stringify(data)};\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
  if (current !== output) {
    console.error('assets/data.js is out of date with assets/data.json.');
    console.error('Run: node tools/build-data.js');
    process.exit(1);
  }
  console.log('assets/data.js is up to date.');
  process.exit(0);
}

fs.writeFileSync(jsPath, output);
console.log(`Wrote ${jsPath} (${output.length} bytes) from ${jsonPath}.`);
