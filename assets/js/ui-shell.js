// Chrome that has no domain knowledge: toast, the generic confirm/message
// dialog, the sidebar open/collapse behaviour, and theme/text-size
// preferences. Self-wires its own listeners on import, same as the rest
// of the app's init-on-load style.

import { el } from './dom.js';

const SIDEBAR_COLLAPSED_KEY = 'caf_sidebar_collapsed_v1';
const THEME_KEY = 'caf_theme_v1';
const FONT_SIZE_KEY = 'caf_font_size_v1';

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------

var toastTimer = null;
export function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
}

// ---------------------------------------------------------------
// Generic dialog modal (confirmations + messages) — replaces
// window.confirm() / window.alert() with in-page UI.
// ---------------------------------------------------------------

var dialogOnConfirm = null;

export function showDialog(opts) {
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

export function closeDialog() {
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

document.addEventListener('keydown', function (evt) {
  if (evt.key === 'Escape' && !el.dialogModal.hidden) closeDialog();
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
