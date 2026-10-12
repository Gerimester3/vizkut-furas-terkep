/**
 * Express backend — HUGEO proxy + multi-source + geology overlays.
 * Browser never calls HUGEO directly (CORS).
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

const {
  DEFAULT_MAPSERVER,
  discoverLayers,
  identifyFields,
} = require('./src/hugeo/layers');
const { getWfsCapabilities } = require('./src/hugeo/capabilities');
const { queryByBbox, buildYearWhere, parseBbox } = require('./src/hugeo/query');
const {
  DRILL_SOURCES,
  OVERLAYS,
  HUGEO_3D_URL,
} = require('./src/hugeo/sources');
const {
  identifyAtPoint,
  buildStratumProfile,
  estimateAquifer,
} = require('./src/hugeo/geology');
const { analyzeRadius, compareRadii } = require('./src/analysis/radius');
const { getFeatureDepth } = require('./src/analysis/depth');
const { searchPlace } = require('./src/geocoding/nominatim');
const { buildHtmlReport } = require('./src/report/htmlReport');
const {
  fetchJellegMap,
  enrichFeaturesWithJelleg,
  collectJellegValues,
} = require('./src/hugeo/jelleg');

const PORT = Number(process.env.PORT) || 3000;
const WMS_URL =
  process.env.HUGEO_WMS ||
  'https://map.hugeo.hu/arcgis/services/furas/map_frs_fdt_web_mercator/MapServer/WMSServer';

const YEAR_ABSOLUTE_MIN = 1825;
const YEAR_ABSOLUTE_MAX = 2022;

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let discoveryCache = null;
let discoveryError = null;
let discoveryAt = 0;
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

async function getDiscovery(force = false) {
  const now = Date.now();
  if (
    !force &&
    discoveryCache &&
    now - discoveryAt < DISCOVERY_TTL_MS &&
    !discoveryError
  ) {
    return discoveryCache;
  }
  try {
    const result = await discoverLayers(DEFAULT_MAPSERVER);
    if (!result.selected) {
      discoveryError = 'Nem található Point geometry layer a MapServeren.';
      discoveryCache = result;
      discoveryAt = now;
      return result;
    }
    result.fieldMap = identifyFields(result.selected.fields || []);
    discoveryCache = result;
    discoveryError = null;
    discoveryAt = now;
    return result;
  } catch (err) {
    discoveryError = err.message;
    discoveryAt = now;
    throw err;
  }
}

function parseSourcesParam(raw) {
  const list = String(raw || 'fdt')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = list.filter((id) => DRILL_SOURCES[id]);
  return valid.length ? valid : ['fdt'];
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vizkut-furas-terkep' });
});

app.get('/api/catalog', (_req, res) => {
  res.json({
    drillSources: Object.values(DRILL_SOURCES).map((s) => ({
      id: s.id,
      label: s.label,
      defaultOn: s.defaultOn,
      color: s.color,
    })),
    overlays: Object.values(OVERLAYS).map((o) => ({
      id: o.id,
      label: o.label,
      kind: o.kind,
      defaultOn: o.defaultOn,
      defaultOpacity: o.defaultOpacity,
      legend: o.legend || null,
    })),
    yearRange: { min: YEAR_ABSOLUTE_MIN, max: YEAR_ABSOLUTE_MAX },
    depthRange: { min: 0, max: 1000 },
    hugeo3d: HUGEO_3D_URL,
    jellegPresets: [
      { id: 'all', label: 'Összes jelleg' },
      { id: 'vizkutato', label: 'Vízkutató / vízföldtani' },
      { id: 'nem_viz', label: 'Nem vízkutató' },
      { id: 'terkepezo', label: 'Térképező / mérnökgeológia' },
      { id: 'nyersanyag', label: 'Nyersanyagkutató (szén, bauxit, stb.)' },
      { id: 'unknown', label: 'Ismeretlen jelleg' },
    ],
  });
});

app.get('/api/diagnostics', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const discovery = await getDiscovery(force);
    const selected = discovery.selected;

    let wfs = null;
    try {
      wfs = await getWfsCapabilities();
    } catch (err) {
      wfs = { error: err.message };
    }

    res.json({
      huggeoConnection: selected ? 'OK' : 'HIBA',
      error: discoveryError,
      service: discovery.mapServerUrl,
      serviceName: discovery.serviceName,
      layerId: selected?.id ?? null,
      layerName: selected?.name ?? null,
      geometry: selected?.geometryType ?? null,
      objectIdField: selected?.objectIdField ?? null,
      maxRecordCount: selected?.maxRecordCount ?? discovery.maxRecordCount,
      fieldMap: discovery.fieldMap || null,
      fields: (selected?.fields || []).map((f) => ({
        name: f.name,
        type: f.type,
        alias: f.alias,
      })),
      layers: discovery.layers.map((l) => ({
        id: l.id,
        name: l.name,
        geometryType: l.geometryType,
        error: l.error || null,
      })),
      drillSources: Object.keys(DRILL_SOURCES),
      overlays: Object.keys(OVERLAYS),
      yearRange: { min: YEAR_ABSOLUTE_MIN, max: YEAR_ABSOLUTE_MAX },
      hugeo3d: HUGEO_3D_URL,
      wms: WMS_URL,
      wfs,
      discoveredAt: new Date(discoveryAt).toISOString(),
      note:
        'A teljes fúrásmélység (MELYSEG) nem azonos a vízadó réteg mélységével.',
    });
  } catch (err) {
    res.status(502).json({
      huggeoConnection: 'HIBA',
      error: err.message,
      service: DEFAULT_MAPSERVER,
    });
  }
});

app.get('/api/features', async (req, res) => {
  try {
    const bbox = req.query.bbox;
    if (!bbox) {
      return res.status(400).json({
        error: 'Hiányzó bbox paraméter (minLon,minLat,maxLon,maxLat)',
        count: 0,
      });
    }

    const sourceIds = parseSourcesParam(req.query.sources);
    const yearMin = req.query.yearMin != null ? Number(req.query.yearMin) : null;
    const yearMax = req.query.yearMax != null ? Number(req.query.yearMax) : null;
    const includeUnknownYear = req.query.includeUnknownYear !== '0';
    const where = buildYearWhere(yearMin, yearMax, includeUnknownYear);

    const discovery = await getDiscovery().catch(() => null);
    const fieldMap = discovery?.fieldMap || null;

    const settled = await Promise.allSettled(
      sourceIds.map(async (sourceId) => {
        const src = DRILL_SOURCES[sourceId];
        return queryByBbox({
          mapServerUrl: src.mapServer,
          layerId: src.layerId,
          bbox,
          fieldsMeta: fieldMap,
          resultRecordCount: Math.min(Number(req.query.limit) || 1000, 1000),
          where,
          sourceId,
        });
      })
    );

    const features = [];
    const perSource = {};
    let exceeded = false;
    const errors = [];

    for (let i = 0; i < settled.length; i += 1) {
      const id = sourceIds[i];
      const item = settled[i];
      if (item.status === 'fulfilled') {
        perSource[id] = {
          count: item.value.features.length,
          exceededTransferLimit: item.value.exceededTransferLimit,
        };
        exceeded = exceeded || item.value.exceededTransferLimit;
        features.push(...item.value.features);
      } else {
        perSource[id] = { count: 0, error: item.reason?.message || 'hiba' };
        errors.push({ source: id, error: item.reason?.message || 'hiba' });
      }
    }

    // Always enrich with ADT jelleg by FRS_ID (official purpose field)
    let jellegMeta = { values: [], count: 0 };
    try {
      const jellegLookup = await fetchJellegMap({ bbox, where, limit: 1000 });
      enrichFeaturesWithJelleg(features, jellegLookup.map);
      jellegMeta = {
        values: collectJellegValues(features),
        lookupCount: jellegLookup.count,
        exceededTransferLimit: jellegLookup.exceededTransferLimit,
      };
      exceeded = exceeded || Boolean(jellegLookup.exceededTransferLimit);
    } catch (err) {
      errors.push({ source: 'jelleg', error: err.message });
    }

    const count = features.length;
    const withJelleg = features.filter(
      (f) => f.properties?.jelleg || f.properties?.__jelleg
    ).length;
    res.json({
      type: 'FeatureCollection',
      features,
      count,
      exceededTransferLimit: exceeded,
      perSource,
      errors: errors.length ? errors : undefined,
      meta: {
        sources: sourceIds,
        where,
        yearMin,
        yearMax,
        fieldMap,
        jellegValues: jellegMeta.values,
        withJelleg,
        message:
          count === 0
            ? 'A lekérdezés 0 fúrást adott vissza.'
            : `${count} fúrás betöltve (HUGEO, források: ${sourceIds.join(', ')}); jelleg: ${withJelleg}/${count}.`,
      },
    });
  } catch (err) {
    const status = err.code === 'BBOX_TOO_LARGE' ? 400 : 502;
    res.status(status).json({
      error: err.message,
      code: err.code || 'QUERY_FAILED',
      count: 0,
      type: 'FeatureCollection',
      features: [],
    });
  }
});

app.get('/api/geology/at', async (req, res) => {
  try {
    const lon = Number(req.query.lon);
    const lat = Number(req.query.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'lon és lat kötelező' });
    }
    const identified = await identifyAtPoint(lon, lat);
    res.json(identified);
  } catch (err) {
    res.status(502).json({ error: err.message, found: false });
  }
});

app.get('/api/identify', async (req, res) => {
  try {
    const lon = Number(req.query.lon);
    const lat = Number(req.query.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'lon és lat kötelező' });
    }
    const identified = await identifyAtPoint(lon, lat);
    res.json(identified);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/profile', async (req, res) => {
  try {
    const {
      lat,
      lon,
      properties = {},
      features = [],
      radiusKm = 10,
    } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat és lon kötelező (number)' });
    }

    const discovery = await getDiscovery().catch(() => null);
    const depthField = discovery?.fieldMap?.depth || 'MELYSEG';
    const { depth: totalDepth } = getFeatureDepth(
      { properties },
      depthField
    );

    const identified = await identifyAtPoint(lon, lat).catch((err) => ({
      geology: { found: false, surface: null, error: err.message },
      talajviz: { found: false, talajviz: null },
      mgtSzintek: { found: false, levels: [] },
    }));

    const geology = identified.geology || {};
    const frsId = properties.FRS_ID ?? null;
    const profile = buildStratumProfile({
      surface: geology.surface,
      totalDepth,
      props: properties,
      talajviz: identified.talajviz?.talajviz || null,
      mgtLevels: identified.mgtSzintek?.levels || null,
    });

    const estimate = estimateAquifer({
      centerLat: lat,
      centerLon: lon,
      features,
      surface: geology.surface,
      depthField,
      radiusKm: Number(radiusKm) || 10,
    });

    res.json({
      fact: {
        kind: 'TÉNYADAT',
        coordinates: { lat, lon },
        totalDepthM: totalDepth,
        year: properties.DATUM ?? null,
        frsId,
        settlement: properties.KZG_TLP || properties.TLP || null,
        surfaceGeology: geology.surface,
        surfaceSource: geology.source || null,
        talajviz: identified.talajviz || null,
        mgtSzintek: identified.mgtSzintek || null,
        aquiferInterval: null,
        aquiferIntervalNote:
          'Vízadó intervallum csak strukturált rétegsor / szűrőzés alapján adható — ez a REST forrás nem szolgáltatja.',
        profile,
      },
      estimate: {
        kind: 'BECSLÉS',
        ...estimate,
      },
      disclaimer:
        'Talpmélység, felszíni földtan, TVZ és MGT szint-sávok TÉNYADAT (térképi/modell). Nem kútrétegsor / vízadó intervallum.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/export', (req, res) => {
  try {
    const { format = 'geojson', features = [] } = req.body || {};
    const list = Array.isArray(features) ? features : [];

    if (format === 'csv') {
      const keys = new Set();
      for (const f of list) {
        Object.keys(f.properties || {}).forEach((k) => keys.add(k));
      }
      const cols = ['lon', 'lat', ...[...keys].sort()];
      const lines = [cols.join(',')];
      for (const f of list) {
        const coords = f.geometry?.coordinates || [];
        const row = cols.map((c) => {
          let v;
          if (c === 'lon') v = coords[0];
          else if (c === 'lat') v = coords[1];
          else v = f.properties?.[c];
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        });
        lines.push(row.join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="furasok.csv"'
      );
      return res.send('\uFEFF' + lines.join('\n'));
    }

    res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="furasok.geojson"'
    );
    res.json({
      type: 'FeatureCollection',
      features: list,
      metadata: {
        source: 'HUGEO',
        exportedAt: new Date().toISOString(),
        count: list.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/report', async (req, res) => {
  try {
    const {
      lat,
      lon,
      address = null,
      features = [],
      radiusKm = 10,
    } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat és lon kötelező' });
    }
    const discovery = await getDiscovery().catch(() => null);
    const depthField = discovery?.fieldMap?.depth || 'MELYSEG';
    const identified = await identifyAtPoint(lon, lat);
    const compareRows = compareRadii({
      centerLat: lat,
      centerLon: lon,
      features,
      depthField,
    });
    const estimate = estimateAquifer({
      centerLat: lat,
      centerLon: lon,
      features,
      surface: identified.geology?.surface,
      depthField,
      radiusKm: Number(radiusKm) || 10,
    });
    const html = buildHtmlReport({
      title: 'Nyugat-Dunántúl fúrási jelentés',
      address,
      center: { lat, lon },
      compareRows,
      identify: identified,
      estimate,
      featureCount: features.length,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

app.post('/api/analysis/radius', async (req, res) => {
  try {
    const { lat, lon, radiusKm = 10, features = [] } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat és lon kötelező (number)' });
    }
    const discovery = await getDiscovery().catch(() => null);
    const depthField = discovery?.fieldMap?.depth || null;
    const result = analyzeRadius({
      centerLat: lat,
      centerLon: lon,
      radiusKm: Number(radiusKm) || 10,
      features,
      depthField,
    });
    res.json({
      ...result,
      disclaimer:
        'A teljes fúrásmélység nem azonos a vízadó réteg mélységével. A számok a forrás talpmélység mezőjén alapulnak.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analysis/compare', async (req, res) => {
  try {
    const { lat, lon, features = [] } = req.body || {};
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return res.status(400).json({ error: 'lat és lon kötelező (number)' });
    }
    const discovery = await getDiscovery().catch(() => null);
    const depthField = discovery?.fieldMap?.depth || null;
    const rows = compareRadii({
      centerLat: lat,
      centerLon: lon,
      features,
      depthField,
    });
    res.json({
      center: { lat, lon },
      rows,
      disclaimer:
        'Vízzadó intervallum csak rétegsor / hidrogeológiai adat alapján adható. Itt szándékosan üres.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) {
      return res.status(400).json({ error: 'Hiányzó q paraméter' });
    }
    const results = await searchPlace(q, { limit: 5 });
    res.json({ query: q, results });
  } catch (err) {
    res.status(502).json({ error: err.message, results: [] });
  }
});

/** ArcGIS cached tiles proxy */
app.get('/api/overlay/:overlayId/tile/:z/:y/:x', async (req, res) => {
  try {
    const overlay = OVERLAYS[req.params.overlayId];
    if (!overlay || overlay.kind !== 'tile') {
      return res.status(404).json({ error: 'Ismeretlen tile overlay' });
    }
    const { z, y, x } = req.params;
    const url = `${overlay.mapServer}/tile/${z}/${y}/${x}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type') || 'image/png';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Dynamic ArcGIS export (non-cached overlays) */
app.get('/api/overlay/:overlayId/export', async (req, res) => {
  try {
    const overlay = OVERLAYS[req.params.overlayId];
    if (!overlay || (overlay.kind !== 'export' && overlay.kind !== 'tile')) {
      return res.status(404).json({ error: 'Ismeretlen export overlay' });
    }
    const bbox = req.query.bbox;
    if (!bbox) {
      return res.status(400).json({ error: 'bbox kötelező' });
    }
    parseBbox(bbox);
    const size = req.query.size || '512,512';
    const params = new URLSearchParams({
      bbox,
      bboxSR: '4326',
      imageSR: '4326',
      size,
      format: 'png32',
      transparent: 'true',
      f: 'image',
    });
    if (overlay.layers) params.set('layers', overlay.layers);
    const url = `${overlay.mapServer}/export?${params}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/** Legacy WMS proxy (fúrás fallback) */
app.get('/api/wms', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    if (!params.get('SERVICE')) params.set('SERVICE', 'WMS');
    if (!params.get('REQUEST')) params.set('REQUEST', 'GetMap');
    const url = `${WMS_URL}?${params.toString()}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const ct = upstream.headers.get('content-type');
    if (ct) res.set('Content-Type', ct);
    res.send(buf);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function boot() {
  console.log('HUGEO layer discovery…');
  try {
    const d = await getDiscovery(true);
    if (d.selected) {
      console.log(
        `OK — layer ${d.selected.id}: ${d.selected.name} (${d.selected.geometryType})`
      );
      console.log('Field map:', d.fieldMap);
    } else {
      console.warn('FIGYELEM: nincs Point layer:', discoveryError);
    }
  } catch (err) {
    console.error('HUGEO discovery sikertelen:', err.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Szerver: http://localhost:${PORT}`);
  });
}

boot();
