/**
 * Radius-based spatial analysis around a click point.
 */

const { getFeatureDepth } = require('./depth');
const {
  depthStats,
  depthHistogram,
  weightedDepthStats,
} = require('./statistics');

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in meters between two WGS84 points. */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function featureLatLon(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === 'Point' && Array.isArray(g.coordinates)) {
    return { lon: g.coordinates[0], lat: g.coordinates[1] };
  }
  if (g.type === 'MultiPoint' && g.coordinates?.[0]) {
    return { lon: g.coordinates[0][0], lat: g.coordinates[0][1] };
  }
  return null;
}

/**
 * Filter features within radiusKm of center, return stats + matching features.
 */
function analyzeRadius({
  centerLat,
  centerLon,
  radiusKm,
  features,
  depthField = null,
}) {
  const radiusM = radiusKm * 1000;
  const inside = [];
  const depths = [];

  for (const f of features || []) {
    const ll = featureLatLon(f);
    if (!ll) continue;
    const dist = haversineMeters(centerLat, centerLon, ll.lat, ll.lon);
    if (dist <= radiusM) {
      const { depth } = getFeatureDepth(f, depthField);
      inside.push({
        feature: f,
        distanceM: dist,
        depth,
      });
      depths.push(depth);
    }
  }

  const stats = depthStats(depths);
  const weighted = weightedDepthStats(inside);
  const histogram = depthHistogram(depths);

  return {
    center: { lat: centerLat, lon: centerLon },
    radiusKm,
    count: inside.length,
    stats: {
      furasok: inside.length,
      atlagMelyseg: stats.average,
      medianMelyseg: stats.median,
      minimum: stats.min,
      maximum: stats.max,
      melyseggel: stats.withDepth,
      tavolsagSulyozottAtlag: weighted.weightedAverage,
      tavolsagSulyozottMedian: weighted.weightedMedian,
    },
    histogram,
    features: inside
      .sort((a, b) => a.distanceM - b.distanceM)
      .map((item) => ({
        distanceM: Math.round(item.distanceM),
        depth: item.depth,
        properties: item.feature.properties || {},
        coordinates: featureLatLon(item.feature),
      })),
  };
}

/**
 * Compare multiple radii (5 / 10 / 20 km) at one location.
 */
function compareRadii({ centerLat, centerLon, features, depthField = null }) {
  return [5, 10, 20].map((radiusKm) => {
    const r = analyzeRadius({
      centerLat,
      centerLon,
      radiusKm,
      features,
      depthField,
    });
    return {
      sugarKm: radiusKm,
      furasok: r.stats.furasok,
      medianMelyseg: r.stats.medianMelyseg,
      atlagMelyseg: r.stats.atlagMelyseg,
      minimum: r.stats.minimum,
      maximum: r.stats.maximum,
      tavolsagSulyozottMedian: r.stats.tavolsagSulyozottMedian,
      // Aquifer interval only from structured log — not available via current REST
      vizzadoIntervallum: null,
      vizzadoIntervallumKind: 'nincs TÉNYADAT (nincs strukturált rétegsor)',
    };
  });
}

module.exports = {
  haversineMeters,
  featureLatLon,
  analyzeRadius,
  compareRadii,
};
