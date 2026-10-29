// Builds the CAF objective/principle/outcome-card tree and the outcome
// grid (built once; state is re-applied whenever the selected assessment
// changes), and owns the per-outcome state mutations triggered from them.

import { el } from './dom.js';
import {
  DATASET, allOutcomes, outcomesById, STATUS_LABEL, FLAG_LABEL, FLAG_KEYS,
  normalizeResult, effectiveStatus, flagsOf, plainEnglishFor, conflictingChecks
} from './model.js';
import { debounce, flashTo } from './utils.js';
import { findAssessment, getCurrentAssessmentId, touchCurrent, renderSidebar } from './assessments.js';
import { updateDashboard } from './dashboard.js';

// Applies fn to the current assessment's result for this outcome (in
// memory only); returns the updated result, or null if nothing is selected.
function updateResult(outcomeId, fn) {
  var a = findAssessment(getCurrentAssessmentId());
  if (!a) return null;
  var r = normalizeResult(a.results[outcomeId]);
  fn(r);
  a.results[outcomeId] = r;
  return r;
}

function setChecked(outcomeId, checkKey, checked) {
  var r = updateResult(outcomeId, function (r) { r.checks[checkKey] = checked; });
  if (!r) return;
  touchCurrent();
  applyOutcomeState(outcomeId, r, true);
  updateDashboard();
}

function setOverride(outcomeId, status) {
  var r = updateResult(outcomeId, function (r) { r.override = (r.override === status) ? null : status; });
  if (!r) return;
  touchCurrent();
  applyOutcomeState(outcomeId, r);
  updateDashboard();
  renderSidebar();
}

// 'wip' and 'review' share one progress value, so pressing one clears the
// other; pressing the active one clears it. 'question' toggles on its own.
function toggleFlag(outcomeId, flag) {
  var r = updateResult(outcomeId, function (r) {
    if (flag === 'question') r.question = !r.question;
    else r.progress = (r.progress === flag) ? null : flag;
  });
  if (!r) return;
  touchCurrent();
  applyOutcomeState(outcomeId, r);
  updateDashboard();
}

// fromTick: the change came from ticking an IGP, so a newly appearing
// contradiction warning pulses to catch the eye (not on load or switching
// assessment, when it isn't news).
export function applyOutcomeState(outcomeId, rawResult, fromTick) {
  var outcome = outcomesById[outcomeId];
  var r = normalizeResult(rawResult);
  var effective = effectiveStatus(outcome, r);
  var flags = flagsOf(r);

  var card = document.getElementById('outcome-' + outcomeId);
  if (card) {
    var checkboxes = card.querySelectorAll('input[type="checkbox"][data-check-key]');
    checkboxes.forEach(function (cb) {
      cb.checked = !!r.checks[cb.getAttribute('data-check-key')];
    });
    applyConflicts(card, outcome, r.checks, fromTick);

    var buttons = card.querySelectorAll('.status-control button');
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-status') === r.override));
    });

    var badge = card.querySelector('.status-badge');
    if (badge) {
      var key = effective || 'unset';
      badge.className = 'status-badge status-badge--' + key;
      var suffix = '';
      if (r.override) suffix = ' · manual';
      else if (effective) suffix = ' · suggested';
      badge.textContent = STATUS_LABEL[key] + suffix;
    }

    var textarea = card.querySelector('[data-notes-for="' + outcomeId + '"]');
    if (textarea) textarea.value = r.notes || '';

    card.querySelectorAll('.flag-control button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(flags.indexOf(b.getAttribute('data-flag')) !== -1));
    });
    setDataAttr(card, 'progress', r.progress);
    setDataAttr(card, 'question', r.question ? 'true' : null);
  }

  var dot = document.getElementById('grid-dot-' + outcomeId);
  if (dot) {
    dot.className = 'outcome-dot';
    if (effective) dot.classList.add('status-' + effective);
    setDataAttr(dot, 'progress', r.progress);
    setDataAttr(dot, 'question', r.question ? 'true' : null);
    var label = 'Jump to outcome ' + outcomeId + ', ' + outcome.title;
    if (flags.length) {
      label += ' — flagged: ' + flags.map(function (f) { return FLAG_LABEL[f]; }).join(', ');
    }
    dot.setAttribute('aria-label', label);
    dot.title = outcomeId + ' — ' + outcome.title +
      (flags.length ? ' (' + flags.map(function (f) { return FLAG_LABEL[f]; }).join(', ') + ')' : '');
  }
}

