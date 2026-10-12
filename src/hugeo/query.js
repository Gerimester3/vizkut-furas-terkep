/**
 * Bounding-box feature queries against discovered ArcGIS REST layers.
 */

const { DEFAULT_MAPSERVER, fetchJson, identifyFields } = require('./layers');

function parseBbox(bbox) {
  if (typeof bbox === 'string') {
    const parts = bbox.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      throw new Error('Invalid bbox. Expected minLon,minLat,maxLon,maxLat');
    }
    return {
      minLon: parts[0],
      minLat: parts[1],
      maxLon: parts[2],
      maxLat: parts[3],
    };
  }
  return bbox;
}

function bboxAreaDeg2(b) {
  return Math.abs(b.maxLon - b.minLon) * Math.abs(b.maxLat - b.minLat);
}

/**
 * Reject overly large requests so we don't pull all of Hungary at once.
 * ~2°×2° ≈ Nyugat-Dunántúl-ish; larger needs more zoom.
 */
function assertBboxReasonable(b, maxArea = 6) {
  const area = bboxAreaDeg2(b);
  if (area > maxArea) {
    const err = new Error(
      'A terület túl nagy. Zoomolj közelebb a fúrások betöltéséhez.'
    );
    err.code = 'BBOX_TOO_LARGE';
    err.area = area;
    throw err;
  }
  return area;
}

function buildYearWhere(yearMin, yearMax, includeUnknownYear = true) {
  const ymin = Number(yearMin);
  const ymax = Number(yearMax);
  const hasMin = Number.isFinite(ymin);
  const hasMax = Number.isFinite(ymax);
  if (!hasMin && !hasMax) return '1=1';

  const parts = [];
  if (hasMin && hasMax) {
    parts.push(`(DATUM >= ${ymin} AND DATUM <= ${ymax})`);
  } else if (hasMin) {
    parts.push(`(DATUM >= ${ymin})`);
  } else {
    parts.push(`(DATUM <= ${ymax})`);
  }
  if (includeUnknownYear) {
    parts.push('(DATUM IS NULL)');
  }
  return parts.join(' OR ');
}

function buildQueryUrl({
  mapServerUrl,
  layerId,
  bbox,
  outFields = '*',
  resultRecordCount = 1000,
  resultOffset = 0,
  where = '1=1',
}) {
  const b = parseBbox(bbox);
  const geometry = `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`;
  const params = new URLSearchParams({
    where: where || '1=1',
    geometry,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: String(outFields),
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: String(resultRecordCount),
  });
  if (resultOffset > 0) {
    params.set('resultOffset', String(resultOffset));
  }
  return `${mapServerUrl}/${layerId}/query?${params.toString()}`;
}

function normalizeFeatureCollection(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection') {
    return {
      type: 'FeatureCollection',
      features: [],
      exceededTransferLimit: false,
    };
  }
  const features = (geojson.features || []).filter((f) => {
    if (!f || !f.geometry) return false;
    const t = f.geometry.type;
    return t === 'Point' || t === 'MultiPoint';
  });
  return {
    type: 'FeatureCollection',
    features,
    exceededTransferLimit: Boolean(
      geojson.exceededTransferLimit ||
        geojson.properties?.exceededTransferLimit
    ),
  };
}

async function queryByBbox({
  mapServerUrl = DEFAULT_MAPSERVER,
  layerId,
  bbox,
  fieldsMeta = null,
  resultRecordCount = 1000,
  where = '1=1',
  sourceId = null,
}) {
  const b = parseBbox(bbox);
  const area = assertBboxReasonable(b);
  const url = buildQueryUrl({
    mapServerUrl,
    layerId,
    bbox: b,
    resultRecordCount,
    where,
  });

  const raw = await fetchJson(url);
  const collection = normalizeFeatureCollection(raw);

  if (sourceId) {
    for (const f of collection.features) {
      f.properties = f.properties || {};
      f.properties.__source = sourceId;
    }
  }

  let fieldMap = fieldsMeta;
  if (!fieldMap && collection.features.length > 0) {
    const sampleKeys = Object.keys(collection.features[0].properties || {});
    fieldMap = identifyFields(sampleKeys.map((name) => ({ name })));
  }

  return {
    ...collection,
    meta: {
      count: collection.features.length,
      exceededTransferLimit: collection.exceededTransferLimit,
      bbox: b,
      areaDeg2: area,
      layerId,
      fieldMap,
      where,
      sourceId,
      queryUrl: url.replace(/([?&])(token)=[^&]*/gi, '$1$2=***'),
    },
  };
}

module.exports = {
  parseBbox,
  bboxAreaDeg2,
  assertBboxReasonable,
  buildQueryUrl,
  buildYearWhere,
  normalizeFeatureCollection,
  queryByBbox,
};
