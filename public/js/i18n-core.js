(function () {
  'use strict';

  var LANG_KEY = 'umatoolsSiteLanguage';
  var currentLang = 'en';

  try {
    var stored = localStorage.getItem(LANG_KEY);
    if (stored && stored.trim().toLowerCase() === 'jp') currentLang = 'ja';
  } catch (e) {}

  var TRANSLATIONS = {
    en: {
      // ── Common ──
      'common.speed': 'Speed',
      'common.stamina': 'Stamina',
      'common.power': 'Power',
      'common.guts': 'Guts',
      'common.wisdom': 'Wisdom',
      'common.turf': 'Turf',
      'common.dirt': 'Dirt',
      'common.sprint': 'Sprint',
      'common.mile': 'Mile',
      'common.medium': 'Medium',
      'common.long': 'Long',
      'common.front': 'Front',
      'common.pace': 'Pace',
      'common.late': 'Late',
      'common.end': 'End',
      'common.track': 'Track',
      'common.distance': 'Distance',
      'common.strategy': 'Strategy',
      'common.add': 'Add',
      'common.remove': 'Remove',
      'common.clear': 'Clear',
      'common.close': 'Close',
      'common.save': 'Save',
      'common.search': 'Search',
      'common.loading': 'Loading...',
      'common.stats': 'Stats',
      'common.skills': 'Skills',
      'common.unique': 'Unique',
      'common.projected': 'Projected',
      'common.projectedRating': 'Projected Rating',
      'common.starLevel': 'Star Level',
      'common.uniqueSkillLevel': 'Unique Skill Level',
      'common.raceConfig': 'Race Configuration',
      'common.searchByName': 'Search by name...',
      'common.toggleDarkLight': 'Toggle dark/light mode',
      'common.enough': 'Enough',
      'common.notEnough': 'Not enough',
      'common.borderline': 'Borderline',
      'common.enterValues': 'Enter values',
      'common.copied': 'Copied!',
      'common.copyFailed': 'Copy failed—select the address bar to copy.',
      'common.reset': 'Reset',

      // ── Nav ──
      'nav.rating': 'Rating',
      'nav.optimizer': 'Optimizer',
      'nav.calculator': 'Calculator',
      'nav.staminaCheck': 'Stamina Check',
      'nav.raceScheduler': 'Race Scheduler',
      'nav.tools': 'Tools',
      'nav.eventOCR': 'Event OCR',
      'nav.supportHints': 'Support Hints',
      'nav.deckBuilder': 'Deck Builder',
      'nav.deckOptimizer': 'Deck Optimizer',
      'nav.tokenPlanner': 'Token Planner',
      'nav.data': 'Data',
      'nav.skillLibrary': 'Skill Library',
      'nav.rankBreakdown': 'Rank Breakdown',
      'nav.fun': 'Fun',
      'nav.randomizer': 'Randomizer',
      'nav.umadle': 'Umadle',
      'nav.settings': 'Settings',
      'nav.globalSettings': 'Global Settings',
      'nav.server': 'Server',
      'nav.siteLanguage': 'Site Language',
      'nav.madeWith': 'Made with',
      'nav.home': 'Uma Tools Home',
      'nav.menu': 'Menu',
      'nav.primary': 'Primary',
    },
    ja: {
      // ── Common ──
      'common.speed': 'スピード',
      'common.stamina': 'スタミナ',
      'common.power': 'パワー',
      'common.guts': '根性',
      'common.wisdom': '賢さ',
      'common.turf': '芝',
      'common.dirt': 'ダート',
      'common.sprint': '短距離',
      'common.mile': 'マイル',
      'common.medium': '中距離',
      'common.long': '長距離',
      'common.front': '逃げ',
      'common.pace': '先行',
      'common.late': '差し',
      'common.end': '追込',
      'common.track': 'バ場',
      'common.distance': '距離',
      'common.strategy': '脚質',
      'common.add': '追加',
      'common.remove': '削除',
      'common.clear': 'クリア',
      'common.close': '閉じる',
      'common.save': '保存',
      'common.search': '検索',
      'common.loading': '読み込み中...',
      'common.stats': 'ステータス',
      'common.skills': 'スキル',
      'common.unique': '固有',
      'common.projected': '予想',
      'common.projectedRating': '予想レーティング',
      'common.starLevel': '星レベル',
      'common.uniqueSkillLevel': '固有スキルレベル',
      'common.raceConfig': 'レース設定',
      'common.searchByName': '名前で検索...',
      'common.toggleDarkLight': 'ダーク/ライトモード切替',
      'common.enough': '十分',
      'common.notEnough': '不足',
      'common.borderline': 'ギリギリ',
      'common.enterValues': '値を入力',
      'common.copied': 'コピー完了！',
      'common.copyFailed': 'コピーに失敗しました。アドレスバーから手動でコピーしてください。',
      'common.reset': 'リセット',

      // ── Nav ──
      'nav.rating': 'レーティング',
      'nav.optimizer': 'オプティマイザー',
      'nav.calculator': 'カリキュレーター',
      'nav.staminaCheck': 'スタミナ計算',
      'nav.raceScheduler': 'レーススケジューラー',
      'nav.tools': 'ツール',
      'nav.eventOCR': 'イベントOCR',
      'nav.supportHints': 'サポートヒント',
      'nav.deckBuilder': 'デッキ編成',
      'nav.deckOptimizer': 'デッキ最適化',
      'nav.tokenPlanner': 'トークンプランナー',
      'nav.data': 'データ',
      'nav.skillLibrary': 'スキル一覧',
      'nav.rankBreakdown': 'ランク内訳',
      'nav.fun': 'お楽しみ',
      'nav.randomizer': 'ランダマイザー',
      'nav.umadle': 'ウマドル',
      'nav.settings': '設定',
      'nav.globalSettings': '全般設定',
      'nav.server': 'サーバー',
      'nav.siteLanguage': 'サイト言語',
      'nav.madeWith': 'Made with',
      'nav.home': 'UmaTools ホーム',
      'nav.menu': 'メニュー',
      'nav.primary': 'メイン',
    },
  };

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    currentLang = lang === 'jp' || lang === 'ja' ? 'ja' : 'en';
  }

  function t(key, vars) {
    var dict = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
    var str = dict[key];
    if (str === undefined) {
      str = TRANSLATIONS.en[key];
    }
    if (str === undefined) return key;
    if (vars && typeof vars === 'object') {
      str = str.replace(/\{([a-zA-Z0-9_-]+)\}/g, function (_, k) {
        var v = vars[k];
        return v === undefined || v === null ? '' : String(v);
      });
    }
    return str;
  }

  function applyI18n(root) {
    var container = root || document;
    var els = container.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    }
    els = container.querySelectorAll('[data-i18n-html]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n-html');
      if (key) el.innerHTML = t(key);
    }
    els = container.querySelectorAll('[data-i18n-placeholder]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    }
    els = container.querySelectorAll('[data-i18n-aria]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', t(key));
    }
    els = container.querySelectorAll('[data-i18n-title]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n-title');
      if (key) el.setAttribute('title', t(key));
    }
  }

  // Listen for language change events from the settings panel
  window.addEventListener('umatools:site-language-change', function (event) {
    var lang = event && event.detail && event.detail.language;
    setLang(lang);
    applyI18n();
    // Fire custom event so page scripts can re-render dynamic content
    window.dispatchEvent(new Event('i18n:changed'));
  });

  // Apply translations once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyI18n();
    });
  } else {
    applyI18n();
  }

  // Expose global API
  // Localized name helpers — used by deck, random, umadle, hints, skill-popup
  function getLocalizedUmaName(uma) {
    if (!uma) return { name: '', nickname: '' };
    var isJP = currentLang === 'ja';
    return {
      name: (isJP && uma.UmaNameJP) || uma.UmaName || '',
      nickname: (isJP && uma.UmaNicknameJP) || uma.UmaNickname || '',
    };
  }

  function getLocalizedSupportName(card) {
    if (!card) return '';
    var isJP = currentLang === 'ja';
    return (isJP && card.SupportNameJP) || card.SupportName || '';
  }

  // ── JP skill name lookup (shared across all pages) ──
  var jpSkillNameMap = null; // Map<normalized_name, jp_name>

  function buildJPSkillNameMap(skillsAllData) {
    if (!Array.isArray(skillsAllData)) return;
    jpSkillNameMap = new Map();
    // Track first JP name per key to detect collisions with duplicate EN names
    var enKeyFirstJP = new Map();

    function indexSkill(jpname, variants) {
      if (!jpname) return;
      variants.forEach(function (n) {
        var key = ((n || '') + '').trim().toLowerCase();
        if (!key) return;
        if (!jpSkillNameMap.has(key)) {
          jpSkillNameMap.set(key, jpname);
          if (!enKeyFirstJP.has(key)) enKeyFirstJP.set(key, jpname);
        } else if (jpSkillNameMap.get(key) !== jpname) {
          // Collision: same EN key maps to different JP names
          // Add disambiguated entries for both skills
          var disambigKey = key + ' (' + jpname.trim().toLowerCase() + ')';
          if (!jpSkillNameMap.has(disambigKey)) jpSkillNameMap.set(disambigKey, jpname);
          var firstJP = enKeyFirstJP.get(key);
          if (firstJP) {
            var firstDisambigKey = key + ' (' + firstJP.trim().toLowerCase() + ')';
            if (!jpSkillNameMap.has(firstDisambigKey)) jpSkillNameMap.set(firstDisambigKey, firstJP);
          }
        }
      });
    }

    skillsAllData.forEach(function (skill) {
      var jpname = ((skill && skill.jpname) || '').trim();
      indexSkill(jpname, [skill.name_en, skill.enname, skill.jpname, skill.name]);
      if (skill.gene_version) {
        var gvJp = ((skill.gene_version.jpname) || '').trim();
        indexSkill(gvJp, [skill.gene_version.name_en, skill.gene_version.enname, skill.gene_version.jpname, skill.gene_version.name]);
      }
    });
    // Notify pages that JP skill names are now available for re-rendering
    try { window.dispatchEvent(new Event('i18n:jpnames-ready')); } catch (_) {}
  }

  function getLocalizedSkillName(name) {
    if (!name) return name || '';
    if (currentLang !== 'ja') return name;
    // Lazy-build the map if data is available but map hasn't been built yet
    if (!jpSkillNameMap && window.__skillsAllData) {
      buildJPSkillNameMap(window.__skillsAllData);
    }
    if (!jpSkillNameMap) return name;
    var key = (name + '').trim().toLowerCase();
    return jpSkillNameMap.get(key) || name;
  }

  // Add a function to allow pages to add their translations
  function addTranslations(newTranslations) {
    if (!newTranslations || typeof newTranslations !== 'object') return;

    // Merge new translations into existing TRANSLATIONS object
    for (var lang in newTranslations) {
      if (!TRANSLATIONS[lang]) {
        TRANSLATIONS[lang] = {};
      }
      var langTranslations = newTranslations[lang];
      for (var key in langTranslations) {
        TRANSLATIONS[lang][key] = langTranslations[key];
      }
    }
  }

  window.t = t;
  window.applyI18n = applyI18n;
  window.getLocalizedUmaName = getLocalizedUmaName;
  window.getLocalizedSupportName = getLocalizedSupportName;
  window.buildJPSkillNameMap = buildJPSkillNameMap;
  window.getLocalizedSkillName = getLocalizedSkillName;
  window.I18n = {
    t: t,
    apply: applyI18n,
    getLang: getLang,
    setLang: setLang,
    getLocalizedUmaName: getLocalizedUmaName,
    getLocalizedSupportName: getLocalizedSupportName,
    buildJPSkillNameMap: buildJPSkillNameMap,
    getLocalizedSkillName: getLocalizedSkillName,
    TRANSLATIONS: TRANSLATIONS,
    addTranslations: addTranslations,
  };
})();
