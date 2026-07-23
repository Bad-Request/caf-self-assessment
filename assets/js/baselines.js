// Baseline profiles: standalone, reusable target-level sets that can be
// applied to any assessment (see storage.js for the on-disk shape). Owns
// their own sidebar list, edit modal, and the borders/badges/legend they
// project onto the outcome grid and framework built by framework.js.

import { el } from './dom.js';
import { DATASET, allOutcomes, STATUS_META, BASELINE_TIERS } from './model.js';
import { loadBaselines, saveBaselines } from './storage.js';
import { baselineUid, nowIso, debounce } from './utils.js';
import { showDialog, showToast } from './ui-shell.js';
import { downloadJson } from './download.js';
import { findAssessment, getCurrentAssessmentId, touchCurrent, getAssessments, persistAssessments } from './assessments.js';

var baselines = loadBaselines();
var currentBaselineEditId = null;

export function findBaseline(id) {
  for (var i = 0; i < baselines.length; i++) {
    if (baselines[i].id === id) return baselines[i];
  }
  return null;
}

export function createBaseline(name) {
  var baseline = {
    id: baselineUid(),
    name: name || 'Untitled baseline',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    targets: {}
  };
  baselines.push(baseline);
  saveBaselines(baselines);
  renderBaselineSidebar();
  refreshBaselineSelectOptions();
  return baseline;
}

function touchBaseline(id) {
  var b = findBaseline(id);
  if (b) {
    b.updatedAt = nowIso();
    saveBaselines(baselines);
  }
}

function deleteBaseline(id) {
  baselines = baselines.filter(function (b) { return b.id !== id; });
  saveBaselines(baselines);
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
    applyBaselineBorders();
    updateBaselineLegend();
    applyBaselineToFramework();
  }
}

export function renderBaselineSidebar() {
  el.baselineList.innerHTML = '';
  el.baselineListEmpty.hidden = baselines.length > 0;

  baselines
    .slice()
    .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); })
    .forEach(function (b) {
      var li = document.createElement('li');
      li.className = 'baseline-list__row';

      var nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'baseline-list__name';
      nameBtn.textContent = b.name || 'Untitled baseline';
      nameBtn.title = 'Edit "' + (b.name || 'Untitled baseline') + '"';
      nameBtn.addEventListener('click', function () { openBaselineModal(b.id); });

      var exportBtn = document.createElement('button');
      exportBtn.type = 'button';
      exportBtn.className = 'baseline-list__icon-btn';
      exportBtn.title = 'Export this baseline profile (.json)';
      exportBtn.setAttribute('aria-label', 'Export baseline profile ' + (b.name || 'Untitled baseline'));
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
    .sort(function (x, y) { return (x.name || '').localeCompare(y.name || ''); })
    .forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name || 'Untitled baseline';
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
  applyBaselineBorders();
  updateBaselineLegend();
  applyBaselineToFramework();
});

function baselineGroupHeading(principle) {
  var heading = document.createElement('div');
  heading.className = 'baseline-target-group__heading';
  heading.innerHTML = '<span class="baseline-target-group__code">Principle ' + principle.id + '</span>' +
    '<span class="baseline-target-group__title"></span>';
  heading.querySelector('.baseline-target-group__title').textContent = principle.title;
  return heading;
}

function baselineOutcomeRow(entry, baseline) {
  var outcome = entry.outcome;
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
    opt.textContent = STATUS_META[tier].label;
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
    if (a && a.baselineId === baseline.id) {
      applyBaselineBorders();
      updateBaselineLegend();
      applyBaselineToFramework();
    }
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
        var entry = { objectiveId: objective.id, principleId: principle.id, outcome: outcome };
        frag.appendChild(baselineOutcomeRow(entry, baseline));
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
    title: 'Delete this baseline profile?',
    message: '"' + (baseline.name || 'Untitled baseline') + '" will be permanently deleted, and any assessments using it will be set back to "None". This cannot be undone.',
    tone: 'danger',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    onConfirm: function () {
      deleteBaseline(baseline.id);
      closeBaselineModal();
      showToast('Baseline profile deleted.');
    }
  });
});

el.btnNewBaseline.addEventListener('click', function () {
  var baseline = createBaseline('Untitled baseline');
  showToast('New baseline profile created.');
  openBaselineModal(baseline.id);
});

function exportBaselineJson(id) {
  var baseline = findBaseline(id);
  if (!baseline) return;
  var filename = downloadJson(baseline, 'CAFBaseline', 'baseline');
  showToast('Exported ' + filename);
}

el.btnImportBaseline.addEventListener('click', function () {
  el.inputImportBaseline.click();
});

