/**
 * Surface geology + TVZ identify, rétegsor profile, distance-weighted estimate.
 */

const {
  GEOLOGY_IDENTIFY,
  TVZ_IDENTIFY,
  MGT_SZINT_IDENTIFY,
  OVERLAYS,
} = require('./sources');
const { fetchJson } = require('./layers');
const { getFeatureDepth } = require('../analysis/depth');
const {
  depthStats,
  weightedDepthStats,
} = require('../analysis/statistics');
const { haversineMeters, featureLatLon } = require('../analysis/radius');

async function identifySurfaceGeology(lon, lat) {
  const { mapServer, layerId } = GEOLOGY_IDENTIFY;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NEV,LITOLOGIA,SOR,GEO_HU,geo_ndx,GEO_ID',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${mapServer}/${layerId}/query?${params}`;
  const data = await fetchJson(url);
  const attrs = data.features?.[0]?.attributes || null;
  if (!attrs) {
    return { found: false, surface: null };
  }
  return {
    found: true,
    kind: 'TÉNYADAT',
    surface: {
      nev: attrs.NEV || null,
      litologia: attrs.LITOLOGIA || null,
      sor: attrs.SOR ?? null,
      geoIndex: attrs.GEO_HU || attrs.geo_ndx || null,
      geoId: attrs.GEO_ID ?? null,
    },
    source: 'HUGEO fdt100 Földtan (felszíni képződmény)',
  };
}

async function identifyTalajviz(lon, lat) {
  const { mapServer, layerId } = TVZ_IDENTIFY;
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  const url = `${mapServer}/${layerId}/query?${params}`;
  const data = await fetchJson(url);
  const attrs = data.features?.[0]?.attributes || null;
  if (!attrs) {
    return { found: false, talajviz: null };
  }
  return {
    found: true,
    kind: 'TÉNYADAT',
    talajviz: {
      kod: attrs.tvz_kod || null,
      objectId: attrs.OBJECTID ?? null,
    },
    source: 'HUGEO TVZ 1:100 000 — talajvízszint mélysége a felszín alatt',
    note: 'Térképi kategória, nem kútspecifikus mérés.',
  };
}

/**
 * Regional MGT formation-bottom depth bands at a point.
 * TÉNYADAT for the model map — NOT clay/aquifer intervals of a well.
 */
async function identifyMgtSzintek(lon, lat) {
  const { mapServer, layers } = MGT_SZINT_IDENTIFY;
  const results = await Promise.all(
    layers.map(async (layer) => {
      const params = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        f: 'json',
      });
      const url = `${mapServer}/${layer.id}/query?${params}`;
      try {
        const data = await fetchJson(url);
        const attrs = data.features?.[0]?.attributes || null;
        if (!attrs) {
          return { layerId: layer.id, label: layer.label, found: false };
        }
        return {
          layerId: layer.id,
          label: layer.label,
          found: true,
          melyseg: attrs.melyseg ?? null,
          level: attrs.level ?? null,
          objectId: attrs.OBJECTID ?? null,
        };
      } catch (err) {
        return {
          layerId: layer.id,
          label: layer.label,
          found: false,
          error: err.message,
        };
      }
    })
  );

  const found = results.filter((r) => r.found);
  return {
    found: found.length > 0,
    kind: 'TÉNYADAT',
    levels: results,
    source: 'HUGEO geoterm/MGT_fdt_szint — regionális földtani szint talpmélység-sávok',
    note:
      'Regionális modell. Nem kútrétegsor, nem agyag/vízadó intervallum. A teljes fúrásmélység sem azonos a vízadó mélységével.',
  };
}

/**
 * Identify at point: geology + TVZ + MGT formation depth bands.
 */
async function identifyAtPoint(lon, lat) {
  const [geology, talajviz, mgtSzintek] = await Promise.all([
    identifySurfaceGeology(lon, lat).catch((err) => ({
      found: false,
      surface: null,
      error: err.message,
    })),
    identifyTalajviz(lon, lat).catch((err) => ({
      found: false,
      talajviz: null,
      error: err.message,
    })),
    identifyMgtSzintek(lon, lat).catch((err) => ({
      found: false,
      levels: [],
      error: err.message,
    })),
  ]);
  return {
    coordinates: { lon, lat },
    geology,
    talajviz,
    mgtSzintek,
  };
}

