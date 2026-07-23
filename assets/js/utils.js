// Small, dependency-free helpers shared across modules.

export function uid() {
  return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function baselineUid() {
  return 'bl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
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
  return function () {
    var args = arguments;
    var ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}
