/**
 * Enrich borehole features with ADT `jelleg` (fúrás jellege) by FRS_ID.
 */

const { DRILL_SOURCES } = require('./sources');
const { queryByBbox, buildYearWhere } = require('./query');

/** Normalize jelleg text for grouping / filters. */
function normalizeJelleg(raw) {
  if (raw == null || raw === '') return null;
  return String(raw).trim();
}

function isVizkutato(jelleg) {
  if (!jelleg) return false;
  const s = jelleg.toLowerCase();
  return (
    s.includes('vízkutató') ||
    s.includes('vizkutato') ||
    s.includes('vízföldtani') ||
    s.includes('karsztvíz') ||
    s.includes('hévíz') ||
    s.includes('hidrogeol')
  );
}

/**
 * Fetch ADT features in bbox and build FRS_ID → jelleg map.
 */
async function fetchJellegMap({ bbox, where = '1=1', limit = 1000 }) {
  const src = DRILL_SOURCES.adt;
  const result = await queryByBbox({
    mapServerUrl: src.mapServer,
    layerId: src.layerId,
    bbox,
    resultRecordCount: limit,
    where,
    sourceId: 'adt',
  });

  const map = new Map();
  const values = new Set();
  for (const f of result.features || []) {
    const props = f.properties || {};
    const frs = props.FRS_ID;
    const jelleg = normalizeJelleg(props.jelleg);
    if (frs == null) continue;
    if (jelleg) {
      map.set(Number(frs), jelleg);
      values.add(jelleg);
    } else if (!map.has(Number(frs))) {
      map.set(Number(frs), null);
    }
  }

  return {
    map,
    values: [...values].sort((a, b) => a.localeCompare(b, 'hu')),
    count: map.size,
    exceededTransferLimit: result.exceededTransferLimit,
  };
}

/**
 * Attach jelleg onto feature properties (does not invent values).
 */
function enrichFeaturesWithJelleg(features, jellegMap) {
  for (const f of features || []) {
    const props = f.properties || (f.properties = {});
    if (props.jelleg) {
      props.__jelleg = normalizeJelleg(props.jelleg);
      continue;
    }
    const frs = props.FRS_ID != null ? Number(props.FRS_ID) : null;
    if (frs != null && jellegMap.has(frs)) {
      const j = jellegMap.get(frs);
      if (j) {
        props.jelleg = j;
        props.__jelleg = j;
      }
    }
  }
  return features;
}

function collectJellegValues(features) {
  const set = new Set();
  for (const f of features || []) {
    const j = normalizeJelleg(f.properties?.jelleg || f.properties?.__jelleg);
    if (j) set.add(j);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'hu'));
}

module.exports = {
  normalizeJelleg,
  isVizkutato,
  fetchJellegMap,
  enrichFeaturesWithJelleg,
  collectJellegValues,
};
