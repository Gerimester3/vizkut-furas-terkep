/**
 * Depth field helpers — names discovered at runtime, not hardcoded in callers.
 */

const DEPTH_CANDIDATES = [
  'MELYSEG',
  'FURAS_MELY',
  'TALPMELYSEG',
  'TALPMEYSEG',
  'DEPTH',
  'TALP',
  'MÉLYSÉG',
  'melyseg',
  'depth',
];

function resolveDepthField(properties, preferredField = null) {
  if (!properties || typeof properties !== 'object') return null;
  if (preferredField && preferredField in properties) return preferredField;
  const keys = Object.keys(properties);
  for (const c of DEPTH_CANDIDATES) {
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (hit) return hit;
  }
  const fuzzy = keys.find((k) => /mely|depth|talp/i.test(k));
  return fuzzy || null;
}

function parseDepth(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getFeatureDepth(feature, preferredField = null) {
  const props = feature?.properties || {};
  const field = resolveDepthField(props, preferredField);
  if (!field) return { field: null, depth: null };
  return { field, depth: parseDepth(props[field]) };
}

/** Color buckets for map markers (full drilling depth, not aquifer depth). */
function depthColor(depth) {
  if (depth == null || Number.isNaN(depth)) return '#6b7280'; // grey — no data
  if (depth < 50) return '#2563eb'; // blue
  if (depth < 100) return '#f97316'; // orange
  if (depth < 200) return '#dc2626'; // red
  return '#7c3aed'; // purple 200+
}

function depthLabel(depth) {
  if (depth == null) return 'nincs adat';
  if (depth < 50) return '0–50 m';
  if (depth < 100) return '50–100 m';
  if (depth < 200) return '100–200 m';
  return '200+ m';
}

function passesMinDepth(depth, minDepth) {
  if (minDepth == null || minDepth <= 0) return true;
  if (depth == null) return false;
  return depth >= minDepth;
}

module.exports = {
  DEPTH_CANDIDATES,
  resolveDepthField,
  parseDepth,
  getFeatureDepth,
  depthColor,
  depthLabel,
  passesMinDepth,
};
