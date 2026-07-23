#!/usr/bin/env python3
"""Extract the NCSC CAF dataset (objectives / principles / outcomes / IGPs)
from the official CAF PDF into the assets/data.json schema documented in
docs/data-schema.md.

Why this exists: naive linear PDF text extraction (pdftotext, PyPDF2, etc.)
reads the CAF's per-outcome tables in the wrong order, because each outcome
is laid out as a 2- or 3-column table (Not Achieved / [Partially Achieved] /
Achieved) and linear extraction interleaves rows across columns. This script
instead reads PyMuPDF's positioned text *blocks* and buckets them by column
(x-position) before reconstructing each column's bullets in top-to-bottom
order, which is what actually recovers the table structure correctly.

This is a best-effort extraction tool, not a black box you can trust blindly.
Known limitations, from validating a full pass against the CAF 4.0 PDF:
  - Page-break splits: when a table row's cell spans a page boundary, the
    continuation sometimes lands in the wrong outcome's range if the split
    falls exactly on an outcome/principle boundary. The `validate` command's
    duplicate/fragment checks catch most of these, but always diff the
    output against the previous dataset for any outcome near a page break.
  - Some accented/curly-quote glyphs (', ') are dropped by the PDF's font
    encoding on extraction. Compare against the previous release's wording
    rather than assuming a dropped apostrophe is a real change.
  - `ncscUrl` (the per-principle link to ncsc.gov.uk) is not present in the
    PDF at all — pass --merge-from to carry it over from an existing
    data.json, and fill in any new principles by hand.

Usage:
    python3 tools/extract_caf_pdf.py extract <path-to-caf.pdf> \\
        --merge-from assets/data.json -o assets/data.new.json

    python3 tools/extract_caf_pdf.py validate assets/data.new.json

Then hand-review the diff between assets/data.json and assets/data.new.json
(e.g. `git diff --no-index assets/data.json assets/data.new.json`) before
replacing assets/data.json and running `node tools/build-data.js`.
"""
import argparse
import json
import re
import sys
from collections import defaultdict

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "This tool needs PyMuPDF. Install it with: pip install pymupdf"
    )

OUTCOME_RE = re.compile(r'^([A-D]\d\.[a-z])\.?\s+(.*)$')
PRINCIPLE_RE = re.compile(r'^Principle ([A-D]\d)\s+(.*)$')
OBJECTIVE_RE = re.compile(
    r'^CAF - Objective ([A-D])\s*[-–]\s*(.*)$'
)
FRAGMENTS = {
    'statements is true', 'statements are true', 'statement is true',
    'are true', 'true', 'is true', 'statement true',
}


def extract_blocks(pdf_path):
    doc = fitz.open(pdf_path)
    blocks = []
    for pno in range(len(doc)):
        for b in doc[pno].get_text('blocks'):
            x0, y0, x1, y1, text, *_ = b
            text = text.strip()
            if text:
                blocks.append(
                    {'page': pno, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'text': text}
                )
    return blocks


def is_subheader_or_noise(text):
    t = text.strip()
    tn = re.sub(r'\s+', ' ', t).lower().rstrip('.')
    if re.fullmatch(r'\d+', t):
        return True
    if 'National Cyber Security Centre' in t:
        return True
    if re.match(r'^(At least one of the following|All the following|'
                r'All of the following|Any of the following)', t):
        return True
    if re.match(r'^Principle [A-D]\d', t):
        return True
    if re.match(r'^CAF - Objective', t):
        return True
    if 'Crown copyright' in t:
        return True
    if tn in FRAGMENTS:
        return True
    return False


