// Shared skill sources. Game master values take precedence; legacy metadata
// supplies aliases, categories and relationships that the raw API does not expose.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SkillData = factory();
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const requests = new Map();
  const catalogs = new Map();
  const aliases = new Map();
  const parsed = new Map();
  const normalize = (value) =>
    String(value || '')
      .trim()
      .toLowerCase();
  function serverName() {
    try {
      return localStorage.getItem('umatoolsServer') === 'jp' ? 'jp' : 'global';
    } catch {
      return 'global';
    }
  }
  function json(url) {
    if (!requests.has(url)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      requests.set(
        url,
        fetch(url, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
          .catch((error) => {
            requests.delete(url);
            throw error;
          })
          .finally(() => clearTimeout(timeout))
      );
    }
    return requests.get(url);
  }
  function aptitude(base, factors) {
    // Preserve the site's half-up midpoint rule; emulate single-precision products.
    return Math.round(
      factors.reduce((value, factor) => Math.fround(value * Math.fround(factor)), Math.fround(base))
    );
  }
  function parseCSV(text) {
    if (parsed.has(text)) return parsed.get(text);
    const rows = [];
    let row = [],
      field = '',
      quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        row.push(field);
        field = '';
      } else if ((ch === '\n' || ch === '\r') && !quoted) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = '';
      } else field += ch;
    }
    row.push(field);
    if (row.some(Boolean)) rows.push(row);
    if (parsed.size >= 4) parsed.delete(parsed.keys().next().value);
    parsed.set(text, rows);
    return rows;
  }
  function master(server = serverName()) {
    if (!catalogs.has(server))
      catalogs.set(
        server,
        (async () => {
          for (const url of [
            `/assets/master/${server}-core.json`,
            `/api/data/v1/${server}/catalog`,
          ]) {
            try {
              const data = await json(url);
              if (
                data.server !== server ||
                !Array.isArray(data.skills) ||
                !data.skills.length ||
                data.skills.some((s) => !Number.isInteger(s.id) || !Number.isFinite(s.grade_value))
              )
                throw new Error('Invalid master catalog');
              return { ...data, byId: new Map(data.skills.map((s) => [String(s.id), s])) };
            } catch {
              /* retain legacy source if both endpoints are unavailable */
            }
          }
          return null;
        })()
      );
    return catalogs.get(server);
  }
  async function loadJSON(url, server = serverName()) {
    const [legacy, catalog] = await Promise.all([json(url), master(server)]);
    if (!Array.isArray(legacy)) throw new Error('Invalid legacy skill catalog');
    const names = aliases.get(server) || new Map();
    aliases.set(server, names);
    function overlay(entry) {
      if (!entry) return entry;
      const source = catalog?.byId.get(String(entry.id));
      const output = { ...entry };
      if (source) {
        output.grade_value = source.grade_value;
        if (source.need_skill_point != null) output.cost = source.need_skill_point;
        for (const name of [source.name, entry.name, entry.name_en, entry.enname, entry.jpname]) {
          const key = normalize(name);
          if (!key) continue;
          if (!names.has(key)) names.set(key, source);
          else if (names.get(key)?.id !== source.id) names.set(key, null); // ambiguous name
        }
      }
      if (entry.gene_version) output.gene_version = overlay(entry.gene_version);
      return output;
    }
    const result = legacy.map(overlay);
    if (typeof document !== 'undefined' && server === serverName()) {
      const anchor = document.getElementById('lib-status') || document.getElementById('skillCount');
      if (anchor) {
        let label = document.getElementById('skill-data-source');
        if (!label) {
          label = document.createElement('small');
          label.id = 'skill-data-source';
          label.className = 'muted';
          label.setAttribute('role', 'status');
          anchor.after(label);
        }
        const version = catalog?.source?.game_version;
        label.textContent = ` · ${server === 'jp' ? 'JP' : 'Global'} · ${catalog ? (version ? `Game data ${version}` : 'Imported game data') : 'Backup data'}`;
        label.title =
          catalog?.source?.imported_at ||
          'The game database is unavailable; community data is being used.';
      }
    }
    return result;
  }
  async function overlayCSV(text, server = serverName()) {
    const catalog = await master(server);
    const rows = parseCSV(text).map((row) => row.slice());
    if (!rows.length) return text;
    const header = rows[0].map(normalize),
      at = (name) => header.indexOf(name);
    const names = aliases.get(server) || new Map();
    if (catalog)
      for (const skill of catalog.skills) {
        const key = normalize(skill.name);
        if (!names.has(key)) names.set(key, skill);
        else if (names.get(key)?.id !== skill.id) names.set(key, null);
      }
    for (const row of rows.slice(1)) {
      // Purchased uniques have a flat rating; native names can match the same aliases.
      if (normalize(row[at('skill_type')]) === 'ius') {
        for (const field of ['base_value', 's_a', 'b_c', 'd_e_f', 'g']) {
          if (at(field) >= 0) row[at(field)] = '180';
        }
        for (const field of ['affinity_role', 'check_type']) {
          if (at(field) >= 0) row[at(field)] = '';
        }
        continue;
      }
      const keys = [
        row[at('name')],
        row[at('localized_name')],
        ...(row[at('alias_name')] || '').split('|'),
      ];
      const matches = [
        ...new Map(
          keys
            .map((key) => names.get(normalize(key)))
            .filter(Boolean)
            .map((s) => [s.id, s])
        ).values(),
      ];
      const source = matches.length === 1 ? matches[0] : null;
      const baseIndex = at('base_value');
      if (baseIndex < 0) continue;
      if (source) row[baseIndex] = String(source.grade_value);
      const base = Number(row[baseIndex]);
      if (!Number.isFinite(base)) continue;
      const check = normalize(row[at('affinity_role')] || row[at('check_type')]);
      const groups = new Set(
        check
          .split('/')
          .filter(Boolean)
          .map((role) =>
            ['turf', 'dirt'].includes(role)
              ? 'surface'
              : ['sprint', 'mile', 'medium', 'long'].includes(role)
                ? 'distance'
                : ['front', 'pace', 'late', 'end'].includes(role)
                  ? 'style'
                  : null
          )
          .filter(Boolean)
      );
      for (const [bucket, factor] of [
        ['s_a', 1.1],
        ['b_c', 0.9],
        ['d_e_f', 0.8],
        ['g', 0.7],
      ]) {
        if (at(bucket) >= 0)
          row[at(bucket)] = String(aptitude(base, Array(groups.size).fill(factor)));
      }
    }
    const output = rows
      .map((row) =>
        row
          .map((field) => (/[",\r\n]/.test(field) ? '"' + field.replace(/"/g, '""') + '"' : field))
          .join(',')
      )
      .join('\n');
    if (parsed.size >= 4) parsed.delete(parsed.keys().next().value);
    parsed.set(output, rows);
    return output;
  }
  async function status(server = serverName()) {
    const data = await master(server);
    return data ? { server, source: data.source } : { server, source: { kind: 'legacy-fallback' } };
  }
  function onServerChange(reload, ready = Promise.resolve()) {
    let queue = ready;
    window.addEventListener('umatools:server-change', () => {
      // Serialize updates so slow responses cannot overwrite the final selection.
      queue = queue
        .catch(() => {})
        .then(reload)
        .catch((error) => {
          console.error('Unable to reload skill data', error);
        });
    });
  }
  return { json, loadJSON, overlayCSV, parseCSV, aptitude, status, master, onServerChange };
});
