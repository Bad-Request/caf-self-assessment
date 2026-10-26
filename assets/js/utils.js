// Small, dependency-free helpers shared across modules.

export function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function nowIso() {
  return new Date().toISOString();
}

// Trailing-edge debounce: delays invoking fn until `wait` ms after the
// last call. Used to coalesce rapid typing into a single persist/render
// pass — the caller is responsible for applying any state change to the
// in-memory model immediately (before debouncing), so a delayed run never
// reads state that's since moved on (e.g. the user switching to a
// different saved assessment while a keystroke's write is still pending).
export function debounce(fn, wait) {
  var timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(function () { fn(...args); }, wait);
  };
}

export function byNewest(a, b) { return b.updatedAt.localeCompare(a.updatedAt); }
export function byName(a, b) { return (a.name || '').localeCompare(b.name || ''); }

// Scrolls a section into view and briefly outlines it so the eye lands on it.
export function flashTo(target, block) {
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: block });
  target.style.outline = '2px solid var(--gold-500)';
  setTimeout(function () { target.style.outline = ''; }, 1200);
}

// Save an object as a downloaded .json file; returns the filename used.
export function downloadJson(data, suffix, fallbackName) {
  var safeName = (data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  var filename = (safeName || fallbackName) + '-' + suffix + '.json';
  var link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return filename;
}