el.inputImportBaseline.addEventListener('change', function (evt) {
  var file = evt.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var imported = JSON.parse(reader.result);
      if (!imported || typeof imported !== 'object' || typeof imported.targets !== 'object' || imported.targets === null) {
        throw new Error('File does not look like a CAF baseline profile export.');
      }
      imported.id = baselineUid(); // avoid clobbering an existing profile with the same id
      imported.updatedAt = nowIso();
      if (!imported.createdAt) imported.createdAt = nowIso();
      if (!imported.name) imported.name = 'Imported baseline';
      baselines.push(imported);
      saveBaselines(baselines);
      renderBaselineSidebar();
      refreshBaselineSelectOptions();
      showToast('Imported "' + imported.name + '".');
    } catch (e) {
      showDialog({
        title: 'Import failed',
        message: 'Could not import this file: ' + e.message,
        confirmLabel: 'OK'
      });
    } finally {
      evt.target.value = '';
    }
  };
  reader.readAsText(file);
});

export function applyBaselineBorders() {
  var a = findAssessment(getCurrentAssessmentId());
  var targets = {};
  if (a && a.baselineId) {
    var b = findBaseline(a.baselineId);
    if (b && b.targets) targets = b.targets;
  }
  allOutcomes.forEach(function (entry) {
    var dot = document.getElementById('grid-dot-' + entry.outcome.id);
    if (!dot) return;
    var target = targets[entry.outcome.id] || '';
    if (target) {
      dot.setAttribute('data-baseline', target);
      dot.title = entry.outcome.id + ' — ' + entry.outcome.title +
        ' · Baseline target: ' + STATUS_META[target].label;
    } else {
      dot.removeAttribute('data-baseline');
      dot.title = entry.outcome.id + ' — ' + entry.outcome.title;
    }
  });
}

// Shows the baseline target inline in the main framework view — a badge
// on each outcome card (visible while ticking IGPs for that outcome)
// and a summary row of chips on each principle's header (visible at a
// glance before working through its outcomes) — so the target is in
// view the whole time someone is working through the exercise, not
// just on the dashboard grid at the top of the page.
export function applyBaselineToFramework() {
  var a = findAssessment(getCurrentAssessmentId());
  var targets = {};
  if (a && a.baselineId) {
    var b = findBaseline(a.baselineId);
    if (b && b.targets) targets = b.targets;
  }

  allOutcomes.forEach(function (entry) {
    var badge = document.getElementById('baseline-badge-' + entry.outcome.id);
    if (!badge) return;
    var target = targets[entry.outcome.id];
    if (target) {
      badge.hidden = false;
      badge.className = 'baseline-badge baseline-badge--' + target;
      badge.textContent = 'Target: ' + STATUS_META[target].label;
    } else {
      badge.hidden = true;
      badge.className = 'baseline-badge';
      badge.textContent = '';
    }
  });

  DATASET.forEach(function (objective) {
    objective.principles.forEach(function (principle) {
      var container = document.getElementById('principle-baselines-' + principle.id);
      if (!container) return;
      container.innerHTML = '';
      var hasAny = false;
      principle.outcomes.forEach(function (outcome) {
        var target = targets[outcome.id];
        if (!target) return;
        hasAny = true;
        var chip = document.createElement('span');
        chip.className = 'principle-baseline-chip principle-baseline-chip--' + target;
        chip.title = outcome.id + ' — ' + outcome.title + ' · Baseline target: ' + STATUS_META[target].label;
        chip.textContent = outcome.id + ' ' + STATUS_META[target].label;
        container.appendChild(chip);
      });
      container.hidden = !hasAny;
    });
  });
}

export function updateBaselineLegend() {
  var a = findAssessment(getCurrentAssessmentId());
  var baseline = a && a.baselineId ? findBaseline(a.baselineId) : null;
  el.baselineLegend.innerHTML = '';
  if (!baseline) {
    var none = document.createElement('span');
    none.className = 'baseline-legend__none';
    none.textContent = 'No baseline profile selected for this assessment — dots have no border.';
    el.baselineLegend.appendChild(none);
    return;
  }
  var intro = document.createElement('span');
  intro.textContent = 'Baseline "' + (baseline.name || 'Untitled baseline') + '" — border key:';
  el.baselineLegend.appendChild(intro);
  BASELINE_TIERS.forEach(function (tier) {
    var item = document.createElement('span');
    item.className = 'baseline-legend__item';
    item.innerHTML = '<span class="baseline-legend__swatch baseline-legend__swatch--' + tier + '"></span>' +
      '<span></span>';
    item.querySelector('span:last-child').textContent = STATUS_META[tier].label;
    el.baselineLegend.appendChild(item);
  });
}
