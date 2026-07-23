// Score ring, status counts and per-objective bars.

import { el, RING_CIRCUMFERENCE } from './dom.js';
import { DATASET, allOutcomes, scoreFor } from './model.js';
import { findAssessment, getCurrentAssessmentId } from './assessments.js';

export function updateDashboard() {
  var a = findAssessment(getCurrentAssessmentId());
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
