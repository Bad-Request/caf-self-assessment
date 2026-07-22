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

  var DATASET = window.CAF_DATASET || [];

  var STATUS_META = {
    not: { label: 'Not achieved' },
    partial: { label: 'Partially achieved' },
    achieved: { label: 'Achieved' },
    na: { label: 'Not applicable' },
    unset: { label: 'Not yet assessed' }
  };

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
  // Result normalisation + suggestion logic
  // ---------------------------------------------------------------

  function normalizeResult(raw) {
    if (!raw) return { checks: {}, override: null, notes: '' };
    var checks = raw.checks || {};
    // Back-compat: assessments saved before this version stored a plain
    // "status" field with no checkboxes. Treat that as a manual override.
    var override = (typeof raw.override !== 'undefined') ? raw.override : (raw.status || null);
    var notes = raw.notes || '';
    return { checks: checks, override: override || null, notes: notes };
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
    toast: document.getElementById('toast')
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
          '<h3></h3><p></p>';
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
    toggle.textContent = 'Tick indicators to assess this outcome';
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
      toggle.textContent = expanded ? 'Tick indicators to assess this outcome' : 'Hide indicators';
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
      var bar = document.createElement('div');
      bar.className = 'objective-bar';
      bar.innerHTML =
        '<div class="objective-bar__head">' +
        '  <div><span class="objective-bar__code">Obj ' + objective.id + '</span><br>' +
        '  <span class="objective-bar__title"></span></div>' +
        '  <span class="objective-bar__pct">' + s.pct + '%</span>' +
        '</div>' +
        '<div class="objective-bar__track"><div class="objective-bar__fill" style="width:' + s.pct + '%"></div></div>';
      bar.querySelector('.objective-bar__title').textContent = objective.title;
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
    if (window.confirm('Delete "' + (a.name || 'this assessment') + '"? This cannot be undone.')) {
      deleteAssessment(a.id);
      showToast('Assessment deleted.');
    }
  });

  // ---------------------------------------------------------------
  // New / import / export / print
  // ---------------------------------------------------------------

  function promptNewAssessment() {
    var name = window.prompt('Name this assessment (e.g. organisation + year):', 'New CAF assessment');
    if (name === null) return;
    createAssessment(name.trim() || 'Untitled assessment');
    showToast('New assessment created.');
  }

  document.getElementById('btn-new-assessment').addEventListener('click', promptNewAssessment);
  document.getElementById('btn-new-assessment-cta').addEventListener('click', promptNewAssessment);

  document.getElementById('btn-print').addEventListener('click', function () {
    window.print();
  });

  document.getElementById('btn-export-json').addEventListener('click', function () {
    var a = findAssessment(currentId);
    if (!a) { showToast('Select or create an assessment first.'); return; }
    var blob = new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var safeName = (a.name || 'caf-assessment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = (safeName || 'caf-assessment') + '.json';
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
        assessments.push(imported);
        saveAssessments(assessments);
        currentId = imported.id;
        setCurrentId(currentId);
        renderSidebar();
        renderCurrentAssessment();
        showToast('Imported "' + imported.name + '".');
      } catch (e) {
        window.alert('Could not import this file: ' + e.message);
      } finally {
        evt.target.value = '';
      }
    };
    reader.readAsText(file);
  });

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
  renderCurrentAssessment();
})();