// Soft warning for ticked IGPs that appear to contradict each other (see
// assets/conflicts.json). Advisory only: nothing is blocked or unticked.
function applyConflicts(card, outcome, checks, pulse) {
  var found = conflictingChecks(outcome, checks);
  var pairs = 0;
  card.querySelectorAll('[data-conflict-for]').forEach(function (note) {
    var others = found[note.getAttribute('data-conflict-for')] || [];
    pairs += others.length;
    var text = others.map(function (other) {
      return 'Appears to contradict a ticked "' + STATUS_LABEL[other.key.split('-')[0]] + '" statement: ' + other.why;
    }).join('\n');
    if (pulse && text && text !== note.textContent) {
      note.classList.remove('igp-conflict--new');
      void note.offsetWidth; // restart the animation if it's mid-pulse
      note.classList.add('igp-conflict--new');
    }
    note.textContent = text;
  });
  pairs /= 2;

  var summary = card.querySelector('.igp-conflict-summary');
  if (summary) {
    summary.textContent = pairs
      ? (pairs === 1 ? 'Two ticked indicators' : pairs + ' pairs of ticked indicators') + ' appear to contradict each other — check your evidence.'
      : '';
  }
}

document.addEventListener('animationend', function (e) {
  if (e.target.classList.contains('igp-conflict--new')) e.target.classList.remove('igp-conflict--new');
});

function setDataAttr(node, name, value) {
  if (value) node.setAttribute('data-' + name, value);
  else node.removeAttribute('data-' + name);
}

export function applyAllState(assessment) {
  allOutcomes.forEach(function (entry) {
    var result = assessment ? assessment.results[entry.outcome.id] : null;
    applyOutcomeState(entry.outcome.id, result);
  });
}

function overrideButtonsFor(outcome) {
  var keys = outcome.type === 3 ? ['not', 'partial', 'achieved'] : ['not', 'achieved'];
  return keys.map(function (key) {
    return { key: key, cls: 'opt-' + key, label: STATUS_LABEL[key] };
  }).concat({ key: 'na', cls: 'opt-na', label: 'N/A' });
}

var frameworkBuilt = false;

export function buildFramework() {
  if (frameworkBuilt) return;
  var frag = document.createDocumentFragment();

  DATASET.forEach(function (objective) {
    var objBlock = document.createElement('div');
    objBlock.className = 'objective-block';
    objBlock.id = 'objective-' + objective.id;
    objBlock.innerHTML =
      '<div class="objective-header">' +
      '  <span class="objective-header__code">' + objective.id + '</span>' +
      '  <h2 class="objective-header__title"></h2>' +
      '  <p class="objective-header__desc"></p>' +
      '</div>';
    objBlock.querySelector('.objective-header__title').textContent = objective.title;
    objBlock.querySelector('.objective-header__desc').textContent = objective.description;

    objective.principles.forEach(function (principle) {
      var pBlock = document.createElement('div');
      pBlock.className = 'principle-block';
      pBlock.id = 'principle-' + principle.id;

      var pHeader = document.createElement('div');
      pHeader.className = 'principle-header';
      pHeader.innerHTML =
        '<div class="principle-header__eyebrow">Principle ' + principle.id + '</div>' +
        '<h3></h3><p></p>' +
        (principle.ncscUrl
          ? '<a class="principle-header__ncsc-link" href="' + principle.ncscUrl + '" target="_blank" rel="noopener">NCSC guidance for Principle ' + principle.id + ' ↗</a>'
          : '') +
        '<div class="principle-header__baselines" id="principle-baselines-' + principle.id + '" hidden></div>';
      pHeader.querySelector('h3').textContent = principle.title;
      pHeader.querySelector('p').textContent = principle.description;
      var guidance = buildGuidance(principle);
      if (guidance) pHeader.insertBefore(guidance, pHeader.querySelector('.principle-header__baselines'));
      pBlock.appendChild(pHeader);

      principle.outcomes.forEach(function (outcome) {
        pBlock.appendChild(buildOutcomeCard(outcome));
      });

      objBlock.appendChild(pBlock);
    });

    frag.appendChild(objBlock);
  });

  el.framework.appendChild(frag);
  frameworkBuilt = true;
}

// The principle's "Guidance and references" from NCSC's consolidated view
// of CAF guidance, as a collapsed <details>. Returns null if there is none.
var GUIDANCE_GROUPS = [
  { key: 'ncsc', label: 'NCSC guidance' },
  { key: 'external', label: 'External resources' }
];

