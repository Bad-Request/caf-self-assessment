// localStorage persistence for assessments and baseline profiles. Nothing
// here is ever sent to a server — this app has none.

import { showToast } from './ui-shell.js';

const STORAGE_KEY = 'caf_assessments_v1';
const CURRENT_KEY = 'caf_current_assessment_id_v1';
const BASELINE_STORAGE_KEY = 'caf_baselines_v1';

export function loadAssessments() {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Could not read assessments from localStorage', e);
    return [];
  }
}

export function saveAssessments(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error('Could not write assessments to localStorage', e);
    showToast('Could not save — your browser storage may be full or blocked.');
    return false;
  }
}

export function getCurrentId() {
  return window.localStorage.getItem(CURRENT_KEY);
}

export function setCurrentId(id) {
  if (id) {
    window.localStorage.setItem(CURRENT_KEY, id);
  } else {
    window.localStorage.removeItem(CURRENT_KEY);
  }
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

export function loadBaselines() {
  try {
    var raw = window.localStorage.getItem(BASELINE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Could not read baseline profiles from localStorage', e);
    return [];
  }
}

export function saveBaselines(list) {
  try {
    window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error('Could not write baseline profiles to localStorage', e);
    showToast('Could not save baseline profile — your browser storage may be full or blocked.');
    return false;
  }
}
