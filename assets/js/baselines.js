// Baseline profiles: standalone, reusable target-level sets that can be
// applied to any assessment (see storage.js for the on-disk shape). Owns
// their own sidebar list, edit modal, and the borders/badges/legend they
// project onto the outcome grid and framework built by framework.js.

import { el } from './dom.js';
import { DATASET, allOutcomes, STATUS_LABEL, BASELINE_TIERS } from './model.js';
import { loadList, saveList, BASELINES_KEY } from './storage.js';
import { uid, nowIso, debounce, byName, downloadJson } from './utils.js';
import { showDialog, showToast, bindJsonImport } from './ui-shell.js';
import { findAssessment, getCurrentAssessmentId, touchCurrent, getAssessments, persistAssessments } from './assessments.js';

var baselines = loadList(BASELINES_KEY);
var currentBaselineEditId = null;

export function findBaseline(id) {
  return baselines.find(function (b) { return b.id === id; }) || null;
}

function persistBaselines() {
  saveList(BASELINES_KEY, baselines);
}

function createBaseline(name) {
  var baseline = {
    id: uid('bl'),
    name: name || 'Untitled profile',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    targets: {}
  };
  baselines.push(baseline);
  persistBaselines();
  renderBaselineSidebar();
  refreshBaselineSelectOptions();
  return baseline;
}

function touchBaseline(id) {
  var b = findBaseline(id);
  if (b) {
    b.updatedAt = nowIso();
    persistBaselines();
  }
}

function deleteBaseline(id) {
  baselines = baselines.filter(function (b) { return b.id !== id; });
  persistBaselines();
  // Any assessment currently pointed at the deleted profile falls back
  // to "None" rather than silently referencing a missing profile.
  var affectedCurrent = false;
  var currentId = getCurrentAssessmentId();
  getAssessments().forEach(function (a) {
    if (a.baselineId === id) {
      a.baselineId = null;
      if (a.id === currentId) affectedCurrent = true;
    }
  });
  persistAssessments();
  renderBaselineSidebar();
  refreshBaselineSelectOptions();
  if (affectedCurrent) {
    el.baselineSelect.value = '';
    applyBaseline();
  }
}

export function renderBaselineSidebar() {
  el.baselineList.innerHTML = '';
  el.baselineListEmpty.hidden = baselines.length > 0;

  baselines
    .slice()
    .sort(byName)
    .forEach(function (b) {
      var li = document.createElement('li');
      li.className = 'baseline-list__row';

      var nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'baseline-list__name';
      nameBtn.textContent = b.name || 'Untitled profile';
      nameBtn.title = 'Edit "' + (b.name || 'Untitled profile') + '"';
      nameBtn.addEventListener('click', function () { openBaselineModal(b.id); });

      var exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'baseline-list__icon-btn';
      exportBtn.title = 'Export this profile (.json)';
      exportBtn.setAttribute('aria-label', 'Export profile ' + (b.name || 'Untitled profile'));
      exportBtn.textContent = '↓';
      exportBtn.addEventListener('click', function (evt) {
        evt.stopPropagation();
        exportBaselineJson(b.id);
      });

      li.appendChild(nameBtn);
      li.appendChild(exportBtn);
      el.baselineList.appendChild(li);
    });
}

export function refreshBaselineSelectOptions() {
  var a = findAssessment(getCurrentAssessmentId());
  var previousValue = el.baselineSelect.value;
  el.baselineSelect.innerHTML = '<option value="">None</option>';
  baselines
    .slice()
    .sort(byName)
    .forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name || 'Untitled profile';
      el.baselineSelect.appendChild(opt);
    });
  if (a) {
    el.baselineSelect.value = (a.baselineId && findBaseline(a.baselineId)) ? a.baselineId : '';
  } else {
    el.baselineSelect.value = previousValue && findBaseline(previousValue) ? previousValue : '';
  }
}

el.baselineSelect.addEventListener('change', function () {
  var a = findAssessment(getCurrentAssessmentId());
  if (!a) return;
  a.baselineId = el.baselineSelect.value || null;
  touchCurrent();
  applyBaseline();
});

