// localStorage persistence for assessments and baseline profiles. Nothing
// here is ever sent to a server — this app has none.
//
// Baseline profiles are standalone, reusable and separate from any one
// assessment — saved under their own key, so the same baseline (e.g. a
// regulator-agreed target) can be applied to several assessments and
// exported/imported independently of them:
//   { id, name, createdAt, updatedAt,
//     targets: { "<outcomeId>": "not"|"partial"|"achieved" } }
// Targets are set per contributing outcome (e.g. "A1.a", "C1.d") — not per
// principle — since a baseline can legitimately expect more of one outcome
// within a principle than another. An outcome with no key (or an empty
// value) in "targets" has no baseline target set.

import { showToast } from './ui-shell.js';

export const ASSESSMENTS_KEY = 'caf_assessments_v1';
export const BASELINES_KEY = 'caf_baselines_v1';
const CURRENT_KEY = 'caf_current_assessment_id_v1';

export function loadList(key) {
  try {
    var raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Could not read ' + key + ' from localStorage', e);
    return [];
  }
}

export function saveList(key, list) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error('Could not write ' + key + ' to localStorage', e);
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
