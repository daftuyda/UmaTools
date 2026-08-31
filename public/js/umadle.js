const _t = (k, v) => (typeof window.t === 'function' ? window.t(k, v) : k);

const DATA_URL = '/assets/uma_data.json';

const STAT_KEYS = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
const GRADE_ORDER = { S: 7, A: 6, B: 5, C: 4, D: 3, E: 2, F: 1, G: 0 };
const SERVER_PREF_KEY = 'umatoolsServer';

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;
  return n;
};

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function initialsOf(name) {
  const parts = String(name || '?')
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return (parts[0].slice(0, 2) || parts[0][0] || '?').toUpperCase();
  return '?';
}

function pickBaseStats(uma) {
  const obj = uma && uma.UmaBaseStats;
  if (!obj || typeof obj !== 'object') return null;
  const keys = Object.keys(obj);
  return keys.length ? obj[keys[0]] : null;
}

function cmpNumDir(guess, target) {
  if (guess == null || target == null) return null;
  const g = +guess,
    t = +target;
  if (Number.isNaN(g) || Number.isNaN(t)) return null;
  if (g === t) return 0;
  return g < t ? 1 : -1;
}
function gradeVal(ch) {
  return GRADE_ORDER[String(ch || '').toUpperCase()] ?? null;
}
function cmpGradeDir(guess, target) {
  const g = gradeVal(guess),
    t = gradeVal(target);
  if (g == null || t == null) return null;
  if (g === t) return 0;
  return g < t ? 1 : -1;
}
function sym(c) {
  return c === 0 ? '\u2713' : c > 0 ? '\u25B2' : '\u25BC';
}
function cls(c) {
  return c === 0 ? 'match' : c > 0 ? 'up' : 'down';
}

function buildLabel(u) {
  const loc = typeof getLocalizedUmaName === 'function' ? getLocalizedUmaName(u) : { name: u.UmaName || '', nickname: u.UmaNickname || '' };
  return loc.nickname ? `${loc.name} \u2014 ${loc.nickname}` : loc.name;
}

function buildLabelEN(u) {
  return u.UmaNickname ? `${u.UmaName} \u2014 ${u.UmaNickname}` : u.UmaName;
}

function buildLabelJP(u) {
  const name = u.UmaNameJP || u.UmaName || '';
  const nick = u.UmaNicknameJP || u.UmaNickname || '';
  return nick ? `${name} \u2014 ${nick}` : name;
}

function buildGuessThumb(uma) {
  const wrap = el('div', 'guess-thumb');
  const imgUrl = uma?.UmaImage || uma?.UmaImageLocal || uma?.UmaThumb || uma?.Thumb || '';
  if (imgUrl) {
    const img = el('img');
    img.src = imgUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    wrap.append(img);
    wrap.classList.add('has-img');
  } else {
    wrap.append(el('span', 'guess-initials', initialsOf(uma?.UmaName || '?')));
  }
  return wrap;
}

function cellLine(labelText, valueText, cmpVal) {
  const cell = el('div', `cell ${cls(cmpVal)}`);
  const k = el('span', 'k', `${labelText}: ${valueText}`);
  const s = el('span', `sym ${cls(cmpVal)}`, sym(cmpVal));
  cell.append(k, s);
  return cell;
}

