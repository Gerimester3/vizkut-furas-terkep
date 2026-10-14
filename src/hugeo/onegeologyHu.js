/**
 * OneGeology 1:1 000 000 legend labels are CGI Simple Lithology names in English.
 * Map only the values published by the HUGEO onegeology layer.
 */
const ONEGEOLOGY_HU = {
  'alkali-olivine_basalt': 'alkáli olivinbazalt',
  andesite: 'andezit',
  clastic_mudstone: 'törmelékes agyagkő',
  clastic_sandstone: 'törmelékes homokkő',
  clastic_sedimentary_rock: 'törmelékes üledékes kőzet',
  diamictite: 'diamiktit',
  diamicton: 'diamikton',
  gabbroic_rock: 'gabbrójellegű kőzet',
  granite: 'gránit',
  impure_dolostone: 'szennyezett dolomit',
  impure_limestone: 'szennyezett mészkő',
  limestone: 'mészkő',
  mica_schist: 'csillámpala',
  monzogranite: 'monzogránit',
  organic_rich_sediment: 'szerves anyagban gazdag üledék',
  phonolite: 'fonolit',
  phyllite: 'fillit',
  sand: 'homok',
  silt: 'kőzetliszt',
  siltstone: 'aleurolit',
  slate: 'agyagpala',
  travertine: 'travertínó',
  tuff_breccia_agglomerate_or_pyroclastic_breccia:
    'tufabreccsa, agglomerátum vagy piroklasztos breccsa',
};

function translateOneGeologyLabel(label) {
  const key = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, (ch) => (ch.trim() === '-' ? '-' : '_'));
  return ONEGEOLOGY_HU[key] || ONEGEOLOGY_HU[String(label || '').trim()] || String(label || '').trim();
}

module.exports = {
  ONEGEOLOGY_HU,
  translateOneGeologyLabel,
};