function buildGuidance(principle) {
  var g = principle.guidance;
  if (!g) return null;
  var groups = GUIDANCE_GROUPS.filter(function (grp) { return g[grp.key] && g[grp.key].length; });
  if (!groups.length) return null;
  var total = groups.reduce(function (n, grp) { return n + g[grp.key].length; }, 0);

  var details = document.createElement('details');
  details.className = 'principle-guidance';
  var summary = document.createElement('summary');
  summary.textContent = 'Guidance & references (' + total + ')';
  details.appendChild(summary);

  groups.forEach(function (grp) {
    var heading = document.createElement('h4');
    heading.className = 'principle-guidance__heading';
    heading.textContent = grp.label;
    var list = document.createElement('ul');
    list.className = 'principle-guidance__list';
    g[grp.key].forEach(function (item) {
      var li = document.createElement('li');
      appendGuidanceItem(li, item);
      list.appendChild(li);
    });
    details.appendChild(heading);
    details.appendChild(list);
  });
  return details;
}

function guidanceLink(text, url) {
  var a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

// item is { title }, { title, url } or { title, links: [{ text, url }] }
// (see docs/data-schema.md).
function appendGuidanceItem(li, item) {
  if (item.url) {
    li.appendChild(guidanceLink(item.title, item.url));
    return;
  }
  var rest = item.title;
  (item.links || []).forEach(function (link) {
    var at = rest.indexOf(link.text);
    if (at === -1) return;
    li.appendChild(document.createTextNode(rest.slice(0, at)));
    li.appendChild(guidanceLink(link.text, link.url));
    rest = rest.slice(at + link.text.length);
  });
  li.appendChild(document.createTextNode(rest));
}

function buildOutcomeCard(outcome) {
  var card = document.createElement('div');
  card.className = 'outcome-card';
  card.id = 'outcome-' + outcome.id;
  card.setAttribute('data-outcome-id', outcome.id);

  var head = document.createElement('div');
  head.className = 'outcome-card__head';

  var titleGroup = document.createElement('div');
  titleGroup.className = 'outcome-card__title-group';
  titleGroup.innerHTML =
    '<div class="outcome-card__code">' + outcome.id + '</div>' +
    '<h4 class="outcome-card__title"></h4>' +
    '<p class="outcome-card__desc"></p>';
  titleGroup.querySelector('.outcome-card__title').textContent = outcome.title;
  titleGroup.querySelector('.outcome-card__desc').textContent = outcome.description;
  head.appendChild(titleGroup);

  var statusArea = document.createElement('div');
  statusArea.className = 'status-area';

  var badge = document.createElement('span');
  badge.className = 'status-badge status-badge--unset';
  badge.textContent = STATUS_LABEL.unset;
  statusArea.appendChild(badge);

  var baselineBadge = document.createElement('span');
  baselineBadge.className = 'baseline-badge';
  baselineBadge.id = 'baseline-badge-' + outcome.id;
  baselineBadge.hidden = true;
  statusArea.appendChild(baselineBadge);

  var statusControl = document.createElement('div');
  statusControl.className = 'status-control';
  statusControl.setAttribute('role', 'group');
  statusControl.setAttribute('aria-label', 'Override final status for outcome ' + outcome.id);
  overrideButtonsFor(outcome).forEach(function (opt) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = opt.cls;
    b.textContent = opt.label;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-status', opt.key);
    b.title = 'Manually set this outcome to "' + opt.label + '" (click again to go back to the suggested status)';
    b.addEventListener('click', function () {
      setOverride(outcome.id, opt.key);
    });
    statusControl.appendChild(b);
  });
  statusArea.appendChild(statusControl);

  head.appendChild(statusArea);
  card.appendChild(head);

  var body = document.createElement('div');
  body.className = 'outcome-card__body';

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'igp-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = 'Show indicators to assess this outcome';
  var panelId = 'igp-panel-' + outcome.id;
  toggle.setAttribute('aria-controls', panelId);

  var panel = document.createElement('div');
  panel.className = 'igp-panel';
  panel.id = panelId;
  panel.hidden = true;
  panel.appendChild(igpChecklistColumn('not', 'Not achieved', outcome.not, outcome.id));
  if (outcome.type === 3) {
    panel.appendChild(igpChecklistColumn('partial', 'Partially achieved', outcome.partial, outcome.id));
  }
  panel.appendChild(igpChecklistColumn('achieved', 'Achieved', outcome.achieved, outcome.id));

  toggle.addEventListener('click', function () {
    var expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
    toggle.textContent = expanded ? 'Show indicators to assess this outcome' : 'Hide indicators';
  });

  // Kept in the page (empty when there's nothing to say) so screen readers
  // announce a new contradiction as it's ticked.
  var conflictSummary = document.createElement('p');
  conflictSummary.className = 'igp-conflict-summary';
  conflictSummary.setAttribute('aria-live', 'polite');

  body.appendChild(buildFlagRow(outcome));
  body.appendChild(conflictSummary);
  body.appendChild(toggle);
  body.appendChild(panel);

  var notesRow = document.createElement('div');
  notesRow.className = 'notes-row';
  var notesLabel = document.createElement('label');
  notesLabel.setAttribute('for', 'notes-' + outcome.id);
  notesLabel.textContent = 'Notes / evidence';
  var notesTextarea = document.createElement('textarea');
  notesTextarea.id = 'notes-' + outcome.id;
  notesTextarea.placeholder = 'Justification, evidence references, or follow-up actions for this outcome…';
  notesTextarea.setAttribute('data-notes-for', outcome.id);

  var persistNotesChange = debounce(touchCurrent, 300);
  notesTextarea.addEventListener('input', function () {
    updateResult(outcome.id, function (r) { r.notes = notesTextarea.value; });
    persistNotesChange();
  });

  notesRow.appendChild(notesLabel);
  notesRow.appendChild(notesTextarea);
  body.appendChild(notesRow);

  card.appendChild(body);
  return card;
}

