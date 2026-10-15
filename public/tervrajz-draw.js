/**
 * Kút végleges tervrajz — adatok, ellenőrzés, A4-es rajz.
 * Koordináták milliméterben, origó a lap bal felső sarka.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KutTerv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FRAME_L = 8;
  const FRAME_T = 8;
  const FRAME_R = 202;
  const FRAME_B = 289;
  const GROUND_Y = 48;
  const TALP_Y = 248;
  const AXIS_X = 31;
  const CENTER_X = 56;
  const BORE_HALF = 15;
  const CALLOUT_X = 78;
  const SPLIT_X = 120;
  const TABLE_X = 124;
  const FOOT_Y = 266;
  const MAX_SECTIONS = 40;

  const INK = '#1c1917';
  const MUTED = '#57534e';
  const RULE = '#d6d3d1';
  const BORE_FILL = '#f3efe4';
  const BORE_LINE = '#44403c';
  const CASING = '#3f3f46';
  const ANNULUS = '#eef2f6';
  const BLANK_FILL = '#f8fafc';
  const BLANK_LINE = '#1e293b';
  const SCREEN_FILL = '#d7ecfa';
  const SCREEN_LINE = '#075985';
  const SLOT = '#0c4a6e';
  const WATER = '#0369a1';
  const LEADER = '#a8a29e';
  const GRID = '#e7e5e4';
  const WARN = '#9a3412';

  function parseNum(value) {
    if (value == null) return null;
    const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function fmtNum(n, digits) {
    const neg = n < 0;
    const [i, d] = Math.abs(n).toFixed(digits).split('.');
    const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return (neg ? '-' : '') + (digits > 0 ? `${grouped},${d}` : grouped);
  }

  function fmtDepth(n) {
    return fmtNum(n, 2);
  }

  function fmtMm(n) {
    const digits = Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1;
    return fmtNum(n, digits);
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '';
    return `${m[1]}. ${m[2]}. ${m[3]}.`;
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function ptToMm(pt) {
    return (pt * 25.4) / 72;
  }

  function textWidthMm(str, sizePt, bold) {
    const factor = bold ? 0.56 : 0.52;
    return String(str).length * sizePt * factor * (25.4 / 72);
  }

  function fitText(str, sizePt, maxMm, bold) {
    const text = String(str || '');
    if (textWidthMm(text, sizePt, bold) <= maxMm) return text;
    let s = text;
    while (s.length > 1 && textWidthMm(`${s}…`, sizePt, bold) > maxMm) s = s.slice(0, -1);
    return `${s}…`;
  }

  function wrapText(str, sizePt, maxMm, bold) {
    const words = String(str || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (textWidthMm(next, sizePt, bold) <= maxMm) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function clipLine(x1, y1, x2, y2, xmin, ymin, xmax, ymax) {
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - xmin, xmax - x1, y1 - ymin, ymax - y1];
    for (let i = 0; i < 4; i += 1) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return null;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return null;
          if (t < t1) t1 = t;
        }
      }
    }
    return {
      x1: x1 + t0 * dx,
      y1: y1 + t0 * dy,
      x2: x1 + t1 * dx,
      y2: y1 + t1 * dy,
    };
  }

  function isBlankSection(section) {
    return parseNum(section.length) == null && parseNum(section.diameter) == null;
  }

  function prepare(input) {
    const errors = [];
    const warnings = [];
    const notes = [];
    const err = (field, message) => errors.push({ field, message });

    const name = String(input.name || '').trim();
    const place = String(input.place || '').trim();
    const dateIso = String(input.date || '').trim();
    const note = String(input.note || '').trim();
    const depth = parseNum(input.depth);
    const bore = parseNum(input.bore);
    const ground = parseNum(input.ground);
    const water = parseNum(input.water);

    if (depth == null) err('depth', 'Add meg a talpmélységet.');
    else if (Number.isNaN(depth)) err('depth', 'A talpmélység legyen szám.');
    else if (depth <= 0) err('depth', 'A talpmélység legyen 0-nál nagyobb.');
    else if (depth > 4000) err('depth', 'A talpmélység legfeljebb 4000 m lehet.');

    if (bore == null) err('bore', 'Add meg a fúrat átmérőjét.');
    else if (Number.isNaN(bore)) err('bore', 'A fúrat átmérője legyen szám.');
    else if (bore <= 0) err('bore', 'A fúrat átmérője legyen 0-nál nagyobb.');
    else if (bore > 2000) err('bore', 'A fúrat átmérője legfeljebb 2000 mm lehet.');

    if (ground != null && Number.isNaN(ground)) err('ground', 'A terepszint legyen szám.');
    const gravel = parseNum(input.gravelTop);
    if (gravel != null && Number.isNaN(gravel)) err('gravelTop', 'A kavicsolás teteje legyen szám.');
    else if (gravel != null && gravel < 0) err('gravelTop', 'A kavicsolás teteje ne legyen negatív.');
    else if (gravel != null && depth != null && !Number.isNaN(depth) && depth > 0 && gravel >= depth) {
      err('gravelTop', 'A kavics a talp fölé érjen fel, mert a talptól felfelé töltik.');
    }

    if (water != null && Number.isNaN(water)) err('water', 'A nyugalmi vízszint legyen szám.');
    else if (water != null && depth != null && !Number.isNaN(depth) && depth > 0) {
      if (water < 0 || water > depth) {
        err('water', 'A nyugalmi vízszint a talajszint és a talp közé essen.');
      }
    }

    let casing = null;
    if (input.casingOn) {
      const casingDia = parseNum(input.casingDia);
      const casingDepth = parseNum(input.casingDepth);
      if (casingDia == null) err('casingDia', 'Add meg a védőcső átmérőjét.');
      else if (Number.isNaN(casingDia) || casingDia <= 0) err('casingDia', 'A védőcső átmérője legyen 0-nál nagyobb.');
      else if (casingDia > 2000) err('casingDia', 'A védőcső átmérője legfeljebb 2000 mm lehet.');
      if (casingDepth == null) err('casingDepth', 'Add meg, milyen mélyre van lehelyezve a védőcső.');
      else if (Number.isNaN(casingDepth) || casingDepth <= 0) {
        err('casingDepth', 'A védőcső lehelyezési mélysége legyen 0-nál nagyobb.');
      } else if (depth != null && !Number.isNaN(depth) && casingDepth > depth + 0.001) {
        err('casingDepth', 'A védőcső nem érhet a talp alá.');
      }
      if (!errors.some((e) => e.field === 'casingDia' || e.field === 'casingDepth') && casingDia != null && casingDepth != null) {
        casing = { diameter: casingDia, depth: casingDepth };
      }
    }

    const rawSections = Array.isArray(input.sections) ? input.sections.slice() : [];
    while (rawSections.length && isBlankSection(rawSections[rawSections.length - 1])) rawSections.pop();

    if (!rawSections.length) {
      err('sections', 'Adj meg legalább egy kútbeléscső-szakaszt.');
    } else if (rawSections.length > MAX_SECTIONS) {
      err('sections', `Egy oldalra legfeljebb ${MAX_SECTIONS} szakasz fér.`);
    }

    const built = [];
    let cursor = 0;
    rawSections.forEach((section, index) => {
      const type = section.type === 'szuro' ? 'szuro' : section.type === 'teli' ? 'teli' : '';
      const length = parseNum(section.length);
      const diameter = parseNum(section.diameter);
      if (!type) err(`section:${index}:type`, `${index + 1}. szakasz: válassz típust.`);
      if (length == null) err(`section:${index}:length`, `${index + 1}. szakasz: add meg a hosszt.`);
      else if (Number.isNaN(length) || length <= 0) {
        err(`section:${index}:length`, `${index + 1}. szakasz: a hossz legyen 0-nál nagyobb.`);
      }
      const sectionBottom = length != null && !Number.isNaN(length) && length > 0 ? cursor + length : null;
      const reducedHole = casing && bore != null && !Number.isNaN(bore) && casing.diameter > bore + 0.05;
      const entersLowerHole = sectionBottom == null || !reducedHole || sectionBottom > casing.depth + 0.001;
      if (diameter == null) err(`section:${index}:diameter`, `${index + 1}. szakasz: add meg az átmérőt.`);
      else if (Number.isNaN(diameter) || diameter <= 0) {
        err(`section:${index}:diameter`, `${index + 1}. szakasz: az átmérő legyen 0-nál nagyobb.`);
      } else if (entersLowerHole && bore != null && !Number.isNaN(bore) && diameter >= bore) {
        err(
          `section:${index}:diameter`,
          reducedHole
            ? `${index + 1}. szakasz: a védőcső alatt a fúrat ${fmtMm(bore)} mm, a béléscső ennél kisebb legyen.`
            : `${index + 1}. szakasz: a béléscső kisebb legyen a fúratnál (${fmtMm(bore)} mm).`
        );
      } else if (casing && diameter >= casing.diameter) {
        err(
          `section:${index}:diameter`,
          `${index + 1}. szakasz: a béléscső kisebb legyen a védőcsőnél (${fmtMm(casing.diameter)} mm), mert azon belül megy.`
        );
      }
      if (type && length != null && !Number.isNaN(length) && length > 0 && diameter != null && !Number.isNaN(diameter) && diameter > 0) {
        const top = cursor;
        cursor += length;
        built.push({ type, length, diameter, top, bottom: cursor, index });
      }
    });

    if (depth != null && !Number.isNaN(depth) && depth > 0 && built.length && cursor > depth + 0.001) {
      err('sections', `A szakaszok együtt ${fmtDepth(cursor)} m-t adnak, a talp csak ${fmtDepth(depth)} m.`);
    }

    if (errors.length || depth == null || bore == null || !built.length) {
      return { ok: false, errors, warnings, notes, model: null };
    }

    let openHole = null;
    const gap = depth - cursor;
    if (gap > 0.01) {
      openHole = { top: cursor, bottom: depth };
      notes.push(
        `A béléscső ${fmtDepth(cursor)} m-ig ér, alatta ${fmtDepth(gap)} m nyitott fúrat.`
      );
    } else if (built.length) {
      built[built.length - 1].bottom = depth;
    }

    const stepped = !!(casing && casing.diameter > bore + 0.05);
    const flush = !!(casing && Math.abs(casing.diameter - bore) <= 0.05);
    if (stepped) {
      notes.push(`A fúrat a védőcső alatt ${fmtMm(bore)} mm-re szűkül.`);
    }
    if (flush) {
      notes.push('A védőcső és a fúrat azonos átmérőjű, vastag külső vonal jelöli.');
    }
    if (gravel != null && !Number.isNaN(gravel)) {
      notes.push(`Kavicsozás ${fmtDepth(gravel)} m-től a talpig, a fúrat és a béléscső között.`);
    }

    for (let i = 1; i < built.length; i += 1) {
      if (built[i].diameter > built[i - 1].diameter + 0.05) {
        warnings.push(
          `${fmtDepth(built[i].top)} m-nél a béléscső ${fmtMm(built[i - 1].diameter)} mm-ről ${fmtMm(built[i].diameter)} mm-re nő. Lefelé általában csak szűkülő lépcsőben lehet leengedni.`
        );
      }
    }

    const filters = [];
    for (const section of built) {
      if (section.type !== 'szuro') continue;
      const prev = filters[filters.length - 1];
      if (prev && Math.abs(prev.bottom - section.top) < 0.011 && Math.abs(prev.diameter - section.diameter) < 0.05) {
        prev.bottom = section.bottom;
      } else {
        filters.push({ top: section.top, bottom: section.bottom, diameter: section.diameter });
      }
    }

    return {
      ok: true,
      errors,
      warnings,
      notes,
      model: {
        name: name || 'Kút',
        place,
        dateIso,
        dateLabel: fmtDate(dateIso),
        note,
        depth,
        boreMm: bore,
        groundMbf: ground,
        waterM: water,
        gravelTop: gravel != null && !Number.isNaN(gravel) ? gravel : null,
        stepped,
        flush,
        casing,
        sections: built,
        openHole,
        filters,
        warnings,
        notes,
      },
    };
  }

  function niceStep(range, targetTicks) {
    const rough = range / Math.max(1, targetTicks);
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
    const n = rough / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  function visualOuters(model) {
    const casing = model.casing;
    const stepped = !!model.stepped;
    const flush = !!model.flush;
    const upperBore = BORE_HALF - 0.15;
    const lowerBore = stepped ? (model.boreMm / casing.diameter) * (upperBore - 1.05) : upperBore;
    let caseOuter = null;
    if (casing) {
      if (stepped) caseOuter = upperBore - 1.05;
      else if (flush) caseOuter = upperBore;
      else caseOuter = (casing.diameter / model.boreMm) * upperBore;
    }
    const refDia = stepped ? casing.diameter : model.boreMm;
    const minLiner = 2.2;
    let linerOuters = model.sections.map((section) => {
      const raw = (section.diameter / refDia) * (stepped ? caseOuter : upperBore);
      const inWideHole = stepped && section.bottom <= casing.depth + 0.001;
      const packed = model.gravelTop != null && section.bottom > model.gravelTop + 0.001;
      const wallGap = packed ? 3.4 : inWideHole ? 1.25 : 0.8;
      const wall = inWideHole && caseOuter != null ? caseOuter : lowerBore;
      const limit = wall - wallGap;
      return Math.max(minLiner, Math.min(raw, Math.max(minLiner, limit)));
    });
    if (!stepped && !flush && caseOuter != null) {
      const maxLiner = Math.max(...linerOuters, 0);
      if (caseOuter < maxLiner + 1.35) caseOuter = Math.min(upperBore - 0.65, maxLiner + 1.35);
      if (caseOuter > upperBore - 0.55) {
        const scale = (upperBore - 1.7) / Math.max(caseOuter, 0.01);
        caseOuter *= scale;
        linerOuters = linerOuters.map((value) => Math.max(minLiner, value * scale));
      }
    } else if (!casing) {
      const maxLiner = Math.max(...linerOuters, 0);
      const limit = upperBore - 0.85;
      if (maxLiner > limit) {
        const scale = limit / maxLiner;
        linerOuters = linerOuters.map((value) => Math.max(minLiner, value * scale));
      }
    }
    return { linerOuters, caseOuter, upperBore, lowerBore, stepped, flush };
  }

  function buildCommands(model) {
    const cmds = [];
    const add = (cmd) => cmds.push(cmd);
    const rect = (x, y, w, h, fill, stroke, sw) => {
      if (!(w > 0) || !(h > 0)) return;
      add({ op: 'rect', x, y, w, h, fill: fill || null, stroke: stroke || null, sw: sw || 0.3 });
    };
    const line = (x1, y1, x2, y2, color, sw, dash) => {
      add({ op: 'line', x1, y1, x2, y2, color, sw: sw || 0.3, dash: dash || null });
    };
    const text = (x, y, value, size, color, anchor, bold) => {
      if (value == null || value === '') return;
      add({
        op: 'text',
        x,
        y,
        text: String(value),
        size,
        color,
        anchor: anchor || 'start',
        bold: !!bold,
      });
    };
    const circle = (cx, cy, r, fill) => add({ op: 'circle', cx, cy, r, fill });

    const drawH = TALP_Y - GROUND_Y;
    const yAt = (depth) => GROUND_Y + (depth / model.depth) * drawH;
    const mmPerM = drawH / model.depth;
    const { linerOuters, caseOuter, upperBore, lowerBore, stepped, flush } = visualOuters(model);
    const linerWall = 0.62;
    const caseWall = 1.25;
    const cellW = (FRAME_R - FRAME_L) / 3;

    rect(FRAME_L, FRAME_T, FRAME_R - FRAME_L, 11, '#f5f5f4', null, 0);
    text(FRAME_L + 4, FRAME_T + 5.5, 'KÚT VÉGLEGES TERVRAJZA', 12, INK, 'start', true);
    text(FRAME_R - 4, FRAME_T + 5.5, '1 / 1', 8, MUTED, 'end', false);
    line(FRAME_L, FRAME_T + 11, FRAME_R, FRAME_T + 11, INK, 0.35);

    const meta = [
      ['KÚT', model.name],
      ['HELYSZÍN', model.place || '—'],
      ['DÁTUM', model.dateLabel || '—'],
      ['TALPMÉLYSÉG', `${fmtDepth(model.depth)} m`],
      ['FÚRAT ÁTMÉRŐ', `Ø ${fmtMm(model.boreMm)} mm`],
      ['NYUGALMI VÍZSZINT', model.waterM == null ? '—' : `${fmtDepth(model.waterM)} m`],
    ];
    for (let i = 0; i < meta.length; i += 1) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = FRAME_L + col * cellW;
      const y = FRAME_T + 11 + row * 8.6;
      text(x + 3, y + 2.5, meta[i][0], 6.5, MUTED, 'start', false);
      text(x + 3, y + 6.1, fitText(meta[i][1], 9, cellW - 6, true), 9, INK, 'start', true);
      if (col > 0) line(x, FRAME_T + 11, x, FRAME_T + 11 + 17.2, RULE, 0.25);
    }
    line(FRAME_L, FRAME_T + 11 + 8.6, FRAME_R, FRAME_T + 11 + 8.6, RULE, 0.25);
    line(FRAME_L, 36.2, FRAME_R, 36.2, INK, 0.4);

    const shoeDepth = stepped ? model.casing.depth : model.depth;
    const yShoe = yAt(shoeDepth);
    rect(CENTER_X - upperBore, GROUND_Y, upperBore * 2, Math.max(0.2, yShoe - GROUND_Y), BORE_FILL, null, 0);
    if (stepped) {
      rect(CENTER_X - lowerBore, yShoe, lowerBore * 2, Math.max(0.2, TALP_Y - yShoe), BORE_FILL, null, 0);
    }

    const step = niceStep(model.depth, Math.max(5, Math.round(drawH / 16)));
    for (let depth = step; depth < model.depth - step * 0.25; depth += step) {
      const y = yAt(depth);
      const half = stepped && depth > model.casing.depth ? lowerBore : upperBore;
      line(CENTER_X - half, y, CENTER_X + half, y, GRID, 0.2);
    }

    if (caseOuter != null && !flush) {
      const y0 = yAt(0);
      const y1 = yAt(model.casing.depth);
      const inner = caseOuter - caseWall;
      rect(CENTER_X - inner, y0, inner * 2, y1 - y0, ANNULUS, null, 0);
    }

    if (model.gravelTop != null) {
      const gravelCuts = [model.gravelTop];
      model.sections.forEach((section) => {
        if (section.top > model.gravelTop && section.top < model.depth) gravelCuts.push(section.top);
        if (section.bottom > model.gravelTop && section.bottom < model.depth) gravelCuts.push(section.bottom);
      });
      if (model.casing && model.casing.depth > model.gravelTop && model.casing.depth < model.depth) {
        gravelCuts.push(model.casing.depth);
      }
      gravelCuts.push(model.depth);
      gravelCuts.sort((a, b) => a - b);
      for (let i = 0; i < gravelCuts.length - 1; i += 1) {
        const top = gravelCuts[i];
        const bottom = gravelCuts[i + 1];
        if (bottom - top < 0.02) continue;
        const mid = (top + bottom) / 2;
        const sectionIndex = model.sections.findIndex((section) => mid >= section.top - 0.001 && mid <= section.bottom + 0.001);
        if (sectionIndex < 0) continue;
        const innerHalf = linerOuters[sectionIndex];
        const insideCasing = model.casing && mid <= model.casing.depth + 0.001;
        const outerHalf = insideCasing
          ? (flush ? upperBore - 1.55 : caseOuter - caseWall - 0.35)
          : (stepped ? lowerBore : upperBore) - 0.25;
        if (outerHalf - innerHalf < 0.65) continue;
        const y0 = yAt(top);
        const y1 = yAt(bottom);
        const band = outerHalf - innerHalf;
        [-1, 1].forEach((side) => {
          const x = side < 0 ? CENTER_X - outerHalf : CENTER_X + innerHalf;
          rect(x, y0, band, Math.max(0.2, y1 - y0), '#e7e5e4', null, 0);
        });
        for (let y = y0 + 0.7; y < y1 - 0.25; y += 1.35) {
          [-1, 1].forEach((side) => {
            const xStart = side < 0 ? CENTER_X - outerHalf + 0.45 : CENTER_X + innerHalf + 0.45;
            const xEnd = side < 0 ? CENTER_X - innerHalf - 0.35 : CENTER_X + outerHalf - 0.35;
            let column = 0;
            for (let x = xStart; x < xEnd; x += 1.25) {
              circle(x, y + (column % 2) * 0.35, 0.38, '#57534e');
              column += 1;
            }
          });
        }
      }
    }

    model.sections.forEach((section, index) => {
      const outer = linerOuters[index];
      const inner = Math.max(0.8, outer - linerWall);
      const y0 = yAt(section.top);
      const y1 = yAt(section.bottom);
      const h = Math.max(0.15, y1 - y0);
      const fill = section.type === 'szuro' ? SCREEN_FILL : BLANK_FILL;
      const wall = section.type === 'szuro' ? SCREEN_LINE : BLANK_LINE;
      rect(CENTER_X - inner, y0, inner * 2, h, fill, null, 0);
      rect(CENTER_X - outer, y0, linerWall, h, wall, null, 0);
      rect(CENTER_X + outer - linerWall, y0, linerWall, h, wall, null, 0);
      if (section.type === 'szuro' && inner > 1.4 && h > 1.2) {
        const slotW = inner * 1.35;
        for (let y = y0 + 1.15; y < y0 + h - 0.5; y += 2.15) {
          line(CENTER_X - slotW / 2, y, CENTER_X + slotW / 2, y, SLOT, 0.32);
        }
      }
    });

    for (let i = 0; i < model.sections.length; i += 1) {
      const section = model.sections[i];
      const y = yAt(section.bottom);
      const outer = linerOuters[i];
      const next = model.sections[i + 1];
      if (next) {
        const outer2 = linerOuters[i + 1];
        if (Math.abs(outer - outer2) > 0.12) {
          line(CENTER_X - outer, y, CENTER_X - outer2, y, BLANK_LINE, 0.45);
          line(CENTER_X + outer, y, CENTER_X + outer2, y, BLANK_LINE, 0.45);
        }
        line(CENTER_X - outer - 0.7, y, CENTER_X - outer + 0.15, y, INK, 0.35);
        line(CENTER_X + outer - 0.15, y, CENTER_X + outer + 0.7, y, INK, 0.35);
      } else {
        line(CENTER_X - outer, y, CENTER_X + outer, y, BLANK_LINE, 0.55);
      }
    }

    if (caseOuter != null) {
      const y0 = yAt(0);
      const y1 = yAt(model.casing.depth);
      const shoe = Math.min(1.7, Math.max(0.4, y1 - y0));
      if (flush) {
        const thick = 2.2;
        line(CENTER_X - upperBore, y0, CENTER_X - upperBore, y1, CASING, thick);
        line(CENTER_X + upperBore, y0, CENTER_X + upperBore, y1, CASING, thick);
        rect(CENTER_X - upperBore - thick / 2, y1 - shoe, thick, shoe, '#27272a', null, 0);
        rect(CENTER_X + upperBore - thick / 2, y1 - shoe, thick, shoe, '#27272a', null, 0);
      } else {
        rect(CENTER_X - caseOuter, y0, caseWall, y1 - y0, CASING, null, 0);
        rect(CENTER_X + caseOuter - caseWall, y0, caseWall, y1 - y0, CASING, null, 0);
        rect(CENTER_X - caseOuter - 0.25, y1 - shoe, caseWall + 0.5, shoe, '#27272a', null, 0);
        rect(CENTER_X + caseOuter - caseWall - 0.25, y1 - shoe, caseWall + 0.5, shoe, '#27272a', null, 0);
      }
    }

    if (flush) {
      const yCase = yAt(model.casing.depth);
      if (model.casing.depth < model.depth - 0.01) {
        line(CENTER_X - upperBore, yCase, CENTER_X - upperBore, TALP_Y, BORE_LINE, 0.55);
        line(CENTER_X + upperBore, yCase, CENTER_X + upperBore, TALP_Y, BORE_LINE, 0.55);
      }
    } else {
      line(CENTER_X - upperBore, GROUND_Y, CENTER_X - upperBore, yShoe, BORE_LINE, 0.55);
      line(CENTER_X + upperBore, GROUND_Y, CENTER_X + upperBore, yShoe, BORE_LINE, 0.55);
      if (stepped) {
        line(CENTER_X - upperBore, yShoe, CENTER_X - lowerBore, yShoe, BORE_LINE, 0.7);
        line(CENTER_X + lowerBore, yShoe, CENTER_X + upperBore, yShoe, BORE_LINE, 0.7);
        line(CENTER_X - lowerBore, yShoe, CENTER_X - lowerBore, TALP_Y, BORE_LINE, 0.55);
        line(CENTER_X + lowerBore, yShoe, CENTER_X + lowerBore, TALP_Y, BORE_LINE, 0.55);
      }
    }
    const bottomHalf = stepped ? lowerBore : upperBore;
    line(CENTER_X - bottomHalf, TALP_Y, CENTER_X + bottomHalf, TALP_Y, BORE_LINE, 0.7);

    const hatchX = CENTER_X - upperBore - 8;
    const hatchW = (upperBore + 8) * 2;
    const hatchY = GROUND_Y - 3.6;
    const hatchH = 3.6;
    for (let d = -hatchH; d < hatchW; d += 1.7) {
      const clipped = clipLine(
        hatchX + d,
        hatchY + hatchH,
        hatchX + d + hatchH,
        hatchY,
        hatchX,
        hatchY,
        hatchX + hatchW,
        hatchY + hatchH
      );
      if (clipped) line(clipped.x1, clipped.y1, clipped.x2, clipped.y2, '#a16207', 0.22);
    }
    line(hatchX, GROUND_Y, hatchX + hatchW, GROUND_Y, '#44403c', 0.8);
    text(CENTER_X, GROUND_Y - 5.2, 'Talajszint', 8, INK, 'middle', true);
    if (model.groundMbf != null) {
      text(CENTER_X, GROUND_Y - 8.4, `${fmtDepth(model.groundMbf)} mBf`, 7, MUTED, 'middle', false);
    }

    if (model.waterM != null) {
      const wy = yAt(model.waterM);
      let half = 4;
      const host = model.sections.find((section, index) => {
        const hit = model.waterM >= section.top - 0.001 && model.waterM <= section.bottom + 0.001;
        if (hit) half = Math.max(1.2, linerOuters[index] - linerWall - 0.3);
        return hit;
      });
      if (!host && model.openHole && model.waterM >= model.openHole.top - 0.001) half = 4.2;
      line(CENTER_X - half, wy, CENTER_X + half, wy, WATER, 0.6);
      circle(CENTER_X - upperBore - 2.3, wy, 1.05, WATER);
      text(CENTER_X - upperBore - 2.3, wy - 2.5, 'NV', 6.5, WATER, 'middle', true);
    }

    line(CENTER_X, GROUND_Y, CENTER_X, TALP_Y, '#94a3b8', 0.18, [1.1, 0.7]);

    const ticks = [{ depth: 0, priority: 3, kind: 'major' }];
    for (let depth = step; depth < model.depth - step * 0.3; depth += step) {
      ticks.push({ depth: round3(depth), priority: 0, kind: 'major' });
    }
    ticks.push({ depth: model.depth, priority: 3, kind: 'major' });
    model.sections.forEach((section) => {
      if (section.top > 0.005) ticks.push({ depth: section.top, priority: 1, kind: 'bound' });
    });
    if (model.openHole) ticks.push({ depth: model.openHole.top, priority: 1, kind: 'bound' });
    if (model.casing && model.casing.depth < model.depth - 0.01) {
      ticks.push({ depth: model.casing.depth, priority: 2, kind: 'bound' });
    }
    if (model.gravelTop != null) ticks.push({ depth: model.gravelTop, priority: 1, kind: 'bound' });
    if (model.waterM != null) ticks.push({ depth: model.waterM, priority: 2, kind: 'water' });
    ticks.sort((a, b) => a.depth - b.depth || b.priority - a.priority);
    const placedTicks = [];
    for (const tick of ticks) {
      const clash = placedTicks.find((item) => Math.abs(yAt(item.depth) - yAt(tick.depth)) < 3.3);
      if (!clash) placedTicks.push(tick);
      else if (tick.priority > clash.priority) placedTicks[placedTicks.indexOf(clash)] = tick;
    }
    line(AXIS_X, GROUND_Y, AXIS_X, TALP_Y, INK, 0.35);
    placedTicks
      .sort((a, b) => a.depth - b.depth)
      .forEach((tick) => {
        const y = yAt(tick.depth);
        const len = tick.kind === 'bound' ? 1.35 : 2.25;
        const color = tick.kind === 'water' ? WATER : INK;
        line(AXIS_X - len, y, AXIS_X, y, color, 0.3);
        text(AXIS_X - len - 0.7, y, fmtDepth(tick.depth), 7.5, color, 'end', tick.kind === 'water');
      });

    const callouts = [];
    if (model.casing) {
      callouts.push({
        anchorY: (yAt(0) + yAt(model.casing.depth)) / 2,
        lines: ['Acél védőcső', `Ø ${fmtMm(model.casing.diameter)} mm`],
        color: CASING,
      });
    }
    model.sections.forEach((section) => {
      callouts.push({
        anchorY: (yAt(section.top) + yAt(section.bottom)) / 2,
        lines: [section.type === 'szuro' ? 'Szűrő · vízadó' : 'Teli cső', `Ø ${fmtMm(section.diameter)} mm`],
        color: section.type === 'szuro' ? SCREEN_LINE : INK,
      });
    });
    if (model.openHole) {
      callouts.push({
        anchorY: (yAt(model.openHole.top) + yAt(model.openHole.bottom)) / 2,
        lines: ['Nyitott fúrat'],
        color: MUTED,
      });
    }
    if (stepped) {
      callouts.push({
        anchorY: (yAt(model.casing.depth) + yAt(model.depth)) / 2,
        lines: ['Fúrat szűkül', `Ø ${fmtMm(model.boreMm)} mm`],
        color: BORE_LINE,
      });
    }
    if (model.gravelTop != null) {
      callouts.push({
        anchorY: (yAt(model.gravelTop) + yAt(model.depth)) / 2,
        lines: ['Kavics', `${fmtDepth(model.gravelTop)} m-től a talpig`],
        color: '#57534e',
      });
    }
    const calloutWidth = SPLIT_X - CALLOUT_X - 2.5;
    callouts.forEach((item) => {
      item.h = item.lines.length > 1 ? 7.1 : 3.8;
      item.y = item.anchorY;
    });
    const calloutNeed = callouts.reduce((sum, item) => sum + item.h, 0) + Math.max(0, callouts.length - 1) * 0.7;
    if (calloutNeed > TALP_Y - GROUND_Y) {
      callouts.forEach((item) => {
        item.lines = [fitText(item.lines.join(' · '), 7.5, calloutWidth, false)];
        item.h = 3.6;
      });
    } else {
      callouts.forEach((item) => {
        item.lines = item.lines.map((lineText) => fitText(lineText, 8, calloutWidth, false));
      });
    }
    callouts.sort((a, b) => a.anchorY - b.anchorY);
    let calloutCursor = GROUND_Y + 1;
    callouts.forEach((item) => {
      let top = item.anchorY - item.h / 2;
      if (top < calloutCursor) top = calloutCursor;
      item.y = top + item.h / 2;
      calloutCursor = top + item.h + 0.7;
    });
    const calloutOverflow = calloutCursor - 0.7 - TALP_Y;
    if (calloutOverflow > 0) callouts.forEach((item) => { item.y -= calloutOverflow; });
    callouts.forEach((item) => {
      line(CENTER_X + upperBore + 0.5, item.anchorY, CALLOUT_X - 1.3, item.y, LEADER, 0.25);
      const lineH = ptToMm(8) * 1.22;
      let ty = item.y - (item.lines.length * lineH) / 2 + lineH / 2;
      item.lines.forEach((lineText, index) => {
        text(CALLOUT_X, ty, lineText, 8, item.color, 'start', index === 0);
        ty += lineH;
      });
    });

    line(SPLIT_X, 38, SPLIT_X, FOOT_Y - 1, RULE, 0.35);

    let ty = 40;
    const legend = [
      [BORE_FILL, BORE_LINE, 'Fúrat'],
      [CASING, CASING, 'Védőcső'],
      [BLANK_FILL, BLANK_LINE, 'Teli'],
      [SCREEN_FILL, SCREEN_LINE, 'Szűrő'],
    ];
    if (model.gravelTop != null) legend.push(['#e7e5e4', '#78716c', 'Kavics']);
    const legendW = (FRAME_R - TABLE_X - 4) / legend.length;
    legend.forEach((item, index) => {
      const x = TABLE_X + 2 + index * legendW;
      rect(x, ty, 3.2, 3.2, item[0], item[1], 0.3);
      text(x + 4.2, ty + 1.6, item[2], 7, INK, 'start', false);
    });
    ty += 8;

    const metaRows = 2 + (model.stepped ? 1 : 0) + (model.gravelTop != null ? 1 : 0) + (model.groundMbf != null ? 1 : 0) + (model.waterM != null ? 1 : 0);
    const casingRows = model.casing ? 2 : 1;
    const filterRows = Math.max(1, model.filters.length);
    const bodyRows = metaRows + casingRows + 1 + model.sections.length + filterRows;
    const headings = 4;
    const available = FOOT_Y - 2 - ty - headings * 6.2 - 6;
    const pitch = Math.max(3.15, Math.min(4.7, available / Math.max(1, bodyRows)));

    const kv = (label, value, bg) => {
      if (ty > FOOT_Y - 4) return;
      if (bg) rect(TABLE_X + 1.2, ty, FRAME_R - TABLE_X - 3.4, pitch, bg, null, 0);
      text(TABLE_X + 2.2, ty + pitch / 2, label, pitch < 3.6 ? 7 : 8, MUTED, 'start', false);
      text(FRAME_R - 3, ty + pitch / 2, value, pitch < 3.6 ? 7 : 8, INK, 'end', true);
      ty += pitch;
    };
    const heading = (label) => {
      text(TABLE_X + 2.2, ty + 2.6, label, 8.5, INK, 'start', true);
      line(TABLE_X + 2.2, ty + 4.6, FRAME_R - 3, ty + 4.6, INK, 0.3);
      ty += 6.2;
    };

    heading('Kiképzés');
    kv('Talpmélység', `${fmtDepth(model.depth)} m`);
    kv(model.stepped ? 'Fúrat a védőcső alatt' : 'Fúrat Ø', `${fmtMm(model.boreMm)} mm`);
    if (model.stepped) kv('Fúrat a saruig', `Ø ${fmtMm(model.casing.diameter)} mm`);
    if (model.gravelTop != null) kv('Kavicsozás', `${fmtDepth(model.gravelTop)} m – talp`);
    if (model.groundMbf != null) kv('Terepszint', `${fmtDepth(model.groundMbf)} mBf`);
    if (model.waterM != null) kv('Nyugalmi vízszint', `${fmtDepth(model.waterM)} m`);
    ty += 1.6;

    heading('Acél védőcső');
    if (!model.casing) kv('Beépítés', 'nincs');
    else {
      kv('Átmérő', `${fmtMm(model.casing.diameter)} mm`);
      kv('Lehelyezés', `0,00–${fmtDepth(model.casing.depth)} m`);
    }
    ty += 1.6;

    heading('Kútbeléscső');
    text(TABLE_X + 2.2, ty + pitch / 2, '#', 6.5, MUTED, 'start', false);
    text(TABLE_X + 7, ty + pitch / 2, 'tető–talp m', 6.5, MUTED, 'start', false);
    text(TABLE_X + 36, ty + pitch / 2, 'hossz', 6.5, MUTED, 'start', false);
    text(TABLE_X + 48, ty + pitch / 2, 'típus', 6.5, MUTED, 'start', false);
    text(FRAME_R - 3, ty + pitch / 2, 'Ø mm', 6.5, MUTED, 'end', false);
    ty += pitch;

    model.sections.forEach((section, index) => {
      if (ty > FOOT_Y - 4) return;
      const bg = section.type === 'szuro' ? '#f0f9ff' : index % 2 === 1 ? '#fafaf9' : null;
      if (bg) rect(TABLE_X + 1.2, ty, FRAME_R - TABLE_X - 3.4, pitch, bg, null, 0);
      const size = pitch < 3.6 ? 6.5 : 7.5;
      const mid = ty + pitch / 2;
      text(TABLE_X + 2.2, mid, String(index + 1), size, MUTED, 'start', false);
      text(TABLE_X + 7, mid, `${fmtDepth(section.top)}–${fmtDepth(section.bottom)}`, size, INK, 'start', false);
      text(TABLE_X + 36, mid, fmtDepth(section.length), size, INK, 'start', false);
      text(TABLE_X + 48, mid, section.type === 'szuro' ? 'Szűrő' : 'Teli', size, section.type === 'szuro' ? SCREEN_LINE : INK, 'start', section.type === 'szuro');
      text(FRAME_R - 3, mid, fmtMm(section.diameter), size, INK, 'end', true);
      ty += pitch;
    });
    ty += 1.6;

    heading('Szűrő a vízadónál');
    if (!model.filters.length) kv('Szakasz', 'nincs');
    model.filters.forEach((filter) => {
      kv('Intervallum', `${fmtDepth(filter.top)}–${fmtDepth(filter.bottom)} m`, '#f0f9ff');
    });

    line(FRAME_L, FOOT_Y, FRAME_R, FOOT_Y, INK, 0.35);
    const scaleDenom = Math.max(1, Math.round(1000 / mmPerM));
    const footBits = [
      `Függőleges méretarány 1 : ${fmtNum(scaleDenom, 0)}. Vízszintesen a rajz szemléltető, nem méretarányos.`,
      'Mélység méterben a talajszinttől, átmérő milliméterben. A védőcső alatt a fúrat a megadott átmérő; felette a védőcsőig tágulhat.',
    ];
    model.notes.forEach((item) => footBits.push(item));
    model.warnings.forEach((item) => footBits.push(item));
    if (model.note) footBits.push(model.note);
    const footWidth = FRAME_R - FRAME_L - 8;
    const wrapped = [];
    footBits.forEach((bit, index) => {
      wrapText(bit, 7.2, footWidth, false).forEach((lineText) => {
        wrapped.push({ text: lineText, warn: index >= 2 + model.notes.length && index < 2 + model.notes.length + model.warnings.length });
      });
    });
    let fy = FOOT_Y + 3.3;
    wrapped.slice(0, 5).forEach((item) => {
      if (fy > FRAME_B - 2.4) return;
      text(FRAME_L + 4, fy, item.text, 7.2, item.warn ? WARN : MUTED, 'start', false);
      fy += 3.5;
    });

    rect(FRAME_L, FRAME_T, FRAME_R - FRAME_L, FRAME_B - FRAME_T, null, INK, 0.6);
    return cmds;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function renderSvg(commands) {
    const parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" role="img">',
      '<title>Kút végleges tervrajza</title>',
      '<rect width="210" height="297" fill="#ffffff"/>',
    ];
    const n = (value) => Math.round(value * 100) / 100;
    commands.forEach((cmd) => {
      if (cmd.op === 'rect') {
        const attrs = [`x="${n(cmd.x)}"`, `y="${n(cmd.y)}"`, `width="${n(cmd.w)}"`, `height="${n(cmd.h)}"`];
        attrs.push(cmd.fill ? `fill="${cmd.fill}"` : 'fill="none"');
        if (cmd.stroke) attrs.push(`stroke="${cmd.stroke}"`, `stroke-width="${n(cmd.sw || 0.3)}"`);
        parts.push(`<rect ${attrs.join(' ')}/>`);
      } else if (cmd.op === 'line') {
        const dash = cmd.dash ? ` stroke-dasharray="${cmd.dash.map(n).join(' ')}"` : '';
        parts.push(
          `<line x1="${n(cmd.x1)}" y1="${n(cmd.y1)}" x2="${n(cmd.x2)}" y2="${n(cmd.y2)}" stroke="${cmd.color}" stroke-width="${n(cmd.sw || 0.3)}"${dash}/>`
        );
      } else if (cmd.op === 'circle') {
        parts.push(`<circle cx="${n(cmd.cx)}" cy="${n(cmd.cy)}" r="${n(cmd.r)}" fill="${cmd.fill}"/>`);
      } else if (cmd.op === 'text') {
        const size = n(ptToMm(cmd.size));
        const y = n(cmd.y + size * 0.32);
        const weight = cmd.bold ? ' font-weight="700"' : '';
        parts.push(
          `<text x="${n(cmd.x)}" y="${y}" font-size="${size}" fill="${cmd.color}" text-anchor="${cmd.anchor || 'start'}" dominant-baseline="alphabetic"${weight}>${esc(cmd.text)}</text>`
        );
      }
    });
    parts.push('</svg>');
    return parts.join('');
  }

  function placeholderSvg(lines) {
    const body = lines.map((line, index) => (
      `<text x="105" y="${118 + index * 7}" text-anchor="middle" font-size="3.6" fill="#44403c">${esc(line)}</text>`
    )).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" role="img"><rect width="210" height="297" fill="#ffffff"/><rect x="8" y="8" width="194" height="281" fill="none" stroke="#1c1917" stroke-width="0.6"/><text x="105" y="28" text-anchor="middle" font-size="4.2" font-weight="700" fill="#1c1917">KÚT VÉGLEGES TERVRAJZA</text>${body}</svg>`;
  }

  function fileNameFor(model) {
    const raw = (model && model.name ? model.name : 'kut').trim() || 'kut';
    const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').slice(0, 80);
    return `kut-vegleges-tervrajz-${safe || 'kut'}.pdf`;
  }

  function planText(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function toPlan(state) {
    const source = state || {};
    const sections = Array.isArray(source.sections) ? source.sections : [];
    return {
      format: 'vizkut-tervrajz',
      version: 1,
      name: planText(source.name).slice(0, 80),
      place: planText(source.place).slice(0, 80),
      date: planText(source.date),
      ground: planText(source.ground),
      water: planText(source.water),
      note: planText(source.note).slice(0, 180),
      depth: planText(source.depth),
      bore: planText(source.bore),
      casingOn: !!source.casingOn,
      casingDia: planText(source.casingDia),
      casingDepth: planText(source.casingDepth),
      gravelTop: planText(source.gravelTop),
      sections: sections.map((section) => ({
        type: section && section.type === 'szuro' ? 'szuro' : 'teli',
        length: planText(section && section.length),
        diameter: planText(section && section.diameter),
      })),
    };
  }

  function planFileName(plan) {
    const raw = (plan && plan.name ? plan.name : 'kut').trim() || 'kut';
    const safe = raw.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').replace(/\s+/g, ' ').slice(0, 80);
    return `kut-terv-${safe || 'kut'}.json`;
  }

  function fromPlan(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('A fájl nem egy kútterv.');
    }
    if (data.format && data.format !== 'vizkut-tervrajz') {
      throw new Error('Ez a fájl nem kútterv.');
    }
    if (data.version != null && Number(data.version) !== 1) {
      throw new Error('Ezt a tervfájlt ez a program nem ismeri.');
    }
    if (!Array.isArray(data.sections)) {
      throw new Error('A tervből hiányoznak a béléscső-szakaszok.');
    }
    if (data.sections.length > 40) {
      throw new Error('A tervben túl sok szakasz van.');
    }
    const sections = data.sections.map((section) => {
      const rawType = planText(section && section.type).toLowerCase();
      const type = rawType === 'szuro' || rawType === 'szűrő' || rawType === 'szűrőcső' || rawType === 'szurocso'
        ? 'szuro'
        : 'teli';
      return {
        type,
        length: planText(section && section.length),
        diameter: planText(section && section.diameter),
      };
    });
    if (!sections.length) sections.push({ type: 'teli', length: '', diameter: '' });
    const date = planText(data.date);
    return {
      name: planText(data.name).slice(0, 80),
      place: planText(data.place).slice(0, 80),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
      ground: planText(data.ground),
      water: planText(data.water),
      note: planText(data.note).slice(0, 180),
      depth: planText(data.depth),
      bore: planText(data.bore),
      casingOn: data.casingOn === true || data.casingOn === 'true' || data.casingOn === 1,
      casingDia: planText(data.casingDia),
      casingDepth: planText(data.casingDepth),
      gravelTop: planText(data.gravelTop),
      sections,
      pristineSample: false,
    };
  }

  async function renderPdf(commands, opts) {
    const { PDFDocument, rgb } = opts.PDFLib;
    const doc = await PDFDocument.create();
    if (opts.fontkit) doc.registerFontkit(opts.fontkit);
    doc.setTitle('Kút végleges tervrajza');
    doc.setSubject('Egyoldalas kút végleges tervrajz');
    doc.setCreator('Vízkút tervrajz');
    const pageW = (210 * 72) / 25.4;
    const pageH = (297 * 72) / 25.4;
    const page = doc.addPage([pageW, pageH]);
    const regular = await doc.embedFont(opts.regular, { subset: true });
    const bold = await doc.embedFont(opts.bold, { subset: true });
    const MM = 72 / 25.4;
    const X = (mm) => mm * MM;
    const Y = (mmFromTop) => pageH - mmFromTop * MM;
    const color = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    };

    commands.forEach((cmd) => {
      if (cmd.op === 'rect') {
        const x = X(cmd.x);
        const y = Y(cmd.y + cmd.h);
        const w = cmd.w * MM;
        const h = cmd.h * MM;
        if (cmd.fill) page.drawRectangle({ x, y, width: w, height: h, color: color(cmd.fill) });
        if (cmd.stroke) {
          const sw = (cmd.sw || 0.3) * MM;
          const stroke = color(cmd.stroke);
          page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: sw, color: stroke });
          page.drawLine({ start: { x, y: y + h }, end: { x: x + w, y: y + h }, thickness: sw, color: stroke });
          page.drawLine({ start: { x, y }, end: { x, y: y + h }, thickness: sw, color: stroke });
          page.drawLine({ start: { x: x + w, y }, end: { x: x + w, y: y + h }, thickness: sw, color: stroke });
        }
      } else if (cmd.op === 'line') {
        page.drawLine({
          start: { x: X(cmd.x1), y: Y(cmd.y1) },
          end: { x: X(cmd.x2), y: Y(cmd.y2) },
          thickness: (cmd.sw || 0.3) * MM,
          color: color(cmd.color),
          dashArray: cmd.dash ? cmd.dash.map((d) => d * MM) : undefined,
        });
      } else if (cmd.op === 'circle') {
        page.drawCircle({
          x: X(cmd.cx),
          y: Y(cmd.cy),
          size: cmd.r * MM,
          color: color(cmd.fill),
        });
      } else if (cmd.op === 'text') {
        const font = cmd.bold ? bold : regular;
        const width = font.widthOfTextAtSize(cmd.text, cmd.size);
        let x = X(cmd.x);
        if (cmd.anchor === 'middle') x -= width / 2;
        else if (cmd.anchor === 'end') x -= width;
        const baselineFromTop = cmd.y + ptToMm(cmd.size) * 0.32;
        page.drawText(cmd.text, {
          x,
          y: Y(baselineFromTop),
          size: cmd.size,
          font,
          color: color(cmd.color),
        });
      }
    });

    return doc.save();
  }

  return {
    parseNum,
    prepare,
    buildCommands,
    renderSvg,
    renderPdf,
    placeholderSvg,
    fileNameFor,
    toPlan,
    fromPlan,
    planFileName,
    fmtDepth,
    fmtMm,
  };
});
