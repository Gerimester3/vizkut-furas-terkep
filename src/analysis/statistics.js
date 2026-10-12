/**
 * Depth statistics, histogram, distance-weighted metrics.
 */

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function depthStats(depths) {
  const values = depths
    .filter((d) => d != null && Number.isFinite(d))
    .slice()
    .sort((a, b) => a - b);

  if (!values.length) {
    return {
      count: depths.length,
      withDepth: 0,
      average: null,
      median: null,
      min: null,
      max: null,
    };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: depths.length,
    withDepth: values.length,
    average: sum / values.length,
    median: median(values),
    min: values[0],
    max: values[values.length - 1],
  };
}

/** Histogram buckets for depth distribution. */
function depthHistogram(depths, { binSize = 50, maxBin = 500 } = {}) {
  const values = depths.filter((d) => d != null && Number.isFinite(d));
  const bins = [];
  for (let from = 0; from < maxBin; from += binSize) {
    bins.push({
      from,
      to: from + binSize,
      label: `${from}–${from + binSize} m`,
      count: 0,
    });
  }
  bins.push({
    from: maxBin,
    to: null,
    label: `${maxBin}+ m`,
    count: 0,
  });

  for (const d of values) {
    if (d >= maxBin) {
      bins[bins.length - 1].count += 1;
    } else {
      const idx = Math.floor(d / binSize);
      if (bins[idx]) bins[idx].count += 1;
    }
  }
  return bins;
}

/**
 * Inverse-distance weighted average of depths.
 * weight = 1 / (distanceM + floorM)^power
 */
function weightedDepthStats(items, { floorM = 500, power = 1 } = {}) {
  const usable = (items || []).filter(
    (it) => it.depth != null && Number.isFinite(it.depth) && it.distanceM != null
  );
  if (!usable.length) {
    return { weightedAverage: null, weightedMedian: null, n: 0 };
  }

  let wSum = 0;
  let dSum = 0;
  const weighted = [];
  for (const it of usable) {
    const w = 1 / (it.distanceM + floorM) ** power;
    wSum += w;
    dSum += w * it.depth;
    weighted.push({ depth: it.depth, w });
  }

  // Approximate weighted median: expand by relative weight ranks
  const sorted = weighted.slice().sort((a, b) => a.depth - b.depth);
  const half = wSum / 2;
  let acc = 0;
  let wMedian = sorted[sorted.length - 1].depth;
  for (const row of sorted) {
    acc += row.w;
    if (acc >= half) {
      wMedian = row.depth;
      break;
    }
  }

  return {
    weightedAverage: dSum / wSum,
    weightedMedian: wMedian,
    n: usable.length,
  };
}

module.exports = {
  median,
  depthStats,
  depthHistogram,
  weightedDepthStats,
};
