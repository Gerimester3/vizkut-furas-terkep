(function () {
  const STORAGE_KEY = 'vizkut-kut-tervrajz-v1';
  const form = document.getElementById('form');
  const sectionsEl = document.getElementById('sections');
  const casingFields = document.getElementById('casingFields');
  const casing2Fields = document.getElementById('casing2Fields');
  const cementFields = document.getElementById('cementFields');
  const summaryEl = document.getElementById('summary');
  const issuesEl = document.getElementById('issues');
  const sheetEl = document.getElementById('sheet');
  const pdfBtn = document.getElementById('pdfBtn');
  const statusEl = document.getElementById('status');
  const sampleBanner = document.getElementById('sampleBanner');

  const scalarIds = ['name', 'place', 'date', 'ground', 'water', 'note', 'depth', 'bore', 'casingOn', 'casingMaterial', 'casingDia', 'casingDepth', 'casing2On', 'casing2Material', 'casing2Dia', 'casing2Depth', 'gravelTop', 'cementOn', 'cementDepth'];
  let triedExport = false;
  let fontPromise = null;

  function todayIso() {
    const d = new Date();
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function emptyState() {
    return {
      name: '',
      place: '',
      date: todayIso(),
      ground: '',
      water: '',
      note: '',
      depth: '',
      bore: '',
      casingOn: false,
      casingMaterial: 'acel',
      casingDia: '',
      casingDepth: '',
      casing2On: false,
      casing2Material: 'acel',
      casing2Dia: '',
      casing2Depth: '',
      gravelTop: '',
      cementOn: false,
      cementDepth: '',
      sections: [{ type: 'teli', length: '', diameter: '' }],
      pristineSample: false,
    };
  }

  function sampleState() {
    return {
      name: 'Minta kút',
      place: 'Pápa',
      date: todayIso(),
      ground: '148.2',
      water: '6.5',
      note: '',
      depth: '42',
      bore: '150',
      casingOn: true,
      casingMaterial: 'acel',
      casingDia: '244',
      casingDepth: '12',
      casing2On: false,
      casing2Material: 'acel',
      casing2Dia: '',
      casing2Depth: '',
      gravelTop: '18',
      cementOn: true,
      cementDepth: '12',
      sections: [
        { type: 'teli', length: '8', diameter: '180' },
        { type: 'teli', length: '12', diameter: '125' },
        { type: 'szuro', length: '18', diameter: '125' },
        { type: 'teli', length: '4', diameter: '125' },
      ],
      pristineSample: true,
    };
  }

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return sampleState();
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.sections) || !data.sections.length) return sampleState();
      if (data.casingMaterial !== 'muanyag') data.casingMaterial = 'acel';
      data.casing2On = data.casing2On === true;
      if (data.casing2Material !== 'muanyag') data.casing2Material = 'acel';
      if (data.casing2Dia == null) data.casing2Dia = '';
      if (data.casing2Depth == null) data.casing2Depth = '';
      data.cementOn = data.cementOn === true;
      if (data.cementDepth == null) data.cementDepth = '';
      return data;
    } catch (err) {
      return sampleState();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* a rajz enélkül is elkészül */
    }
  }

  function fillForm() {
    scalarIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!state[id];
      else el.value = state[id] == null ? '' : state[id];
    });
    casingFields.hidden = !state.casingOn;
    casing2Fields.hidden = !state.casing2On;
    cementFields.hidden = !state.cementOn;
    renderSections();
    refresh();
  }

  function renderSections() {
    sectionsEl.replaceChildren();
    state.sections.forEach((section, index) => {
      const row = document.createElement('div');
      row.className = `seg${section.type === 'szuro' ? ' is-szuro' : ''}`;
      row.dataset.index = String(index);

      const typeLabel = document.createElement('label');
      typeLabel.className = 'type';
      typeLabel.append(document.createTextNode('Típus'));
      const select = document.createElement('select');
      select.dataset.field = 'type';
      [
        ['teli', 'Teli cső'],
        ['szuro', 'Szűrőcső'],
      ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = section.type === value;
        select.append(option);
      });
      typeLabel.append(select);

      row.append(
        typeLabel,
        numberField('Hossz (m)', 'length', section.length),
        numberField('Átmérő (mm)', 'diameter', section.diameter)
      );

      const foot = document.createElement('div');
      foot.className = 'seg-foot';
      const range = document.createElement('div');
      range.className = 'seg-range';
      range.textContent = '—';
      const actions = document.createElement('div');
      actions.className = 'icon-btns';
      actions.append(
        iconButton('up', 'Szakasz feljebb', '↑', index === 0),
        iconButton('down', 'Szakasz lejjebb', '↓', index === state.sections.length - 1),
        iconButton('remove', 'Szakasz törlése', '×', false)
      );
      foot.append(range, actions);
      row.append(foot);
      sectionsEl.append(row);
    });
  }

  function numberField(label, field, value) {
    const wrap = document.createElement('label');
    wrap.append(document.createTextNode(label));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = 'any';
    input.inputMode = 'decimal';
    input.dataset.field = field;
    input.value = value == null ? '' : value;
    wrap.append(input);
    return wrap;
  }

  function iconButton(act, label, symbol, disabled) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.act = act;
    button.setAttribute('aria-label', label);
    button.textContent = symbol;
    button.disabled = disabled;
    return button;
  }

  function fieldValue(field) {
    if (field.startsWith('section:')) {
      const [, index, key] = field.split(':');
      const section = state.sections[Number(index)];
      return section ? section[key] : '';
    }
    return state[field];
  }

  function refresh() {
    const result = KutTerv.prepare(state);
    sampleBanner.hidden = !state.pristineSample;
    updateRanges();
    renderIssues(result);
    markFields(result.errors);
    pdfBtn.disabled = !result.ok;
    if (!result.ok) {
      const lines = result.errors.map((item) => item.message);
      sheetEl.innerHTML = KutTerv.placeholderSvg(lines.length ? lines : ['Töltsd ki a fúrat és a béléscső adatait.']);
      summaryEl.textContent = '';
      return;
    }
    const filters = result.model.filters.map((item) => `${KutTerv.fmtDepth(item.top)}–${KutTerv.fmtDepth(item.bottom)} m`);
    const parts = [`Béléscső ${KutTerv.fmtDepth(result.model.sections.reduce((sum, section) => sum + section.length, 0))} m, talp ${KutTerv.fmtDepth(result.model.depth)} m.`];
    parts.push(filters.length ? `Szűrő a vízadónál: ${filters.join(', ')}.` : 'Nincs szűrőzött szakasz.');
    summaryEl.textContent = parts.join(' ');
    sheetEl.innerHTML = KutTerv.renderSvg(KutTerv.buildCommands(result.model));
  }

  function updateRanges() {
    let cursor = 0;
    state.sections.forEach((section, index) => {
      const row = sectionsEl.querySelector(`.seg[data-index="${index}"]`);
      if (!row) return;
      const range = row.querySelector('.seg-range');
      const length = KutTerv.parseNum(section.length);
      row.classList.toggle('is-szuro', section.type === 'szuro');
      if (length == null || Number.isNaN(length) || length < 0) {
        range.textContent = '—';
        return;
      }
      const top = cursor;
      cursor += length;
      range.textContent = `${KutTerv.fmtDepth(top)}–${KutTerv.fmtDepth(cursor)} m`;
    });
  }

  function renderIssues(result) {
    issuesEl.replaceChildren();
    result.errors.forEach((item) => issuesEl.append(issue('err', item.message)));
    result.warnings.forEach((item) => issuesEl.append(issue('warn', item)));
    result.notes.forEach((item) => issuesEl.append(issue('note', item)));
  }

  function issue(kind, message) {
    const p = document.createElement('p');
    p.className = kind;
    p.textContent = message;
    return p;
  }

  function markFields(errors) {
    form.querySelectorAll('.bad').forEach((el) => el.classList.remove('bad'));
    errors.forEach((item) => {
      const value = fieldValue(item.field);
      const filled = value != null && String(value) !== '';
      if (!triedExport && !filled) return;
      if (item.field.startsWith('section:')) {
        const [, index, key] = item.field.split(':');
        const input = sectionsEl.querySelector(`.seg[data-index="${index}"] [data-field="${key}"]`);
        if (input) input.classList.add('bad');
        return;
      }
      const el = document.getElementById(item.field);
      if (el) el.classList.add('bad');
    });
  }

  function loadFonts() {
    if (!fontPromise) {
      fontPromise = Promise.all([
        fetch('/fonts/NotoSans-Regular.ttf').then((res) => {
          if (!res.ok) throw new Error('A betűtípus nem tölthető be.');
          return res.arrayBuffer();
        }),
        fetch('/fonts/NotoSans-Bold.ttf').then((res) => {
          if (!res.ok) throw new Error('A félkövér betűtípus nem tölthető be.');
          return res.arrayBuffer();
        }),
      ]);
    }
    return fontPromise;
  }

  async function downloadPdf() {
    triedExport = true;
    const result = KutTerv.prepare(state);
    refresh();
    if (!result.ok) {
      statusEl.textContent = 'A PDF-hez még hiányzik vagy hibás adat van.';
      return;
    }
    pdfBtn.disabled = true;
    statusEl.textContent = 'Készül a PDF…';
    try {
      const [regular, bold] = await loadFonts();
      const bytes = await KutTerv.renderPdf(KutTerv.buildCommands(result.model), {
        PDFLib,
        fontkit: globalThis.fontkit,
        regular,
        bold,
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = KutTerv.fileNameFor(result.model);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      statusEl.textContent = 'A PDF egy A4-es oldal.';
    } catch (err) {
      statusEl.textContent = err && err.message ? err.message : 'A PDF készítése nem sikerült.';
    } finally {
      pdfBtn.disabled = !KutTerv.prepare(state).ok;
    }
  }

  const menuToggle = document.getElementById('menuToggle');
  const actionsEl = document.getElementById('actions');

  function setMenuOpen(open) {
    actionsEl.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  menuToggle.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('click', (event) => {
    if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
    if (actionsEl.contains(event.target) || menuToggle.contains(event.target)) return;
    setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuOpen(false);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    downloadPdf();
  });

  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('wheel', (event) => {
    if (event.target.type === 'number' && document.activeElement === event.target) event.target.blur();
  }, { passive: true });

  function onEdit(event) {
    const target = event.target;
    const row = target.closest('.seg');
    if (row && target.dataset.field) {
      const index = Number(row.dataset.index);
      state.sections[index][target.dataset.field] = target.value;
    } else if (target.id && Object.prototype.hasOwnProperty.call(state, target.id)) {
      state[target.id] = target.type === 'checkbox' ? target.checked : target.value;
      if (target.id === 'casingOn') casingFields.hidden = !state.casingOn;
      if (target.id === 'casing2On') casing2Fields.hidden = !state.casing2On;
      if (target.id === 'cementOn') cementFields.hidden = !state.cementOn;
    } else {
      return;
    }
    state.pristineSample = false;
    persist();
    refresh();
  }

  sectionsEl.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    const index = Number(button.closest('.seg').dataset.index);
    const act = button.dataset.act;
    if (act === 'up' && index > 0) {
      const [item] = state.sections.splice(index, 1);
      state.sections.splice(index - 1, 0, item);
    } else if (act === 'down' && index < state.sections.length - 1) {
      const [item] = state.sections.splice(index, 1);
      state.sections.splice(index + 1, 0, item);
    } else if (act === 'remove') {
      if (state.sections.length === 1) state.sections[0] = { type: 'teli', length: '', diameter: '' };
      else state.sections.splice(index, 1);
    } else {
      return;
    }
    state.pristineSample = false;
    persist();
    renderSections();
    refresh();
  });

  document.getElementById('addSection').addEventListener('click', () => {
    state.sections.push({ type: 'teli', length: '', diameter: '' });
    state.pristineSample = false;
    persist();
    renderSections();
    refresh();
  });

  document.getElementById('sampleBtn').addEventListener('click', () => {
    state = sampleState();
    triedExport = false;
    persist();
    fillForm();
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    state = emptyState();
    triedExport = false;
    persist();
    fillForm();
  });

  document.getElementById('savePlanBtn').addEventListener('click', () => {
    const plan = KutTerv.toPlan(state);
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = KutTerv.planFileName(plan);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    statusEl.textContent = 'A tervfájl mentve. Később a Terv betöltése gombbal vissza lehet hozni.';
  });

  const planFile = document.getElementById('planFile');
  document.getElementById('loadPlanBtn').addEventListener('click', () => {
    planFile.click();
  });
  planFile.addEventListener('change', async () => {
    const file = planFile.files && planFile.files[0];
    planFile.value = '';
    if (!file) return;
    try {
      let data;
      try {
        data = JSON.parse(await file.text());
      } catch (err) {
        throw new Error('A fájl nem olvasható terv. A Terv mentése gombbal készült JSON fájlt válaszd.');
      }
      state = KutTerv.fromPlan(data);
      triedExport = false;
      persist();
      fillForm();
      statusEl.textContent = 'A terv betöltve. Módosíthatod, aztán mentsd újra a fájlt vagy töltsd le a PDF-et.';
    } catch (err) {
      statusEl.textContent = err && err.message ? err.message : 'A tervfájl nem tölthető be.';
    }
  });

  fillForm();
  loadFonts().catch(() => {});
})();
