// Score ring, status counts, per-objective bars and flagged outcomes.

import { el, RING_CIRCUMFERENCE } from './dom.js';
import { DATASET, allOutcomes, scoreFor, flaggedOutcomes, FLAG_KEYS, FLAG_LABEL, outcomesById } from './model.js';
import { flashTo } from './utils.js';
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
    var s = scoreFor(allOutcomes.filter(function (e) { return e.objectiveId === objective.id; }), results);
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
      flashTo(document.getElementById('objective-' + objective.id), 'start');
    });
    el.objectiveBars.appendChild(bar);
  });

  renderFlagSummary(flaggedOutcomes(allOutcomes, results));
}

function renderFlagSummary(flagged) {
  el.flagSummary.innerHTML = '';
  FLAG_KEYS.forEach(function (flag) {
    var ids = flagged[flag];
    var row = document.createElement('div');
    row.className = 'flag-summary__row';
    row.innerHTML =
      '<dt><span class="flag-marker flag-marker--' + flag + '" aria-hidden="true"></span><span></span></dt>' +
      '<dd class="flag-summary__count"></dd>' +
      '<dd class="flag-summary__ids"></dd>';
    row.querySelector('.flag-marker').textContent = FLAG_MARKER[flag];
    row.querySelector('dt span:last-child').textContent = FLAG_LABEL[flag];
    row.querySelector('.flag-summary__count').textContent = ids.length;
    var list = row.querySelector('.flag-summary__ids');
    if (!ids.length) {
      list.textContent = 'None';
      list.classList.add('flag-summary__ids--none');
    }
    ids.forEach(function (id) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'flag-chip';
      chip.textContent = id;
      chip.title = id + ' — ' + outcomesById[id].title;
      chip.setAttribute('aria-label', 'Jump to outcome ' + id + ', ' + outcomesById[id].title);
      chip.addEventListener('click', function () {
        flashTo(document.getElementById('outcome-' + id), 'center');
      });
      list.appendChild(chip);
    });
    el.flagSummary.appendChild(row);
  });
}

// Must match the grid tile markers in style.css.
var FLAG_MARKER = { wip: '⋯', review: '✓', question: '?' };
