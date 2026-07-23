// Shared "save an object as a downloaded .json file" helper, used by both
// assessment and baseline export.

export function downloadJson(data, suffix, fallbackName) {
  var safeName = (data.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  var filename = (safeName || fallbackName) + '-' + suffix + '.json';
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}
