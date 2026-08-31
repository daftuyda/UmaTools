(async function () {
  'use strict';

  // ── Constants ──
  const SUPPORT_URL = '/assets/support_hints.json';
  const SKILLS_URL = '/assets/skills_all.json';
  const STORAGE_KEY = 'umatools-collection';
  const SERVER_PREF_KEY = 'umatoolsServer';
  const SUPPORT_TYPES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend', 'Group'];
  const RARITY_ORDER = ['SSR', 'SR', 'R'];
  const LB_LABELS = ['LB0', 'LB1', 'LB2', 'LB3', 'MLB'];
  const LB_INDICES = { SSR: [6, 7, 8, 9, 10], SR: [5, 6, 7, 8, 9], R: [4, 5, 6, 7, 8] };
  const TOP_N = 5; // top decks per template
  const MAX_PER_TYPE = 15;

  const LB_UNLOCK_INDEX = { 0: 0, 1: 0, 5: 1, 10: 2, 15: 3, 20: 4, 25: 5, 30: 6, 35: 7, 40: 8, 45: 9, 50: 10 };

  function lbToEffectIndex(lbStop, rarity) {
    return (LB_INDICES[rarity] || LB_INDICES.SSR)[lbStop] ?? 10;
  }

  function uniqueActiveAtLb(card, lbStop) {
    if (!card.SupportUnique) return false;
    const rarity = card.SupportRarity || 'SSR';
    const cardIdx = lbToEffectIndex(lbStop, rarity);
    const unlockLv = card.SupportUnique.level || 0;
    const unlockIdx = LB_UNLOCK_INDEX[unlockLv] ?? 0;
    return cardIdx >= unlockIdx;
  }

  // ── Scenario Definitions ──
  const SCENARIOS = {
    mant: {
      name: 'MANT (Class 6)',
      constraints: { minRaceBonus: 50 },
      // Source: beta.uma.moe statistics dataset 2026-05-11,
      // scenario 4 (MANT), Team Stadium class 6.
      templates: [
        { id: 'mant-spd2-pow2-wit2', label: '2 Speed + 2 Power + 2 Wit', slots: { Speed: 2, Power: 2, Wit: 2 }, group: 'core' },
        { id: 'mant-spd2-pow1-wit3', label: '2 Speed + 1 Power + 3 Wit', slots: { Speed: 2, Power: 1, Wit: 3 }, group: 'core' },
        { id: 'mant-spd3-pow1-wit2', label: '3 Speed + 1 Power + 2 Wit', slots: { Speed: 3, Power: 1, Wit: 2 }, group: 'core' },
        { id: 'mant-spd3-wit3', label: '3 Speed + 3 Wit', slots: { Speed: 3, Wit: 3 }, group: 'core' },
        { id: 'mant-spd2-sta1-pow1-wit2', label: '2 Speed + 1 Stamina + 1 Power + 2 Wit', slots: { Speed: 2, Stamina: 1, Power: 1, Wit: 2 }, group: 'stamina' },
        { id: 'mant-spd2-sta2-wit2', label: '2 Speed + 2 Stamina + 2 Wit', slots: { Speed: 2, Stamina: 2, Wit: 2 }, group: 'stamina' },
        { id: 'mant-spd3-sta1-wit2', label: '3 Speed + 1 Stamina + 2 Wit', slots: { Speed: 3, Stamina: 1, Wit: 2 }, group: 'stamina' },
        { id: 'mant-spd1-guts3-wit2', label: '1 Speed + 3 Guts + 2 Wit', slots: { Speed: 1, Guts: 3, Wit: 2 }, group: 'guts' },
        { id: 'mant-spd2-guts2-wit2', label: '2 Speed + 2 Guts + 2 Wit', slots: { Speed: 2, Guts: 2, Wit: 2 }, group: 'guts' },
        { id: 'mant-spd2-pow1-wit2-friend1', label: '2 Speed + 1 Power + 2 Wit + 1 Friend', slots: { Speed: 2, Power: 1, Wit: 2, Friend: 1 }, group: 'friend' },
      ],
      scoringWeights: { raceBonus: 0.35, effectStacking: 0.25, skillAffinity: 0.25, hintOverlap: 0.15 },
    },
  };

  // ── Skill affinity maps ──
  const STYLE_MAP = { 1: 'front', 2: 'pace', 3: 'late', 4: 'end' };
  const DIST_MAP = { 1: 'short', 2: 'mile', 3: 'medium', 4: 'long' };

  // ── Elements ──
  const statusMsg = document.getElementById('statusMsg');
  const tabs = document.querySelectorAll('.co-tab');
  const panels = { collection: document.getElementById('panelCollection'), optimizer: document.getElementById('panelOptimizer') };
  const cardSearch = document.getElementById('cardSearch');
  const typeFiltersEl = document.getElementById('typeFilters');
  const rarityFiltersEl = document.getElementById('rarityFilters');
  const searchResults = document.getElementById('searchResults');
  const collectionGrid = document.getElementById('collectionGrid');
  const collectionEmpty = document.getElementById('collectionEmpty');
  const collectionCount = document.getElementById('collectionCount');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const clearCollectionBtn = document.getElementById('clearCollectionBtn');
  const ioModal = document.getElementById('importExportModal');
  const ioTextarea = document.getElementById('ioTextarea');
  const ioConfirmBtn = document.getElementById('ioConfirmBtn');
  const ioModalTitle = document.getElementById('ioModalTitle');
  const scenarioSelect = document.getElementById('scenarioSelect');
  const optimizeBtn = document.getElementById('optimizeBtn');
  const styleFilter = document.getElementById('styleFilter');
  const distanceFilter = document.getElementById('distanceFilter');
  const optimizeProgress = document.getElementById('optimizeProgress');
  const optimizeResults = document.getElementById('optimizeResults');

  // ── State ──
  let supports = [];
  let skillsIndex = null; // Map<skillId, {styles: Set, distances: Set}>
  let collection = []; // [{id, lb}]
  let currentServer = 'en';
  let filterTypes = new Set();
  let filterRarity = null;
  let filterSearch = '';
  let ioMode = null; // 'import' or 'export'

  // ── Data loading ──
  function showStatus(msg) { if (statusMsg) statusMsg.textContent = msg; }

  showStatus('Loading support card data...');

  try {
    currentServer = localStorage.getItem(SERVER_PREF_KEY) || 'en';
  } catch (e) {}

  try {
    const res = await fetch(SUPPORT_URL);
    if (!res.ok) throw new Error('Failed to load support data');
    supports = await res.json();
    showStatus('');
  } catch (err) {
    showStatus('Failed to load data. Please refresh.');
    console.error(err);
    return;
  }

  // Lazy-load skills for affinity scoring
  async function loadSkillsIndex() {
    if (skillsIndex) return skillsIndex;
    try {
      const res = await fetch(SKILLS_URL);
      if (!res.ok) return null;
      const data = await res.json();
      skillsIndex = new Map();
      for (const skill of data) {
        const entry = { styles: new Set(), distances: new Set() };
        for (const loc of ['en', 'jp']) {
          const groups = skill.loc?.[loc]?.condition_groups || [];
          for (const g of groups) {
            const cond = (g.condition || '') + ' ' + (g.precondition || '');
            const styleMatches = cond.match(/running_style[=<>!]+(\d)/g);
            if (styleMatches) {
              for (const m of styleMatches) {
                const code = m.match(/(\d)$/)?.[1];
                if (code && STYLE_MAP[code]) entry.styles.add(STYLE_MAP[code]);
              }
            }
            const distMatches = cond.match(/distance_type[=<>!]+(\d)/g);
            if (distMatches) {
              for (const m of distMatches) {
                const code = m.match(/(\d)$/)?.[1];
                if (code && DIST_MAP[code]) entry.distances.add(DIST_MAP[code]);
              }
            }
          }
        }
        // Also check skill type array for broad categorization
        const types = skill.type || [];
        const typeSet = new Set(types);
        if (typeSet.has('run')) entry.styles.add('front');
        if (typeSet.has('ldr')) entry.styles.add('pace');
        if (typeSet.has('cha')) { entry.styles.add('end'); entry.styles.add('late'); }
        if (typeSet.has('sho')) entry.distances.add('short');
        if (typeSet.has('mil')) entry.distances.add('mile');
        if (typeSet.has('med')) entry.distances.add('medium');
        if (typeSet.has('lng')) entry.distances.add('long');
        skillsIndex.set(String(skill.id), entry);
      }
      return skillsIndex;
    } catch {
      return null;
    }
  }

  // ── Collection persistence ──
  function loadCollection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) collection = JSON.parse(raw);
    } catch { collection = []; }
  }

  function saveCollection() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    } catch (e) {
      console.error('Failed to save collection', e);
    }
  }

  function addToCollection(supportId, lb) {
    if (collection.some(c => c.id === supportId)) return false;
    collection.push({ id: supportId, lb: lb ?? 4 });
    saveCollection();
    return true;
  }

  function removeFromCollection(supportId) {
    collection = collection.filter(c => c.id !== supportId);
    saveCollection();
  }

  function updateCollectionLb(supportId, lb) {
    const entry = collection.find(c => c.id === supportId);
    if (entry) { entry.lb = lb; saveCollection(); }
  }

  function isInCollection(supportId) {
    return collection.some(c => c.id === supportId);
  }

  function getCollectionCards() {
    const idMap = new Map(supports.map(s => [s.SupportId, s]));
    return collection.map(c => {
      const card = idMap.get(c.id);
      return card ? { ...card, _lb: c.lb } : null;
    }).filter(Boolean);
  }

  // ── Helpers ──
  function getCardName(card) {
    if (currentServer === 'jp' && card.SupportNameJP) return card.SupportNameJP;
    return card.SupportName || card.SupportSlug || '';
  }

  function getCardThumb(card) {
    return '/assets/support_thumbs/' + (card.SupportSlug || '').replace(/[^a-zA-Z0-9_-]/g, '') + '.webp';
  }

  function getEffectValue(card, effectName, lbStop) {
    const rarity = card.SupportRarity || 'SSR';
    const idx = lbToEffectIndex(lbStop, rarity);
    const eff = (card.SupportEffects || []).find(e => e.name === effectName);
    return eff?.values?.[idx] ?? 0;
  }

  function getCardRaceBonus(card, lbStop) {
    let rb = getEffectValue(card, 'Race Bonus', lbStop);
    if (uniqueActiveAtLb(card, lbStop) && card.SupportUnique) {
      for (const u of card.SupportUnique.effects) {
        if (u.name === 'Race Bonus') rb += u.value;
      }
    }
    return rb;
  }

  function getBaseCharName(card) {
    // Strip rarity suffix like " (SSR)", " (SR)", " (R)" to get character name
    const name = card.SupportName || card.SupportSlug || '';
    return name.replace(/\s*\((SSR|SR|R)\)\s*$/, '').trim().toLowerCase();
  }

  function typeClass(type) {
    return 'type-' + (type || '').toLowerCase();
  }

  // ── Tab switching ──
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => p.classList.remove('active'));
      const target = panels[tab.dataset.tab];
      if (target) target.classList.add('active');
    });
  });

  // ── Filter UI ──
  function renderFilters() {
    typeFiltersEl.innerHTML = '';
    for (const type of SUPPORT_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'co-filter-btn' + (filterTypes.has(type) ? ' active' : '');
      btn.textContent = type;
      btn.addEventListener('click', () => {
        if (filterTypes.has(type)) filterTypes.delete(type);
        else filterTypes.add(type);
        btn.classList.toggle('active');
        renderSearchResults();
      });
      typeFiltersEl.appendChild(btn);
    }

    rarityFiltersEl.innerHTML = '';
    for (const r of RARITY_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'co-filter-btn' + (filterRarity === r ? ' active' : '');
      btn.textContent = r;
      btn.addEventListener('click', () => {
        filterRarity = filterRarity === r ? null : r;
        renderFilters();
        renderSearchResults();
      });
      rarityFiltersEl.appendChild(btn);
    }
  }

  // ── Search results ──
  function getFilteredSupports() {
    let list = supports;
    if (currentServer !== 'jp') {
      list = list.filter(s => s.SupportServer === 'global');
    }
    if (filterTypes.size > 0) {
      list = list.filter(s => filterTypes.has(s.SupportType));
    }
    if (filterRarity) {
      list = list.filter(s => s.SupportRarity === filterRarity);
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter(s => {
        const name = getCardName(s).toLowerCase();
        return name.includes(q);
      });
    }
    list.sort((a, b) => (a.SupportId || '').localeCompare(b.SupportId || '', undefined, { numeric: true }));
    return list;
  }

  function renderSearchResults() {
    if (!filterSearch && filterTypes.size === 0 && !filterRarity) {
      searchResults.hidden = true;
      searchResults.innerHTML = '';
      return;
    }

    const filtered = getFilteredSupports().slice(0, 50);
    searchResults.hidden = false;
    searchResults.innerHTML = '';

    for (const card of filtered) {
      searchResults.appendChild(createCardEl(card, 'search'));
    }

    if (filtered.length === 0) {
      searchResults.innerHTML = '<div class="co-empty">No cards match your search.</div>';
    }
  }

  function createCardEl(card, mode) {
    const el = document.createElement('div');
    el.className = 'co-card';

    const inColl = isInCollection(card.SupportId);
    const lb = mode === 'collection' ? (collection.find(c => c.id === card.SupportId)?.lb ?? 4) : 4;
    const raceBonus = getCardRaceBonus(card, lb);

    const imgSrc = card.SupportImage || '';
    const imgHtml = imgSrc
      ? `<img class="co-card-thumb" src="${imgSrc}" alt="" loading="lazy">`
      : '';

    el.innerHTML = `
      ${imgHtml}
      <div class="co-card-info">
        <div class="co-card-name" title="${getCardName(card)}">${getCardName(card)}</div>
        <div class="co-card-meta">
          <span class="co-type-badge ${typeClass(card.SupportType)}">${card.SupportType}</span>
          <span class="co-rarity-badge">${card.SupportRarity || 'SSR'}</span>
          ${raceBonus > 0 ? `<span class="co-card-effect">RB: ${raceBonus}%</span>` : ''}
        </div>
        ${mode === 'collection' ? `
          <div class="co-card-meta" style="margin-top:0.2rem">
            <select class="co-lb-select" data-id="${card.SupportId}">
              ${LB_LABELS.map((l, i) => `<option value="${i}" ${i === lb ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </div>
        ` : ''}
      </div>
      <div class="co-card-actions">
        ${mode === 'search' ? (
          inColl
            ? '<span class="co-added-badge">Added</span>'
            : `<button class="co-add-btn" data-id="${card.SupportId}" title="Add to collection">+</button>`
        ) : `<button class="co-remove-btn" data-id="${card.SupportId}" title="Remove">&times;</button>`}
      </div>
    `;

    // Event: add
    const addBtn = el.querySelector('.co-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        addToCollection(card.SupportId, 4);
        renderSearchResults();
        renderCollection();
      });
    }

    // Event: remove
    const removeBtn = el.querySelector('.co-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        removeFromCollection(card.SupportId);
        renderSearchResults();
        renderCollection();
      });
    }

    // Event: LB change
    const lbSelect = el.querySelector('.co-lb-select');
    if (lbSelect) {
      lbSelect.addEventListener('change', () => {
        const newLb = parseInt(lbSelect.value);
        updateCollectionLb(card.SupportId, newLb);
        // Update displayed RB (includes unique effects)
        const newRb = getCardRaceBonus(card, newLb);
        const effEl = el.querySelector('.co-card-effect');
        if (effEl) effEl.textContent = newRb > 0 ? `RB: ${newRb}%` : '';
      });
    }

    return el;
  }

  // ── Collection display ──
  function renderCollection() {
    const cards = getCollectionCards();
    collectionCount.textContent = cards.length + ' card' + (cards.length !== 1 ? 's' : '');
    collectionGrid.innerHTML = '';
    collectionEmpty.hidden = cards.length > 0;

    // Group by type
    const byType = new Map();
    for (const type of SUPPORT_TYPES) byType.set(type, []);
    for (const card of cards) {
      const arr = byType.get(card.SupportType) || [];
      arr.push(card);
      byType.set(card.SupportType, arr);
    }

    for (const [type, typeCards] of byType) {
      if (typeCards.length === 0) continue;
      typeCards.sort((a, b) => (a.SupportId || '').localeCompare(b.SupportId || '', undefined, { numeric: true }));
      for (const card of typeCards) {
        collectionGrid.appendChild(createCardEl(card, 'collection'));
      }
    }
  }

  // ── Import/Export ──
  function openModal(mode) {
    ioMode = mode;
    ioModal.hidden = false;
    if (mode === 'export') {
      ioModalTitle.textContent = 'Export Collection';
      ioTextarea.value = JSON.stringify(collection, null, 2);
      ioTextarea.readOnly = true;
      ioConfirmBtn.textContent = 'Copy';
    } else {
      ioModalTitle.textContent = 'Import Collection';
      ioTextarea.value = '';
      ioTextarea.readOnly = false;
      ioConfirmBtn.textContent = 'Import';
    }
  }

  function closeModal() {
    ioModal.hidden = true;
    ioMode = null;
  }

  importBtn.addEventListener('click', () => openModal('import'));
  exportBtn.addEventListener('click', () => openModal('export'));

  ioModal.querySelector('.support-modal-backdrop').addEventListener('click', closeModal);
  ioModal.querySelector('.support-modal-close').addEventListener('click', closeModal);

  ioConfirmBtn.addEventListener('click', () => {
    if (ioMode === 'export') {
      navigator.clipboard.writeText(ioTextarea.value).catch(() => {});
      ioConfirmBtn.textContent = 'Copied!';
      setTimeout(() => { ioConfirmBtn.textContent = 'Copy'; }, 1200);
      return;
    }

    // Import
    try {
      const data = JSON.parse(ioTextarea.value);
      if (!Array.isArray(data)) throw new Error('Expected array');
      const validIds = new Set(supports.map(s => s.SupportId));
      const valid = data.filter(c => c && c.id && validIds.has(c.id)).map(c => ({
        id: c.id,
        lb: typeof c.lb === 'number' ? Math.min(4, Math.max(0, c.lb)) : 4,
      }));
      // Merge: don't duplicate
      const existing = new Set(collection.map(c => c.id));
      let added = 0;
      for (const entry of valid) {
        if (!existing.has(entry.id)) {
          collection.push(entry);
          existing.add(entry.id);
          added++;
        }
      }
      saveCollection();
      renderCollection();
      renderSearchResults();
      closeModal();
      showStatus(`Imported ${added} new card${added !== 1 ? 's' : ''}.`);
      setTimeout(() => showStatus(''), 3000);
    } catch (err) {
      showStatus('Invalid JSON format. Expected: [{id: "...", lb: 4}, ...]');
      setTimeout(() => showStatus(''), 5000);
    }
  });

  clearCollectionBtn.addEventListener('click', () => {
    if (!confirm('Clear your entire collection?')) return;
    collection = [];
    saveCollection();
    renderCollection();
    renderSearchResults();
  });

  // ── Search input ──
  let searchTimeout = null;
  cardSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterSearch = cardSearch.value.trim();
      renderSearchResults();
    }, 200);
  });

  // ── Server change listener ──
  window.addEventListener('umatools:server-change', (e) => {
    currentServer = e.detail?.server || 'en';
    renderSearchResults();
    renderCollection();
  });

  // ═══════════════════════════════════════════════
  //  OPTIMIZER ENGINE
  // ═══════════════════════════════════════════════

  // ── Scoring functions ──
  function calcDeckEffects(cards) {
    const totals = {};
    for (const card of cards) {
      const rarity = card.SupportRarity || 'SSR';
      const lb = card._lb ?? 4;
      const idx = lbToEffectIndex(lb, rarity);
      for (const eff of card.SupportEffects || []) {
        const val = eff.values?.[idx] ?? 0;
        if (val !== 0) totals[eff.name] = (totals[eff.name] || 0) + val;
      }
      // Include unique effects if unlocked at this LB
      if (uniqueActiveAtLb(card, lb) && card.SupportUnique) {
        for (const u of card.SupportUnique.effects) {
          totals[u.name] = (totals[u.name] || 0) + u.value;
        }
      }
    }
    return totals;
  }

  function scoreRaceBonus(totals, target) {
    const rb = totals['Race Bonus'] || 0;
    if (rb < target) return Math.max(0, (rb / target) * 80);
    // Meeting target = 80, more RB is still good but with diminishing returns
    const over = rb - target;
    return 80 + Math.min(20, over * 0.5);
  }

  function scoreEffects(totals) {
    let score = 0;
    const fb = totals['Fan Bonus'] || 0;
    if (fb >= 30) score += 35; else if (fb >= 15) score += 20; else if (fb >= 5) score += 10;
    const frb = totals['Friendship Bonus'] || 0;
    if (frb >= 30) score += 25; else if (frb >= 15) score += 15;
    const sp = totals['Skill Point Bonus'] || 0;
    if (sp >= 2) score += 20; else if (sp >= 1) score += 10;
    // Initials are a minor bonus
    const initials = ['Initial Speed', 'Initial Stamina', 'Initial Power', 'Initial Guts', 'Initial Wit'];
    score += Math.min(5, initials.filter(n => totals[n] > 0).length);
    return Math.min(100, score);
  }

  function scoreSkillAffinity(cards, targetStyle, targetDist, sIndex) {
    if (!sIndex) return 50; // neutral if no skill data
    let matchCount = 0;
    let totalHints = 0;

    for (const card of cards) {
      for (const h of card.SupportHints || []) {
        if (!h.SkillId) continue;
        totalHints++;
        const entry = sIndex.get(String(h.SkillId));
        if (!entry) continue;
        if (targetStyle && targetStyle !== 'all' && entry.styles.has(targetStyle)) matchCount++;
        if (targetDist && targetDist !== 'all' && entry.distances.has(targetDist)) matchCount++;
      }
    }

    if (totalHints === 0) return 50;
    const ratio = matchCount / totalHints;
    return Math.min(100, Math.round(ratio * 200)); // scale so ~50% match = 100
  }

  function scoreHintOverlap(cards) {
    const hintCounts = new Map();
    let totalHints = 0;

    for (const card of cards) {
      for (const h of card.SupportHints || []) {
        if (!h.Name || !h.SkillId) continue;
        totalHints++;
        hintCounts.set(h.SkillId, (hintCounts.get(h.SkillId) || 0) + 1);
      }
    }

    const shared = [...hintCounts.values()].filter(c => c > 1).length;
    let score = 0;
    if (shared >= 8) score += 60;
    else if (shared >= 5) score += 45;
    else if (shared >= 3) score += 30;
    else if (shared >= 1) score += 15;
    if (totalHints >= 25) score += 40;
    else if (totalHints >= 18) score += 30;
    else if (totalHints >= 12) score += 20;
    else if (totalHints >= 6) score += 10;
    return Math.min(100, score);
  }

  // SSR cards give access to gold skills which are strictly better
  const RARITY_BONUS = { SSR: 5, SR: 0, R: -3 };

  function scoreDeck(cards, scenario, targetStyle, targetDist, sIndex) {
    const totals = calcDeckEffects(cards);
    const w = scenario.scoringWeights;

    const rbScore = scoreRaceBonus(totals, scenario.constraints.minRaceBonus);
    const effScore = scoreEffects(totals);
    const affScore = scoreSkillAffinity(cards, targetStyle, targetDist, sIndex);
    const hintScore = scoreHintOverlap(cards);

    let total = Math.round(
      rbScore * w.raceBonus +
      effScore * w.effectStacking +
      affScore * w.skillAffinity +
      hintScore * w.hintOverlap
    );

    // Rarity bonus: SSR preferred for gold skill access
    for (const card of cards) {
      total += RARITY_BONUS[card.SupportRarity] || 0;
    }

    const rb = totals['Race Bonus'] || 0;

    const grade = total >= 85 ? 'S' : total >= 70 ? 'A' : total >= 55 ? 'B' : total >= 40 ? 'C' : total >= 25 ? 'D' : 'F';

    return { total, grade, raceBonus: rb, rbScore, effScore, affScore, hintScore, totals };
  }

  // ── Combination generator ──
  function* combinations(arr, k) {
    if (k === 0) { yield []; return; }
    if (arr.length < k) return;
    for (let i = 0; i <= arr.length - k; i++) {
      for (const rest of combinations(arr.slice(i + 1), k - 1)) {
        yield [arr[i], ...rest];
      }
    }
  }

  function* cartesianProduct(arrays, idx = 0, current = []) {
    if (idx === arrays.length) { yield [...current]; return; }
    for (const item of arrays[idx]) {
      current.push(item);
      yield* cartesianProduct(arrays, idx + 1, current);
      current.pop();
    }
  }

  // ── Pre-filter: keep top cards per type by Race Bonus (with uniques) + hint count ──
  function prefilterCards(cards, type, maxPerType) {
    const ofType = cards.filter(c => c.SupportType === type);
    if (ofType.length <= maxPerType) return ofType;

    const scored = ofType.map(c => {
      const rb = getCardRaceBonus(c, c._lb ?? 4);
      const hints = (c.SupportHints || []).length;
      return { card: c, score: rb * 3 + hints };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxPerType).map(s => s.card);
  }

  // ── Skill categorization (mirrors deck.js) ──
  const HINT_CATEGORIES = {
    sprint: { label: 'Short', order: 0 },
    mile: { label: 'Mile', order: 1 },
    medium: { label: 'Medium', order: 2 },
    long: { label: 'Long', order: 3 },
    front: { label: 'Front', order: 4 },
    pace: { label: 'Pace', order: 5 },
    late: { label: 'Late', order: 6 },
    end: { label: 'End', order: 7 },
    corner: { label: 'Corner', order: 8 },
    straight: { label: 'Straight', order: 9 },
    debuff: { label: 'Debuff', order: 10 },
    general: { label: 'General', order: 11 },
  };

  function categorizeHint(skillId, sIndex) {
    const entry = sIndex?.get(String(skillId));
    if (!entry) return 'general';
    // Distance first
    if (entry.distances.has('short')) return 'sprint';
    if (entry.distances.has('mile')) return 'mile';
    if (entry.distances.has('medium')) return 'medium';
    if (entry.distances.has('long')) return 'long';
    // Style
    if (entry.styles.has('front')) return 'front';
    if (entry.styles.has('pace')) return 'pace';
    if (entry.styles.has('late')) return 'late';
    if (entry.styles.has('end')) return 'end';
    return 'general';
  }

  // ── Collect all hints from a deck, categorized ──
  function getDeckHints(cards, sIndex) {
    const hintMap = new Map(); // skillId -> {name, count, category}
    for (const card of cards) {
      for (const h of card.SupportHints || []) {
        if (!h.Name || !h.SkillId) continue;
        const existing = hintMap.get(h.SkillId);
        if (existing) {
          existing.count++;
        } else {
          hintMap.set(h.SkillId, {
            name: h.Name,
            count: 1,
            category: categorizeHint(h.SkillId, sIndex),
          });
        }
      }
    }

    // Group by category
    const grouped = new Map();
    for (const hint of hintMap.values()) {
      if (!grouped.has(hint.category)) grouped.set(hint.category, []);
      grouped.get(hint.category).push(hint);
    }

    // Sort categories by order, hints within by count desc then name
    const sorted = [...grouped.entries()]
      .sort((a, b) => (HINT_CATEGORIES[a[0]]?.order ?? 99) - (HINT_CATEGORIES[b[0]]?.order ?? 99));

    for (const [, hints] of sorted) {
      hints.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }

    const totalHints = hintMap.size;
    const sharedCount = [...hintMap.values()].filter(h => h.count > 1).length;

    return { grouped: sorted, totalHints, sharedCount };
  }

  // ── Main optimizer ──
  async function runOptimizer() {
    const scenarioKey = scenarioSelect.value;
    const scenario = SCENARIOS[scenarioKey];
    if (!scenario) return;

    const targetStyle = styleFilter.value;
    const targetDist = distanceFilter.value;

    const collCards = getCollectionCards();
    if (collCards.length < 6) {
      optimizeResults.innerHTML = '<div class="co-result-empty">Add at least 6 cards to your collection to optimize.</div>';
      return;
    }

    // Load skills index for affinity scoring
    const sIndex = await loadSkillsIndex();

    optimizeBtn.disabled = true;
    optimizeProgress.hidden = false;
    optimizeResults.innerHTML = '';

    const progressFill = optimizeProgress.querySelector('.co-progress-fill');
    const progressLabel = optimizeProgress.querySelector('.co-progress-label');

    const results = []; // {template, decks: [{cards, score}]}

    let templateIdx = 0;
    const totalTemplates = scenario.templates.length;

    for (const template of scenario.templates) {
      templateIdx++;
      progressLabel.textContent = `Template ${templateIdx}/${totalTemplates}: ${template.label}`;
      progressFill.style.width = ((templateIdx / totalTemplates) * 100) + '%';

      const typeSlots = Object.entries(template.slots);

      // Check if we have enough cards per type
      let canBuild = true;
      for (const [type, count] of typeSlots) {
        const available = collCards.filter(c => c.SupportType === type).length;
        if (available < count) { canBuild = false; break; }
      }
      // Check flex slot availability
      if (canBuild && template.flex) {
        const flexAvailable = collCards.filter(c => template.flex.types.includes(c.SupportType)).length;
        if (flexAvailable < template.flex.count) canBuild = false;
      }

      if (!canBuild) {
        results.push({ template, decks: [], skip: true });
        continue;
      }

      // Pre-filter per type
      const combosPerType = typeSlots.map(([type, count]) => {
        const filtered = prefilterCards(collCards, type, MAX_PER_TYPE);
        return [...combinations(filtered, count)];
      });

      // Add flex slot: merge cards from all flex types into one pool
      if (template.flex) {
        const flexPool = [];
        for (const ft of template.flex.types) {
          flexPool.push(...prefilterCards(collCards, ft, MAX_PER_TYPE));
        }
        combosPerType.push([...combinations(flexPool, template.flex.count)]);
      }

      // Score all deck combinations, keeping top N
      const topDecks = [];
      let evalCount = 0;

      for (const combo of cartesianProduct(combosPerType)) {
        const deck = combo.flat();

        // Prevent duplicate cards or same character in the same deck
        const ids = new Set(deck.map(c => c.SupportId));
        if (ids.size < deck.length) continue;
        const charNames = new Set(deck.map(c => getBaseCharName(c)));
        if (charNames.size < deck.length) continue;

        const score = scoreDeck(deck, scenario, targetStyle, targetDist, sIndex);
        evalCount++;

        if (topDecks.length < TOP_N) {
          topDecks.push({ cards: deck, score });
          topDecks.sort((a, b) => b.score.total - a.score.total);
        } else if (score.total > topDecks[topDecks.length - 1].score.total) {
          topDecks[topDecks.length - 1] = { cards: deck, score };
          topDecks.sort((a, b) => b.score.total - a.score.total);
        }

        // Yield to UI every 2000 evals
        if (evalCount % 2000 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      results.push({ template, decks: topDecks });
    }

    // Render results
    renderResults(results, scenario, sIndex);

    optimizeBtn.disabled = false;
    optimizeProgress.hidden = true;
  }

  const GROUP_LABELS = {
    core: 'MANT Core',
    stamina: 'Stamina Variants',
    guts: 'Guts Decks',
    friend: 'Friend Decks',
    standard: 'Standard Decks',
  };

  function renderResults(results, scenario, sIndex) {
    optimizeResults.innerHTML = '';

    // Group results by template group
    const grouped = new Map();
    for (const r of results) {
      const g = r.template.group || 'other';
      if (!grouped.has(g)) grouped.set(g, []);
      grouped.get(g).push(r);
    }

    let isFirst = true;
    for (const [groupKey, groupResults] of grouped) {
      const section = document.createElement('div');
      section.className = 'co-result-section';

      const sectionHeader = document.createElement('button');
      sectionHeader.className = 'co-section-toggle' + (isFirst ? ' open' : '');
      sectionHeader.innerHTML = `<span class="co-section-arrow">&#9654;</span> ${GROUP_LABELS[groupKey] || groupKey}`;
      sectionHeader.addEventListener('click', () => {
        sectionHeader.classList.toggle('open');
        sectionBody.hidden = !sectionBody.hidden;
      });

      const sectionBody = document.createElement('div');
      sectionBody.className = 'co-section-body';
      sectionBody.hidden = !isFirst;

      for (const { template, decks, skip } of groupResults) {
        const group = document.createElement('div');
        group.className = 'co-result-group';

        const header = document.createElement('div');
        header.className = 'co-result-header';
        header.innerHTML = `<span class="co-template-label">${template.label}</span>`;

        if (skip) {
          header.innerHTML += '<span style="font-size:0.72rem;color:var(--muted)">Not enough cards</span>';
        }

        group.appendChild(header);

        if (skip || decks.length === 0) {
          if (!skip) {
            const empty = document.createElement('div');
            empty.className = 'co-result-empty';
            empty.textContent = 'No valid decks found.';
            group.appendChild(empty);
          }
          sectionBody.appendChild(group);
          continue;
        }

      for (let i = 0; i < decks.length; i++) {
        const { cards, score } = decks[i];
        const row = document.createElement('div');
        row.className = 'co-result-deck';

        // Cards grouped by type in template slot order
        const cardsEl = document.createElement('div');
        cardsEl.className = 'co-result-cards-grouped';
        cardsEl.innerHTML = `<span class="co-result-rank">#${i + 1}</span>`;

        // Group cards by type, preserving template slot order + flex types
        const typeOrder = Object.keys(template.slots);
        const flexTypes = template.flex ? template.flex.types : [];
        const byType = new Map();
        for (const card of cards) {
          const t = card.SupportType;
          if (!byType.has(t)) byType.set(t, []);
          byType.get(t).push(card);
        }

        // Show fixed slot types first, then any remaining (flex cards)
        const shownTypes = new Set(typeOrder);
        const allTypes = [...typeOrder];
        for (const t of flexTypes) {
          if (!shownTypes.has(t) && byType.has(t)) { allTypes.push(t); shownTypes.add(t); }
        }
        // Catch any other types just in case
        for (const t of byType.keys()) {
          if (!shownTypes.has(t)) { allTypes.push(t); shownTypes.add(t); }
        }

        for (const type of allTypes) {
          const typeCards = byType.get(type);
          if (!typeCards || typeCards.length === 0) continue;
          const typeRow = document.createElement('div');
          typeRow.className = 'co-result-type-row';
          for (const card of typeCards) {
            const pill = document.createElement('span');
            pill.className = 'co-result-card-pill';
            const thumbSrc = card.SupportImage || '';
            const thumbHtml = thumbSrc
              ? `<img class="co-result-thumb" src="${thumbSrc}" alt="" loading="lazy">`
              : '';
            const lbLabel = LB_LABELS[card._lb ?? 4];
            pill.innerHTML = `${thumbHtml}<span class="co-type-dot ${typeClass(card.SupportType)}"></span><span class="co-pill-name">${getCardName(card)}</span><span class="co-pill-lb">${lbLabel}</span>`;
            typeRow.appendChild(pill);
          }
          cardsEl.appendChild(typeRow);
        }

        // Grade + score header
        const headerEl = document.createElement('div');
        headerEl.className = 'co-score-header';
        headerEl.innerHTML = `<span class="co-grade co-grade-${score.grade.toLowerCase()}">${score.grade}</span><span class="co-score-total">${score.total}</span>`;

        // Deck effect stats grid
        const rbClass = score.raceBonus >= scenario.constraints.minRaceBonus ? 'good' : score.raceBonus >= scenario.constraints.minRaceBonus * 0.8 ? 'warn' : 'bad';
        const eff = score.totals;
        const initTotal = (eff['Initial Speed'] || 0) + (eff['Initial Stamina'] || 0) +
          (eff['Initial Power'] || 0) + (eff['Initial Guts'] || 0) + (eff['Initial Wit'] || 0);
        const statsEl = document.createElement('div');
        statsEl.className = 'co-stats-grid';
        statsEl.innerHTML = `
          <span class="co-stat"><span class="co-stat-label">Race Bonus</span><span class="co-stat-value ${rbClass}">${score.raceBonus}%</span></span>
          <span class="co-stat"><span class="co-stat-label">Fan Bonus</span><span class="co-stat-value">${eff['Fan Bonus'] || 0}%</span></span>
          <span class="co-stat"><span class="co-stat-label">Initials</span><span class="co-stat-value">${initTotal > 0 ? '+' + initTotal : '0'}</span></span>
        `;

        const scoresEl = document.createElement('div');
        scoresEl.className = 'co-result-scores';
        scoresEl.appendChild(headerEl);
        scoresEl.appendChild(statsEl);

        // Right side: scores, hints, button
        const rightEl = document.createElement('div');
        rightEl.className = 'co-result-right';

        rightEl.appendChild(scoresEl);

        // Categorized skill hints
        const { grouped: hintGroups, totalHints, sharedCount } = getDeckHints(cards, sIndex);
        if (totalHints > 0) {
          const hintsEl = document.createElement('div');
          hintsEl.className = 'co-hints-section';

          const hintHeader = document.createElement('div');
          hintHeader.className = 'co-hints-header';
          hintHeader.innerHTML = `<span>${totalHints} hints</span>${sharedCount > 0 ? `<span class="co-hints-synergy">${sharedCount} synergy</span>` : ''}`;
          hintsEl.appendChild(hintHeader);

          for (const [category, hints] of hintGroups) {
            const catEl = document.createElement('div');
            catEl.className = 'co-hint-category';
            const catLabel = HINT_CATEGORIES[category]?.label || category;
            catEl.innerHTML = `<span class="co-hint-cat-label">${catLabel}</span>`;
            const tagsEl = document.createElement('span');
            tagsEl.className = 'co-hint-cat-tags';
            for (const h of hints) {
              const tag = document.createElement('span');
              tag.className = 'co-skill-tag' + (h.count > 1 ? ' synergy' : '');
              tag.textContent = h.name + (h.count > 1 ? ' x' + h.count : '');
              tagsEl.appendChild(tag);
            }
            catEl.appendChild(tagsEl);
            hintsEl.appendChild(catEl);
          }

          rightEl.appendChild(hintsEl);
        }

        // Open in Deck Builder button
        const openBtn = document.createElement('button');
        openBtn.className = 'btn btn-sm co-open-deck-btn';
        openBtn.textContent = 'Open in Deck Builder';
        openBtn.addEventListener('click', () => {
          const deckData = {
            char: null,
            stars: 5,
            supports: cards.map(c => c.SupportSlug),
            lbs: cards.map(c => c._lb ?? 4),
          };
          try {
            localStorage.setItem('umatools-deck', JSON.stringify(deckData));
          } catch {}
          window.location.href = '/deck';
        });
        rightEl.appendChild(openBtn);

        row.appendChild(cardsEl);
        row.appendChild(rightEl);

        group.appendChild(row);
      }

        sectionBody.appendChild(group);
      }

      section.appendChild(sectionHeader);
      section.appendChild(sectionBody);
      optimizeResults.appendChild(section);
      isFirst = false;
    }

    if (results.every(r => r.skip)) {
      optimizeResults.innerHTML = '<div class="co-result-empty">Your collection doesn\'t have enough cards for any template. Add more cards!</div>';
    }
  }

  optimizeBtn.addEventListener('click', runOptimizer);

  // ── Init ──
  loadCollection();
  renderFilters();
  renderCollection();
})();
