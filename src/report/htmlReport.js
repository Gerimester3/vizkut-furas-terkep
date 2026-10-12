/**
 * Printable HTML report for a location (5/10/20 km comparison).
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(d) {
  if (d == null || Number.isNaN(d)) return '—';
  return `${Number(d).toFixed(Number.isInteger(d) ? 0 : 1)} m`;
}

function buildHtmlReport({
  title = 'Fúrási jelentés',
  address = null,
  center,
  compareRows = [],
  identify = null,
  estimate = null,
  featureCount = 0,
  generatedAt = new Date().toISOString(),
}) {
  const rows = compareRows
    .map(
      (r) => `
      <tr>
        <td>${esc(r.sugarKm)} km</td>
        <td>${esc(r.furasok)}</td>
        <td>${esc(fmt(r.medianMelyseg))}</td>
        <td>${esc(fmt(r.tavolsagSulyozottMedian))}</td>
        <td>${esc(r.vizzadoIntervallum ?? '—')}</td>
      </tr>`
    )
    .join('');

  const surface = identify?.geology?.surface;
  const tvz = identify?.talajviz?.talajviz;

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: Segoe UI, sans-serif; color: #111; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.4rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.45rem 0.55rem; text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    .badge { display:inline-block; padding:0.1rem 0.4rem; border-radius:4px; font-size:0.75rem; font-weight:700; }
    .fact { background:#d1fae5; color:#065f46; }
    .est { background:#ffedd5; color:#9a3412; }
    .note { color:#92400e; font-size:0.9rem; }
    @media print { button { display:none; } }
  </style>
</head>
<body>
  <button onclick="window.print()">Nyomtatás / PDF</button>
  <h1>${esc(title)}</h1>
  <p><b>Cím / hely:</b> ${esc(address || '—')}</p>
  <p><b>Koordináta:</b> ${esc(center?.lat?.toFixed?.(5))}, ${esc(center?.lon?.toFixed?.(5))}</p>
  <p><b>Generálva:</b> ${esc(generatedAt)} · látható fúrások a kérésben: ${esc(featureCount)}</p>

  <h2><span class="badge fact">TÉNYADAT</span> Helyszín</h2>
  <ul>
    <li>Felszíni földtan: ${esc(surface?.nev || '—')}${surface?.litologia ? ` (${esc(surface.litologia)})` : ''}</li>
    <li>Talajvízszint kategória (TVZ): ${esc(tvz?.kod || '—')}</li>
    <li>Vízadó intervallum: — (strukturált rétegsor nem elérhető REST-en)</li>
  </ul>

  <h2>5 / 10 / 20 km összehasonlítás</h2>
  <table>
    <thead>
      <tr>
        <th>Sugár</th>
        <th>Fúrások</th>
        <th>Medián talp</th>
        <th>Táv. súlyozott medián</th>
        <th>Vízadó intervallum</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <h2><span class="badge est">BECSLÉS</span> Tájékoztató talpmélység-sáv</h2>
  ${
    estimate?.available
      ? `<p>Becsült középpont: <b>${esc(fmt(estimate.estimatedDepthM))}</b>
         (tartomány: ${esc(fmt(estimate.rangeM?.min))} – ${esc(fmt(estimate.rangeM?.max))})
         · bizonyosság: ${esc(estimate.confidence)} (${esc(estimate.confidenceScore)}/100)</p>
         <p class="note">${esc(estimate.disclaimer)}</p>`
      : `<p>${esc(estimate?.reason || 'Becslés nem elérhető')}</p>`
  }

  <p class="note">A teljes fúrásmélység nem azonos a vízadó réteg mélységével. Adatforrás: HUGEO / SZTFH.</p>
</body>
</html>`;
}

module.exports = { buildHtmlReport };
