// Wires the other modules together: renders the selected assessment,
// and handles the bits of UI that span more than one module (new/delete
// assessment, JSON import/export, meta field bindings, print).

import { el } from './dom.js';
import { uid, nowIso, debounce } from './utils.js';
import { showDialog, showToast } from './ui-shell.js';
import { downloadJson } from './download.js';
import {
  renderSidebar, findAssessment, getCurrentAssessmentId, createAssessment,
  deleteAssessment, addImportedAssessment, touchCurrent, setOnCurrentChanged
} from './assessments.js';
import {
  renderBaselineSidebar, refreshBaselineSelectOptions, applyBaselineBorders,
  updateBaselineLegend, applyBaselineToFramework, findBaseline
} from './baselines.js';
import { buildFramework, buildOutcomeGrid, applyAllState } from './framework.js';
import { updateDashboard } from './dashboard.js';

// ---------------------------------------------------------------
// Current assessment render
// ---------------------------------------------------------------

function renderCurrentAssessment() {
  var a = findAssessment(getCurrentAssessmentId());
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

setOnCurrentChanged(renderCurrentAssessment);

// ---------------------------------------------------------------
// Meta field bindings
// ---------------------------------------------------------------

function bindMetaField(input, prop) {
  var persistChange = debounce(function () {
    touchCurrent();
    renderSidebar();
  }, 300);
  input.addEventListener('input', function () {
    var a = findAssessment(getCurrentAssessmentId());
    if (!a) return;
    a[prop] = input.value;
    persistChange();
  });
}

bindMetaField(el.nameInput, 'name');
bindMetaField(el.orgInput, 'org');
bindMetaField(el.assessorInput, 'assessor');

el.deleteBtn.addEventListener('click', function () {
  var a = findAssessment(getCurrentAssessmentId());
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
// New assessment modal
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
  if (evt.key === 'Escape' && !el.newAssessmentModal.hidden) closeNewAssessmentModal();
});

document.getElementById('btn-new-assessment').addEventListener('click', openNewAssessmentModal);
document.getElementById('btn-new-assessment-cta').addEventListener('click', openNewAssessmentModal);

// ---------------------------------------------------------------
// Print / storage-info / import / export
// ---------------------------------------------------------------

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
  var a = findAssessment(getCurrentAssessmentId());
  if (!a) { showToast('Select or create an assessment first.'); return; }
  var filename = downloadJson(a, 'CAFAssessment', 'assessment');
  showToast('Exported ' + filename);
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
      addImportedAssessment(imported);
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
// Init
// ---------------------------------------------------------------

renderSidebar();
renderBaselineSidebar();
renderCurrentAssessment();
