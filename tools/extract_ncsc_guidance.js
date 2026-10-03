#!/usr/bin/env node
// Merges the per-principle "Guidance and references" links from NCSC's
// "Consolidated view of CAF Guidance" page into assets/data.json, as each
// principle's `guidance` field (see docs/data-schema.md).
//
// Dev-only maintenance utility — nothing here ships to the browser.
//
// Usage:
//   1. Save the page's HTML, e.g.
//        curl -sSL -o ncsc.html https://www.ncsc.gov.uk/collection/cyber-assessment-framework/consolidated-view-of-caf-guidance
//   2. node tools/extract_ncsc_guidance.js ncsc.html
//   3. node tools/build-data.js
//   4. Hand-review the diff of assets/data.json before committing.
//
// Deliberately strict: it exits non-zero rather than guess if the page's
// structure changes (an unknown heading, a list item with more than one
// link, a principle id that isn't in data.json, ...). Known quirks it
// handles: relative NCSC hrefs (made absolute), inconsistent heading case
// ("NCSC Guidance" / "NCSC guidance"), and standards listed by name with no
// link (kept as title-only entries — never invent a URL for them).

const fs = require('fs');
const path = require('path');

const NCSC_ORIGIN = 'https://www.ncsc.gov.uk';
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'assets', 'data.json');

function fail(msg) {
  console.error('extract_ncsc_guidance: ' + msg);
  process.exit(1);
}

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
    if (e[0] === '#') {
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    }
    var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (!(e.toLowerCase() in named)) fail('unhandled HTML entity ' + m);
    return named[e.toLowerCase()];
  });
}

// Strip tags, decode entities, normalise whitespace (incl. &nbsp;).
function text(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/[\s ]+/g, ' ').trim();
}

function absoluteUrl(href) {
  href = decodeEntities(href).trim();
  if (/^https?:\/\//i.test(href)) return href;
  return NCSC_ORIGIN + (href[0] === '/' ? '' : '/') + href;
}

function groupKey(heading) {
  if (/^ncsc guidance$/i.test(heading)) return 'ncsc';
  if (/^external resources$/i.test(heading)) return 'external';
  fail('unknown guidance heading "' + heading + '"');
}

// Returns { title } (plain text), { title, url } (the whole item is one
// link), or { title, links: [{ text, url }] } (a sentence with links inside
// it, each `text` appearing in `title` in order).
function parseItem(liHtml, context) {
  var anchors = liHtml.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  var title = text(liHtml);
  if (!title) return null;
  var links = anchors.map(function (a) {
    var href = a.match(/\bhref="([^"]*)"/i);
    if (!href) fail(context + ': link with no href: ' + liHtml);
    return { text: text(a), url: absoluteUrl(href[1]) };
  }).filter(function (l) { return l.text; });
  if (!links.length) return { title: title };
  if (links.length === 1 && links[0].text === title) return { title: title, url: links[0].url };
  var from = 0;
  links.forEach(function (l) {
    var at = title.indexOf(l.text, from);
    if (at === -1) fail(context + ': link text "' + l.text + '" not found in "' + title + '"');
    from = at + l.text.length;
  });
  return { title: title, links: links };
}

function parse(html) {
  var tables = html.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  if (!tables.length) fail('no tables found — has the page layout changed?');

  var result = {};
  var current = null;
  tables.forEach(function (table) {
    (table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).forEach(function (tr) {
      var cells = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
      cells.forEach(function (td) {
        var inner = td.replace(/^<td\b[^>]*>/i, '').replace(/<\/td>$/i, '');
        // A principle-name cell: "<a ...>A1 Governance</a>".
        if (!/<ul\b/i.test(inner)) {
          var m = text(inner).match(/^([A-D]\d)\b/);
          if (!m) fail('unrecognised table cell: ' + text(inner));
          current = m[1];
          if (result[current]) fail('principle ' + current + ' appears twice');
          result[current] = { ncsc: [], external: [] };
          return;
        }
        if (!current) fail('guidance cell before any principle cell');
        // A guidance cell: one or more "<p>Heading</p><ul>...</ul>" groups,
        // possibly with empty spacer paragraphs (<p><br>&nbsp;</p>).
        var key = null;
        var tokens = inner.match(/<p\b[^>]*>[\s\S]*?<\/p>|<ul\b[^>]*>[\s\S]*?<\/ul>/gi) || [];
        tokens.forEach(function (tok) {
          if (/^<p\b/i.test(tok)) {
            var heading = text(tok);
            if (heading) key = groupKey(heading);
            return;
          }
          if (!key) fail(current + ': list with no heading');
          if (/<ul\b/i.test(tok.slice(3))) fail(current + ': nested lists are not handled');
          (tok.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) || []).forEach(function (li) {
            var item = parseItem(li, current);
            if (item) result[current][key].push(item);
          });
        });
      });
    });
  });
  return result;
}

var htmlPath = process.argv[2];
if (!htmlPath) fail('usage: node tools/extract_ncsc_guidance.js <saved-page.html>');

var guidance = parse(fs.readFileSync(htmlPath, 'utf8'));
var data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

var known = [];
data.forEach(function (objective) {
  objective.principles.forEach(function (principle) {
    known.push(principle.id);
    var g = guidance[principle.id];
    if (!g) {
      console.warn('No guidance found for principle ' + principle.id + ' — leaving it unchanged.');
      return;
    }
    var entry = {};
    if (g.ncsc.length) entry.ncsc = g.ncsc;
    if (g.external.length) entry.external = g.external;
    principle.guidance = entry;
    console.log(principle.id + ': ' + g.ncsc.length + ' NCSC, ' + g.external.length + ' external');
  });
});
Object.keys(guidance).forEach(function (id) {
  if (known.indexOf(id) === -1) fail('page lists principle ' + id + ', which is not in data.json');
});

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
console.log('Updated ' + jsonPath + '. Now run: node tools/build-data.js, then review the diff.');