def build_outcome(blocks, start_idx, end_idx):
    """Given the block range strictly between one outcome header and the
    next, split into not/partial/achieved bullet lists."""
    sec_blocks = blocks[start_idx:end_idx]
    ca_idx = None
    for j, b in enumerate(sec_blocks):
        if b['text'].strip().startswith('Not Achieved'):
            ca_idx = j
            break
    body_src = sec_blocks[ca_idx + 1:] if ca_idx is not None else sec_blocks
    body = []
    for b in body_src:
        if is_subheader_or_noise(b['text']):
            continue
        # Full-width paragraphs after the column-header row are stray
        # objective/principle description text bleeding in from a divider
        # page, not a table cell (real cells are one column wide).
        if (b['x1'] - b['x0']) > 300 and b['x0'] < 55:
            continue
        body.append(b)

    xs = sorted(set(round(b['x0'] / 10) * 10 for b in body))
    clusters = []
    for x in xs:
        if clusters and x - clusters[-1][-1] <= 15:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    centers = [sum(c) / len(c) for c in clusters]

    def col_of(x):
        return min(range(len(centers)), key=lambda i: abs(centers[i] - x))

    cols = defaultdict(list)
    for b in body:
        cols[col_of(b['x0'])].append(b)

    col_bullets = {}
    for c, bl in cols.items():
        bl.sort(key=lambda b: (b['page'], b['y0']))
        bullets = []
        for b in bl:
            t = re.sub(r'\s+', ' ', b['text'].strip())
            if bullets and (t[0].islower() or t[0] in ')('):
                bullets[-1] = bullets[-1] + ' ' + t
            else:
                bullets.append(t)
        col_bullets[c] = bullets

    labels = ['not', 'achieved'] if len(centers) == 2 else ['not', 'partial', 'achieved']
    return {label: col_bullets.get(i, []) for i, label in enumerate(labels)}, len(centers)


def extract(pdf_path):
    blocks = extract_blocks(pdf_path)

    # Locate every objective divider, principle header, and outcome header
    # in document order, tagged with its block index.
    markers = []
    for i, b in enumerate(blocks):
        first_line = b['text'].splitlines()[0].strip()
        m = OBJECTIVE_RE.match(first_line)
        if m:
            markers.append(('objective', i, m.group(1), m.group(2).strip(), b))
            continue
        m = PRINCIPLE_RE.match(first_line)
        if m:
            markers.append(('principle', i, m.group(1), m.group(2).strip(), b))
            continue
        m = OUTCOME_RE.match(first_line)
        if m:
            markers.append(('outcome', i, m.group(1), m.group(2).strip(), b))

    objectives = {}
    obj_order = []
    principles = {}
    principle_order = defaultdict(list)

    for idx, (kind, i, oid, title, b) in enumerate(markers):
        if kind == 'objective':
            desc = ''
            # description is the next block(s) before the next marker
            next_i = markers[idx + 1][1] if idx + 1 < len(markers) else len(blocks)
            for nb in blocks[i + 1:next_i]:
                if is_subheader_or_noise(nb['text']):
                    continue
                if PRINCIPLE_RE.match(nb['text'].splitlines()[0]):
                    break
                desc = (desc + ' ' + nb['text']).strip()
                break
            objectives[oid] = {'id': oid, 'title': title, 'description': re.sub(r'\s+', ' ', desc), 'principles': []}
            obj_order.append(oid)
        elif kind == 'principle':
            desc = ''
            next_i = markers[idx + 1][1] if idx + 1 < len(markers) else len(blocks)
            for nb in blocks[i + 1:next_i]:
                if is_subheader_or_noise(nb['text']):
                    continue
                if OUTCOME_RE.match(nb['text'].splitlines()[0]):
                    break
                desc = (desc + ' ' + nb['text']).strip()
                break
            current_obj = oid[0]
            principles[oid] = {'id': oid, 'title': title, 'description': re.sub(r'\s+', ' ', desc), 'outcomes': [], 'ncscUrl': ''}
            principle_order[current_obj].append(oid)

    # Outcomes: attach to the principle they belong to (id prefix).
    outcome_markers = [m for m in markers if m[0] == 'outcome']
    for idx, (kind, i, oid, title, b) in enumerate(outcome_markers):
        # find end index = start of next marker of any kind after i
        end = len(blocks)
        for kind2, i2, *_ in markers:
            if i2 > i:
                end = i2
                break
        # description: blocks between header and column-header row, minus noise
        desc = ''
        for nb in blocks[i + 1:end]:
            if is_subheader_or_noise(nb['text']):
                continue
            if nb['text'].strip().startswith('Not Achieved'):
                break
            if (nb['x1'] - nb['x0']) < 300:
                # title continuation line (wrapped heading), skip
                continue
            desc = (desc + ' ' + nb['text']).strip()
        cols, ncols = build_outcome(blocks, i + 1, end)
        principle_id = oid.split('.')[0]
        outcome = {
            'id': oid,
            'title': title,
            'description': re.sub(r'\s+', ' ', desc),
            'type': ncols,
        }
        outcome['not'] = cols.get('not', [])
        if ncols == 3:
            outcome['partial'] = cols.get('partial', [])
        outcome['achieved'] = cols.get('achieved', [])
        if principle_id in principles:
            principles[principle_id]['outcomes'].append(outcome)
        else:
            print(f'WARNING: outcome {oid} has no matching principle header', file=sys.stderr)

    for obj_id in obj_order:
        for pid in principle_order[obj_id]:
            objectives[obj_id]['principles'].append(principles[pid])

    return [objectives[o] for o in obj_order]


