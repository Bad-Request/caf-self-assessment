/**
 * NCSC CAF Self-Assessment Tool — client logic.
 *
 * Every assessment lives ONLY in this browser's localStorage under the
 * keys below. Nothing is ever sent to a server. The PHP backend serves
 * the static CAF reference dataset (window.CAF_DATASET) and nothing else.
 *
 * Per-outcome result shape:
 *   {
 *     checks:   { "<not|partial|achieved>-<index>": true, ... },
 *     override: null | 'not' | 'partial' | 'achieved' | 'na',
 *     notes:    "free text"
 *   }
 *
 * "checks" records which individual IGP statements the assessor has
 * ticked as true for their organisation. From these, a status is
 * SUGGESTED for the outcome:
 *   - any ticked "Not achieved" indicator  -> suggestion is "Not achieved",
 *     no matter what else is ticked (an outcome cannot score higher than
 *     its lowest ticked indicator).
 *   - otherwise, every "Achieved" indicator ticked -> suggestion "Achieved".
 *   - otherwise, any "Achieved"/"Partially achieved" indicator ticked
 *     -> suggestion "Partially achieved" (three-column outcomes only).
 *   - otherwise -> no suggestion yet ("Not yet assessed").
 *
 * "override" lets the assessor set the final status by hand instead of
 * accepting the suggestion (the CAF is explicit that IGPs support expert
 * judgement rather than replace it). When set, override always wins.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'caf_assessments_v1';
  var CURRENT_KEY = 'caf_current_assessment_id_v1';
  var BASELINE_STORAGE_KEY = 'caf_baselines_v1';
  var SIDEBAR_COLLAPSED_KEY = 'caf_sidebar_collapsed_v1';
  var THEME_KEY = 'caf_theme_v1';
  var FONT_SIZE_KEY = 'caf_font_size_v1';

  var DATASET = window.CAF_DATASET || [];

  var STATUS_META = {
    not: { label: 'Not achieved' },
    partial: { label: 'Partially achieved' },
    achieved: { label: 'Achieved' },
    na: { label: 'Not applicable' },
    unset: { label: 'Not yet assessed' }
  };

  // Baseline targets only ever use these three tiers (a target is either
  // not expected, partially expected, or fully expected — "not applicable"
  // and "not yet assessed" don't make sense as a *target*).
  var BASELINE_TIERS = ['not', 'partial', 'achieved'];

  var allOutcomes = [];
  var outcomesById = {};
  DATASET.forEach(function (objective) {
    objective.principles.forEach(function (principle) {
      principle.outcomes.forEach(function (outcome) {
        var entry = { objectiveId: objective.id, principleId: principle.id, outcome: outcome };
        allOutcomes.push(entry);
        outcomesById[outcome.id] = outcome;
      });
    });
  });

  // ---------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------

  function loadAssessments() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Could not read assessments from localStorage', e);
      return [];
    }
  }

  function saveAssessments(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Could not write assessments to localStorage', e);
      showToast('Could not save — your browser storage may be full or blocked.');
      return false;
    }
  }

  function getCurrentId() {
    return window.localStorage.getItem(CURRENT_KEY);
  }

  function setCurrentId(id) {
    if (id) {
      window.localStorage.setItem(CURRENT_KEY, id);
    } else {
      window.localStorage.removeItem(CURRENT_KEY);
    }
  }

  function uid() {
    return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // ---------------------------------------------------------------
  // Baseline profile storage
  //
  // Baseline profiles are standalone, reusable and separate from any
  // one assessment — saved under their own localStorage key, so the
  // same baseline (e.g. a regulator-agreed target) can be applied to
  // several assessments and exported/imported independently of them.
  //   { id, name, createdAt, updatedAt,
  //     targets: { "<outcomeId>": "not"|"partial"|"achieved" } }
  // Targets are set per contributing outcome (e.g. "A1.a", "C1.d") —
  // not per principle — since a baseline can legitimately expect more
  // of one outcome within a principle than another. An outcome with no
  // key (or an empty value) in "targets" has no baseline target set.
  // ---------------------------------------------------------------

  function loadBaselines() {
    try {
      var raw = window.localStorage.getItem(BASELINE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Could not read baseline profiles from localStorage', e);
      return [];
    }
  }

  function saveBaselines(list) {
    try {
      window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Could not write baseline profiles to localStorage', e);
      showToast('Could not save baseline profile — your browser storage may be full or blocked.');
      return false;
    }
  }

  function baselineUid() {
    return 'bl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // ---------------------------------------------------------------
  // Result normalisation + suggestion logic
  // ---------------------------------------------------------------

  function normalizeResult(raw) {
    if (!raw) return { checks: {}, override: null, notes: '' };
    return { checks: raw.checks || {}, override: raw.override || null, notes: raw.notes || '' };
  }

  function computeSuggestedStatus(outcome, checks) {
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

  function effectiveStatus(outcome, result) {
    return result.override || computeSuggestedStatus(outcome, result.checks);
  }

  // ---------------------------------------------------------------
  // Assessment CRUD
  // ---------------------------------------------------------------

  var assessments = loadAssessments();
  var currentId = getCurrentId();
  var baselines = loadBaselines();
  var currentBaselineEditId = null;

  function findBaseline(id) {
    for (var i = 0; i < baselines.length; i++) {
      if (baselines[i].id === id) return baselines[i];
    }
    return null;
  }

  function createBaseline(name) {
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
    assessments.forEach(function (a) {
      if (a.baselineId === id) {
        a.baselineId = null;
        if (a.id === currentId) affectedCurrent = true;
      }
    });
    saveAssessments(assessments);
    renderBaselineSidebar();
    refreshBaselineSelectOptions();
    if (affectedCurrent) {
      el.baselineSelect.value = '';
      applyBaselineBorders();
      updateBaselineLegend();
      applyBaselineToFramework();
    }
  }

  function findAssessment(id) {
    for (var i = 0; i < assessments.length; i++) {
      if (assessments[i].id === id) return assessments[i];
    }
    return null;
  }

  function createAssessment(name) {
    var assessment = {
      id: uid(),
      name: name || 'Untitled assessment',
      org: '',
      assessor: '',
      baselineId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      results: {}
    };
    assessments.push(assessment);
    saveAssessments(assessments);
    currentId = assessment.id;
    setCurrentId(currentId);
    renderSidebar();
    renderCurrentAssessment();
    return assessment;
  }

  function deleteAssessment(id) {
    assessments = assessments.filter(function (a) { return a.id !== id; });
    saveAssessments(assessments);
    if (currentId === id) {
      currentId = assessments.length ? assessments[0].id : null;
      setCurrentId(currentId);
    }
    renderSidebar();
    renderCurrentAssessment();
  }

  function touchCurrent() {
    var a = findAssessment(currentId);
    if (a) {
      a.updatedAt = nowIso();
      saveAssessments(assessments);
    }
  }

  // ---------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------

  var el = {
    sidebar: document.getElementById('app-sidebar'),
    btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    list: document.getElementById('assessment-list'),
    listEmpty: document.getElementById('assessment-list-empty'),
    emptyState: document.getElementById('empty-state'),
    assessmentView: document.getElementById('assessment-view'),
    nameInput: document.getElementById('input-assessment-name'),
    orgInput: document.getElementById('input-org-name'),
    assessorInput: document.getElementById('input-assessor-name'),
    deleteBtn: document.getElementById('btn-delete-assessment'),
    framework: document.getElementById('framework'),
    outcomeGrid: document.getElementById('outcome-grid'),
    objectiveBars: document.getElementById('objective-bars'),
    scorePct: document.getElementById('score-percentage'),
    scoreRingValue: document.getElementById('score-ring-value'),
    countAchieved: document.getElementById('count-achieved'),
    countPartial: document.getElementById('count-partial'),
    countNot: document.getElementById('count-not'),
    countNa: document.getElementById('count-na'),
    countUnset: document.getElementById('count-unset'),
    toast: document.getElementById('toast'),
    newAssessmentModal: document.getElementById('new-assessment-modal'),
    newAssessmentForm: document.getElementById('new-assessment-form'),
    newAssessmentNameInput: document.getElementById('new-assessment-name'),
    newAssessmentCancel: document.getElementById('new-assessment-cancel'),
    dialogModal: document.getElementById('dialog-modal'),
    dialogTitle: document.getElementById('dialog-modal-title'),
    dialogMessage: document.getElementById('dialog-modal-message'),
    dialogCancel: document.getElementById('dialog-modal-cancel'),
    dialogConfirm: document.getElementById('dialog-modal-confirm'),
    baselineList: document.getElementById('baseline-list'),
    baselineListEmpty: document.getElementById('baseline-list-empty'),
    baselineSelect: document.getElementById('input-baseline-select'),
    baselineLegend: document.getElementById('baseline-legend'),
    baselineModal: document.getElementById('baseline-modal'),
    baselineNameInput: document.getElementById('baseline-name-input'),
    baselineTargetList: document.getElementById('baseline-target-list'),
    baselineModalDelete: document.getElementById('baseline-modal-delete'),
    baselineModalExport: document.getElementById('baseline-modal-export'),
    baselineModalClose: document.getElementById('baseline-modal-close'),
    btnNewBaseline: document.getElementById('btn-new-baseline'),
    btnImportBaseline: document.getElementById('btn-import-baseline'),
    inputImportBaseline: document.getElementById('input-import-baseline'),
    themeToggle: document.getElementById('theme-toggle'),
    fontSizeToggle: document.getElementById('fontsize-toggle')
  };

  var RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  // ---------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------

  function renderSidebar() {
    el.list.innerHTML = '';
    el.listEmpty.hidden = assessments.length > 0;

    assessments
      .slice()
      .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); })
      .forEach(function (a) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'assessment-list__item';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', String(a.id === currentId));
        btn.innerHTML =
          '<span class="assessment-list__name"></span>' +
          '<span class="assessment-list__org"></span>';
        btn.querySelector('.assessment-list__name').textContent = a.name || 'Untitled assessment';
        btn.querySelector('.assessment-list__org').textContent = a.org || 'No organisation set';
        btn.addEventListener('click', function () {
          currentId = a.id;
          setCurrentId(currentId);
          renderSidebar();
          renderCurrentAssessment();
        });
        li.appendChild(btn);
        el.list.appendChild(li);
      });
  }

  // ---------------------------------------------------------------
  // Baseline profile sidebar, modal, and application to the grid
  // ---------------------------------------------------------------

  function renderBaselineSidebar() {
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
        exportBtn.textContent = '\u2193';
        exportBtn.addEventListener('click', function (evt) {
          evt.stopPropagation();
          exportBaselineJson(b.id);
        });

        li.appendChild(nameBtn);
        li.appendChild(exportBtn);
        el.baselineList.appendChild(li);
      });
  }

  function refreshBaselineSelectOptions() {
    var a = findAssessment(currentId);
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
    var a = findAssessment(currentId);
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
      var a = findAssessment(currentId);
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

  var baselineNameDebounce = null;
  el.baselineNameInput.addEventListener('input', function () {
    var baseline = findBaseline(currentBaselineEditId);
    if (!baseline) return;
    baseline.name = el.baselineNameInput.value;
    clearTimeout(baselineNameDebounce);
    baselineNameDebounce = setTimeout(function () {
      touchBaseline(baseline.id);
      renderBaselineSidebar();
      refreshBaselineSelectOptions();
    }, 300);
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
    var blob = new Blob([JSON.stringify(baseline, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var safeName = (baseline.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = (safeName || 'baseline') + '-CAFBaseline.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported ' + link.download);
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

  function applyBaselineBorders() {
    var a = findAssessment(currentId);
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
  function applyBaselineToFramework() {
    var a = findAssessment(currentId);
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

  function updateBaselineLegend() {
    var a = findAssessment(currentId);
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

  // ---------------------------------------------------------------
  // Framework rendering (built once; state re-applied per assessment)
  // ---------------------------------------------------------------

  var frameworkBuilt = false;

  function overrideButtonsFor(outcome) {
    var opts = [
      { key: 'not', cls: 'opt-not', label: 'Not achieved' }
    ];
    if (outcome.type === 3) {
      opts.push({ key: 'partial', cls: 'opt-partial', label: 'Partially achieved' });
    }
    opts.push({ key: 'achieved', cls: 'opt-achieved', label: 'Achieved' });
    opts.push({ key: 'na', cls: 'opt-na', label: 'N/A' });
    return opts;
  }

  function buildFramework() {
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
    badge.textContent = STATUS_META.unset.label;
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

    var debounceTimer = null;
    notesTextarea.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        setNotes(outcome.id, notesTextarea.value);
      }, 400);
    });

    notesRow.appendChild(notesLabel);
    notesRow.appendChild(notesTextarea);
    body.appendChild(notesRow);

    card.appendChild(body);
    return card;
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

      var span = document.createElement('span');
      span.textContent = text;

      row.appendChild(input);
      row.appendChild(span);
      list.appendChild(row);
    });
    col.appendChild(list);
    return col;
  }

  // ---------------------------------------------------------------
  // Outcome grid (dashboard signature element)
  // ---------------------------------------------------------------

  var gridBuilt = false;

  function buildOutcomeGrid() {
    if (gridBuilt) return;
    var frag = document.createDocumentFragment();
    allOutcomes.forEach(function (entry) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'outcome-dot';
      dot.id = 'grid-dot-' + entry.outcome.id;
      dot.title = entry.outcome.id + ' — ' + entry.outcome.title;
      dot.setAttribute('aria-label', 'Jump to outcome ' + entry.outcome.id + ', ' + entry.outcome.title);
      dot.addEventListener('click', function () {
        var target = document.getElementById('outcome-' + entry.outcome.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.outline = '2px solid var(--gold-500)';
          setTimeout(function () { target.style.outline = ''; }, 1200);
        }
      });
      frag.appendChild(dot);
    });
    el.outcomeGrid.appendChild(frag);
    gridBuilt = true;
  }

  // ---------------------------------------------------------------
  // State application + scoring
  // ---------------------------------------------------------------

  function setChecked(outcomeId, checkKey, checked) {
    var a = findAssessment(currentId);
    if (!a) return;
    var r = normalizeResult(a.results[outcomeId]);
    r.checks[checkKey] = checked;
    a.results[outcomeId] = r;
    touchCurrent();
    applyOutcomeState(outcomeId, r);
    updateDashboard();
  }

  function setOverride(outcomeId, status) {
    var a = findAssessment(currentId);
    if (!a) return;
    var r = normalizeResult(a.results[outcomeId]);
    r.override = (r.override === status) ? null : status;
    a.results[outcomeId] = r;
    touchCurrent();
    applyOutcomeState(outcomeId, r);
    updateDashboard();
    renderSidebar();
  }

  function setNotes(outcomeId, notes) {
    var a = findAssessment(currentId);
    if (!a) return;
    var r = normalizeResult(a.results[outcomeId]);
    r.notes = notes;
    a.results[outcomeId] = r;
    touchCurrent();
  }

  function applyOutcomeState(outcomeId, rawResult) {
    var outcome = outcomesById[outcomeId];
    var r = normalizeResult(rawResult);
    var effective = effectiveStatus(outcome, r);

    var card = document.getElementById('outcome-' + outcomeId);
    if (card) {
      var checkboxes = card.querySelectorAll('input[type="checkbox"][data-check-key]');
      checkboxes.forEach(function (cb) {
        cb.checked = !!r.checks[cb.getAttribute('data-check-key')];
      });

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
        badge.textContent = STATUS_META[key].label + suffix;
      }

      var textarea = card.querySelector('[data-notes-for="' + outcomeId + '"]');
      if (textarea) textarea.value = r.notes || '';
    }

    var dot = document.getElementById('grid-dot-' + outcomeId);
    if (dot) {
      dot.className = 'outcome-dot';
      if (effective) dot.classList.add('status-' + effective);
    }
  }

  function applyAllState(assessment) {
    allOutcomes.forEach(function (entry) {
      var result = assessment ? assessment.results[entry.outcome.id] : null;
      applyOutcomeState(entry.outcome.id, result);
    });
  }

  function scoreFor(entries, results) {
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

  function updateDashboard() {
    var a = findAssessment(currentId);
    var results = a ? a.results : {};
    var overall = scoreFor(allOutcomes, results);

    el.scorePct.textContent = overall.pct + '%';
    var offset = RING_CIRCUMFERENCE * (1 - overall.pct / 100);
    el.scoreRingValue.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.scoreRingValue.style.strokeDashoffset = String(offset);

    el.countAchieved.textContent = overall.counts.achieved;
    el.countPartial.textContent = overall.counts.partial;
    el.countNot.textContent = overall.counts.not;
    el.countNa.textContent = overall.counts.na;
    el.countUnset.textContent = overall.counts.unset;

    el.objectiveBars.innerHTML = '';
    DATASET.forEach(function (objective) {
      var entries = [];
      objective.principles.forEach(function (p) {
        p.outcomes.forEach(function (o) {
          entries.push({ objectiveId: objective.id, principleId: p.id, outcome: o });
        });
      });
      var s = scoreFor(entries, results);
      var bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'objective-bar';
      bar.setAttribute('aria-label', 'Jump to Objective ' + objective.id + ', ' + objective.title);
      bar.innerHTML =
        '<div class="objective-bar__head">' +
        '  <span class="objective-bar__code">Obj ' + objective.id + '</span>' +
        '  <span class="objective-bar__pct">' + s.pct + '%</span>' +
        '</div>' +
        '<span class="objective-bar__title"></span>' +
        '<div class="objective-bar__track"><div class="objective-bar__fill" style="width:' + s.pct + '%"></div></div>';
      bar.querySelector('.objective-bar__title').textContent = objective.title;
      bar.addEventListener('click', function () {
        var target = document.getElementById('objective-' + objective.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.style.outline = '2px solid var(--gold-500)';
          setTimeout(function () { target.style.outline = ''; }, 1200);
        }
      });
      el.objectiveBars.appendChild(bar);
    });
  }

  // ---------------------------------------------------------------
  // Current assessment render
  // ---------------------------------------------------------------

  function renderCurrentAssessment() {
    var a = findAssessment(currentId);
    if (!a) {
      el.emptyState.hidden = false;
      el.assessmentView.hidden = true;
      return;
    }
    el.emptyState.hidden = true;
    el.assessmentView.hidden = false;

    buildFramework();
    buildOutcomeGrid();

    el.nameInput.value = a.name || '';
    el.orgInput.value = a.org || '';
    el.assessorInput.value = a.assessor || '';

    applyAllState(a);
    updateDashboard();
    refreshBaselineSelectOptions();
    applyBaselineBorders();
    updateBaselineLegend();
    applyBaselineToFramework();
  }

  // ---------------------------------------------------------------
  // Meta field bindings
  // ---------------------------------------------------------------

  function bindMetaField(input, prop) {
    var t = null;
    input.addEventListener('input', function () {
      var a = findAssessment(currentId);
      if (!a) return;
      a[prop] = input.value;
      clearTimeout(t);
      t = setTimeout(function () {
        touchCurrent();
        renderSidebar();
      }, 300);
    });
  }

  bindMetaField(el.nameInput, 'name');
  bindMetaField(el.orgInput, 'org');
  bindMetaField(el.assessorInput, 'assessor');

  el.deleteBtn.addEventListener('click', function () {
    var a = findAssessment(currentId);
    if (!a) return;
    showDialog({
      title: 'Delete this assessment?',
      message: '"' + (a.name || 'Untitled assessment') + '" will be permanently deleted. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      onConfirm: function () {
        deleteAssessment(a.id);
        showToast('Assessment deleted.');
      }
    });
  });

  // ---------------------------------------------------------------
  // Generic dialog modal (confirmations + messages) — replaces
  // window.confirm() / window.alert() with in-page UI.
  // ---------------------------------------------------------------

  var dialogOnConfirm = null;

  function showDialog(opts) {
    el.dialogTitle.textContent = opts.title || '';
    el.dialogMessage.textContent = opts.message || '';
    el.dialogConfirm.textContent = opts.confirmLabel || 'OK';
    el.dialogConfirm.className = 'btn ' + (opts.tone === 'danger' ? 'btn--danger' : 'btn--primary');
    if (opts.cancelLabel) {
      el.dialogCancel.hidden = false;
      el.dialogCancel.textContent = opts.cancelLabel;
    } else {
      el.dialogCancel.hidden = true;
    }
    dialogOnConfirm = typeof opts.onConfirm === 'function' ? opts.onConfirm : null;
    el.dialogModal.hidden = false;
    window.setTimeout(function () { el.dialogConfirm.focus(); }, 20);
  }

  function closeDialog() {
    el.dialogModal.hidden = true;
    dialogOnConfirm = null;
  }

  el.dialogConfirm.addEventListener('click', function () {
    var cb = dialogOnConfirm;
    closeDialog();
    if (cb) cb();
  });

  el.dialogCancel.addEventListener('click', closeDialog);

  el.dialogModal.addEventListener('click', function (evt) {
    if (evt.target === el.dialogModal) closeDialog();
  });

  // ---------------------------------------------------------------
  // New / import / export / print
  // ---------------------------------------------------------------

  function openNewAssessmentModal() {
    el.newAssessmentNameInput.value = '';
    el.newAssessmentModal.hidden = false;
    // Focus after the browser has actually unhidden the element.
    window.setTimeout(function () { el.newAssessmentNameInput.focus(); }, 20);
  }

  function closeNewAssessmentModal() {
    el.newAssessmentModal.hidden = true;
  }

  el.newAssessmentForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
    var name = el.newAssessmentNameInput.value.trim() || 'Untitled assessment';
    createAssessment(name);
    closeNewAssessmentModal();
    showToast('New assessment created.');
  });

  el.newAssessmentCancel.addEventListener('click', closeNewAssessmentModal);

  el.newAssessmentModal.addEventListener('click', function (evt) {
    if (evt.target === el.newAssessmentModal) closeNewAssessmentModal();
  });

  document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    if (!el.newAssessmentModal.hidden) closeNewAssessmentModal();
    if (!el.dialogModal.hidden) closeDialog();
  });

  document.getElementById('btn-new-assessment').addEventListener('click', openNewAssessmentModal);
  document.getElementById('btn-new-assessment-cta').addEventListener('click', openNewAssessmentModal);

  document.getElementById('btn-print').addEventListener('click', function () {
    window.print();
  });

  document.getElementById('btn-storage-info').addEventListener('click', function () {
    showDialog({
      title: 'Your data never leaves this browser',
      message: 'This tool is fully static and has no server or backend of any kind — nothing you type is ever sent, uploaded or transmitted anywhere. Assessment names, statuses, notes, organisation details and baseline profiles are written only to this browser’s local storage, on this device. Nobody else, including whoever hosts this page, can see or access your data. It stays on this device until you clear your browser data, use a different browser, or use a different device — none of which will carry your assessments across. Use "Export assessment (.json)" in the sidebar to back up or move an assessment yourself.'
    });
  });

  document.getElementById('btn-export-json').addEventListener('click', function () {
    var a = findAssessment(currentId);
    if (!a) { showToast('Select or create an assessment first.'); return; }
    var blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var safeName = (a.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = (safeName || 'assessment') + '-CAFAssessment.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported ' + link.download);
  });

  document.getElementById('btn-import-json').addEventListener('click', function () {
    document.getElementById('input-import-json').click();
  });

  document.getElementById('input-import-json').addEventListener('change', function (evt) {
    var file = evt.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = JSON.parse(reader.result);
        if (!imported || typeof imported !== 'object' || !imported.results) {
          throw new Error('File does not look like a CAF assessment export.');
        }
        imported.id = uid(); // avoid clobbering an existing assessment with the same id
        imported.updatedAt = nowIso();
        if (!imported.name) imported.name = 'Imported assessment';
        // A baselineId from another browser/device won't correspond to any
        // baseline profile saved here, so don't carry over a dangling
        // reference — the assessor can re-attach the right profile locally.
        if (!imported.baselineId || !findBaseline(imported.baselineId)) {
          imported.baselineId = null;
        }
        assessments.push(imported);
        saveAssessments(assessments);
        currentId = imported.id;
        setCurrentId(currentId);
        renderSidebar();
        renderCurrentAssessment();
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

  // ---------------------------------------------------------------
  // Sidebar toggle
  // ---------------------------------------------------------------
  // Desktop: the sidebar is a permanent column that can be collapsed to
  // reclaim width, and the preference is remembered. Mobile/tablet: the
  // sidebar is an off-canvas drawer over the content (see the max-width
  // media query in style.css) that always starts closed. Both cases are
  // driven by the same open/closed toggle so there's one code path.

  var sidebarBreakpoint = window.matchMedia('(min-width: 921px)');

  function isSidebarDesktop() { return sidebarBreakpoint.matches; }

  function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    document.body.classList.toggle('sidebar-collapsed', !open);
    el.btnToggleSidebar.setAttribute('aria-expanded', String(open));
    el.sidebarBackdrop.hidden = !open;
  }

  function initSidebarState() {
    var collapsed = false;
    try { collapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch (e) {}
    setSidebarOpen(isSidebarDesktop() ? !collapsed : false);
  }

  el.btnToggleSidebar.addEventListener('click', function () {
    var open = !document.body.classList.contains('sidebar-open');
    setSidebarOpen(open);
    if (isSidebarDesktop()) {
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, open ? '0' : '1'); } catch (e) {}
    }
  });

  el.sidebarBackdrop.addEventListener('click', function () { setSidebarOpen(false); });

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape' && !isSidebarDesktop() && document.body.classList.contains('sidebar-open')) {
      setSidebarOpen(false);
    }
  });

  // Crossing the desktop/mobile breakpoint changes what "open" should
  // mean (permanent column vs. off-canvas drawer), so recompute rather
  // than carry over whatever state the other layout left behind.
  if (sidebarBreakpoint.addEventListener) {
    sidebarBreakpoint.addEventListener('change', initSidebarState);
  } else if (sidebarBreakpoint.addListener) {
    sidebarBreakpoint.addListener(initSidebarState);
  }

  // On mobile, picking something in the drawer should close it so the
  // result (a modal, a switched assessment) is immediately visible.
  el.sidebar.addEventListener('click', function (evt) {
    if (isSidebarDesktop()) return;
    if (evt.target.closest('button, a')) setSidebarOpen(false);
  });

  initSidebarState();

  // ---------------------------------------------------------------
  // Theme (light / dark / system) and text size
  // ---------------------------------------------------------------
  // The attribute is already set on <html> by an inline script in <head>
  // (before this file loads) so the correct theme paints on first frame
  // instead of flashing light-then-dark. This section just keeps the
  // toggle buttons in sync and reacts to further changes.

  var systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function getStoredTheme() {
    try { return window.localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function setToggleGroupPressed(group, value) {
    group.querySelectorAll('button[data-value]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    });
  }

  function applyTheme(mode) {
    var resolved = mode === 'system' ? (systemDarkQuery.matches ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    setToggleGroupPressed(el.themeToggle, mode);
  }

  function setTheme(mode) {
    try { window.localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    applyTheme(mode);
  }

  el.themeToggle.addEventListener('click', function (evt) {
    var btn = evt.target.closest('button[data-value]');
    if (!btn) return;
    setTheme(btn.dataset.value);
  });

  // Only follow the OS preference live while "System" is selected — an
  // explicit Light/Dark choice shouldn't be overridden by it changing.
  var handleSystemThemeChange = function () {
    if ((getStoredTheme() || 'system') === 'system') applyTheme('system');
  };
  if (systemDarkQuery.addEventListener) {
    systemDarkQuery.addEventListener('change', handleSystemThemeChange);
  } else if (systemDarkQuery.addListener) {
    systemDarkQuery.addListener(handleSystemThemeChange);
  }

  applyTheme(getStoredTheme() || 'system');

  function getStoredFontSize() {
    try { return window.localStorage.getItem(FONT_SIZE_KEY); } catch (e) { return null; }
  }

  function applyFontSize(size) {
    document.documentElement.setAttribute('data-font-size', size);
    setToggleGroupPressed(el.fontSizeToggle, size);
  }

  function setFontSize(size) {
    try { window.localStorage.setItem(FONT_SIZE_KEY, size); } catch (e) {}
    applyFontSize(size);
  }

  el.fontSizeToggle.addEventListener('click', function (evt) {
    var btn = evt.target.closest('button[data-value]');
    if (!btn) return;
    setFontSize(btn.dataset.value);
  });

  applyFontSize(getStoredFontSize() || 'standard');

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------

  var toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------

  if (currentId && !findAssessment(currentId)) {
    currentId = null;
    setCurrentId(null);
  }
  if (!currentId && assessments.length) {
    currentId = assessments
      .slice()
      .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); })[0].id;
    setCurrentId(currentId);
  }

  renderSidebar();
  renderBaselineSidebar();
  renderCurrentAssessment();
})();
