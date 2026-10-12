/**
 * Optional WFS GetCapabilities probe (diagnostic / fallback discovery).
 */

const DEFAULT_WFS =
  process.env.HUGEO_WFS ||
  'https://map.hugeo.hu/arcgis/services/furas/map_frs_fdt_web_mercator/MapServer/WFSServer';

function extractFeatureTypes(xml) {
  const types = [];
  const re =
    /<FeatureType>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?(?:<Title>([^<]*)<\/Title>)?[\s\S]*?<\/FeatureType>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    types.push({ name: m[1].trim(), title: (m[2] || '').trim() });
  }
  return types;
}

async function getWfsCapabilities(wfsUrl = DEFAULT_WFS) {
  const url = `${wfsUrl}?service=WFS&request=GetCapabilities`;
  const res = await fetch(url, {
    headers: { Accept: 'application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`WFS GetCapabilities HTTP ${res.status}`);
  }
  const xml = await res.text();
  return {
    wfsUrl,
    featureTypes: extractFeatureTypes(xml),
    rawLength: xml.length,
  };
}

module.exports = {
  DEFAULT_WFS,
  getWfsCapabilities,
  extractFeatureTypes,
};