function buildStratumProfile({
  surface,
  totalDepth,
  props = {},
  talajviz = null,
  mgtLevels = null,
}) {
  const hasVfdt =
    props.isVfdt_npl === 'Igen' ||
    props.isVfdt_npl === 'I' ||
    props.isVfdt_npl === true;
  const detail = props.verzio_max || null;

  const layers = [];
  if (surface?.litologia || surface?.nev) {
    layers.push({
      fromM: 0,
      toM: null,
      label: surface.nev || surface.litologia,
      litologia: surface.litologia,
      kind: 'surface',
      certainty: 'TÉNYADAT',
      note: 'Felszíni földtani képződmény (1:100 000)',
    });
  }

  if (talajviz?.kod) {
    layers.push({
      fromM: null,
      toM: null,
      label: `Talajvízszint kategória: ${talajviz.kod}`,
      litologia: null,
      kind: 'groundwater_map',
      certainty: 'TÉNYADAT',
      note: 'TVZ térképi kategória — nem azonos a vízadó intervallummal',
    });
  }

  for (const lvl of mgtLevels || []) {
    if (!lvl?.found || !lvl.melyseg) continue;
    layers.push({
      fromM: null,
      toM: null,
      label: `${lvl.label}: ${lvl.melyseg}`,
      litologia: null,
      kind: 'mgt_level',
      certainty: 'TÉNYADAT',
      note: 'Regionális MGT modell — nem kútrétegsor',
    });
  }

  if (totalDepth != null) {
    layers.push({
      fromM: null,
      toM: totalDepth,
      label: 'Talpmélység',
      litologia: null,
      kind: 'bottom',
      certainty: 'TÉNYADAT',
      note: 'Teljes fúrásmélység — nem vízadó mélység',
    });
  }

  return {
    layers,
    hasStructuredLog: false,
    aquiferInterval: null,
    aquiferIntervalKind:
      'nincs TÉNYADAT — strukturált rétegsor / szűrőzés nem érhető el REST-en',
    hasVfdtFlag: hasVfdt,
    detailLevel: detail,
    message: hasVfdt
      ? 'A forrás szerint vízföldtani napló elérhető a HUGEO-n, de strukturált rétegintervallumok ehhez a REST szolgáltatáshoz nem kapcsolódnak.'
      : 'Strukturált rétegsor (intervallumonkénti litológia / szűrőzés) nem érhető el ezen a szolgáltatáson.',
  };
}

/**
 * Distance-weighted drilling-depth estimate — BECSLÉS only, never aquifer depth.
 */
function estimateAquifer({
  centerLat,
  centerLon,
  features,
  surface,
  depthField = null,
  radiusKm = 10,
}) {
  const radiusM = radiusKm * 1000;
  const nearby = [];
  for (const f of features || []) {
    const ll = featureLatLon(f);
    if (!ll) continue;
    const dist = haversineMeters(centerLat, centerLon, ll.lat, ll.lon);
    if (dist > radiusM) continue;
    const { depth } = getFeatureDepth(f, depthField);
    nearby.push({ distanceM: dist, depth });
  }

  const depths = nearby.map((n) => n.depth);
  const stats = depthStats(depths);
  const weighted = weightedDepthStats(nearby);
  const hasSurface = Boolean(surface?.litologia || surface?.nev);

  if (stats.withDepth < 3) {
    return {
      available: false,
      kind: 'BECSLÉS',
      reason:
        'Nincs elég közeli fúrás mélységadattal a becsléshez (legalább 3 kell).',
      confidence: 'nincs',
      confidenceScore: 0,
      estimatedDepthM: null,
      rangeM: null,
      nearbyCount: nearby.length,
      withDepth: stats.withDepth,
      surfaceUsed: hasSurface,
    };
  }

  const center = weighted.weightedMedian ?? stats.median;
  const spread = Math.max(20, (stats.max - stats.min) * 0.25);
  const low = Math.max(0, center - spread);
  const high = center + spread;

  // Confidence score 0–100 from sample size, distance concentration, surface context
  const avgDist =
    nearby.reduce((a, b) => a + b.distanceM, 0) / Math.max(1, nearby.length);
  let score = 15;
  score += Math.min(35, stats.withDepth * 1.2);
  score += hasSurface ? 10 : 0;
  score += avgDist < 3000 ? 20 : avgDist < 7000 ? 10 : 0;
  score += stats.withDepth >= 30 ? 10 : 0;
  score = Math.min(70, Math.round(score)); // cap: no structured log ⇒ never high

  let confidence = 'alacsony';
  if (score >= 55) confidence = 'közepes';
  else if (score >= 40) confidence = 'közepes-alacsony';

  return {
    available: true,
    kind: 'BECSLÉS',
    disclaimer:
      'Ez NEM vízadó réteg mélység. Távolság-súlyozott talpmélység-sáv; rétegsor nélkül legfeljebb közepes bizonyosság.',
    confidence,
    confidenceScore: score,
    estimatedDepthM: center,
    rangeM: { min: low, max: high },
    nearbyCount: nearby.length,
    withDepth: stats.withDepth,
    stats: {
      average: stats.average,
      median: stats.median,
      weightedMedian: weighted.weightedMedian,
      weightedAverage: weighted.weightedAverage,
      min: stats.min,
      max: stats.max,
    },
    surfaceUsed: hasSurface,
    surfaceLabel: surface?.nev || surface?.litologia || null,
  };
}