function baselineGroupHeading(principle) {
  var heading = document.createElement('div');
  heading.className = 'baseline-target-group__heading';
  heading.innerHTML = '<span class="baseline-target-group__code">Principle ' + principle.id + '</span>' +
    '<span class="baseline-target-group__title"></span>';
  heading.querySelector('.baseline-target-group__title').textContent = principle.title;
  return heading;
}

function baselineOutcomeRow(outcome, baseline) {
  var row = document.createElement('div');
  row.className = 'baseline-target-row';

  var label = document.createElement('div');
  label.className = 'baseline-target-row__label';
  label.innerHTML = '<span class="baseline-target-row__code">' + outcome.id + '</span>' +
    '<span class="baseline-target-row__title"></span>';
  label.querySelector('.baseline-target-row__title').textContent = outcome.title;

  var select = document.createElement('select');
  select.setAttribute('data-outcome-id', outcome.id);
  select.setAttribute('aria-label', 'Baseline target for outcome ' + outcome.id + ', ' + outcome.title);
  var noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'No target set';
  select.appendChild(noneOpt);
  BASELINE_TIERS.forEach(function (tier) {
    var opt = document.createElement('option');
    opt.value = tier;
    opt.textContent = STATUS_LABEL[tier];
    select.appendChild(opt);
  });
  select.value = (baseline.targets && baseline.targets[outcome.id]) || '';
  select.addEventListener('change', function () {
    if (!baseline.targets) baseline.targets = {};
    if (select.value) {
      baseline.targets[outcome.id] = select.value;
    } else {
      delete baseline.targets[outcome.id];
    }
    touchBaseline(baseline.id);
    // Live-update the grid if this profile is the one currently applied.
    var a = findAssessment(getCurrentAssessmentId());
    if (a && a.baselineId === baseline.id) applyBaseline();
  });

  row.appendChild(label);
  row.appendChild(select);
  return row;
}

function openBaselineModal(id) {
  var baseline = findBaseline(id);
  if (!baseline) return;
  currentBaselineEditId = id;
  el.baselineNameInput.value = baseline.name || '';
  el.baselineTargetList.innerHTML = '';
  var frag = document.createDocumentFragment();
  DATASET.forEach(function (objective) {
    objective.principles.forEach(function (principle) {
      frag.appendChild(baselineGroupHeading(principle));
      principle.outcomes.forEach(function (outcome) {
        frag.appendChild(baselineOutcomeRow(outcome, baseline));
      });
    });
  });
  el.baselineTargetList.appendChild(frag);
  el.baselineModal.hidden = false;
  window.setTimeout(function () { el.baselineNameInput.focus(); }, 20);
}

function closeBaselineModal() {
  el.baselineModal.hidden = true;
  currentBaselineEditId = null;
}

var persistBaselineNameChange = debounce(function (baselineId) {
  touchBaseline(baselineId);
  renderBaselineSidebar();
  refreshBaselineSelectOptions();
}, 300);

el.baselineNameInput.addEventListener('input', function () {
  var baseline = findBaseline(currentBaselineEditId);
  if (!baseline) return;
  baseline.name = el.baselineNameInput.value;
  persistBaselineNameChange(baseline.id);
});

el.baselineModalClose.addEventListener('click', closeBaselineModal);
el.baselineModal.addEventListener('click', function (evt) {
  if (evt.target === el.baselineModal) closeBaselineModal();
});

el.baselineModalExport.addEventListener('click', function () {
  if (currentBaselineEditId) exportBaselineJson(currentBaselineEditId);
});

el.baselineModalDelete.addEventListener('click', function () {
  var baseline = findBaseline(currentBaselineEditId);
  if (!baseline) return;
  showDialog({
    title: 'Delete this profile?',
    message: '"' + (baseline.name || 'Untitled profile') + '" will be permanently deleted, and any assessments using it will be set back to "None". This cannot be undone.',
    tone: 'danger',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    onConfirm: function () {
      deleteBaseline(baseline.id);
      closeBaselineModal();
      showToast('Profile deleted.');
    }
  });
});

