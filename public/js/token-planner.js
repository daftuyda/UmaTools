(function () {
  'use strict';

  const STORAGE_KEY = 'umatools-token-planner-v1';

  const TOKEN_TYPES = [
    { key: 'da', label: 'Da', name: 'Dance', className: 'token-da' },
    { key: 'pa', label: 'Pa', name: 'Passion', className: 'token-pa' },
    { key: 'vo', label: 'Vo', name: 'Vocal', className: 'token-vo' },
    { key: 'vi', label: 'Vi', name: 'Visual', className: 'token-vi' },
    { key: 'me', label: 'Co', name: 'Composure', className: 'token-me' },
  ];

  const LESSONS = [
    { label: 'Live 1', value: '1-2-3-4-4-2' },
    { label: 'Live 2-4', value: '2-2-2-4-5-2' },
    { label: 'Live 5', value: '2-2-2-4-2-2' },
  ];

  const SONGS = [
    song('seishun', '1', 'Here Comes Our Time', 'Power +22 / Friendship Bonus +5%', {
      vo: 32,
      me: 12,
    }),
    song('run-run', '1', "Run n' Run!", 'Skill Points +22 / Friendship Bonus +5%', {
      da: 14,
      vi: 16,
      me: 14,
    }),
    song(
      'umadol-power',
      '1',
      'Full Speed Ahead! Umadol Power☆',
      'Speed +22 / Friendship Bonus +5%',
      {
        da: 32,
        vi: 12,
      }
    ),
    song(
      'position-zero',
      '1',
      'Zero Is Where the Center Stands!',
      'Speed Training +1 / Support Chain Event Frequency +1',
      {
        da: 21,
        vi: 21,
      }
    ),
    song(
      'believe-miracle',
      '1',
      'Believe in Miracles!',
      'Wit Training +1 / Speciality Priority Up +5',
      {
        pa: 21,
        me: 21,
      }
    ),
    song(
      'go-this-way',
      '1',
      'Go This Way',
      'Power Training +1 / Support Chain Event Frequency +1',
      {
        vo: 21,
        me: 21,
      }
    ),
    song(
      'ring-ring-diary',
      '1',
      'Ring Ring Diary',
      'Stamina Training +1 / Support Chain Event Frequency +1',
      {
        pa: 21,
        vi: 21,
      }
    ),
    song(
      'fallin-love',
      '1',
      "Getaway! Fallin' Love",
      'Guts Training +1 / Support Chain Event Frequency +1',
      {
        da: 21,
        vi: 21,
      }
    ),
    song(
      'yume-wo-kakeru',
      '2',
      'Run for Our Dream!',
      'Skill Point Bonus +2 / Speciality Priority Up +5',
      {
        pa: 21,
        vi: 21,
      }
    ),
    song(
      'bluebird-days',
      '2',
      'Our Blue Bird Days',
      'Speed Training +2 / Speciality Priority Up +5',
      {
        da: 21,
        vi: 42,
      }
    ),
    song('anone', '2', 'Hey, Guess What!', 'Guts Training +2 / Speciality Priority Up +5', {
      da: 42,
      vi: 21,
    }),
    song(
      'grow-up-shine',
      '2.5',
      'Grow Up and Shine!',
      'Skill Point Bonus +3 / Support Chain Event Frequency +1',
      {
        da: 21,
        vo: 21,
        me: 21,
      }
    ),
    song(
      'rainbow-scenery',
      '2.5',
      'Seven Colors Scenery',
      'Power Training +2 / Speciality Priority Up +5',
      {
        vo: 21,
        me: 42,
      }
    ),
    song(
      'sunbeam-yell',
      '2.5',
      'Sunbeam Cheer',
      'Wit Training +2 / Support Chain Event Frequency +1',
      {
        pa: 42,
        me: 21,
      }
    ),
    song(
      'pyoi-hallelujah',
      '2.5',
      'Hoppity Sunny Days♪',
      'Stamina Training +2 / Speciality Priority Up +5',
      {
        pa: 42,
        vo: 21,
      }
    ),
    song('treasure-box', '3', 'Precious Treasure Box', 'Speed +26 / Friendship Bonus +10%', {
      da: 42,
      vi: 26,
    }),
    song('fanfare-future', '3', 'Fanfare for the Future!', 'Guts +26 / Friendship Bonus +10%', {
      da: 26,
      vi: 42,
    }),
    song('present-march', '3', 'Present March♪', 'Power +22 / Friendship Bonus +5%', {
      vo: 22,
      me: 22,
    }),
    song('yumezora', '3', 'Dream Sky', 'Wit +22 / Friendship Bonus +5%', {
      pa: 22,
      me: 22,
    }),
    song('world-obeys-us', '3', "The World's at Our Whim", 'Stamina +22 / Friendship Bonus +5%', {
      pa: 32,
      vo: 12,
    }),
    song('blue-sky-blue', '3', 'Sky-Blue Spring', 'Guts +22 / Friendship Bonus +5%', {
      da: 12,
      vi: 32,
    }),
  ];

  const PRESETS = [
    {
      key: 'planner',
      label: 'Planner / Year 1 Sheet',
      want: ['seishun', 'run-run', 'umadol-power'],
      got: [],
    },
    {
      key: 'year2',
      label: 'Year 2 Sheet',
      want: ['yume-wo-kakeru', 'grow-up-shine'],
      got: [],
    },
    {
      key: 'year3',
      label: 'Year 3 Sheet',
      want: [
        'treasure-box',
        'fanfare-future',
        'present-march',
        'yumezora',
        'world-obeys-us',
        'blue-sky-blue',
      ],
      got: [],
    },
    {
      key: 'blank',
      label: 'Blank Plan',
      want: [],
      got: [],
    },
  ];

  const elements = {};
  let state = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    state = loadState();
    renderPresetOptions();
    renderHeldInputs();
    renderLessons();
    bindEvents();
    syncControls();
    render();
  }

  function cacheElements() {
    elements.presetSelect = document.getElementById('presetSelect');
    elements.yearFilter = document.getElementById('yearFilter');
    elements.songSearch = document.getElementById('songSearch');
    elements.wantVisibleBtn = document.getElementById('wantVisibleBtn');
    elements.clearVisibleBtn = document.getElementById('clearVisibleBtn');
    elements.resetPresetBtn = document.getElementById('resetPresetBtn');
    elements.clearAllBtn = document.getElementById('clearAllBtn');
    elements.lessonChips = document.getElementById('lessonChips');
    elements.heldInputs = document.getElementById('heldInputs');
    elements.tokenTotals = document.getElementById('tokenTotals');
    elements.planCounts = document.getElementById('tokenPlanCounts');
    elements.tableBody = document.getElementById('songTableBody');
    elements.visibleCount = document.getElementById('visibleCount');
  }

  function bindEvents() {
    elements.presetSelect.addEventListener('change', () => {
      applyPreset(elements.presetSelect.value);
    });
    elements.yearFilter.addEventListener('change', () => {
      state.filter = elements.yearFilter.value;
      saveAndRender();
    });
    elements.songSearch.addEventListener('input', () => {
      state.search = elements.songSearch.value.trim();
      saveAndRender();
    });
    elements.wantVisibleBtn.addEventListener('click', () => {
      setVisibleWant(true);
    });
    elements.clearVisibleBtn.addEventListener('click', () => {
      for (const item of getVisibleSongs()) {
        state.want[item.id] = false;
        state.got[item.id] = false;
      }
      saveAndRender();
    });
    elements.resetPresetBtn.addEventListener('click', () => {
      applyPreset(state.preset);
    });
    elements.clearAllBtn.addEventListener('click', () => {
      state.want = {};
      state.got = {};
      saveAndRender();
    });
    elements.tableBody.addEventListener('change', onTableChange);
  }

  function onTableChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const id = input.dataset.songId;
    const field = input.dataset.field;
    if (!id || !field) return;

    if (field === 'want') {
      state.want[id] = input.checked;
      if (!input.checked) state.got[id] = false;
    }
    if (field === 'got') {
      state.got[id] = input.checked;
      if (input.checked) state.want[id] = true;
    }
    saveAndRender();
  }

  function renderPresetOptions() {
    elements.presetSelect.innerHTML = PRESETS.map(
      (preset) => `<option value="${escapeHtml(preset.key)}">${escapeHtml(preset.label)}</option>`
    ).join('');
  }

  function renderHeldInputs() {
    elements.heldInputs.innerHTML = TOKEN_TYPES.map((type) => {
      return `
        <label>
          <span>${escapeHtml(type.label)} · ${escapeHtml(type.name)}</span>
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            value="0"
            data-held-token="${escapeHtml(type.key)}"
            aria-label="${escapeHtml(type.name)} tokens already held"
          />
        </label>
      `;
    }).join('');

    elements.heldInputs.addEventListener('input', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      const key = input.dataset.heldToken;
      if (!key) return;
      state.held[key] = normalizeInt(input.value);
      saveAndRender(false);
      renderTotals();
    });
  }

  function renderLessons() {
    elements.lessonChips.innerHTML = LESSONS.map((lesson) => {
      return `
        <span class="lesson-chip">
          <strong>${escapeHtml(lesson.label)}</strong>
          <span>${escapeHtml(lesson.value)}</span>
        </span>
      `;
    }).join('');
  }

  function syncControls() {
    elements.presetSelect.value = state.preset;
    elements.yearFilter.value = state.filter;
    elements.songSearch.value = state.search;
    for (const input of elements.heldInputs.querySelectorAll('[data-held-token]')) {
      input.value = String(state.held[input.dataset.heldToken] || 0);
    }
  }

  function render() {
    syncControls();
    renderTotals();
    renderTable();
  }

  function renderTotals() {
    const totals = calculateTotals();
    elements.planCounts.innerHTML = `
      <span class="pill">${totals.wantCount} wanted</span>
      <span class="pill">${totals.gotCount} bought</span>
      <span class="pill">${totals.openCount} open</span>
    `;

    elements.tokenTotals.innerHTML = TOKEN_TYPES.map((type) => {
      const remaining = totals.remaining[type.key];
      const held = state.held[type.key] || 0;
      const short = Math.max(remaining - held, 0);
      const afterHeldClass = short === 0 ? ' is-clear' : '';
      return `
        <article class="token-total-card">
          <header>
            <span class="token-name">
              <span class="token-dot ${escapeHtml(type.className)}" aria-hidden="true"></span>
              ${escapeHtml(type.label)}
            </span>
            <span class="token-label">${escapeHtml(type.name)}</span>
          </header>
          <div class="token-total-values">
            <div>
              <span class="metric-label">Save</span>
              <span class="metric-value">${remaining}</span>
            </div>
            <div>
              <span class="metric-label">After Held</span>
              <span class="metric-value${afterHeldClass}">${short}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderTable() {
    const visible = getVisibleSongs();
    elements.visibleCount.textContent = `${visible.length} of ${SONGS.length} songs shown`;

    if (!visible.length) {
      elements.tableBody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">No songs match the current filters.</td>
        </tr>
      `;
      return;
    }

    elements.tableBody.innerHTML = visible
      .map((item) => {
        const isWanted = !!state.want[item.id];
        const isGot = !!state.got[item.id];
        const rowClass = isGot ? ' class="is-complete"' : '';
        return `
          <tr${rowClass}>
            <td class="token-check-cell">
              <label class="token-check" title="Want ${escapeHtml(item.title)}">
                <input
                  type="checkbox"
                  data-field="want"
                  data-song-id="${escapeHtml(item.id)}"
                  ${isWanted ? 'checked' : ''}
                  aria-label="Want ${escapeHtml(item.title)}"
                />
              </label>
            </td>
            <td class="token-check-cell">
              <label class="token-check" title="Bought ${escapeHtml(item.title)}">
                <input
                  type="checkbox"
                  data-field="got"
                  data-song-id="${escapeHtml(item.id)}"
                  ${isGot ? 'checked' : ''}
                  aria-label="Bought ${escapeHtml(item.title)}"
                />
              </label>
            </td>
            <td><span class="year-pill">Y${escapeHtml(item.year)}</span></td>
            <td>
              <div class="song-copy">
                <span class="song-title">${escapeHtml(item.title)}</span>
                <span class="song-effect">${escapeHtml(item.effect)}</span>
              </div>
            </td>
            ${TOKEN_TYPES.map((type) => renderTokenCell(item, type)).join('')}
            <td class="token-number token-total">${item.total}</td>
          </tr>
        `;
      })
      .join('');
  }

  function renderTokenCell(item, type) {
    const value = item.tokens[type.key] || 0;
    const zeroClass = value ? '' : ' is-zero';
    return `
      <td class="token-number">
        <span
          class="token-cell ${escapeHtml(type.className)}${zeroClass}"
          aria-label="${escapeHtml(type.name)}: ${value}"
        >${value || '-'}</span>
      </td>
    `;
  }

  function getVisibleSongs() {
    const query = state.search.trim().toLowerCase();
    return SONGS.filter((item) => {
      if (state.filter === 'remaining' && (!state.want[item.id] || state.got[item.id])) {
        return false;
      }
      if (state.filter !== 'all' && state.filter !== 'remaining' && item.year !== state.filter) {
        return false;
      }
      if (!query) return true;
      return `${item.title} ${item.effect}`.toLowerCase().includes(query);
    });
  }

  function calculateTotals() {
    const totals = {
      wantCount: 0,
      gotCount: 0,
      openCount: 0,
      remaining: emptyTokenTotals(),
    };

    for (const item of SONGS) {
      const isWanted = !!state.want[item.id];
      const isGot = !!state.got[item.id];
      if (isWanted) totals.wantCount += 1;
      if (isGot) totals.gotCount += 1;
      if (isWanted && !isGot) {
        totals.openCount += 1;
        addTokens(totals.remaining, item.tokens);
      }
    }
    return totals;
  }

  function setVisibleWant(want) {
    for (const item of getVisibleSongs()) {
      state.want[item.id] = want;
      if (!want) state.got[item.id] = false;
    }
    saveAndRender();
  }

  function applyPreset(key) {
    const preset = PRESETS.find((item) => item.key === key) || PRESETS[0];
    state.preset = preset.key;
    state.want = {};
    state.got = {};
    for (const id of preset.want) state.want[id] = true;
    for (const id of preset.got) {
      state.want[id] = true;
      state.got[id] = true;
    }
    saveAndRender();
  }

  function saveAndRender(renderEverything = true) {
    saveState();
    if (renderEverything) render();
  }

  function loadState() {
    const fallback = createPresetState(PRESETS[0]);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return sanitizeState(parsed, fallback);
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function sanitizeState(input, fallback) {
    const knownIds = new Set(SONGS.map((item) => item.id));
    const preset = PRESETS.some((item) => item.key === input?.preset)
      ? input.preset
      : fallback.preset;
    const filterValues = new Set(['all', '1', '2', '2.5', '3', 'remaining']);
    const filter = filterValues.has(input?.filter) ? input.filter : fallback.filter;
    const next = {
      preset,
      filter,
      search: typeof input?.search === 'string' ? input.search : '',
      held: emptyTokenTotals(),
      want: {},
      got: {},
    };

    for (const type of TOKEN_TYPES) {
      next.held[type.key] = normalizeInt(input?.held?.[type.key]);
    }
    for (const [id, value] of Object.entries(input?.want || {})) {
      if (knownIds.has(id)) next.want[id] = !!value;
    }
    for (const [id, value] of Object.entries(input?.got || {})) {
      if (knownIds.has(id)) {
        next.got[id] = !!value;
        if (value) next.want[id] = true;
      }
    }
    return next;
  }

  function createPresetState(preset) {
    const next = {
      preset: preset.key,
      filter: 'all',
      search: '',
      held: emptyTokenTotals(),
      want: {},
      got: {},
    };
    for (const id of preset.want) next.want[id] = true;
    for (const id of preset.got) {
      next.want[id] = true;
      next.got[id] = true;
    }
    return next;
  }

  function song(id, year, title, effect, tokens) {
    const normalized = emptyTokenTotals();
    addTokens(normalized, tokens);
    return {
      id,
      year,
      title,
      effect,
      tokens: normalized,
      total: TOKEN_TYPES.reduce((sum, type) => sum + normalized[type.key], 0),
    };
  }

  function emptyTokenTotals() {
    return TOKEN_TYPES.reduce((acc, type) => {
      acc[type.key] = 0;
      return acc;
    }, {});
  }

  function addTokens(target, source) {
    for (const type of TOKEN_TYPES) {
      target[type.key] += normalizeInt(source[type.key]);
    }
  }

  function normalizeInt(value) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }
})();
