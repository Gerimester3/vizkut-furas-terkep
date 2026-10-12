/* global L */

(() => {
  const START = { lat: 47.1, lon: 16.9, zoom: 9 };
  const DEBOUNCE_MS = 700;
  const MAX_BBOX_AREA = 6;

  const el = {
    app: document.getElementById('app'),
    statusBar: document.getElementById('statusBar'),
    diagText: document.getElementById('diagText'),
    statCount: document.getElementById('statCount'),
    statAvg: document.getElementById('statAvg'),
    statMin: document.getElementById('statMin'),
    statMax: document.getElementById('statMax'),
    radiusKm: document.getElementById('radiusKm'),
    pickPointBtn: document.getElementById('pickPointBtn'),
    compareModeBtn: document.getElementById('compareModeBtn'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    analysisBox: document.getElementById('analysisBox'),
    analysisContent: document.getElementById('analysisContent'),
    histogram: document.getElementById('histogram'),
    compareTable: document.getElementById('compareTable'),
    compareBox: document.getElementById('compareBox'),
    comparePoints: document.getElementById('comparePoints'),
    clearCompareBtn: document.getElementById('clearCompareBtn'),
    profileBox: document.getElementById('profileBox'),
    profileContent: document.getElementById('profileContent'),
    identifyBox: document.getElementById('identifyBox'),
    identifyContent: document.getElementById('identifyContent'),
    identifyMode: document.getElementById('identifyMode'),
    panel: document.getElementById('panel'),
    togglePanel: document.getElementById('togglePanel'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    sourceToggles: document.getElementById('sourceToggles'),
    jellegPreset: document.getElementById('jellegPreset'),
    jellegValues: document.getElementById('jellegValues'),
    includeUnknownJelleg: document.getElementById('includeUnknownJelleg'),
    overlayToggles: document.getElementById('overlayToggles'),
    overlayOpacity: document.getElementById('overlayOpacity'),
    overlayOpacityVal: document.getElementById('overlayOpacityVal'),
    overlayLegend: document.getElementById('overlayLegend'),
    yearMin: document.getElementById('yearMin'),
    yearMax: document.getElementById('yearMax'),
    yearRangeLabel: document.getElementById('yearRangeLabel'),
    includeUnknownYear: document.getElementById('includeUnknownYear'),
    depthMin: document.getElementById('depthMin'),
    depthMax: document.getElementById('depthMax'),
    depthRangeLabel: document.getElementById('depthRangeLabel'),
    includeUnknownDepth: document.getElementById('includeUnknownDepth'),
    embed3dBtn: document.getElementById('embed3dBtn'),
    embed3dWrap: document.getElementById('embed3dWrap'),
    embed3d: document.getElementById('embed3d'),
    open3d: document.getElementById('open3d'),
    coordPaste: document.getElementById('coordPaste'),
    gotoCoordBtn: document.getElementById('gotoCoordBtn'),
    exportGeoBtn: document.getElementById('exportGeoBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    reportBtn: document.getElementById('reportBtn'),
    copyViewBtn: document.getElementById('copyViewBtn'),
  };

  let catalog = null;
  let diagnostics = null;
  let fieldMap = {};
  let allFeatures = [];
  let filteredFeatures = [];
  let pickMode = false;
  let compareMode = false;
  let radiusCircle = null;
  let analysisMarker = null;
  let identifyMarker = null;
  let loadToken = 0;
  let debounceTimer = null;
  let filterDebounce = null;
  let lastCenter = null;
  let lastAddress = null;
  const compareList = [];
  const compareMarkers = [];
  const exportLayers = {};

  const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
  }).setView([START.lat, START.lon], START.zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> | adatok: HUGEO / SZTFH',
  }).addTo(map);

  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 45,
    showCoverageOnHover: false,
  });
  map.addLayer(cluster);

  function createExportOverlay(overlayId) {
    let image = null;
    let token = 0;
    let enabled = false;
    let refreshTimer = null;

    async function refresh() {
      if (!enabled) return;
      const my = ++token;
      const b = map.getBounds();
      const size = map.getSize();
      const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
      const url = `/api/overlay/${overlayId}/export?bbox=${encodeURIComponent(
        bbox
      )}&size=${Math.round(size.x)},${Math.round(size.y)}&_=${Date.now()}`;
      const opacity = Number(el.overlayOpacity.value) / 100;
      const bounds = [
        [b.getSouth(), b.getWest()],
        [b.getNorth(), b.getEast()],
      ];
      const layer = L.imageOverlay(url, bounds, {
        opacity,
        interactive: false,
        zIndex: 200,
      });
      layer.addTo(map);
      if (my !== token || !enabled) {
        map.removeLayer(layer);
        return;
      }
      if (image) map.removeLayer(image);
      image = layer;
    }

    function scheduleRefresh() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 350);
    }

    return {
      enable() {
        if (enabled) {
          this.setOpacity(Number(el.overlayOpacity.value) / 100);
          return;
        }
        enabled = true;
        map.on('moveend', scheduleRefresh);
        refresh();
      },
      disable() {
        if (!enabled) return;
        enabled = false;
        map.off('moveend', scheduleRefresh);
        clearTimeout(refreshTimer);
        token += 1;
        if (image) {
          map.removeLayer(image);
          image = null;
        }
      },
      setOpacity(o) {
        if (image) image.setOpacity(o);
      },
    };
  }

  function setStatus(msg, kind = '') {
    el.statusBar.textContent = msg;
    el.statusBar.className = 'status-bar' + (kind ? ` ${kind}` : '');
  }

  function fmtDepth(d) {
    if (d == null || Number.isNaN(d)) return '—';
    return `${Number(d).toFixed(Number.isInteger(d) ? 0 : 1)} m`;
  }

  function sourceColor(sourceId) {
    return catalog?.drillSources?.find((x) => x.id === sourceId)?.color || '#3d8bfd';
  }

  function getDepth(props) {
    const preferred = fieldMap?.depth;
    const keys = Object.keys(props || {});
    const field =
      (preferred && preferred in props && preferred) ||
      keys.find((k) =>
        ['MELYSEG', 'FURAS_MELY', 'DEPTH', 'TALP'].includes(k.toUpperCase())
      ) ||
      keys.find((k) => /mely|depth|talp/i.test(k));
    if (!field) return null;
    const v = props[field];
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function getYear(props) {
    const v = props?.DATUM;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getJelleg(props) {
    const j = props?.jelleg || props?.__jelleg;
    if (j == null || j === '') return null;
    return String(j).trim();
  }

  function isVizkutatoJelleg(jelleg) {
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

  function isTerkepezoJelleg(jelleg) {
    if (!jelleg) return false;
    const s = jelleg.toLowerCase();
    return (
      s.includes('térképező') ||
      s.includes('terkepezo') ||
      s.includes('mérnökgeol') ||
      s.includes('mernokgeol') ||
      s.includes('építésföldtani') ||
      s.includes('talajmechanikai')
    );
  }

  function isNyersanyagJelleg(jelleg) {
    if (!jelleg) return false;
    const s = jelleg.toLowerCase();
    return (
      s.includes('szén') ||
      s.includes('bauxit') ||
      s.includes('szénhidrogén') ||
      s.includes('érckutató') ||
      s.includes('gipsz') ||
      s.includes('anhidrit') ||
      s.includes('lignit') ||
      s.includes('homokkő') ||
      s.includes('kovaföld') ||
      s.includes('dolomit') ||
      s.includes('kaolin') ||
      s.includes('ásvány')
    );
  }

  function selectedJellegValues() {
    return [...el.jellegValues.querySelectorAll('input:checked')].map(
      (i) => i.value
    );
  }

  function updateJellegChecklist(values) {
    const prev = new Set(selectedJellegValues());
    const hadAny = el.jellegValues.querySelectorAll('input').length > 0;
    el.jellegValues.innerHTML = '';
    for (const v of values || []) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = v;
      input.checked = !hadAny || prev.has(v);
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + v));
      el.jellegValues.appendChild(label);
    }
  }

  function depthColor(depth) {
    if (depth == null) return '#6b7280';
    if (depth < 50) return '#2563eb';
    if (depth < 100) return '#f97316';
    if (depth < 200) return '#dc2626';
    return '#7c3aed';
  }

  function selectedSources() {
    return [...el.sourceToggles.querySelectorAll('input:checked')].map((i) => i.value);
  }

  function yearParams() {
    let ymin = Number(el.yearMin.value);
    let ymax = Number(el.yearMax.value);
    if (ymin > ymax) [ymin, ymax] = [ymax, ymin];
    return {
      yearMin: ymin,
      yearMax: ymax,
      includeUnknownYear: el.includeUnknownYear.checked ? '1' : '0',
    };
  }

  function depthParams() {
    let dmin = Number(el.depthMin.value);
    let dmax = Number(el.depthMax.value);
    if (dmin > dmax) [dmin, dmax] = [dmax, dmin];
    return { depthMin: dmin, depthMax: dmax };
  }

  function updateFilterLabels() {
    const y = yearParams();
    const d = depthParams();
    el.yearRangeLabel.textContent = `${y.yearMin} – ${y.yearMax}`;
    el.depthRangeLabel.textContent = `${d.depthMin} – ${d.depthMax}`;
  }

  function getState() {
    const c = map.getCenter();
    const d = depthParams();
    const y = yearParams();
    return {
      lat: Number(c.lat.toFixed(5)),
      lon: Number(c.lng.toFixed(5)),
      z: map.getZoom(),
      sources: selectedSources().join(','),
      overlays: [...el.overlayToggles.querySelectorAll('input:checked')]
        .map((i) => i.value)
        .join(','),
      opacity: el.overlayOpacity.value,
      dmin: d.depthMin,
      dmax: d.depthMax,
      ymin: y.yearMin,
      ymax: y.yearMax,
      uy: el.includeUnknownYear.checked ? 1 : 0,
      ud: el.includeUnknownDepth.checked ? 1 : 0,
      r: el.radiusKm.value,
      q: el.searchInput.value.trim() || undefined,
      jp: el.jellegPreset.value,
      uj: el.includeUnknownJelleg.checked ? 1 : 0,
    };
  }

  function applyState(params) {
    if (params.lat && params.lon) {
      map.setView([Number(params.lat), Number(params.lon)], Number(params.z) || 9);
    }
    if (params.sources) {
      const set = new Set(params.sources.split(','));
      el.sourceToggles.querySelectorAll('input').forEach((inp) => {
        inp.checked = set.has(inp.value);
      });
    }
    if (params.overlays) {
      const set = new Set(params.overlays.split(','));
      el.overlayToggles.querySelectorAll('input').forEach((inp) => {
        inp.checked = set.has(inp.value);
      });
    }
    if (params.opacity) el.overlayOpacity.value = params.opacity;
    if (params.dmin != null) el.depthMin.value = params.dmin;
    if (params.dmax != null) el.depthMax.value = params.dmax;
    if (params.ymin != null) el.yearMin.value = params.ymin;
    if (params.ymax != null) el.yearMax.value = params.ymax;
    if (params.uy != null) el.includeUnknownYear.checked = params.uy === '1' || params.uy === 1;
    if (params.ud != null) el.includeUnknownDepth.checked = params.ud === '1' || params.ud === 1;
    if (params.r) el.radiusKm.value = params.r;
    if (params.q) el.searchInput.value = params.q;
    if (params.jp) el.jellegPreset.value = params.jp;
    if (params.uj != null) {
      el.includeUnknownJelleg.checked = params.uj === '1' || params.uj === 1;
    }
    updateFilterLabels();
  }

  function syncUrl() {
    const s = getState();
    const qs = new URLSearchParams();
    Object.entries(s).forEach(([k, v]) => {
      if (v != null && v !== '') qs.set(k, v);
    });
    history.replaceState(null, '', `?${qs.toString()}`);
  }

  function buildPopup(feature) {
    const p = feature.properties || {};
    const coords = feature.geometry?.coordinates || [];
    const lon = coords[0];
    const lat = coords[1];
    const depth = getDepth(p);
    const year = getYear(p);
    const jelleg = getJelleg(p);
    const id = p.FRS_ID ?? p.OBJECTID ?? '—';
    const place = p.KZG_TLP || p.TLP || '—';
    const jel = p.JELSZAM || '';
    const src = p.__source || 'fdt';
    const rows = Object.keys(p)
      .filter((k) => k !== '__source' && k !== '__jelleg')
      .sort()
      .map((k) => `${k}: ${p[k] == null ? '' : p[k]}`)
      .join('\n');

    return `
      <div class="popup-title">FRS ${id}${jel ? ` · ${jel}` : ''}</div>
      <div class="popup-meta">
        <div><span class="badge badge-fact">TÉNYADAT</span></div>
        <div><b>Forrás:</b> ${src}</div>
        <div><b>Jelleg:</b> ${jelleg || '— (nincs ADT adat)'}</div>
        <div><b>Település:</b> ${place}</div>
        <div><b>Év:</b> ${year ?? '—'}</div>
        <div><b>Teljes mélység (talp):</b> ${fmtDepth(depth)}</div>
        <div><b>Koordináta:</b> ${lat?.toFixed?.(5)}, ${lon?.toFixed?.(5)}</div>
        <button type="button" class="popup-profile-btn" data-lat="${lat}" data-lon="${lon}">Rétegsor / becslés</button>
        <button type="button" class="popup-profile-btn" data-compare="1" data-lat="${lat}" data-lon="${lon}" style="background:#0f766e;margin-top:0.3rem">Összehasonlításhoz</button>
      </div>
      <details><summary>Összes adat</summary><pre class="popup-all">${rows}</pre></details>
    `;
  }

  function makeMarker(feature) {
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) return null;
    const [lon, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const depth = getDepth(feature.properties);
    const color = depthColor(depth);
    const ring = sourceColor(feature.properties?.__source);
    const icon = L.divIcon({
      className: '',
      html: `<div class="marker-depth" style="background:${color};box-shadow:0 0 0 2px ${ring}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([lat, lon], { icon });
    marker.bindPopup(() => buildPopup(feature), { maxWidth: 340 });
    marker.on('popupopen', () => {
      document.querySelectorAll('.popup-profile-btn').forEach((btn) => {
        btn.onclick = () => {
          const plat = Number(btn.dataset.lat);
          const plon = Number(btn.dataset.lon);
          if (btn.dataset.compare) {
            addComparePoint(plat, plon, feature.properties || {});
          } else {
            loadProfile(plat, plon, feature.properties || {});
          }
        };
      });
    });
    return marker;
  }

  function passesJellegFilter(feature) {
    const jelleg = getJelleg(feature.properties || {});
    const preset = el.jellegPreset.value;
    const includeUnknown = el.includeUnknownJelleg.checked;

    if (preset === 'unknown') return jelleg == null;

    if (jelleg == null) {
      return includeUnknown && preset === 'all';
    }

    if (preset === 'vizkutato' && !isVizkutatoJelleg(jelleg)) return false;
    if (preset === 'nem_viz' && isVizkutatoJelleg(jelleg)) return false;
    if (preset === 'terkepezo' && !isTerkepezoJelleg(jelleg)) return false;
    if (preset === 'nyersanyag' && !isNyersanyagJelleg(jelleg)) return false;

    const boxes = [...el.jellegValues.querySelectorAll('input')];
    if (boxes.length) {
      const selected = selectedJellegValues();
      if (!selected.length) return false;
      if (selected.length < boxes.length && !selected.includes(jelleg)) {
        return false;
      }
    }
    return true;
  }

  function passesClientFilters(feature) {
    const p = feature.properties || {};
    const d = getDepth(p);
    const { depthMin, depthMax } = depthParams();
    if (d == null) {
      if (!el.includeUnknownDepth.checked) return false;
    } else if (d < depthMin || d > depthMax) {
      return false;
    }
    if (!passesJellegFilter(feature)) return false;
    return true;
  }

  function computeStats(features) {
    const depths = features.map((f) => getDepth(f.properties)).filter((d) => d != null);
    if (!depths.length) return { count: features.length, avg: null, min: null, max: null };
    return {
      count: features.length,
      avg: depths.reduce((a, b) => a + b, 0) / depths.length,
      min: Math.min(...depths),
      max: Math.max(...depths),
    };
  }

  function updateStats(features) {
    const s = computeStats(features);
    el.statCount.textContent = String(s.count);
    el.statAvg.textContent = fmtDepth(s.avg);
    el.statMin.textContent = fmtDepth(s.min);
    el.statMax.textContent = fmtDepth(s.max);
  }

  function renderMarkers(features) {
    filteredFeatures = features.filter(passesClientFilters);
    cluster.clearLayers();
    const markers = [];
    for (const f of filteredFeatures) {
      const m = makeMarker(f);
      if (m) markers.push(m);
    }
    cluster.addLayers(markers);
    updateStats(filteredFeatures);
  }

  function currentBbox() {
    const b = map.getBounds();
    return {
      minLon: b.getWest(),
      minLat: b.getSouth(),
      maxLon: b.getEast(),
      maxLat: b.getNorth(),
    };
  }

  function bboxArea(b) {
    return Math.abs(b.maxLon - b.minLon) * Math.abs(b.maxLat - b.minLat);
  }

  async function loadFeatures() {
    const token = ++loadToken;
    const b = currentBbox();
    if (bboxArea(b) > MAX_BBOX_AREA) {
      setStatus('A terület túl nagy — zoomolj közelebb.', 'warn');
      return;
    }
    const sources = selectedSources();
    if (!sources.length) {
      allFeatures = [];
      renderMarkers([]);
      setStatus('Nincs kiválasztott fúrási forrás.', 'warn');
      return;
    }
    setStatus('HUGEO lekérdezés…');
    const yp = yearParams();
    const qs = new URLSearchParams({
      bbox: `${b.minLon},${b.minLat},${b.maxLon},${b.maxLat}`,
      sources: sources.join(','),
      yearMin: String(yp.yearMin),
      yearMax: String(yp.yearMax),
      includeUnknownYear: yp.includeUnknownYear,
    });
    try {
      const res = await fetch(`/api/features?${qs}`);
      const data = await res.json();
      if (token !== loadToken) return;
      if (!res.ok) {
        allFeatures = [];
        renderMarkers([]);
        setStatus(data.error || 'Lekérdezési hiba', 'error');
        return;
      }
      allFeatures = data.features || [];
      if (data.meta?.fieldMap) fieldMap = data.meta.fieldMap;
      if (data.meta?.jellegValues) updateJellegChecklist(data.meta.jellegValues);
      renderMarkers(allFeatures);
      setStatus(
        allFeatures.length === 0
          ? 'A lekérdezés 0 fúrást adott vissza.'
          : `${allFeatures.length} fúrás betöltve (HUGEO)${
              data.exceededTransferLimit ? ' (rekordlimit)' : ''
            }`,
        allFeatures.length === 0 ? 'error' : ''
      );
      refreshDiag(allFeatures.length, data.meta?.message);
      syncUrl();
    } catch (err) {
      if (token !== loadToken) return;
      setStatus(`Hiba: ${err.message}`, 'error');
    }
  }

  function scheduleLoad() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadFeatures, DEBOUNCE_MS);
  }

  function scheduleClientFilter() {
    updateFilterLabels();
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      renderMarkers(allFeatures);
      syncUrl();
    }, 200);
  }

  function scheduleYearLoad() {
    updateFilterLabels();
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(loadFeatures, 400);
  }

  function refreshDiag(count, message) {
    if (!diagnostics) return;
    el.diagText.textContent = [
      `HUGEO kapcsolat: ${diagnostics.huggeoConnection || '—'}`,
      `Layer: ${diagnostics.layerId} ${diagnostics.layerName || ''}`,
      `Geometry: ${diagnostics.geometry || '—'}`,
      `Rekordok: ${count}`,
      `Mélységmező: ${diagnostics.fieldMap?.depth || '—'}`,
      message ? `Üzenet: ${message}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function renderHistogram(bins) {
    if (!bins?.length) {
      el.histogram.innerHTML = '';
      return;
    }
    const max = Math.max(1, ...bins.map((b) => b.count));
    el.histogram.innerHTML = bins
      .filter((b) => b.count > 0 || b.from < 300)
      .map(
        (b) => `
      <div class="hist-row">
        <span>${b.label}</span>
        <div class="hist-bar-wrap"><div class="hist-bar" style="width:${(100 * b.count) / max}%"></div></div>
        <span>${b.count}</span>
      </div>`
      )
      .join('');
  }

  function renderProfileHtml(data) {
    const fact = data.fact || {};
    const est = data.estimate || {};
    const surface = fact.surfaceGeology;
    const tvz = fact.talajviz?.talajviz;
    const mgt = fact.mgtSzintek?.levels || [];
    let stack = '0 m\n│\n';
    if (surface) {
      stack += `├── ${surface.nev || surface.litologia}  [TÉNYADAT — felszín]\n`;
    }
    if (tvz?.kod) {
      stack += `├── Talajvíz: ${tvz.kod}  [TÉNYADAT — TVZ]\n`;
    }
    for (const lvl of mgt) {
      if (lvl.found && lvl.melyseg) {
        stack += `├── ${lvl.label}: ${lvl.melyseg}  [TÉNYADAT — MGT modell]\n`;
      }
    }
    stack += '├── … köztes litológia / szűrőzés: nincs strukturált REST adat …\n';
    stack += `├── Vízadó intervallum: — (nincs TÉNYADAT)\n`;
    if (fact.totalDepthM != null) {
      stack += `└── ${fmtDepth(fact.totalDepthM)} talp  [TÉNYADAT]\n`;
    }

    const mgtHtml = mgt.filter((l) => l.found).length
      ? `<ul>${mgt
          .filter((l) => l.found)
          .map((l) => `<li>${l.label}: <b>${l.melyseg || '—'}</b></li>`)
          .join('')}</ul>
         <p class="hint">${fact.mgtSzintek?.note || ''}</p>`
      : '<p class="hint">MGT szint-sáv: nincs találat ezen a ponton.</p>';

    const estHtml = est.available
      ? `<p><span class="badge badge-estimate">BECSLÉS</span> ${est.confidence} (${est.confidenceScore}/100)</p>
         <p>Táv. súlyozott középpont: <b>${fmtDepth(est.estimatedDepthM)}</b></p>
         <p>Tartomány: ${fmtDepth(est.rangeM?.min)} – ${fmtDepth(est.rangeM?.max)}</p>
         <p class="disclaimer">${est.disclaimer || ''}</p>`
      : `<p><span class="badge badge-estimate">BECSLÉS</span>${est.reason || '—'}</p>`;

    return `
      <p><span class="badge badge-fact">TÉNYADAT</span> FRS ${fact.frsId ?? '—'} · ${fact.settlement || '—'} · ${fact.year ?? '—'}</p>
      <p>Talpmélység: <b>${fmtDepth(fact.totalDepthM)}</b></p>
      <p>Felszín: <b>${surface?.nev || '—'}</b> · TVZ: <b>${tvz?.kod || '—'}</b></p>
      <h3 style="font-size:0.8rem;margin:0.6rem 0 0.3rem">Regionális MGT mélységsávok</h3>
      ${mgtHtml}
      <pre class="profile-stack">${stack}</pre>
      <p class="hint">${fact.profile?.message || ''}</p>
      <hr style="border-color:#243044;margin:0.75rem 0" />
      ${estHtml}
      <p class="disclaimer">${data.disclaimer || ''}</p>`;
  }

  async function loadProfile(lat, lon, properties) {
    el.profileBox.hidden = false;
    el.profileContent.textContent = 'Profil betöltése…';
    lastCenter = { lat, lon };
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          properties,
          features: allFeatures,
          radiusKm: Number(el.radiusKm.value) || 10,
        }),
      });
      const data = await res.json();
      el.profileContent.innerHTML = res.ok
        ? renderProfileHtml(data)
        : data.error || 'Profil hiba';
    } catch (err) {
      el.profileContent.textContent = err.message;
    }
  }

  async function runIdentify(lat, lon) {
    el.identifyBox.hidden = false;
    el.identifyContent.textContent = 'Identify…';
    if (identifyMarker) map.removeLayer(identifyMarker);
    identifyMarker = L.circleMarker([lat, lon], {
      radius: 6,
      color: '#fff',
      fillColor: '#22c55e',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    try {
      const data = await (
        await fetch(`/api/identify?lat=${lat}&lon=${lon}`)
      ).json();
      const g = data.geology?.surface;
      const t = data.talajviz?.talajviz;
      const mgt = (data.mgtSzintek?.levels || []).filter((l) => l.found);
      const mgtList = mgt.length
        ? `<ul>${mgt
            .map((l) => `<li>${l.label}: <b>${l.melyseg || '—'}</b></li>`)
            .join('')}</ul>`
        : '<p>—</p>';
      el.identifyContent.innerHTML = `
        <p><span class="badge badge-fact">TÉNYADAT</span> ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
        <p><b>Földtan:</b> ${g?.nev || '—'} ${g?.litologia ? `(${g.litologia})` : ''}</p>
        <p><b>Index:</b> ${g?.geoIndex || '—'}</p>
        <p><b>Talajvíz (TVZ):</b> ${t?.kod || '—'}</p>
        <p><b>MGT földtani szintek (regionális):</b></p>
        ${mgtList}
        <p class="hint">${data.mgtSzintek?.note || 'Regionális modell — nem kútrétegsor.'}</p>
        <p class="hint">Vízadó / agyag intervallum kúton: nincs strukturált REST adat.</p>`;
      await loadProfile(lat, lon, {});
    } catch (err) {
      el.identifyContent.textContent = err.message;
    }
  }

  function addComparePoint(lat, lon, properties = {}) {
    if (compareList.length >= 4) {
      setStatus('Max. 4 pont hasonlítható össze.', 'warn');
      return;
    }
    const depth = getDepth(properties);
    const item = {
      lat,
      lon,
      properties,
      label: properties.KZG_TLP || properties.TLP || properties.FRS_ID || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      depth,
      year: getYear(properties),
    };
    compareList.push(item);
    const m = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="marker-depth" style="background:#0f766e;width:16px;height:16px"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map);
    compareMarkers.push(m);
    renderCompare();
    loadProfile(lat, lon, properties);
  }

  function renderCompare() {
    el.compareBox.hidden = compareList.length === 0;
    el.comparePoints.innerHTML = `<div class="compare-cards">${compareList
      .map(
        (p, i) => `
      <div class="compare-card">
        <b>#${i + 1} ${p.label}</b><br/>
        ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}<br/>
        Talp: ${fmtDepth(p.depth)} · Év: ${p.year ?? '—'} · FRS: ${p.properties.FRS_ID ?? '—'}
      </div>`
      )
      .join('')}</div>`;
  }

  function clearCompare() {
    compareList.length = 0;
    compareMarkers.forEach((m) => map.removeLayer(m));
    compareMarkers.length = 0;
    renderCompare();
  }

  async function runRadiusAnalysis(lat, lon) {
    const radiusKm = Number(el.radiusKm.value) || 10;
    lastCenter = { lat, lon };
    if (radiusCircle) map.removeLayer(radiusCircle);
    if (analysisMarker) map.removeLayer(analysisMarker);
    analysisMarker = L.circleMarker([lat, lon], {
      radius: 7,
      color: '#fff',
      fillColor: '#f59e0b',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    radiusCircle = L.circle([lat, lon], {
      radius: radiusKm * 1000,
      color: '#f59e0b',
      weight: 2,
      fillOpacity: 0.08,
    }).addTo(map);

    el.analysisBox.hidden = false;
    el.analysisContent.textContent = 'Számítás…';
    try {
      const [radiusRes, compareRes] = await Promise.all([
        fetch('/api/analysis/radius', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, radiusKm, features: allFeatures }),
        }).then((r) => r.json()),
        fetch('/api/analysis/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lon, features: allFeatures }),
        }).then((r) => r.json()),
      ]);
      const s = radiusRes.stats || {};
      el.analysisContent.innerHTML = `
        <div><b>Sugár:</b> ${radiusKm} km · <b>Fúrások:</b> ${s.furasok ?? 0}</div>
        <div><b>Medián:</b> ${fmtDepth(s.medianMelyseg)} · <b>Átlag:</b> ${fmtDepth(s.atlagMelyseg)}</div>
        <div><b>Táv. súlyozott medián:</b> ${fmtDepth(s.tavolsagSulyozottMedian)}</div>
        <div><b>Min/Max:</b> ${fmtDepth(s.minimum)} / ${fmtDepth(s.maximum)}</div>
        <p class="disclaimer">${radiusRes.disclaimer || ''}</p>`;
      renderHistogram(radiusRes.histogram);
      el.compareTable.innerHTML = `
        <table class="compare-table">
          <thead><tr><th>Sugár</th><th>Fúrások</th><th>Medián</th><th>Súly. med.</th><th>Vízadó</th></tr></thead>
          <tbody>
            ${(compareRes.rows || [])
              .map(
                (r) => `<tr>
                <td>${r.sugarKm} km</td>
                <td>${r.furasok}</td>
                <td>${fmtDepth(r.medianMelyseg)}</td>
                <td>${fmtDepth(r.tavolsagSulyozottMedian)}</td>
                <td>${r.vizzadoIntervallum ?? '—'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <p class="disclaimer">${compareRes.disclaimer || ''}</p>`;
      await loadProfile(lat, lon, {});
    } catch (err) {
      el.analysisContent.textContent = err.message;
    }
  }

  async function exportData(format) {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, features: filteredFeatures }),
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = format === 'csv' ? 'furasok.csv' : 'furasok.geojson';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openReport() {
    const center = lastCenter || {
      lat: map.getCenter().lat,
      lon: map.getCenter().lng,
    };
    const res = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: center.lat,
        lon: center.lon,
        address: lastAddress || el.searchInput.value.trim() || null,
        features: allFeatures,
        radiusKm: Number(el.radiusKm.value) || 10,
      }),
    });
    const html = await res.text();
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }

  function parseCoord(text) {
    const m = String(text)
      .trim()
      .match(/(-?\d+[.,]\d+)\s*[,;\s]\s*(-?\d+[.,]\d+)/);
    if (!m) return null;
    let a = Number(m[1].replace(',', '.'));
    let b = Number(m[2].replace(',', '.'));
    // If first looks like lon for Hungary (16-23) and second like lat (45-49), swap
    if (a > 40 && a < 50 && b > 15 && b < 24) return { lat: a, lon: b };
    if (b > 40 && b < 50 && a > 15 && a < 24) return { lat: b, lon: a };
    return { lat: a, lon: b };
  }

  function syncOverlays() {
    const opacity = Number(el.overlayOpacity.value) / 100;
    el.overlayOpacityVal.textContent = `${el.overlayOpacity.value}%`;
    const checked = new Set(
      [...el.overlayToggles.querySelectorAll('input:checked')].map((i) => i.value)
    );
    const legends = [];
    for (const [id, ctrl] of Object.entries(exportLayers)) {
      if (checked.has(id)) {
        ctrl.enable();
        ctrl.setOpacity(opacity);
        const meta = catalog?.overlays?.find((o) => o.id === id);
        if (meta?.legend?.length) {
          legends.push(
            `<div><b>${meta.label}</b></div>` +
              meta.legend
                .map(
                  (l) =>
                    `<div class="leg-item"><span class="dot" style="background:${l.color}"></span>${l.label}</div>`
                )
                .join('')
          );
        } else if (meta) {
          legends.push(`<div class="leg-item">• ${meta.label}</div>`);
        }
      } else {
        ctrl.disable();
      }
    }
    el.overlayLegend.innerHTML = legends.join('') || '<div class="hint">Nincs bekapcsolt overlay</div>';
    syncUrl();
  }

  async function loadCatalog() {
    catalog = await (await fetch('/api/catalog')).json();
    el.sourceToggles.innerHTML = '';
    for (const s of catalog.drillSources || []) {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" value="${s.id}" ${
        s.defaultOn ? 'checked' : ''
      } /> <span class="source-swatch" style="background:${s.color}"></span> ${s.label}`;
      el.sourceToggles.appendChild(label);
    }
    el.overlayToggles.innerHTML = '';
    for (const o of catalog.overlays || []) {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" value="${o.id}" ${
        o.defaultOn ? 'checked' : ''
      } /> ${o.label}`;
      el.overlayToggles.appendChild(label);
      exportLayers[o.id] = createExportOverlay(o.id);
    }
    if (catalog.yearRange) {
      el.yearMin.min = catalog.yearRange.min;
      el.yearMin.max = catalog.yearRange.max;
      el.yearMax.min = catalog.yearRange.min;
      el.yearMax.max = catalog.yearRange.max;
      el.yearMin.value = catalog.yearRange.min;
      el.yearMax.value = catalog.yearRange.max;
    }
    if (catalog.hugeo3d) el.open3d.href = catalog.hugeo3d;
    updateFilterLabels();
  }

  async function loadDiagnostics() {
    try {
      diagnostics = await (await fetch('/api/diagnostics')).json();
      if (diagnostics.fieldMap) fieldMap = diagnostics.fieldMap;
      if (diagnostics.hugeo3d) el.open3d.href = diagnostics.hugeo3d;
      refreshDiag(0, diagnostics.note);
    } catch (err) {
      el.diagText.textContent = err.message;
    }
  }

  // Events
  el.pickPointBtn.addEventListener('click', () => {
    pickMode = !pickMode;
    compareMode = false;
    el.compareModeBtn.classList.remove('active');
    el.pickPointBtn.classList.toggle('active', pickMode);
    el.pickPointBtn.textContent = pickMode ? 'Kattints a térképre…' : 'Pont kijelölése';
    map.getContainer().style.cursor = pickMode ? 'crosshair' : '';
  });

  el.compareModeBtn.addEventListener('click', () => {
    compareMode = !compareMode;
    pickMode = false;
    el.pickPointBtn.classList.remove('active');
    el.pickPointBtn.textContent = 'Pont kijelölése';
    el.compareModeBtn.classList.toggle('active', compareMode);
    el.compareModeBtn.textContent = compareMode
      ? 'Kattints pontokhoz…'
      : 'Összehasonlítás';
    map.getContainer().style.cursor = compareMode ? 'crosshair' : '';
  });

  map.on('click', async (e) => {
    const { lat, lng: lon } = e.latlng;
    if (el.identifyMode.checked && !pickMode && !compareMode) {
      await runIdentify(lat, lon);
      return;
    }
    if (compareMode) {
      addComparePoint(lat, lon, {});
      return;
    }
    if (!pickMode) return;
    pickMode = false;
    el.pickPointBtn.classList.remove('active');
    el.pickPointBtn.textContent = 'Pont kijelölése';
    map.getContainer().style.cursor = '';
    runRadiusAnalysis(lat, lon);
  });

  el.clearCompareBtn.addEventListener('click', clearCompare);
  el.minDepth?.addEventListener?.('change', () => renderMarkers(allFeatures));
  el.sourceToggles.addEventListener('change', () => {
    scheduleLoad();
    syncUrl();
  });
  el.jellegPreset.addEventListener('change', () => {
    if (el.jellegPreset.value === 'unknown') {
      el.includeUnknownJelleg.checked = true;
    }
    scheduleClientFilter();
  });
  el.jellegValues.addEventListener('change', scheduleClientFilter);
  el.includeUnknownJelleg.addEventListener('change', scheduleClientFilter);
  el.overlayToggles.addEventListener('change', syncOverlays);
  el.overlayOpacity.addEventListener('input', syncOverlays);
  el.yearMin.addEventListener('input', scheduleYearLoad);
  el.yearMax.addEventListener('input', scheduleYearLoad);
  el.includeUnknownYear.addEventListener('change', scheduleLoad);
  el.depthMin.addEventListener('input', scheduleClientFilter);
  el.depthMax.addEventListener('input', scheduleClientFilter);
  el.includeUnknownDepth.addEventListener('change', scheduleClientFilter);
  el.radiusKm.addEventListener('change', syncUrl);
  el.exportGeoBtn.addEventListener('click', () => exportData('geojson'));
  el.exportCsvBtn.addEventListener('click', () => exportData('csv'));
  el.reportBtn.addEventListener('click', openReport);
  el.copyViewBtn.addEventListener('click', async () => {
    syncUrl();
    await navigator.clipboard.writeText(location.href);
    setStatus('Nézet URL a vágólapra másolva.');
  });
  el.gotoCoordBtn.addEventListener('click', () => {
    const c = parseCoord(el.coordPaste.value);
    if (!c) {
      setStatus('Érvénytelen koordináta. Formátum: lat, lon', 'error');
      return;
    }
    map.setView([c.lat, c.lon], 13);
    runIdentify(c.lat, c.lon);
    scheduleLoad();
  });
  el.fullscreenBtn.addEventListener('click', () => {
    el.app.classList.toggle('fullscreen-map');
    setTimeout(() => map.invalidateSize(), 200);
  });
  el.embed3dBtn.addEventListener('click', () => {
    const open = el.embed3dWrap.hidden;
    el.embed3dWrap.hidden = !open;
    if (open && !el.embed3d.src) {
      el.embed3d.src = el.open3d.href;
    }
    el.embed3dBtn.textContent = open ? '3D panel bezárása' : '3D beágyazás (panel)';
  });
  el.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = el.searchInput.value.trim();
    if (!q) return;
    setStatus(`Keresés: ${q}…`);
    try {
      const data = await (await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)).json();
      if (!data.results?.length) {
        setStatus('Nincs találat', 'error');
        return;
      }
      const hit = data.results[0];
      lastAddress = hit.displayName;
      if (hit.boundingBox) {
        const bb = hit.boundingBox;
        map.fitBounds([
          [bb.minLat, bb.minLon],
          [bb.maxLat, bb.maxLon],
        ]);
      } else {
        map.setView([hit.lat, hit.lon], 12);
      }
      lastCenter = { lat: hit.lat, lon: hit.lon };
      setStatus(hit.displayName);
      scheduleLoad();
    } catch (err) {
      setStatus(err.message, 'error');
    }
  });
  el.togglePanel.addEventListener('click', () => el.panel.classList.toggle('open'));
  map.on('moveend', scheduleLoad);

  (async function init() {
    await loadCatalog();
    const params = Object.fromEntries(new URLSearchParams(location.search));
    applyState(params);
    await loadDiagnostics();
    syncOverlays();
    await loadFeatures();
  })();
})();