el.btnNewBaseline.addEventListener('click', function () {
  var baseline = createBaseline('Untitled profile');
  showToast('New profile created.');
  openBaselineModal(baseline.id);
});

function exportBaselineJson(id) {
  var baseline = findBaseline(id);
  if (!baseline) return;
  var filename = downloadJson(baseline, 'CAFProfile', 'profile');
  showToast('Exported ' + filename);
}

bindJsonImport(el.btnImportBaseline, el.inputImportBaseline, function (imported) {
  if (!imported || typeof imported !== 'object' || typeof imported.targets !== 'object' || imported.targets === null) {
    throw new Error('File does not look like a CAF profile export.');
  }
  imported.id = uid('bl'); // avoid clobbering an existing profile with the same id
  imported.updatedAt = nowIso();
  if (!imported.createdAt) imported.createdAt = nowIso();
  if (!imported.name) imported.name = 'Imported profile';
  baselines.push(imported);
  persistBaselines();
  renderBaselineSidebar();
  refreshBaselineSelectOptions();
  showToast('Imported "' + imported.name + '".');
});

// Projects the current assessment's profile onto the page: borders on the
// outcome grid dots, plus — so the target is in view the whole time
// someone is working through the exercise, not just on the dashboard grid
// — a badge on each outcome card and a row of chips on each principle's
// header, and the border-key legend.
export function applyBaseline() {
  var a = findAssessment(getCurrentAssessmentId());
  var baseline = a && a.baselineId ? findBaseline(a.baselineId) : null;
  var targets = (baseline && baseline.targets) || {};

  allOutcomes.forEach(function (entry) {
    var outcome = entry.outcome;
    var target = targets[outcome.id];
    var label = outcome.id + ' — ' + outcome.title;

    var dot = document.getElementById('grid-dot-' + outcome.id);
    if (dot) {
      if (target) dot.setAttribute('data-baseline', target);
      else dot.removeAttribute('data-baseline');
      dot.title = target ? label + ' · Profile target: ' + STATUS_LABEL[target] : label;
    }

    var badge = document.getElementById('baseline-badge-' + outcome.id);
    if (badge) {
      badge.hidden = !target;
      badge.className = 'baseline-badge' + (target ? ' baseline-badge--' + target : '');
      badge.textContent = target ? 'Target: ' + STATUS_LABEL[target] : '';
    }
  });

  DATASET.forEach(function (objective) {
    objective.principles.forEach(function (principle) {
      var container = document.getElementById('principle-baselines-' + principle.id);
      if (!container) return;
      container.innerHTML = '';
      principle.outcomes.forEach(function (outcome) {
        var target = targets[outcome.id];
        if (!target) return;
        var chip = document.createElement('span');
        chip.className = 'principle-baseline-chip principle-baseline-chip--' + target;
        chip.title = outcome.id + ' — ' + outcome.title + ' · Profile target: ' + STATUS_LABEL[target];
        chip.textContent = outcome.id + ' ' + STATUS_LABEL[target];
        container.appendChild(chip);
      });
      container.hidden = !container.childElementCount;
    });
  });

  el.baselineLegend.innerHTML = '';
  if (!baseline) {
    var none = document.createElement('span');
    none.className = 'baseline-legend__none';
    none.textContent = 'No profile selected for this assessment — dots have no border.';
    el.baselineLegend.appendChild(none);
    return;
  }
  var intro = document.createElement('span');
  intro.textContent = 'Profile "' + (baseline.name || 'Untitled profile') + '" — border key:';
  el.baselineLegend.appendChild(intro);
  BASELINE_TIERS.forEach(function (tier) {
    var item = document.createElement('span');
    item.className = 'baseline-legend__item';
    item.innerHTML = '<span class="baseline-legend__swatch baseline-legend__swatch--' + tier + '"></span>' +
      '<span></span>';
    item.querySelector('span:last-child').textContent = STATUS_LABEL[tier];
    el.baselineLegend.appendChild(item);
  });
}
