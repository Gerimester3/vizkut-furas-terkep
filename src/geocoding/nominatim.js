/**
 * Nominatim geocoding proxy helpers (Hungary-biased).
 */

const DEFAULT_NOMINATIM =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

async function searchPlace(query, { limit = 5, countrycodes = 'hu' } = {}) {
  const q = String(query || '').trim();
  if (!q) {
    throw new Error('Üres keresési kifejezés');
  }

  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: String(limit),
    countrycodes,
  });

  const url = `${DEFAULT_NOMINATIM}/search?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'vizkut-furas-terkep/1.0 (local research tool)',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((item) => ({
    displayName: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    boundingBox: item.boundingbox
      ? {
          minLat: Number(item.boundingbox[0]),
          maxLat: Number(item.boundingbox[1]),
          minLon: Number(item.boundingbox[2]),
          maxLon: Number(item.boundingbox[3]),
        }
      : null,
    type: item.type,
    class: item.class,
  }));
}

module.exports = {
  DEFAULT_NOMINATIM,
  searchPlace,
};
