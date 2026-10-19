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

  const INK = '#000000';
  const MUTED = '#000000';
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
  const CEMENT = '#b4b4ae';
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
    if (gravel != null && Number.isNaN(gravel)) err('gravelTop', 'A kavics teteje legyen szám.');
    else if (gravel != null && gravel < 0) err('gravelTop', 'A kavics teteje ne legyen negatív.');
    else if (gravel != null && depth != null && !Number.isNaN(depth) && depth > 0 && gravel >= depth) {
      err('gravelTop', 'A kavics a talp fölé érjen fel, mert a talptól felfelé töltik.');
    }

    let cement = null;
    if (input.cementOn) {
      const cementDepth = parseNum(input.cementDepth);
      if (cementDepth == null) err('cementDepth', 'Add meg, milyen mélységig van cementezve a gyűrűstér.');
      else if (Number.isNaN(cementDepth) || cementDepth <= 0) err('cementDepth', 'A cementezés mélysége legyen 0-nál nagyobb.');
      else if (depth != null && !Number.isNaN(depth) && depth > 0 && cementDepth > depth + 0.001) {
        err('cementDepth', 'A cementezés nem érhet a talp alá.');
      } else if (!Number.isNaN(cementDepth)) cement = cementDepth;
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
        const material = input.casingMaterial === 'muanyag' ? 'muanyag' : 'acel';
        casing = { diameter: casingDia, depth: casingDepth, material };
      }
    }

    let casing2 = null;
    if (casing && input.casing2On) {
      const casingDia = parseNum(input.casing2Dia);
      const casingDepth = parseNum(input.casing2Depth);
      if (casingDia == null) err('casing2Dia', 'Add meg a másodlagos védőcső átmérőjét.');
      else if (Number.isNaN(casingDia) || casingDia <= 0) err('casing2Dia', 'A másodlagos védőcső átmérője legyen 0-nál nagyobb.');
      else if (casingDia > 2000) err('casing2Dia', 'A másodlagos védőcső átmérője legfeljebb 2000 mm lehet.');
      if (casingDepth == null) err('casing2Depth', 'Add meg, milyen mélyre van lehelyezve a másodlagos védőcső.');
      else if (Number.isNaN(casingDepth) || casingDepth <= 0) {
        err('casing2Depth', 'A másodlagos védőcső lehelyezési mélysége legyen 0-nál nagyobb.');
      } else if (depth != null && !Number.isNaN(depth) && casingDepth > depth + 0.001) {
        err('casing2Depth', 'A másodlagos védőcső nem érhet a talp alá.');
      }
      if (!errors.some((e) => e.field === 'casing2Dia' || e.field === 'casing2Depth') && casingDia != null && casingDepth != null) {
        const material = input.casing2Material === 'muanyag' ? 'muanyag' : 'acel';
        casing2 = { diameter: casingDia, depth: casingDepth, material };
      }
    }
    if (casing && casing2) {
      if (Math.abs(casing.diameter - casing2.diameter) <= 0.05) {
        err('casing2Dia', 'A két védőcső átmérője nem lehet ugyanakkora, mert egymásba kerülnek.');
      } else {
        const widerIsPrimary = casing.diameter > casing2.diameter;
        const wider = widerIsPrimary ? casing : casing2;
        const narrower = widerIsPrimary ? casing2 : casing;
        if (wider.depth > narrower.depth + 0.001) {
          err(
            widerIsPrimary ? 'casingDepth' : 'casing2Depth',
            'A tágabb védőcső nem érhet mélyebbre a szűkebbnél, mert azon a lyukon nem fér le.'
          );
        }
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
      const wideners = [casing, casing2].filter((pipe) => pipe && bore != null && !Number.isNaN(bore) && pipe.diameter > bore + 0.05);
      const reducedHole = wideners.length > 0;
      const shoeForHole = wideners.reduce((max, pipe) => Math.max(max, pipe.depth), 0);
      const entersLowerHole = sectionBottom == null || !reducedHole || sectionBottom > shoeForHole + 0.001;
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
      } else if (casing2 && diameter >= casing2.diameter) {
        err(
          `section:${index}:diameter`,
          `${index + 1}. szakasz: a béléscső kisebb legyen a másodlagos védőcsőnél (${fmtMm(casing2.diameter)} mm), mert azon belül megy.`
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
    if (stepped && !casing2) {
      notes.push(`A fúrat a védőcső alatt ${fmtMm(bore)} mm-re szűkül.`);
    }
    if (flush && !casing2) {
      notes.push('A védőcső és a fúrat azonos átmérőjű, vastag külső vonal jelöli.');
    }
    if (casing2) {
      const secondName = casing2.material === 'muanyag' ? 'műanyag' : 'acél';
      notes.push(`Másodlagos ${secondName} védőcső Ø ${fmtMm(casing2.diameter)} mm, a talajszinttől ${fmtDepth(casing2.depth)} m-ig.`);
      if ([casing, casing2].some((pipe) => pipe.diameter > bore + 0.05)) {
        notes.push(`A fúrat a védőcsövek alatt ${fmtMm(bore)} mm-re szűkül.`);
      }
    }
    const gravelShown = gravel != null && !Number.isNaN(gravel)
      ? (cement != null ? Math.max(gravel, cement) : gravel)
      : null;
    if (gravel != null && !Number.isNaN(gravel)) {
      notes.push(`Kavics a gyűrűstérben ${fmtDepth(gravel)} m-től a talpig.`);
    }
    if (cement != null) {
      notes.push(`Cementezés a felszíntől ${fmtDepth(cement)} m-ig.`);
    }
    if (gravel != null && !Number.isNaN(gravel) && cement != null && cement > gravel + 0.001) {
      notes.push(`Ahol fedik egymást, a cement takarja a kavicsot ${fmtDepth(gravel)}–${fmtDepth(Math.min(cement, depth))} m között.`);
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
        gravelShown: gravelShown != null && gravelShown < depth - 0.02 ? gravelShown : null,
        cementDepth: cement,
        stepped,
        flush,
        casing,
        casing2,
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
      const inGravel = model.gravelShown != null && section.bottom > model.gravelShown + 0.001;
      const inCement = model.cementDepth != null && section.top < model.cementDepth - 0.001;
      const packed = inGravel || inCement;
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

  function casingPaint(material) {
    const plastic = material === 'muanyag';
    return {
      plastic,
      color: plastic ? '#1d4ed8' : CASING,
      shoe: plastic ? '#1e3a8a' : '#27272a',
      name: plastic ? 'Műanyag védőcső' : 'Acél védőcső',
    };
  }

  function secondLayout(model) {
    const casings = [model.casing, model.casing2];
    const upperBore = BORE_HALF - 0.15;
    const bore = model.boreMm;
    const depth = model.depth;
    const cuts = [0, depth];
    casings.forEach((pipe) => {
      if (pipe.depth > 0.02 && pipe.depth < depth - 0.02) cuts.push(pipe.depth);
    });
    cuts.sort((a, b) => a - b);
    const points = [];
    cuts.forEach((value) => {
      if (!points.length || value - points[points.length - 1] > 0.02) points.push(value);
    });
    const segments = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i];
      const to = points[i + 1];
      let diameter = bore;
      casings.forEach((pipe) => {
        if (pipe.depth + 0.001 >= to && pipe.diameter > diameter) diameter = pipe.diameter;
      });
      segments.push({ from, to, diameter });
    }
    const maxDia = Math.max(...segments.map((segment) => segment.diameter));
    segments.forEach((segment) => {
      segment.half = (segment.diameter / maxDia) * upperBore;
    });
    const ordered = casings.slice().sort((a, b) => b.diameter - a.diameter);
    let limit = null;
    const visuals = ordered.map((pipe) => {
      const paint = casingPaint(pipe.material);
      let outer;
      if (Math.abs(pipe.diameter - bore) <= 0.05) outer = (bore / maxDia) * upperBore;
      else if (Math.abs(pipe.diameter - maxDia) <= 0.05) outer = upperBore - 1.05;
      else outer = (pipe.diameter / maxDia) * upperBore - 0.35;
      if (limit != null) outer = Math.min(outer, limit - 1.5);
      outer = Math.max(3.4, outer);
      limit = Math.abs(pipe.diameter - bore) <= 0.05 ? outer - 2.3 : outer - 1.25;
      return {
        casing: pipe,
        outer,
        secondary: pipe === model.casing2,
        ...paint,
        name: pipe === model.casing2 ? `Másodlagos ${paint.name.toLowerCase()}` : paint.name,
      };
    });
    return { segments, visuals, upperBore };
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
    const layout = model.casing2 ? secondLayout(model) : null;
    let { linerOuters, caseOuter, upperBore, lowerBore, stepped, flush } = visualOuters(model);
    if (layout) {
      linerOuters = linerOuters.map((value, index) => {
        const section = model.sections[index];
        const covering = layout.visuals.filter((item) => section.top < item.casing.depth - 0.001);
        if (!covering.length) return value;
        const innerMost = covering.reduce((a, b) => (a.casing.diameter <= b.casing.diameter ? a : b));
        const cap = innerMost.outer - 1.25 - 0.9;
        return Math.max(2.2, Math.min(value, cap));
      });
    }
    const plastic = !!(model.casing && model.casing.material === 'muanyag');
    const casingColor = plastic ? '#1d4ed8' : CASING;
    const casingShoe = plastic ? '#1e3a8a' : '#27272a';
    const casingName = plastic ? 'Műanyag védőcső' : 'Acél védőcső';
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
    if (layout) {
      layout.segments.forEach((segment) => {
        const y0 = yAt(segment.from);
        const y1 = yAt(segment.to);
        rect(CENTER_X - segment.half, y0, segment.half * 2, Math.max(0.2, y1 - y0), BORE_FILL, null, 0);
      });
    } else {
      rect(CENTER_X - upperBore, GROUND_Y, upperBore * 2, Math.max(0.2, yShoe - GROUND_Y), BORE_FILL, null, 0);
      if (stepped) {
        rect(CENTER_X - lowerBore, yShoe, lowerBore * 2, Math.max(0.2, TALP_Y - yShoe), BORE_FILL, null, 0);
      }
    }

    const step = niceStep(model.depth, Math.max(5, Math.round(drawH / 16)));
    for (let depth = step; depth < model.depth - step * 0.25; depth += step) {
      const y = yAt(depth);
      let half = stepped && depth > model.casing.depth ? lowerBore : upperBore;
      if (layout) {
        const segment = layout.segments.find((item) => depth > item.from + 0.001 && depth <= item.to + 0.001) || layout.segments[0];
        half = segment.half;
      }
      line(CENTER_X - half, y, CENTER_X + half, y, GRID, 0.2);
    }

    if (layout) {
      const innerPipe = layout.visuals[layout.visuals.length - 1];
      const matchesBore = Math.abs(innerPipe.casing.diameter - model.boreMm) <= 0.05;
      if (!matchesBore) {
        const y0 = yAt(0);
        const y1 = yAt(Math.min(innerPipe.casing.depth, model.depth));
        const inner = innerPipe.outer - caseWall;
        rect(CENTER_X - inner, y0, inner * 2, Math.max(0.2, y1 - y0), ANNULUS, null, 0);
      }
    } else if (caseOuter != null && !flush) {
      const y0 = yAt(0);
      const y1 = yAt(model.casing.depth);
      const inner = caseOuter - caseWall;
      rect(CENTER_X - inner, y0, inner * 2, y1 - y0, ANNULUS, null, 0);
    }

    const drawAnnulus = (fromDepth, toDepth, paint) => {
      if (!(toDepth > fromDepth + 0.02)) return;
      const cuts = [fromDepth];
      model.sections.forEach((section) => {
        if (section.top > fromDepth && section.top < toDepth) cuts.push(section.top);
        if (section.bottom > fromDepth && section.bottom < toDepth) cuts.push(section.bottom);
      });
      [model.casing, model.casing2].forEach((pipe) => {
        if (pipe && pipe.depth > fromDepth && pipe.depth < toDepth) cuts.push(pipe.depth);
      });
      cuts.push(toDepth);
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i += 1) {
        const top = cuts[i];
        const bottom = cuts[i + 1];
        if (bottom - top < 0.02) continue;
        const mid = (top + bottom) / 2;
        const sectionIndex = model.sections.findIndex((section) => mid >= section.top - 0.001 && mid <= section.bottom + 0.001);
        if (sectionIndex < 0) continue;
        const innerHalf = linerOuters[sectionIndex];
        let outerHalf;
        if (layout) {
          const covering = layout.visuals.filter((item) => mid <= item.casing.depth + 0.001);
          const segment = layout.segments.find((item) => mid >= item.from - 0.001 && mid <= item.to + 0.001);
          if (covering.length) {
            const innerMost = covering.reduce((a, b) => (a.casing.diameter <= b.casing.diameter ? a : b));
            const onBoreWall = segment
              && Math.abs(innerMost.casing.diameter - model.boreMm) <= 0.05
              && Math.abs(segment.diameter - model.boreMm) <= 0.05;
            outerHalf = onBoreWall ? segment.half - 1.55 : innerMost.outer - caseWall - 0.35;
          } else {
            outerHalf = (segment ? segment.half : upperBore) - 0.25;
          }
        } else {
          const insideCasing = model.casing && mid <= model.casing.depth + 0.001;
          outerHalf = insideCasing
            ? (flush ? upperBore - 1.55 : caseOuter - caseWall - 0.35)
            : (stepped ? lowerBore : upperBore) - 0.25;
        }
        if (outerHalf - innerHalf < 0.65) continue;
        paint(top, bottom, innerHalf, outerHalf);
      }
    };
    if (model.gravelShown != null) {
      drawAnnulus(model.gravelShown, model.depth, (top, bottom, innerHalf, outerHalf) => {
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
      });
    }
    if (model.cementDepth != null) {
      drawAnnulus(0, Math.min(model.cementDepth, model.depth), (top, bottom, innerHalf, outerHalf) => {
        const y0 = yAt(top);
        const y1 = yAt(bottom);
        const band = outerHalf - innerHalf;
        [-1, 1].forEach((side) => {
          const x = side < 0 ? CENTER_X - outerHalf : CENTER_X + innerHalf;
          rect(x, y0, band, Math.max(0.2, y1 - y0), CEMENT, null, 0);
        });
      });
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

    if (layout) {
      layout.visuals.forEach((item) => {
        const endDepth = Math.min(item.casing.depth, model.depth);
        const yEnd = yAt(endDepth);
        const shoe = Math.min(1.7, Math.max(0.4, yEnd - yAt(0)));
        layout.segments.forEach((segment) => {
          const from = Math.max(segment.from, 0);
          const to = Math.min(segment.to, endDepth);
          if (to - from < 0.02) return;
          const y0 = yAt(from);
          const y1 = yAt(to);
          const onBoreWall = Math.abs(item.casing.diameter - model.boreMm) <= 0.05
            && Math.abs(segment.diameter - model.boreMm) <= 0.05;
          if (onBoreWall) {
            line(CENTER_X - segment.half, y0, CENTER_X - segment.half, y1, item.color, 2.2);
            line(CENTER_X + segment.half, y0, CENTER_X + segment.half, y1, item.color, 2.2);
          } else {
            rect(CENTER_X - item.outer, y0, caseWall, y1 - y0, item.color, null, 0);
            rect(CENTER_X + item.outer - caseWall, y0, caseWall, y1 - y0, item.color, null, 0);
          }
        });
        const endSeg = layout.segments.find((segment) => endDepth <= segment.to + 0.001 && endDepth >= segment.from - 0.001)
          || layout.segments[layout.segments.length - 1];
        const shoeOnWall = Math.abs(item.casing.diameter - model.boreMm) <= 0.05
          && endSeg && Math.abs(endSeg.diameter - model.boreMm) <= 0.05;
        const shoeOuter = shoeOnWall ? endSeg.half : item.outer;
        const shoeW = shoeOnWall ? 2.2 : caseWall + 0.5;
        if (shoeOnWall) {
          rect(CENTER_X - shoeOuter - shoeW / 2, yEnd - shoe, shoeW, shoe, item.shoe, null, 0);
          rect(CENTER_X + shoeOuter - shoeW / 2, yEnd - shoe, shoeW, shoe, item.shoe, null, 0);
        } else {
          rect(CENTER_X - shoeOuter - 0.25, yEnd - shoe, shoeW, shoe, item.shoe, null, 0);
          rect(CENTER_X + shoeOuter - caseWall - 0.25, yEnd - shoe, shoeW, shoe, item.shoe, null, 0);
        }
      });
      layout.segments.forEach((segment, index) => {
        const y0 = yAt(segment.from);
        const y1 = yAt(segment.to);
        const covered = layout.visuals.some((item) => (
          Math.abs(item.casing.diameter - model.boreMm) <= 0.05
          && Math.abs(segment.diameter - model.boreMm) <= 0.05
          && item.casing.depth + 0.001 >= segment.to
        ));
        if (!covered) {
          line(CENTER_X - segment.half, y0, CENTER_X - segment.half, y1, BORE_LINE, 0.55);
          line(CENTER_X + segment.half, y0, CENTER_X + segment.half, y1, BORE_LINE, 0.55);
        }
        const next = layout.segments[index + 1];
        if (next && Math.abs(next.half - segment.half) > 0.05) {
          line(CENTER_X - segment.half, y1, CENTER_X - next.half, y1, BORE_LINE, 0.7);
          line(CENTER_X + next.half, y1, CENTER_X + segment.half, y1, BORE_LINE, 0.7);
        }
      });
      const lastHalf = layout.segments[layout.segments.length - 1].half;
      line(CENTER_X - lastHalf, TALP_Y, CENTER_X + lastHalf, TALP_Y, BORE_LINE, 0.7);
    } else if (caseOuter != null) {
      const y0 = yAt(0);
      const y1 = yAt(model.casing.depth);
      const shoe = Math.min(1.7, Math.max(0.4, y1 - y0));
      if (flush) {
        const thick = 2.2;
        line(CENTER_X - upperBore, y0, CENTER_X - upperBore, y1, casingColor, thick);
        line(CENTER_X + upperBore, y0, CENTER_X + upperBore, y1, casingColor, thick);
        rect(CENTER_X - upperBore - thick / 2, y1 - shoe, thick, shoe, casingShoe, null, 0);
        rect(CENTER_X + upperBore - thick / 2, y1 - shoe, thick, shoe, casingShoe, null, 0);
      } else {
        rect(CENTER_X - caseOuter, y0, caseWall, y1 - y0, casingColor, null, 0);
        rect(CENTER_X + caseOuter - caseWall, y0, caseWall, y1 - y0, casingColor, null, 0);
        rect(CENTER_X - caseOuter - 0.25, y1 - shoe, caseWall + 0.5, shoe, casingShoe, null, 0);
        rect(CENTER_X + caseOuter - caseWall - 0.25, y1 - shoe, caseWall + 0.5, shoe, casingShoe, null, 0);
      }
    }

    if (!layout && flush) {
      const yCase = yAt(model.casing.depth);
      if (model.casing.depth < model.depth - 0.01) {
        line(CENTER_X - upperBore, yCase, CENTER_X - upperBore, TALP_Y, BORE_LINE, 0.55);
        line(CENTER_X + upperBore, yCase, CENTER_X + upperBore, TALP_Y, BORE_LINE, 0.55);
      }
    } else if (!layout) {
      line(CENTER_X - upperBore, GROUND_Y, CENTER_X - upperBore, yShoe, BORE_LINE, 0.55);
      line(CENTER_X + upperBore, GROUND_Y, CENTER_X + upperBore, yShoe, BORE_LINE, 0.55);
      if (stepped) {
        line(CENTER_X - upperBore, yShoe, CENTER_X - lowerBore, yShoe, BORE_LINE, 0.7);
        line(CENTER_X + lowerBore, yShoe, CENTER_X + upperBore, yShoe, BORE_LINE, 0.7);
        line(CENTER_X - lowerBore, yShoe, CENTER_X - lowerBore, TALP_Y, BORE_LINE, 0.55);
        line(CENTER_X + lowerBore, yShoe, CENTER_X + lowerBore, TALP_Y, BORE_LINE, 0.55);
      }
    }
    if (!layout) {
      const bottomHalf = stepped ? lowerBore : upperBore;
      line(CENTER_X - bottomHalf, TALP_Y, CENTER_X + bottomHalf, TALP_Y, BORE_LINE, 0.7);
    }

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
    [model.casing, model.casing2].forEach((pipe) => {
      if (pipe && pipe.depth < model.depth - 0.01) ticks.push({ depth: pipe.depth, priority: 2, kind: 'bound' });
    });
    if (model.gravelShown != null) ticks.push({ depth: model.gravelShown, priority: 1, kind: 'bound' });
    if (model.cementDepth != null && model.cementDepth < model.depth - 0.01) {
      ticks.push({ depth: model.cementDepth, priority: 2, kind: 'bound' });
    }
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
        lines: [casingName, `Ø ${fmtMm(model.casing.diameter)} mm`],
        color: plastic ? casingColor : '#000000',
      });
    }
    if (model.casing2 && layout) {
      const second = layout.visuals.find((item) => item.secondary);
      callouts.push({
        anchorY: (yAt(0) + yAt(model.casing2.depth)) / 2,
        lines: [second.name, `Ø ${fmtMm(model.casing2.diameter)} mm`],
        color: second.plastic ? second.color : '#000000',
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
    const stepFrom = layout
      ? layout.segments.reduce((max, segment) => (segment.diameter > model.boreMm + 0.05 ? Math.max(max, segment.to) : max), 0)
      : (stepped ? model.casing.depth : 0);
    if (stepFrom > 0.01 && stepFrom < model.depth - 0.01) {
      callouts.push({
        anchorY: (yAt(stepFrom) + yAt(model.depth)) / 2,
        lines: ['Fúrat szűkül', `Ø ${fmtMm(model.boreMm)} mm`],
        color: '#000000',
      });
    }
    if (model.gravelShown != null) {
      callouts.push({
        anchorY: (yAt(model.gravelShown) + yAt(model.depth)) / 2,
        lines: ['Kavics', `${fmtDepth(model.gravelShown)} m-től a talpig`],
        color: '#000000',
      });
    }
    if (model.cementDepth != null) {
      callouts.push({
        anchorY: (yAt(0) + yAt(model.cementDepth)) / 2,
        lines: ['Cement', `0–${fmtDepth(model.cementDepth)} m`],
        color: '#000000',
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
      [casingColor, casingColor, plastic ? 'Műanyag' : 'Acél'],
      [BLANK_FILL, BLANK_LINE, 'Teli'],
      [SCREEN_FILL, SCREEN_LINE, 'Szűrő'],
    ];
    if (model.casing2 && model.casing.material !== model.casing2.material) {
      const plastic2 = model.casing2.material === 'muanyag';
      legend.splice(2, 0, [plastic2 ? '#1d4ed8' : CASING, plastic2 ? '#1d4ed8' : CASING, plastic2 ? 'Műanyag' : 'Acél']);
    }
    if (model.gravelShown != null) legend.push(['#e7e5e4', '#78716c', 'Kavics']);
    if (model.cementDepth != null) legend.push([CEMENT, '#737373', 'Cement']);
    const legendW = (FRAME_R - TABLE_X - 4) / legend.length;
    legend.forEach((item, index) => {
      const x = TABLE_X + 2 + index * legendW;
      rect(x, ty, 3.2, 3.2, item[0], item[1], 0.3);
      text(x + 4.2, ty + 1.6, item[2], 7, INK, 'start', false);
    });
    ty += 8;

    const wideRows = layout
      ? layout.segments.filter((segment) => segment.diameter > model.boreMm + 0.05)
      : [];
    const metaRows = 2 + (layout ? wideRows.length : (model.stepped ? 1 : 0)) + (model.gravelShown != null ? 1 : 0) + (model.cementDepth != null ? 1 : 0) + (model.groundMbf != null ? 1 : 0) + (model.waterM != null ? 1 : 0);
    const casingRows = (model.casing ? 2 : 1) + (model.casing2 ? 2 : 0);
    const filterRows = Math.max(1, model.filters.length);
    const bodyRows = metaRows + casingRows + 1 + model.sections.length + filterRows;
    const headings = 4 + (model.casing2 ? 1 : 0);
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
    const holeSteps = layout ? wideRows.length > 0 : model.stepped;
    kv(holeSteps ? 'Fúrat a védőcső alatt' : 'Fúrat Ø', `${fmtMm(model.boreMm)} mm`);
    if (layout) {
      wideRows.forEach((segment) => {
        kv(`Fúrat ${fmtDepth(segment.from)}–${fmtDepth(segment.to)} m`, `Ø ${fmtMm(segment.diameter)} mm`);
      });
    } else if (model.stepped) kv('Fúrat a saruig', `Ø ${fmtMm(model.casing.diameter)} mm`);
    if (model.cementDepth != null) kv('Cementezés', `0,00–${fmtDepth(model.cementDepth)} m`);
    if (model.gravelShown != null) kv('Kavics', `${fmtDepth(model.gravelShown)} m – talp`);
    if (model.groundMbf != null) kv('Terepszint', `${fmtDepth(model.groundMbf)} mBf`);
    if (model.waterM != null) kv('Nyugalmi vízszint', `${fmtDepth(model.waterM)} m`);
    ty += 1.6;

    heading(model.casing ? casingName : 'Védőcső');
    if (!model.casing) kv('Beépítés', 'nincs');
    else {
      kv('Átmérő', `${fmtMm(model.casing.diameter)} mm`);
      kv('Lehelyezés', `0,00–${fmtDepth(model.casing.depth)} m`);
    }
    if (model.casing2 && layout) {
      const second = layout.visuals.find((item) => item.secondary);
      ty += 1.6;
      heading(second.name);
      kv('Átmérő', `${fmtMm(model.casing2.diameter)} mm`);
      kv('Lehelyezés', `0,00–${fmtDepth(model.casing2.depth)} m`);
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

  function casingMaterialOf(value) {
    const raw = planText(value).toLowerCase();
    if (raw === 'muanyag' || raw === 'műanyag' || raw === 'pvc' || raw === 'műanyag (pvc)') return 'muanyag';
    return 'acel';
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
      casingMaterial: source.casingMaterial === 'muanyag' ? 'muanyag' : 'acel',
      casingDia: planText(source.casingDia),
      casingDepth: planText(source.casingDepth),
      casing2On: !!source.casing2On,
      casing2Material: source.casing2Material === 'muanyag' ? 'muanyag' : 'acel',
      casing2Dia: planText(source.casing2Dia),
      casing2Depth: planText(source.casing2Depth),
      gravelTop: planText(source.gravelTop),
      cementOn: !!source.cementOn,
      cementDepth: planText(source.cementDepth),
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
      casingMaterial: casingMaterialOf(data.casingMaterial),
      casingDia: planText(data.casingDia),
      casingDepth: planText(data.casingDepth),
      casing2On: data.casing2On === true || data.casing2On === 'true' || data.casing2On === 1,
      casing2Material: casingMaterialOf(data.casing2Material),
      casing2Dia: planText(data.casing2Dia),
      casing2Depth: planText(data.casing2Depth),
      gravelTop: planText(data.gravelTop),
      cementOn: data.cementOn === true || data.cementOn === 'true' || data.cementOn === 1,
      cementDepth: planText(data.cementDepth),
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