function renderGuess(rowsWrap, g, target) {
  const card = el('div', 'row card');
  const details = document.createElement('details');
  details.className = 'guess-details';
  const summary = document.createElement('summary');
  summary.className = 'guess-summary';

  const titleWrap = el('div', 'guess-summary-title');
  const textWrap = el('div', 'guess-summary-text');
  const gLoc = typeof getLocalizedUmaName === 'function' ? getLocalizedUmaName(g) : { name: g.UmaName || '', nickname: g.UmaNickname || '' };
  textWrap.append(el('div', 'uma-name', gLoc.name || 'Unknown'));
  if (gLoc.nickname) textWrap.append(el('div', 'uma-nick muted', `(${gLoc.nickname})`));
  titleWrap.append(buildGuessThumb(g), textWrap);
  const meta = el('div', 'guess-summary-meta', 'View details');
  summary.append(titleWrap, meta);
  details.append(summary);

  details.addEventListener('toggle', () => {
    if (details.dataset.autoToggle === 'true') {
      delete details.dataset.autoToggle;
      return;
    }
    details.dataset.pinned = details.open ? 'true' : '';
  });

  // Base Stats
  const baseG = pickBaseStats(g) || {};
  const baseT = pickBaseStats(target) || {};
  const baseWrap = el('div', 'section');
  baseWrap.append(el('div', 'section-title', 'Base stats'));
  const baseRow = el('div', 'group');
  STAT_KEYS.forEach((k) => {
    const cmp = cmpNumDir(baseG[k], baseT[k]);
    baseRow.append(cellLine(k, baseG[k] ?? '\u2013', cmp));
  });
  baseWrap.append(baseRow);

  // Stat Bonuses
  const bonusWrap = el('div', 'section');
  bonusWrap.append(el('div', 'section-title', 'Stat bonuses'));
  const bonusRow = el('div', 'group');
  STAT_KEYS.forEach((k) => {
    const gV = (g.UmaStatBonuses || {})[k];
    const tV = (target.UmaStatBonuses || {})[k];
    const cmp = cmpNumDir(
      typeof gV === 'number' ? gV : parseInt(gV),
      typeof tV === 'number' ? tV : parseInt(tV)
    );
    const show = gV == null ? '\u2013' : `${gV}%`;
    bonusRow.append(cellLine(k, show, cmp));
  });
  bonusWrap.append(bonusRow);

  // Aptitudes
  const aptWrap = el('div', 'section');
  aptWrap.append(el('div', 'section-title', 'Aptitudes'));
  const aptG = g.UmaAptitudes || {};
  const aptT = target.UmaAptitudes || {};

  const addAptRow = (title, keys, groupKey) => {
    aptWrap.append(el('div', 'group-title', title));
    const row = el('div', 'group');
    keys.forEach((k) => {
      const gv = aptG?.[groupKey]?.[k];
      const tv = aptT?.[groupKey]?.[k];
      const cmp = cmpGradeDir(gv, tv);
      row.append(cellLine(k, gv ?? '\u2013', cmp));
    });
    aptWrap.append(row);
  };

  addAptRow('Surface', ['Turf', 'Dirt'], 'Surface');
  addAptRow('Distance', ['Short', 'Mile', 'Medium', 'Long'], 'Distance');
  addAptRow('Strategy', ['Front', 'Pace', 'Late', 'End'], 'Strategy');

  details.append(baseWrap, bonusWrap, aptWrap);
  card.append(details);

  // PREPEND so newest guess is first
  rowsWrap.prepend(card);
}

