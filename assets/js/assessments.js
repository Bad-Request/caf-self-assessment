// Assessment records: in-memory list + the currently-selected one,
// persisted via storage.js. Deliberately has no knowledge of the
// framework/dashboard/baseline rendering — call setOnCurrentChanged()
// once at startup to be notified when the selected assessment changes.

import { el } from './dom.js';
import { loadAssessments, saveAssessments, getCurrentId, setCurrentId } from './storage.js';
import { uid, nowIso } from './utils.js';

var assessments = loadAssessments();
var currentId = getCurrentId();
var onCurrentChanged = function () {};

export function setOnCurrentChanged(fn) {
  onCurrentChanged = fn;
}

export function getAssessments() {
  return assessments;
}

export function getCurrentAssessmentId() {
  return currentId;
}

export function findAssessment(id) {
  for (var i = 0; i < assessments.length; i++) {
    if (assessments[i].id === id) return assessments[i];
  }
  return null;
}

export function persistAssessments() {
  saveAssessments(assessments);
}

export function touchCurrent() {
  var a = findAssessment(currentId);
  if (a) {
    a.updatedAt = nowIso();
    saveAssessments(assessments);
  }
}

function selectAssessment(id) {
  currentId = id;
  setCurrentId(currentId);
  renderSidebar();
  onCurrentChanged();
}

export function createAssessment(name) {
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
  selectAssessment(assessment.id);
  return assessment;
}

export function deleteAssessment(id) {
  assessments = assessments.filter(function (a) { return a.id !== id; });
  saveAssessments(assessments);
  if (currentId === id) {
    selectAssessment(assessments.length ? assessments[0].id : null);
  } else {
    renderSidebar();
  }
}

// Adds an already-prepared assessment object (e.g. from a JSON import) and
// makes it the current selection.
export function addImportedAssessment(assessment) {
  assessments.push(assessment);
  saveAssessments(assessments);
  selectAssessment(assessment.id);
}

export function renderSidebar() {
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
      btn.addEventListener('click', function () { selectAssessment(a.id); });
      li.appendChild(btn);
      el.list.appendChild(li);
    });
}

// If the last-selected assessment no longer exists, or none was ever
// selected, fall back to the most recently updated one (if any).
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
