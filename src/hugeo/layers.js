/**
 * HUGEO MapServer layer discovery — no hardcoded FeatureType / layer assumptions.
 */

const DEFAULT_MAPSERVER =
  process.env.HUGEO_MAPSERVER ||
  'https://map.hugeo.hu/arcgis/rest/services/furas/map_frs_fdt_web_mercator/MapServer';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function isPointLayer(layer) {
  const gt = (layer.geometryType || '').toLowerCase();
  return gt.includes('point');
}

/**
 * Discover MapServer layers and pick the best Point feature layer.
 */
async function discoverLayers(mapServerUrl = DEFAULT_MAPSERVER) {
  const meta = await fetchJson(`${mapServerUrl}?f=pjson`);
  const layers = Array.isArray(meta.layers) ? meta.layers : [];

  const detailed = [];
  for (const layer of layers) {
    try {
      const detail = await fetchJson(`${mapServerUrl}/${layer.id}?f=pjson`);
      detailed.push({
        id: layer.id,
        name: detail.name || layer.name,
        geometryType: detail.geometryType || layer.geometryType,
        objectIdField: detail.objectIdField || null,
        fields: Array.isArray(detail.fields) ? detail.fields : [],
        maxRecordCount: detail.maxRecordCount || meta.maxRecordCount || 1000,
        supportsQuery: true,
      });
    } catch (err) {
      detailed.push({
        id: layer.id,
        name: layer.name,
        geometryType: layer.geometryType,
        error: err.message,
        fields: [],
      });
    }
  }

  const pointLayers = detailed.filter(
    (l) => !l.error && isPointLayer(l) && l.fields.length > 0
  );

  const selected =
    pointLayers.find((l) =>
      /furas|fur|kút|kut|point|pont|réteg|reteg/i.test(l.name || '')
    ) || pointLayers[0] || null;

  return {
    mapServerUrl,
    serviceName: meta.mapName || 'MapServer',
    spatialReference: meta.spatialReference || null,
    maxRecordCount: meta.maxRecordCount || 1000,
    layers: detailed,
    pointLayers,
    selected,
  };
}

/**
 * Heuristically identify important attribute fields from the fields list.
 */
function identifyFields(fields = []) {
  const names = fields.map((f) => f.name);
  const lower = Object.fromEntries(names.map((n) => [n.toLowerCase(), n]));

  const pick = (...candidates) => {
    for (const c of candidates) {
      if (lower[c.toLowerCase()]) return lower[c.toLowerCase()];
    }
    // partial match
    for (const c of candidates) {
      const hit = names.find((n) =>
        n.toLowerCase().includes(c.toLowerCase())
      );
      if (hit) return hit;
    }
    return null;
  };

  return {
    id: pick('FRS_ID', 'OBJECTID', 'FID', 'ID'),
    depth: pick(
      'MELYSEG',
      'FURAS_MELY',
      'TALPMEYSEG',
      'TALPMELYSEG',
      'DEPTH',
      'TALP',
      'MÉLYSÉG'
    ),
    year: pick('DATUM', 'EV', 'YEAR', 'FURAS_EV', 'DATE'),
    settlement: pick('KZG_TLP', 'TLP', 'TELEPULES', 'HELYSEG', 'SETTLEMENT'),
    county: pick('MEGYE', 'COUNTY'),
    label: pick('JELSZAM', 'NEV', 'NAME', 'JEL'),
    objectId: pick('OBJECTID', 'FID', 'OID'),
  };
}

module.exports = {
  DEFAULT_MAPSERVER,
  discoverLayers,
  identifyFields,
  isPointLayer,
  fetchJson,
};
