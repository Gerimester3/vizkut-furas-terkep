/**
 * Catalog of HUGEO drilling point sources and basemap overlays.
 * Discovered / verified against MapServer metadata — not invented.
 */

const HUGEO_REST = 'https://map.hugeo.hu/arcgis/rest/services';

/** Selectable fúrási pont-források */
const DRILL_SOURCES = {
  fdt: {
    id: 'fdt',
    label: 'Földtani réteginformáció',
    mapServer: `${HUGEO_REST}/furas/map_frs_fdt_web_mercator/MapServer`,
    layerId: 0,
    defaultOn: true,
    color: '#3d8bfd',
  },
  vfdt: {
    id: 'vfdt',
    label: 'Vízföldtani / mélyfúrású kutak',
    mapServer: `${HUGEO_REST}/furas/map_frs_vfdt_npl_web_mercator/MapServer`,
    layerId: 0,
    defaultOn: false,
    color: '#14b8a6',
  },
  mm: {
    id: 'mm',
    label: 'Magminták',
    mapServer: `${HUGEO_REST}/furas/map_frs_mm_web_mercator/MapServer`,
    layerId: 0,
    defaultOn: false,
    color: '#a855f7',
  },
  adt: {
    id: 'adt',
    label: 'Adattári dokumentáció',
    mapServer: `${HUGEO_REST}/furas/map_frs_adt_web_mercator/MapServer`,
    layerId: 0,
    defaultOn: false,
    color: '#f59e0b',
  },
};

/**
 * Map overlays (tile or dynamic export).
 * tile: ArcGIS cached XYZ
 * export: ArcGIS export (dynamic)
 * wms: WMS GetMap via proxy
 */
const OVERLAYS = {
  foldtan100: {
    id: 'foldtan100',
    label: 'Földtan 1:100 000',
    kind: 'export',
    mapServer: `${HUGEO_REST}/fdt100/fdt100_foldtan/MapServer`,
    layers: 'show:6',
    defaultOpacity: 0.55,
    defaultOn: false,
  },
  foldtan500: {
    id: 'foldtan500',
    label: 'Földtan 1:500 000',
    kind: 'export',
    mapServer: `${HUGEO_REST}/fdt500/fdt500/MapServer`,
    layers: 'show:2',
    defaultOpacity: 0.5,
    defaultOn: false,
  },
  pretercier: {
    id: 'pretercier',
    label: 'Pretercier aljzat',
    kind: 'export',
    mapServer: `${HUGEO_REST}/preterc500/preterc500_geology/MapServer`,
    layers: 'show:6,7',
    defaultOpacity: 0.5,
    defaultOn: false,
  },
  termalviz: {
    id: 'termalviz',
    label: 'Termálvíztestek',
    kind: 'export',
    mapServer: `${HUGEO_REST}/geoterm/MGT_termalviztest/MapServer`,
    layers: 'show:1,2',
    defaultOpacity: 0.45,
    defaultOn: false,
  },
  onegeology: {
    id: 'onegeology',
    label: 'OneGeology (1M)',
    kind: 'export',
    mapServer: `${HUGEO_REST}/onegeology/onegeology/MapServer`,
    layers: 'show:2',
    defaultOpacity: 0.45,
    defaultOn: false,
  },
  talajviz: {
    id: 'talajviz',
    label: 'Talajvízszint (TVZ)',
    kind: 'export',
    mapServer: `${HUGEO_REST}/tvz/tvz100_all/MapServer`,
    layers: 'show:0',
    defaultOpacity: 0.4,
    defaultOn: false,
    legend: [
      { label: '0 – 2 m', color: '#c6dbef' },
      { label: '2 – 5 m', color: '#9ecae1' },
      { label: '5 – 10 m', color: '#6baed6' },
      { label: 'mélyebb / egyéb', color: '#2171b5' },
    ],
  },
  mgtSzintek: {
    id: 'mgtSzintek',
    label: 'Földtani szintek (MGT talpmélység)',
    kind: 'export',
    mapServer: `${HUGEO_REST}/geoterm/MGT_fdt_szint/MapServer`,
    layers: 'show:0,1,2,3',
    defaultOpacity: 0.45,
    defaultOn: false,
    legend: [
      { label: 'Kvarter talp', color: '#fde68a' },
      { label: 'Felső-pannóniai talp', color: '#fdba74' },
      { label: 'Pannóniai talp', color: '#f97316' },
      { label: 'Prekainozoos aljzat', color: '#9a3412' },
    ],
  },
};

const GEOLOGY_IDENTIFY = {
  mapServer: `${HUGEO_REST}/fdt100/fdt100_foldtan/MapServer`,
  layerId: 6,
};

const TVZ_IDENTIFY = {
  mapServer: `${HUGEO_REST}/tvz/tvz100_all/MapServer`,
  layerId: 0,
};

/** Regional formation bottom depth bands (not well stratigraphy). */
const MGT_SZINT_IDENTIFY = {
  mapServer: `${HUGEO_REST}/geoterm/MGT_fdt_szint/MapServer`,
  layers: [
    { id: 0, label: 'Kvarter talp' },
    { id: 1, label: 'Felső-pannóniai talp' },
    { id: 2, label: 'Pannóniai talp' },
    { id: 3, label: 'Prekainozoos aljzat felszíne' },
  ],
};

const HUGEO_3D_URL = 'https://map.hugeo.hu/3d_foldtan/';

module.exports = {
  HUGEO_REST,
  DRILL_SOURCES,
  OVERLAYS,
  GEOLOGY_IDENTIFY,
  TVZ_IDENTIFY,
  MGT_SZINT_IDENTIFY,
  HUGEO_3D_URL,
};