(function init() {
  fetch(DATA_URL)
    .then((r) => r.json())
    .then((data) => {
      // Server filtering
      let currentServer = 'en';
      try {
        currentServer = localStorage.getItem(SERVER_PREF_KEY) || 'en';
      } catch {}

      function matchesServer(uma) {
        if (currentServer === 'jp') return true;
        return (uma.UmaServer || 'global') === 'global';
      }

      function getFilteredData() {
        return data.filter(matchesServer);
      }

      const byLabel = {};
      data.forEach((u) => {
        byLabel[buildLabelEN(u).toLowerCase()] = u;
        const jpLabel = buildLabelJP(u).toLowerCase();
        if (jpLabel) byLabel[jpLabel] = u;
      });

      // Track guessed slugs
      const guessedSlugs = new Set();

      const rows = document.getElementById('rows');
      const pickBtn = document.getElementById('pickUmaBtn');
      const pickLabel = pickBtn.querySelector('.pick-uma-label');
      const footer = document.getElementById('footer');

      // Modal elements
      const modal = document.getElementById('umaPickerModal');
      const searchInput = document.getElementById('umaPickerSearch');
      const listEl = document.getElementById('umaPickerList');

      // Win modal
      const winModal = $('#winModal');
      const winMsg = $('#winMsg');
      const winNewBtn = $('#winNewBtn');
      const winCloseBtn = $('#winCloseBtn');

      // Pick random target (from server-filtered pool)
      const params = new URLSearchParams(location.search);
      const targetParam = (params.get('target') || '').toLowerCase();
      let target = targetParam ? byLabel[targetParam] : null;
      if (!target) {
        const pool = getFilteredData();
        target = pool[Math.floor(Math.random() * pool.length)];
      }

      let filterSearch = '';
      let gameOver = false;

      // --- Modal rendering ---
      function renderModalList() {
        const pool = getFilteredData();
        const q = filterSearch.toLowerCase();
        const filtered = pool.filter((u) => {
          if (q) {
            const labelEN = buildLabelEN(u).toLowerCase();
            const labelJP = buildLabelJP(u).toLowerCase();
            if (!labelEN.includes(q) && !labelJP.includes(q)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          listEl.innerHTML = `<div class="modal-card-empty">${escHtml(_t('umadle.noCharsMatch'))}</div>`;
          return;
        }

        let html = '';
        for (const c of filtered) {
          const cLoc = typeof getLocalizedUmaName === 'function' ? getLocalizedUmaName(c) : { name: c.UmaName || '', nickname: c.UmaNickname || '' };
          const name = cLoc.name || '';
          const nick = cLoc.nickname || '';
          const isGuessed = guessedSlugs.has(c.UmaSlug);
          const itemCls = isGuessed ? 'modal-card-item disabled' : 'modal-card-item';
          const imgSrc = c.UmaImage || '';
          const imgHtml = imgSrc
            ? `<img class="modal-card-thumb" src="${escHtml(imgSrc)}" alt="" loading="lazy">`
            : `<span class="modal-card-initials">${escHtml(initialsOf(name))}</span>`;
          const stars = c.UmaBaseStars ? '\u2605'.repeat(Math.min(c.UmaBaseStars, 5)) : '';

          html += `<div class="${itemCls}" data-slug="${escHtml(c.UmaSlug)}">
            ${imgHtml}
            <span class="modal-card-name">${escHtml(name)}${nick ? ` <span class="modal-card-nick">(${escHtml(nick)})</span>` : ''}</span>
            <span class="modal-card-rarity char-stars">${stars}</span>
          </div>`;
        }
        listEl.innerHTML = html;
      }

      function openModal() {
        if (gameOver) return;
        filterSearch = '';
        searchInput.value = '';
        if (modal.parentElement !== document.body) document.body.appendChild(modal);
        renderModalList();
        modal.hidden = false;
        searchInput.focus();
      }

      function closeModal() {
        modal.hidden = true;
      }

      // Modal events
      pickBtn.addEventListener('click', openModal);
      modal.querySelector('.support-modal-backdrop').addEventListener('click', closeModal);
      modal.querySelector('.support-modal-close').addEventListener('click', closeModal);

      searchInput.addEventListener('input', () => {
        filterSearch = searchInput.value;
        renderModalList();
      });

      listEl.addEventListener('click', (e) => {
        const item = e.target.closest('.modal-card-item');
        if (!item || item.classList.contains('disabled')) return;
        const slug = item.dataset.slug;
        const found = data.find((u) => u.UmaSlug === slug);
        if (!found) return;
        closeModal();
        submitGuess(found);
      });

      // Keyboard: Escape closes modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (!modal.hidden) closeModal();
          else if (winModal.classList.contains('open')) closeWinModal();
        }
      });

      // --- Guess logic ---
      function submitGuess(g) {
        footer.textContent = '';

        // Track guessed
        guessedSlugs.add(g.UmaSlug);

        // Collapse previous guesses unless manually pinned
        rows.querySelectorAll('.guess-details').forEach((details) => {
          if (details.dataset.pinned !== 'true') {
            details.open = false;
          }
        });

        renderGuess(rows, g, target);
        const newest = rows.querySelector('.guess-details');
        if (newest) {
          newest.dataset.autoToggle = 'true';
          newest.open = true;
        }

        // Victory check
        const baseEq = STAT_KEYS.every(
          (k) => (pickBaseStats(g)?.[k] ?? null) === (pickBaseStats(target)?.[k] ?? null)
        );
        const bonusEq = STAT_KEYS.every(
          (k) => (g.UmaStatBonuses || {})[k] == (target.UmaStatBonuses || {})[k]
        );
        const eqA = (grp, ks) =>
          ks.every(
            (k) =>
              (g.UmaAptitudes?.[grp]?.[k] || null) === (target.UmaAptitudes?.[grp]?.[k] || null)
          );
        const aptEq =
          eqA('Surface', ['Turf', 'Dirt']) &&
          eqA('Distance', ['Short', 'Mile', 'Medium', 'Long']) &&
          eqA('Strategy', ['Front', 'Pace', 'Late', 'End']);

        if (baseEq && bonusEq && aptEq) {
          gameOver = true;
          footer.textContent = t('umadle.allMatch');
          footer.style.fontWeight = '700';
          openWinModal();
        }
      }

      // --- Win modal ---
      function openWinModal() {
        const tLoc = typeof getLocalizedUmaName === 'function' ? getLocalizedUmaName(target) : { name: target.UmaName || '', nickname: target.UmaNickname || '' };
        winMsg.textContent = `${tLoc.name}${tLoc.nickname ? ' (' + tLoc.nickname + ')' : ''}`;
        winModal.classList.add('open');
        winModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => winNewBtn.focus(), 0);
      }
      function closeWinModal() {
        winModal.classList.remove('open');
        winModal.setAttribute('aria-hidden', 'true');
      }

      winModal.addEventListener('click', (e) => {
        if (e.target === winModal) closeWinModal();
      });

      function newGame() {
        const pool = getFilteredData();
        if (pool.length > 1) {
          const available = pool.filter((u) => buildLabel(u) !== buildLabel(target));
          target = available[Math.floor(Math.random() * available.length)];
        }
        rows.innerHTML = '';
        footer.textContent = '';
        footer.style.fontWeight = '';
        guessedSlugs.clear();
        gameOver = false;
      }

      winNewBtn.addEventListener('click', () => {
        closeWinModal();
        newGame();
      });
      winCloseBtn.addEventListener('click', () => {
        closeWinModal();
      });

      // Server change listener
      window.addEventListener('umatools:server-change', (e) => {
        const next = (e?.detail?.server || 'en').toLowerCase();
        if (next !== currentServer) {
          currentServer = next;
          // Re-render modal if open
          if (!modal.hidden) renderModalList();
        }
      });

      // Language change listener — re-render displayed names
      window.addEventListener('i18n:changed', () => {
        if (!modal.hidden) renderModalList();
      });
    });
})();