/** Layer names taken from each MapServer layer's published name. */
const OVERLAY_LAYER_NAMES = {
  foldtan100: { 6: 'Földtan' },
  foldtan500: { 30: 'Felszíni földtan' },
  pretercier: {
    7: 'Prekainozoos földtan',
    6: 'Felszíni kibukkanás',
  },
  termalviz: { 1: 'Karszt', 2: 'Porózus' },
  onegeology: { 2: 'Felszíni képződmény' },
  talajviz: { 0: 'Talajvízszint' },
  mgtSzintek: {
    0: 'Kvarter talp',
    1: 'Felső-pannóniai talp',
    2: 'Pannóniai talp',
    3: 'Prekainozoos aljzat felszíne',
  },
};

function detailLine(label, value) {
  if (value == null || String(value).trim() === '') return null;
  return { label, value: String(value).trim() };
}

function formatFoldtan100(attrs) {
  return {
    title: attrs.NEV || attrs.LITOLOGIA || attrs.GEO_HU || null,
    lines: [
      detailLine('Kőzet', attrs.LITOLOGIA),
      detailLine('Jelkulcs', attrs.GEO_HU),
    ].filter(Boolean),
  };
}

function formatFoldtan500(attrs) {
  const title = [attrs.Kod, attrs.leiras].filter(Boolean).join(' — ');
  return {
    title: title || null,
    lines: [detailLine('Angol név', attrs.english)].filter(Boolean),
  };
}

function formatPretercier(attrs) {
  return {
    title: attrs.kozet_en || attrs.kod_uj_szoveg || null,
    lines: [detailLine('Kód', attrs.kod_uj_szoveg)].filter(Boolean),
  };
}

function formatTermal(attrs, layerName) {
  return {
    title: attrs.viztest_ne || layerName,
    lines: [
      detailLine('Típus', layerName),
      detailLine('Alegység', attrs.alegyseg),
      detailLine('Vízadó', attrs.vizado_tip),
      detailLine('Földtani típus', attrs.foldtani_t),
    ].filter(Boolean),
  };
}

function formatOneGeology(attrs) {
  return {
    title: attrs.gu_name || null,
    lines: [detailLine('Leírás', attrs.gu_descrip)].filter(Boolean),
  };
}

function formatTalajviz(attrs) {
  return { title: attrs.tvz_kod || null, lines: [] };
}

function formatMelyseg(attrs) {
  const band = attrs.melyseg ? String(attrs.melyseg).trim() : '';
  return { title: band ? `${band} m` : null, lines: [] };
}

const OVERLAY_FORMATTERS = {
  foldtan100: { 6: formatFoldtan100 },
  foldtan500: { 30: formatFoldtan500 },
  pretercier: {
    7: formatPretercier,
    6: () => ({
      title: 'A prekainozoos aljzat a felszínen kibukkan',
      lines: [],
    }),
  },
  termalviz: { 1: formatTermal, 2: formatTermal },
  onegeology: { 2: formatOneGeology },
  talajviz: { 0: formatTalajviz },
  mgtSzintek: {
    0: formatMelyseg,
    1: formatMelyseg,
    2: formatMelyseg,
    3: formatMelyseg,
  },
};

async function queryPointAttributes(mapServer, layerId, lon, lat) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'false',
    f: 'json',
  });
  const data = await fetchJson(`${mapServer}/${layerId}/query?${params}`);
  if (data.error) {
    throw new Error(data.error.message || 'HUGEO identify hiba');
  }
  return data.features?.[0]?.attributes || null;
}

/**
 * Name the map unit under a click for the overlays the user actually turned on.
 * Colors on these maps are often near-duplicates; the attribute is the legend name.
 */
async function identifyOverlays(lon, lat, overlayIds) {
  const unique = [...new Set(overlayIds)].filter((id) => OVERLAYS[id]);
  const overlays = await Promise.all(
    unique.map(async (id) => {
      const overlay = OVERLAYS[id];
      const formatters = OVERLAY_FORMATTERS[id] || {};
      const layerIds = overlay.legendLayers || [];
      const hits = await Promise.all(
        layerIds.map(async (layerId) => {
          const layerName = OVERLAY_LAYER_NAMES[id]?.[layerId] || String(layerId);
          try {
            const attrs = await queryPointAttributes(
              overlay.mapServer,
              layerId,
              lon,
              lat
            );
            if (!attrs) {
              return { layerId, layerName, found: false };
            }
            const format = formatters[layerId];
            const view = format
              ? format(attrs, layerName)
              : { title: null, lines: [] };
            if (!view?.title) {
              return { layerId, layerName, found: false };
            }
            const lines = (view.lines || []).filter(
              (row) => row.value && row.value !== view.title
            );
            return {
              layerId,
              layerName,
              found: true,
              title: view.title,
              lines,
            };
          } catch (err) {
            return {
              layerId,
              layerName,
              found: false,
              error: err.message,
            };
          }
        })
      );
      return { id, label: overlay.label, hits };
    })
  );
  return overlays;
}

module.exports = {
  identifySurfaceGeology,
  identifyTalajviz,
  identifyMgtSzintek,
  identifyAtPoint,
  identifyOverlays,
  buildStratumProfile,
  estimateAquifer,
};