function buildFlagRow(outcome) {
  var row = document.createElement('div');
  row.className = 'flag-row';
  var label = document.createElement('span');
  label.className = 'flag-row__label';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = 'Flag';
  row.appendChild(label);

  var control = document.createElement('div');
  control.className = 'flag-control';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', 'Flag outcome ' + outcome.id + ' for review');
  FLAG_KEYS.forEach(function (flag) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'flag-btn flag-btn--' + flag;
    b.textContent = FLAG_LABEL[flag];
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-flag', flag);
    b.title = flag === 'question'
      ? 'Flag a question about this outcome for review (click again to clear)'
      : 'Mark this outcome as "' + FLAG_LABEL[flag] + '" (click again to clear)';
    b.addEventListener('click', function () {
      toggleFlag(outcome.id, flag);
    });
    control.appendChild(b);
  });
  row.appendChild(control);
  return row;
}

function igpChecklistColumn(key, label, items, outcomeId) {
  var col = document.createElement('div');
  col.className = 'igp-col igp-col--' + key;
  var h4 = document.createElement('h4');
  h4.textContent = label;
  col.appendChild(h4);

  var list = document.createElement('div');
  list.className = 'igp-check-list';
  (items || []).forEach(function (text, idx) {
    var checkKey = key + '-' + idx;
    var row = document.createElement('label');
    row.className = 'igp-check';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('data-outcome-id', outcomeId);
    input.setAttribute('data-check-key', checkKey);
    input.addEventListener('change', function () {
      setChecked(outcomeId, checkKey, input.checked);
    });

    var body = document.createElement('span');
    body.className = 'igp-check__body';
    var official = document.createElement('span');
    official.className = 'igp-check__official';
    official.textContent = text;
    body.appendChild(official);

    var plain = plainEnglishFor(outcomeId, key, idx, text);
    if (plain) {
      var plainEl = document.createElement('span');
      plainEl.className = 'igp-plain';
      var plainLabel = document.createElement('span');
      plainLabel.className = 'visually-hidden';
      plainLabel.textContent = 'Plain English (unofficial): ';
      plainEl.appendChild(plainLabel);
      plainEl.appendChild(document.createTextNode(plain));
      body.appendChild(plainEl);
    }

    var conflictEl = document.createElement('span');
    conflictEl.className = 'igp-conflict';
    conflictEl.setAttribute('data-conflict-for', checkKey);
    body.appendChild(conflictEl);

    row.appendChild(input);
    row.appendChild(body);
    list.appendChild(row);
  });
  col.appendChild(list);
  return col;
}

var gridBuilt = false;

export function buildOutcomeGrid() {
  if (gridBuilt) return;
  var frag = document.createDocumentFragment();
  DATASET.forEach(function (objective) {
    var row = document.createElement('div');
    row.className = 'outcome-grid__objective';
    var key = document.createElement('span');
    key.className = 'outcome-grid__key';
    key.textContent = objective.id;
    key.title = 'Objective ' + objective.id + ' — ' + objective.title;
    var principles = document.createElement('div');
    principles.className = 'outcome-grid__principles';
    objective.principles.forEach(function (principle) {
      var group = document.createElement('div');
      group.className = 'outcome-grid__principle';
      principle.outcomes.forEach(function (outcome) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'outcome-dot';
        dot.id = 'grid-dot-' + outcome.id;
        dot.textContent = outcome.id;
        dot.title = outcome.id + ' — ' + outcome.title;
        dot.setAttribute('aria-label', 'Jump to outcome ' + outcome.id + ', ' + outcome.title);
        dot.addEventListener('click', function () {
          flashTo(document.getElementById('outcome-' + outcome.id), 'center');
        });
        group.appendChild(dot);
      });
      principles.appendChild(group);
    });
    row.appendChild(key);
    row.appendChild(principles);
    frag.appendChild(row);
  });
  el.outcomeGrid.appendChild(frag);
  gridBuilt = true;
}
