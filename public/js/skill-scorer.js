// Automated skill scoring and tiering for Team Trials optimization
// In Team Trials, skills score purely on ACTIVATION (Gold=1200pts, White=500pts).
// What a skill does (acceleration, speed, etc.) is irrelevant for scoring.
// Only consistency (will it activate?) and cost efficiency (SV per SP) matter.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SkillScorer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_SCORING_WEIGHTS = {
    consistency: 0.6,
    costEfficiency: 0.4,
  };

  var DISTANCE_TAGS = ['sho', 'mil', 'med', 'lng'];
  var SURFACE_TAGS = ['tur', 'dir'];
  var STYLE_TAGS = ['run', 'ldr', 'btw', 'cha'];

  var DISTANCE_TAG_LABELS = { sho: 'Sprint', mil: 'Mile', med: 'Medium', lng: 'Long' };
  var SURFACE_TAG_LABELS = { tur: 'Turf', dir: 'Dirt' };
  var STYLE_TAG_LABELS = { run: 'Front', ldr: 'Pace', btw: 'Late', cha: 'End' };

  // Helpers from TeamTrialsOptimizer (resolved at call time)
  function TTO() {
    return (typeof window !== 'undefined' && window.TeamTrialsOptimizer) || {};
  }

  function clamp(v, lo, hi) {
    var fn = TTO().clamp;
    return fn ? fn(v, lo, hi) : Math.max(lo, Math.min(hi, v));
  }
  function nName(v) {
    var fn = TTO().nName;
    return fn
      ? fn(v)
      : String(v || '')
          .trim()
          .toLowerCase()
          .replace(/[\u25ce\u25cb\u00d7]/g, '')
          .replace(/[\[\]\(\)!'".,:;+*/\\-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
  }
  function condText(g) {
    var fn = TTO().condText;
    return fn
      ? fn(g)
      : [
          g && typeof g.condition === 'string' ? g.condition : '',
          g && typeof g.precondition === 'string' ? g.precondition : '',
        ]
          .filter(Boolean)
          .join(' & ');
  }

  // ---------------------------------------------------------------------------
  // Trigger Consistency scoring (reuses team-trials-optimizer helpers)
  // This is the PRIMARY scoring dimension for Team Trials.
  // ---------------------------------------------------------------------------
  function scoreTriggerConsistency(conditionGroups) {
    var tto = TTO();
    if (!tto.timingScore || !tto.breadthScore || !tto.scenarioScore) return 0.5;

    if (!Array.isArray(conditionGroups) || !conditionGroups.length) return 0.58;

    var gScores = [];
    conditionGroups.forEach(function (g) {
      var t = condText(g);
      if (!t) return;
      var ts = tto.timingScore(t);
      var bs = tto.breadthScore(t);
      var ss = tto.scenarioScore(t);

      var strict = 0;
      if (/order\s*==\s*1/.test(t)) strict += 2;
      if (/blocked_|is_overtake|change_order_onetime/.test(t)) strict += 2;
      if (/phase_random|corner_random|straight_random/.test(t)) strict += 1;
      var cmpMatch = String(t).match(/==|>=|<=|>|</g);
      if (cmpMatch && cmpMatch.length >= 5) strict += 1;
      var pen = Math.min(0.24, strict * 0.04);

      gScores.push(clamp(ts * 0.45 + bs * 0.3 + ss * 0.25 - pen, 0.05, 0.99));
    });

    if (!gScores.length) return 0.58;

    // Combine via miss probability (same formula as scoreSkillConsistency)
    var miss = 1;
    gScores.forEach(function (v) {
      miss *= 1 - Math.min(0.97, v * 0.9);
    });
    var c = 1 - miss;
    if (conditionGroups.length > 1) {
      c += Math.min(0.08, (conditionGroups.length - 1) * 0.03);
    }
    return clamp(c, 0.05, 0.99);
  }

  // ---------------------------------------------------------------------------
  // Cost Efficiency scoring (SV-based)
  // Gold activation = 12 SV, White = 5 SV. Cheaper skills = more SV per SP.
  // ---------------------------------------------------------------------------
  function scoreCostEfficiency(cost, isGold) {
    var sv = isGold ? 12 : 5;
    if (!cost || cost <= 0) return 1.0; // free skill = max efficiency
    // Normalize: sv/cost, where a "perfect" ratio is ~0.1 (12 SV / 120 SP)
    var ratio = sv / cost;
    // Scale so that 0.1 ratio = 1.0 score, with diminishing returns
    var score = ratio / 0.1;
    // Cost bracket bonuses (cheap skills are disproportionately valuable)
    if (cost <= 120) score *= 1.15;
    else if (cost <= 160) score *= 1.05;
    if (cost >= 360) score *= 0.70;
    else if (cost >= 300) score *= 0.80;
    return clamp(score, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Green skill detection -- passive stat boosts with volatile race conditions
  // ---------------------------------------------------------------------------
  var VOLATILE_RACE_RE =
    /(rotation|season|ground_condition|weather|post_number)\s*(==|!=|>=|<=|>|<)/i;
  var SAVVY_NAME_RE = /savvy|コツ/i;

  function isGreenPassive(conditionGroups) {
    if (!Array.isArray(conditionGroups) || !conditionGroups.length) return false;
    return conditionGroups.every(function (g) {
      if (!g) return false;
      var passive = g.base_time === -1 || g.base_time === 0;
      if (!passive) return false;
      var t = condText(g);
      return VOLATILE_RACE_RE.test(t);
    });
  }

  function isSavvySkill(name) {
    return SAVVY_NAME_RE.test(name || '');
  }

  var GREEN_PASSIVE_PENALTY = 0.2;

  // ---------------------------------------------------------------------------
  // Tag derivation
  // ---------------------------------------------------------------------------
  function deriveTags(skill, breakdown) {
    var tags = [];
    if (breakdown.consistency >= 0.75) tags.push('core');
    if (breakdown.consistency >= 0.65) tags.push('consistent');
    if (breakdown.consistency < 0.35) tags.push('inconsistent');
    return tags;
  }

  function deriveConsistencyAdjustment(tags) {
    var adj = 0;
    if (tags.indexOf('inconsistent') !== -1) adj -= 0.24;
    if (tags.indexOf('consistent') !== -1) adj += 0.1;
    if (tags.indexOf('core') !== -1) adj += 0.08;
    return clamp(adj, -0.45, 0.35);
  }

  // ---------------------------------------------------------------------------
  // Tier marker from composite score
  // ---------------------------------------------------------------------------
  function markerFromScore(composite) {
    if (composite >= 0.72) return '\u25ce'; // ◎
    if (composite >= 0.52) return '\u25cb'; // ◯
    if (composite >= 0.36) return '\u25b2'; // ▲
    if (composite >= 0.2) return '\u25b3'; // △
    return '\u2715'; // ✕
  }

  // ---------------------------------------------------------------------------
  // Context string from type tags
  // ---------------------------------------------------------------------------
  function deriveContext(typeTags) {
    var tags = new Set(
      Array.isArray(typeTags)
        ? typeTags.map(function (t) {
            return String(t).toLowerCase();
          })
        : []
    );
    if (tags.has('nac')) return '/';
    var parts = [];
    DISTANCE_TAGS.forEach(function (t) {
      if (tags.has(t)) parts.push(DISTANCE_TAG_LABELS[t]);
    });
    STYLE_TAGS.forEach(function (t) {
      if (tags.has(t)) parts.push(STYLE_TAG_LABELS[t]);
    });
    SURFACE_TAGS.forEach(function (t) {
      if (tags.has(t)) parts.push(SURFACE_TAG_LABELS[t]);
    });
    return parts.length ? parts.join('/') : '/';
  }

  // ---------------------------------------------------------------------------
  // Explanation generation
  // ---------------------------------------------------------------------------
  function generateExplanation(breakdown, tags) {
    var parts = [];

    // Consistency assessment
    if (breakdown.consistency >= 0.80) parts.push('Very reliable activation');
    else if (breakdown.consistency >= 0.65) parts.push('Reliable activation');
    else if (breakdown.consistency >= 0.50) parts.push('Moderate activation');
    else if (breakdown.consistency >= 0.35) parts.push('Unreliable activation');
    else parts.push('Very unreliable activation');

    // Cost efficiency
    if (breakdown.costEfficiency >= 0.80) parts.push('- excellent SV/SP');
    else if (breakdown.costEfficiency >= 0.55) parts.push('- good SV/SP');
    else if (breakdown.costEfficiency >= 0.35) parts.push('- average SV/SP');
    else parts.push('- poor SV/SP (expensive)');

    return parts.join(' ');
  }

  // ---------------------------------------------------------------------------
  // Detect if skill ID looks like a gold skill (6-digit IDs starting with 1)
  // ---------------------------------------------------------------------------
  function looksLikeGold(normalizedSkill) {
    var id = normalizedSkill.id;
    if (!id) return false;
    var numId = parseInt(id, 10);
    // Gold/unique skills have IDs in the 1xxxxx range (parent skills)
    // Gene versions (inheritable) are in the 9xxxxx range
    // Cost is also a good indicator: gold skills tend to cost 170+
    var cost = normalizedSkill.cost || 0;
    if (cost >= 170) return true;
    if (numId >= 100000 && numId < 200000) return true;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Score a single normalized skill
  // ---------------------------------------------------------------------------
  function scoreSkill(normalizedSkill, weights) {
    var w = weights || DEFAULT_SCORING_WEIGHTS;
    var groups = Array.isArray(normalizedSkill.conditionGroups)
      ? normalizedSkill.conditionGroups
      : [];
    var typeTags = Array.isArray(normalizedSkill.typeTags) ? normalizedSkill.typeTags : [];
    var cost = normalizedSkill.cost || 0;
    var isGold = looksLikeGold(normalizedSkill);

    var consistency = scoreTriggerConsistency(groups);
    var costEfficiency = scoreCostEfficiency(cost, isGold);

    var breakdown = {
      consistency: consistency,
      costEfficiency: costEfficiency,
    };

    // Normalize weights to sum to 1
    var total = (w.consistency || 0) + (w.costEfficiency || 0);
    if (total <= 0) total = 1;
    var nw = {
      consistency: (w.consistency || 0) / total,
      costEfficiency: (w.costEfficiency || 0) / total,
    };

    var composite = clamp(
      nw.consistency * consistency + nw.costEfficiency * costEfficiency,
      0,
      1
    );

    // Penalize green passive skills (volatile race-condition stat boosts)
    var greenPenalized = false;
    if (isGreenPassive(groups) && !isSavvySkill(normalizedSkill.name)) {
      composite = clamp(composite - GREEN_PASSIVE_PENALTY, 0, 1);
      greenPenalized = true;
    }

    var marker = markerFromScore(composite);
    var tags = deriveTags(normalizedSkill, breakdown);
    if (greenPenalized) tags.push('inconsistent');
    var consistencyAdjustment = deriveConsistencyAdjustment(tags);
    var context = deriveContext(typeTags);
    var note = generateExplanation(breakdown, tags);
    if (greenPenalized) note += ' - volatile race condition (green passive)';

    var scorePerSp = null;
    if (cost > 0) {
      scorePerSp = Number(((composite * 500) / cost).toFixed(2));
    }

    return {
      skillName: normalizedSkill.name,
      normalizedName: normalizedSkill.normalizedName || nName(normalizedSkill.name),
      marker: marker,
      scorePerSp: scorePerSp,
      context: context,
      note: note,
      tags: tags,
      tierBonus: Number(composite.toFixed(4)),
      consistencyAdjustment: Number(consistencyAdjustment.toFixed(4)),
      skillId: normalizedSkill.id || null,
      breakdown: {
        consistency: Number(consistency.toFixed(4)),
        costEfficiency: Number(costEfficiency.toFixed(4)),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Score all skills from the raw skills_all.json array
  // ---------------------------------------------------------------------------
  function scoreAllSkills(rawSkillArray, weights) {
    var tto = TTO();
    var normalizeSkillFn = tto.normalizeSkill;
    if (!normalizeSkillFn) {
      return { byId: new Map(), byName: new Map() };
    }

    var byId = new Map();
    var byName = new Map();
    var w = weights || DEFAULT_SCORING_WEIGHTS;

    (Array.isArray(rawSkillArray) ? rawSkillArray : []).forEach(function (raw) {
      var gene =
        raw && raw.gene_version && typeof raw.gene_version === 'object' ? raw.gene_version : null;
      var hasGene = gene && gene.cost != null;

      var parentNorm = normalizeSkillFn(raw);
      if (parentNorm && parentNorm.id) {
        var parentEntry = scoreSkill(parentNorm, w);
        parentEntry.skillId = String(parentNorm.id);
        if (!byId.has(parentEntry.skillId)) byId.set(parentEntry.skillId, parentEntry);
        if (parentEntry.normalizedName && !byName.has(parentEntry.normalizedName)) {
          byName.set(parentEntry.normalizedName, parentEntry);
        }
      }

      if (hasGene) {
        var geneRaw = Object.assign({}, raw, gene, {
          id: gene.id,
          condition_groups: gene.condition_groups || raw.condition_groups,
          type: raw.type,
        });
        if (raw.loc && raw.loc.en && raw.loc.en.gene_version) {
          geneRaw.loc = {
            en: Object.assign({}, raw.loc.en.gene_version, {
              type: raw.loc && raw.loc.en ? raw.loc.en.type : undefined,
            }),
          };
        }
        var geneNorm = normalizeSkillFn(geneRaw);
        if (geneNorm && geneNorm.id) {
          var geneEntry = scoreSkill(geneNorm, w);
          geneEntry.skillId = String(geneNorm.id);
          if (!byId.has(geneEntry.skillId)) byId.set(geneEntry.skillId, geneEntry);
          if (geneEntry.normalizedName && !byName.has(geneEntry.normalizedName)) {
            byName.set(geneEntry.normalizedName, geneEntry);
          }
        }
      }
    });

    return { byId: byId, byName: byName };
  }

  return {
    DEFAULT_SCORING_WEIGHTS: DEFAULT_SCORING_WEIGHTS,
    scoreSkill: scoreSkill,
    scoreAllSkills: scoreAllSkills,
    markerFromScore: markerFromScore,
    generateExplanation: generateExplanation,
  };
});
