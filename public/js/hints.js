(async function () {
  const DATA_URL = '/assets/support_hints.json';

  // Elements
  const hintInput = document.getElementById('hintInput');
  const addBtn = document.getElementById('addBtn');
  const modeSelect = document.getElementById('modeSelect');
  const fSSR = document.getElementById('fSSR');
  const fSR = document.getElementById('fSR');
  const fR = document.getElementById('fR');
  const clearBtn = document.getElementById('clearBtn');
  const copyLinkBtn = document.getElementById('copyLinkBtn'); // optional
  const exportBtn = document.getElementById('exportBtn'); // optional
  const chips = document.getElementById('chips');
  const results = document.getElementById('results');
  const counts = document.getElementById('counts');
  const hintList = document.getElementById('hintList');

  // Virtual Scroll removed — grid layout is incompatible with absolute positioning

  // Pagination state
  const CHUNK_SIZE = 100;
  let rawData = [];
  let processedChunks = 0;
  let totalChunks = 0;
  let isProcessing = false;

  if (counts)
    counts.innerHTML = `<span class="loading-indicator">${t('hints.loadingHints')}</span>`;

  let data = [];
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rawData = await res.json();
    totalChunks = Math.ceil(rawData.length / CHUNK_SIZE);
  } catch (err) {
    console.error('Failed to load support hints', err);
    if (counts) counts.textContent = t('hints.loadFailed');
    if (results) {
      results.innerHTML = `<div class="inline-note">${t('hints.loadSupportFailed')}</div>`;
    }
    return;
  }

  // Normalizer used for fuzzy matching (unchanged behavior)
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[○•\u25CB]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  function cleanCardName(full) {
    return String(full || '')
      .replace(/\s*\((?:SSR|SR|R)\)\s*/i, ' ') // drop rarity tag
      .replace(/Support\s*Card/i, '') // drop suffix
      .replace(/\s+/g, ' ')
      .trim();
  }

  function localizedCardName(card) {
    if (typeof getLocalizedSupportName === 'function') {
      // getLocalizedSupportName expects { SupportName, SupportNameJP }
      return cleanCardName(getLocalizedSupportName({ SupportName: card.rawName, SupportNameJP: card.SupportNameJP }));
    }
    return card.name;
  }

  function initialsOf(title) {
    const cleaned = String(title || '')
      .replace(/\(.*?\)/g, '')
      .replace(/Support\s*Card/i, '')
      .trim();

    const tokens = cleaned
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-z]/g, '')) // letters only for initials
      .filter(Boolean);

    if (tokens.length >= 2) return (tokens[0][0] + tokens[1][0]).toUpperCase();
    if (tokens.length === 1) {
      const t = tokens[0];
      return (t.slice(0, 2) || t[0] || '?').toUpperCase(); // e.g., “Vo” for “Vodka”
    }
    return '?';
  }

  // Server filtering
  let currentServer = 'en';
  try {
    currentServer = localStorage.getItem('umatoolsServer') || 'en';
  } catch {}

  function matchesServer(card) {
    if (currentServer === 'jp') return true; // JP shows all cards
    return card.server === 'global'; // EN shows only global cards
  }

  // Parse a single card
  function parseCard(c) {
    const rawName = c?.SupportName ?? '';
    const name = cleanCardName(rawName);
    const rarity = (
      c?.SupportRarity ||
      /\((SSR|SR|R)\)/i.exec(rawName)?.[1] ||
      'UNKNOWN'
    ).toUpperCase();

    // Filter out non-skill hints (e.g. "Initial Speed bonus")
    const isStatBonus = (name) => /^Initial .+ bonus$/i.test(name);
    const hints = Array.isArray(c?.SupportHints)
      ? c.SupportHints.filter((h) => typeof h === 'string' || h?.SkillId || h?.Name)
          .map((h) => (typeof h === 'string' ? h : h?.Name || ''))
          .filter((name) => name && !isStatBonus(name))
      : [];

    const img = c?.SupportImage || c?.Image || c?.Thumb || null;
    const slug = c?.SupportSlug || c?.slug || null;
    const id = c?.SupportId ?? null;
    const server = c?.SupportServer || 'global';
    const SupportNameJP = c?.SupportNameJP || '';
    const nameJP = cleanCardName(SupportNameJP);

    return { name, rawName, rarity, hints, img, slug, id, server, SupportNameJP, nameJP };
  }

  // Process data in chunks to avoid blocking UI
  let cards = [];

  function processNextChunk() {
    if (processedChunks >= totalChunks || isProcessing) return;

    isProcessing = true;
    const start = processedChunks * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, rawData.length);
    const chunk = rawData.slice(start, end);

    // Use requestIdleCallback if available, otherwise setTimeout
    const scheduleWork = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));

    scheduleWork(() => {
      const newCards = chunk.map(parseCard);
      cards = cards.concat(newCards);
      processedChunks++;
      isProcessing = false;

      // Update UI after first chunk to show initial results quickly
      if (processedChunks === 1) {
        buildHintDatalist();
        update();
      } else if (processedChunks === totalChunks) {
        // Final update after all chunks processed
        buildHintDatalist();
        update();
      } else {
        // Update counts during progressive loading to show progress
        const matched = cards.filter(matchCard).sort((a, b) => localizedCardName(a).localeCompare(localizedCardName(b)));
        updateCounts(matched);
      }

      // Process next chunk
      if (processedChunks < totalChunks) {
        processNextChunk();
      }
    });
  }

  // Start processing first chunk
  processNextChunk();

  // Compute allHints dynamically based on currently loaded cards
  function getAllHints() {
    return Array.from(new Set(cards.flatMap((c) => c.hints))).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  // Fill datalist — when JP, use JP names as values so they display in dropdown;
  // build reverse map so we can convert JP input back to English for matching.
  let jpToEnHintMap = new Map();
  function buildHintDatalist() {
    const allHints = getAllHints();
    jpToEnHintMap = new Map();
    hintList.innerHTML = allHints.map((h) => {
      var jp = typeof window.getLocalizedSkillName === 'function' ? window.getLocalizedSkillName(h) : h;
      if (jp !== h) {
        jpToEnHintMap.set(jp, h);
        return `<option value="${jp}"></option>`;
      }
      return `<option value="${h}"></option>`;
    }).join('');
  }

  let selected = [];

  // --- URL state ---
  function readFromURL() {
    const p = new URLSearchParams(location.search);
    const q = (p.get('hints') || '')
      .split(',')
      .map(decodeURIComponent)
      .map((s) => s.trim())
      .filter(Boolean);
    const mode = p.get('mode');
    const rar = (p.get('rar') || 'SSR,SR,R').split(',').map((s) => s.trim().toUpperCase());
    if (q.length) selected = q;
    if (mode === 'OR') modeSelect.value = 'OR';
    fSSR.checked = rar.includes('SSR');
    fSR.checked = rar.includes('SR');
    fR.checked = rar.includes('R');
  }
  function writeToURL() {
    const p = new URLSearchParams();
    if (selected.length) p.set('hints', selected.map(encodeURIComponent).join(','));
    p.set('mode', modeSelect.value);
    const rar = [fSSR.checked ? 'SSR' : null, fSR.checked ? 'SR' : null, fR.checked ? 'R' : null]
      .filter(Boolean)
      .join(',');
    p.set('rar', rar || 'none');
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  }

  // --- Rendering ---
  function renderChips() {
    chips.innerHTML = selected
      .map(
        (h, i) => {
          var displayName = typeof window.getLocalizedSkillName === 'function' ? window.getLocalizedSkillName(h) : h;
          return `<span class="chip">${displayName}<button aria-label="Remove ${h}" data-i="${i}">×</button></span>`;
        }
      )
      .join('');
    chips.querySelectorAll('button[data-i]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected.splice(Number(btn.dataset.i), 1);
        update();
      });
    });
  }

  function rarityAllowed(r) {
    if (r === 'SSR') return fSSR.checked;
    if (r === 'SR') return fSR.checked;
    if (r === 'R') return fR.checked;
    return true;
  }

  function matchCard(card) {
    if (!matchesServer(card)) return false;
    if (!rarityAllowed(card.rarity)) return false;
    if (!selected.length) return true;

    const cardHintsNorm = new Set(card.hints.map(norm));
    const wanted = selected.map(norm);

    if (modeSelect.value === 'AND') {
      return wanted.every((w) => Array.from(cardHintsNorm).some((h) => h.includes(w)));
    } else {
      return wanted.some((w) => Array.from(cardHintsNorm).some((h) => h.includes(w)));
    }
  }

  function highlightMatches(hint) {
    const wanted = selected.map(norm).filter(Boolean);
    const hN = norm(hint);
    const isMatch = wanted.some((w) => hN.includes(w));
    var displayName = typeof window.getLocalizedSkillName === 'function' ? window.getLocalizedSkillName(hint) : hint;
    return `<span class="pill ${isMatch ? 'match' : ''}" data-skill-name="${hint}" tabindex="0" role="button">${displayName}</span>`;
  }

  function initialsOf(name) {
    const parts = String(name).trim().split(/\s+/);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }

  const renderBadge = (rarity) => `<span class="badge badge-${rarity}">${rarity}</span>`;

  function renderResults(list) {
    if (!list.length) {
      results.innerHTML = '';
      results.className = 'grid';
      return;
    }

    results.className = 'grid';
    results.innerHTML = list
      .map((card) => {
        const displayName = localizedCardName(card);
        const thumb = card.img && typeof window.createPictureHTML === 'function'
          ? window.createPictureHTML(card.img, displayName, '', { loading: 'lazy', decoding: 'async', fetchpriority: 'low' })
          : card.img
          ? `<img src="${card.img}" alt="${displayName}" loading="lazy" decoding="async" fetchpriority="low">`
          : `<span>${initialsOf(displayName)}</span>`;
        return `
        <div class="card card-support">
          <div class="card-thumb">${thumb}</div>
          <div class="card-title">
            <h3>${displayName}</h3>
            ${renderBadge(card.rarity)}
          </div>
          <div style="grid-column: 1 / -1;">
            ${card.hints.map(highlightMatches).join('')}
          </div>
        </div>
      `;
      })
      .join('');
  }

  function updateCounts(list) {
    const serverCards = cards.filter(matchesServer);
    const allHints = getAllHints();

    let countText = t('hints.counts', {
      matched: list.length,
      total: serverCards.length,
      hints: allHints.length,
    });

    // Show loading indicator if still processing
    if (processedChunks < totalChunks) {
      const percent = Math.round((processedChunks / totalChunks) * 100);
      countText += ` <span class="loading-indicator">(Loading ${percent}%...)</span>`;
    }

    counts.innerHTML = countText;
  }

  function update() {
    renderChips();
    writeToURL();
    const matched = cards.filter(matchCard).sort((a, b) => localizedCardName(a).localeCompare(localizedCardName(b)));
    renderResults(matched);
    updateCounts(matched);
  }

  // --- Input handling ---

  // Smart split: commas BETWEEN digits are preserved (1,500,000 CC stays whole).
  function smartSplit(raw) {
    // Temporarily protect numeric commas: 1,234 -> 1␟234
    const PROTECT = '\u241F'; // symbol for visual clarity if ever seen
    const protectedStr = raw.replace(/(\d),(?=\d)/g, `$1${PROTECT}`);
    // Split on commas that aren't part of numbers
    return protectedStr
      .split(',')
      .map((s) => s.replace(new RegExp(PROTECT, 'g'), ',').trim())
      .filter(Boolean);
  }

  function addFromInput() {
    const raw = hintInput.value.trim();
    if (!raw) return;
    const many = smartSplit(raw);
    many.forEach((h) => {
      // Reverse-map JP name to English for matching (selected always stores EN)
      const en = jpToEnHintMap.get(h) || h;
      if (!selected.includes(en)) selected.push(en);
    });
    hintInput.value = '';
    update();
  }

  // Bindings (safe even if optional buttons don't exist)
  addBtn.addEventListener('click', addFromInput);
  hintInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFromInput();
    }
  });
  [modeSelect, fSSR, fSR, fR].forEach((el) => el.addEventListener('change', update));
  clearBtn.addEventListener('click', () => {
    selected = [];
    update();
  });

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      writeToURL();
      try {
        await navigator.clipboard.writeText(location.href);
        copyLinkBtn.textContent = t('common.copied');
        setTimeout(() => (copyLinkBtn.textContent = t('hints.copyLink')), 1200);
      } catch {
        alert(t('common.copyFailed'));
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const matched = cards.filter(matchCard).map((c) => {
        const wanted = selected.map(norm);
        const matchedHints = c.hints.filter((h) => {
          const hN = norm(h);
          return wanted.length ? wanted.some((w) => hN.includes(w)) : true;
        });
        return { SupportName: c.name, Rarity: c.rarity, Hints: matchedHints };
      });
      const blob = new Blob([JSON.stringify(matched, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'support_hint_search.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Listen for server changes from nav
  window.addEventListener('umatools:server-change', (e) => {
    const next = (e?.detail?.server || 'en').toLowerCase();
    if (next !== currentServer) {
      currentServer = next;
      update();
    }
  });

  // Language change listener — re-render card names and datalist
  window.addEventListener('i18n:changed', () => {
    buildHintDatalist();
    update();
  });

  // Re-render when JP skill name map becomes available
  window.addEventListener('i18n:jpnames-ready', () => {
    buildHintDatalist();
    update();
  });

  // Init - readFromURL to load filters, update will be called after first chunk loads
  readFromURL();
})();