def merge_urls(data, existing_path):
    with open(existing_path) as f:
        existing = json.load(f)
    urls = {}
    for obj in existing:
        for p in obj.get('principles', []):
            if p.get('ncscUrl'):
                urls[p['id']] = p['ncscUrl']
    missing = []
    for obj in data:
        for p in obj['principles']:
            if p['id'] in urls:
                p['ncscUrl'] = urls[p['id']]
            else:
                missing.append(p['id'])
    if missing:
        print(f'No ncscUrl found for new/changed principles: {missing} '
              f'(fill these in by hand)', file=sys.stderr)
    return data


def cmd_extract(args):
    data = extract(args.pdf)
    if args.merge_from:
        data = merge_urls(data, args.merge_from)
    out = json.dumps(data, indent=2) + '\n'
    if args.output:
        with open(args.output, 'w') as f:
            f.write(out)
        print(f'Wrote {args.output}')
    else:
        print(out)


def cmd_validate(args):
    with open(args.data_json) as f:
        data = json.load(f)
    problems = 0
    for obj in data:
        for p in obj['principles']:
            for o in p['outcomes']:
                oid = o['id']
                not_l, partial_l, ach_l = o.get('not', []), o.get('partial'), o.get('achieved', [])
                if o['type'] == 2 and partial_l is not None:
                    print(f'{oid}: type 2 but has a "partial" key')
                    problems += 1
                if o['type'] == 3 and partial_l is None:
                    print(f'{oid}: type 3 but missing "partial" key')
                    problems += 1
                if partial_l is not None and ach_l and set(partial_l) == set(ach_l) and partial_l:
                    print(f'{oid}: "partial" and "achieved" are identical sets — likely an unsplit column')
                    problems += 1
                for label, lst in (('not', not_l), ('partial', partial_l or []), ('achieved', ach_l)):
                    seen = {}
                    for item in lst:
                        if item in seen:
                            print(f'{oid}.{label}: duplicate bullet: {item[:80]!r}')
                            problems += 1
                        seen[item] = True
                        if len(item) < 15:
                            print(f'{oid}.{label}: suspiciously short bullet (possible extraction fragment): {item!r}')
                            problems += 1
    print(f'\n{problems} potential issue(s) found.' if problems else '\nNo issues found.')
    sys.exit(1 if problems else 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    p_extract = sub.add_parser('extract', help='Extract a CAF PDF into data.json-shaped JSON')
    p_extract.add_argument('pdf', help='Path to the CAF PDF')
    p_extract.add_argument('--merge-from', help='Existing data.json to copy ncscUrl fields from')
    p_extract.add_argument('-o', '--output', help='Output path (default: stdout)')
    p_extract.set_defaults(func=cmd_extract)

    p_validate = sub.add_parser('validate', help='Sanity-check a data.json for known defect patterns')
    p_validate.add_argument('data_json', help='Path to the data.json to check')
    p_validate.set_defaults(func=cmd_validate)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
