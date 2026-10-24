/* Offline calibration: node scripts/data/calibrate-team-trials.js --sim PATH --engine EXE [--seeds 32] [--workers 4] */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const readline = require('readline');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const arg = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const sim = path.resolve(arg('--sim', '../GlobalSim'));
const engine = path.resolve(
  arg('--engine', path.join(sim, 'target/release/race_engine_rs_v2.exe'))
);
const seeds = Number(arg('--seeds', 32));
const workerCount = Number(arg('--workers', 4));
const audit = args.includes('--audit');
const isolated = audit || args.includes('--isolated');
if (audit && !args.includes('--out'))
  throw Error('--audit requires an explicit scratch --out path.');
if (
  !Number.isInteger(seeds) ||
  seeds < 8 ||
  seeds % 4 ||
  !Number.isInteger(workerCount) ||
  workerCount < 1 ||
  workerCount > 32
)
  throw Error('Use seeds divisible by four (>=8) and 1-32 workers.');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pool = read(path.join(root, 'public/assets/team-trials-tracks.json'));
const courses = read(path.join(sim, 'data/course_data.json'));
const example = read(path.join(sim, 'examples/v76-race.jsonl'));
const table = example.skillData;
const raw = read(path.join(root, 'public/assets/skills_all.json'));
const styles = ['front', 'pace', 'late', 'end'];
const strategies = ['Nige', 'Senkou', 'Sasi', 'Oikomi'];
const signature = (s) =>
  JSON.stringify(
    (s.loc?.en?.condition_groups?.length
      ? s.loc.en.condition_groups
      : s.condition_groups || []
    ).map((g) => [g.precondition || '', g.condition || ''])
  );
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const candidates = raw.filter((s) => s.loc?.en && [1, 2].includes(s.rarity) && table[s.id]);
const staticKeys = new Set([
  'always',
  'track_id',
  'course_id',
  'race_track_id',
  'course_distance',
  'distance_type',
  'ground_type',
  'rotation',
  'is_basis_distance',
  'running_style',
  'season',
  'weather',
  'ground_condition',
]);
function matches(text, values) {
  if (!text) return true;
  return text.split('@').some((or) =>
    or.split('&').every((atom) => {
      const m = atom.trim().match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
      if (!m || !(m[1] in values)) throw Error('Unsupported static expression: ' + atom);
      const a = values[m[1]],
        b = Number(m[3]);
      return { '==': a === b, '!=': a !== b, '>=': a >= b, '<=': a <= b, '>': a > b, '<': a < b }[
        m[2]
      ];
    })
  );
}
function isStatic(s) {
  return table[s.id].alternatives.every((a) =>
    [a.condition, a.precondition].every(
      (t) =>
        !t ||
        t.split(/[@&]/).every((atom) => {
          const m = atom.trim().match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(-?\d+)$/);
          return m && staticKeys.has(m[1]);
        })
    )
  );
}
function exactRate(skill, category, style) {
  let rate = 0;
  for (const row of pool.categories[category])
    for (const courseId of row.courseIds) {
      const c = courses[courseId];
      for (const [season, ps] of Object.entries(pool.conditions.season))
        for (const [weather, pw] of Object.entries(pool.conditions.weather))
          for (const [ground, pg] of Object.entries(pool.conditions.groundCondition)) {
            const v = {
              always: 1,
              track_id: c.raceTrackId,
              race_track_id: c.raceTrackId,
              course_id: courseId,
              course_distance: c.distance,
              distance_type: c.distanceType,
              ground_type: c.surface,
              rotation: c.turn,
              is_basis_distance: Number(c.distance % 400 === 0),
              running_style: style + 1,
              season: ['Spring', 'Summer', 'Autumn', 'Winter'].indexOf(season) + 1,
              weather: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'].indexOf(weather) + 1,
              ground_condition: ['Good', 'Yielding', 'Soft', 'Heavy'].indexOf(ground) + 1,
            };
            if (
              table[skill.id].alternatives.some(
                (a) => matches(a.condition, v) && matches(a.precondition, v)
              )
            )
              rate += (ps * pw * pg) / pool.categories[category].length / row.courseIds.length;
          }
    }
  return Math.max(0, Math.min(1, rate));
}
const dynamic = candidates.filter((s) => !isStatic(s));
const results = {};
for (const s of candidates) {
  results[s.id] = {
    name: s.loc?.en?.name_en || s.name_en || s.enname,
    signature: signature(s),
    wisdomGated: !!table[s.id].wisdomCheck,
    contexts: {},
  };
  for (const category of Object.keys(pool.categories)) {
    results[s.id].contexts[category] = {};
    for (let style = 0; style < 4; style++)
      results[s.id].contexts[category][styles[style]] = isStatic(s)
        ? { rate: exactRate(s, category, style), samples: 0, source: 'course-enumeration' }
        : { hits: 0, samples: 0, byCourse: {}, byScenario: {} };
  }
}
const background = ['200332', '200362', '200352'];
function random(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
function pick(rng, rates) {
  let r = rng();
  for (const [key, p] of Object.entries(rates)) {
    r -= p;
    if (r < 0) return key;
  }
  return Object.keys(rates).at(-1);
}
const jobs = [];
for (const [category, rows] of Object.entries(pool.categories))
  for (const row of rows)
    for (let offset = 0; offset < dynamic.length; offset += 12)
      for (let rotation = 0; rotation < 4; rotation++)
        for (let scenario = 0; scenario < 4; scenario++)
          jobs.push({
            category,
            courseId: row.courseIds[0],
            offset,
            rotation,
            scenario,
            index: jobs.length,
          });
if (audit) {
  for (let i = jobs.length - 1; i >= 0; i--)
    if (![0, 120, 288].includes(jobs[i].offset)) jobs.splice(i, 1);
}
let next = 0,
  completed = 0,
  raceCount = 0;
const started = Date.now();
const output = path.resolve(
  arg('--out', path.join(root, 'public/assets/team-trials-calibration.json'))
);
function interval(h, n) {
  const z = 1.96,
    p = h / n,
    d = 1 + (z * z) / n,
    m = (p + (z * z) / (2 * n)) / d,
    e = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [m - e, m + e];
}
class Worker {
  constructor() {
    this.child = spawn(engine, [], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    this.pending = null;
    this.stderr = '';
    this.child.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d).slice(-10000);
    });
    readline.createInterface({ input: this.child.stdout }).on('line', (line) => {
      try {
        const value = JSON.parse(line);
        if (value.error) throw Error(value.error);
        if (!this.pending) throw Error('Unexpected reply');
        this.pending.rows.push(value);
        if (this.pending.rows.length === this.pending.count) {
          const p = this.pending;
          this.pending = null;
          p.resolve(p.rows);
        }
      } catch (e) {
        this.pending?.reject(e);
        this.pending = null;
      }
    });
    this.child.on('error', (e) => {
      this.pending?.reject(e);
      this.pending = null;
    });
    this.child.on('exit', (code) => {
      this.pending?.reject(Error('Engine exited ' + code + ': ' + this.stderr));
      this.pending = null;
    });
  }
  run(request) {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, count: request.seeds.length, rows: [] };
      this.child.stdin.write(JSON.stringify(request) + '\n');
    });
  }
  close() {
    this.child.stdin.end();
  }
}
const workers = [];
const recoveries = [];
async function workerLoop() {
  let worker = new Worker();
  let workerJobs = 0;
  workers.push(worker);
  while (next < jobs.length) {
    const job = jobs[next++],
      rng = random(20261024 + job.index * 997),
      chunk = dynamic.slice(job.offset, job.offset + 12);
    const assignments = Array.from({ length: 12 }, (_, i) => chunk[i] || null);
    const horses = assignments.map((s, i) => {
      const style = (i + job.rotation) % 4,
        delta = [-140, -50, 50, 140][job.scenario] * ((i % 3) - 1);
      return {
        speed: 1200 + delta,
        stamina: job.category === 'long' ? 1100 : job.category === 'medium' ? 900 : 650,
        power: 1100 + delta / 2,
        guts: 800,
        wisdom: 900,
        strategy: strategies[style],
        distanceAptitude: 'A',
        surfaceAptitude: 'A',
        strategyAptitude: 'A',
        mood: 0,
        gateIndex: (i + job.scenario * 3) % 12,
        popularity: i + 1,
        teamId: i < 3 ? 1 : i < 6 ? 2 : 0,
        skills: [
          ...background.filter((id) => !s || Math.floor(Number(id) / 10) !== Math.floor(s.id / 10)),
          ...(s ? [String(s.id)] : []),
        ],
      };
    });
    const used = new Set(horses.flatMap((h) => h.skills));
    const request = {
      ...example,
      skillData: Object.fromEntries([...used].map((id) => [id, { ...table[id], wisdomCheck: 0 }])),
      courseId: job.courseId,
      horses,
      wisdomChecks: false,
      retainAllFrames: false,
      omitFrames: true,
      threads: 1,
      weather: pick(rng, pool.conditions.weather),
      season: pick(rng, pool.conditions.season),
      groundCondition: pick(rng, pool.conditions.groundCondition),
      seeds: Array.from({ length: seeds / 4 }, (_, i) => 20261024 + job.index * (seeds / 4) + i),
    };
    let replies;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        replies = await worker.run(request);
        break;
      } catch (error) {
        fs.mkdirSync(path.join(root, '.tmp-team-trials'), { recursive: true });
        fs.writeFileSync(
          path.join(root, '.tmp-team-trials', 'failed-request-' + job.index + '.json'),
          JSON.stringify(request)
        );
        recoveries.push({ job: job.index, courseId: job.courseId, attempt, error: String(error) });
        console.error('Retrying exact batch', job.index, 'attempt', attempt + 1, String(error));
        worker.child.kill();
        if (attempt === 2) throw error;
        worker = new Worker();
        workers.push(worker);
        workerJobs = 0;
      }
    }
    if (++workerJobs >= (isolated ? 1 : 250)) {
      worker.close();
      worker = new Worker();
      workers.push(worker);
      workerJobs = 0;
    }
    for (const reply of replies) {
      if (reply.frames || !Array.isArray(reply.skillEvents) || reply.results?.length !== 12)
        throw Error('Engine lacks required batch/results-only event contract');
      const activated = new Set(reply.skillEvents.map((e) => e.horseIndex + ':' + e.skillId));
      assignments.forEach((s, i) => {
        if (!s) return;
        const cell = results[s.id].contexts[job.category][styles[(i + job.rotation) % 4]];
        const hit = Number(activated.has(i + ':' + s.id));
        cell.samples++;
        cell.hits += hit;
        const course = (cell.byCourse[job.courseId] ||= [0, 0]);
        course[0] += hit;
        course[1]++;
        const scenario = (cell.byScenario[job.scenario] ||= [0, 0]);
        scenario[0] += hit;
        scenario[1]++;
      });
    }
    raceCount += replies.length;
    completed++;
    completedJobs.push(job.index);
    if (completed % 500 === 0)
      fs.writeFileSync(
        checkpoint,
        JSON.stringify({ key: checkpointKey, results, completedJobs, raceCount, recoveries })
      );
    if (completed % 500 === 0)
      console.log(
        JSON.stringify({
          completed,
          total: jobs.length,
          races: raceCount,
          seconds: Math.round((Date.now() - started) / 1000),
        })
      );
  }
  worker.close();
}
const checkpoint = path.join(
  root,
  '.tmp-team-trials',
  audit
    ? 'calibration-audit-checkpoint.json'
    : isolated
      ? 'calibration-isolated-checkpoint.json'
      : 'calibration-ungated-checkpoint.json'
);
const checkpointKey =
  sha(engine) +
  sha(path.join(root, 'public/assets/team-trials-tracks.json')) +
  sha(path.join(root, 'public/assets/skills_all.json')) +
  seeds +
  ':explicit-ungated-v1';
const completedJobs = [];
async function main() {
  fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
  if (fs.existsSync(checkpoint)) {
    const saved = read(checkpoint);
    if (saved.key !== checkpointKey)
      throw Error(
        'Checkpoint inputs changed; choose a fresh scratch directory or remove the stale checkpoint.'
      );
    Object.assign(results, saved.results);
    completedJobs.push(...saved.completedJobs);
    raceCount = saved.raceCount;
    recoveries.push(...saved.recoveries);
    const done = new Set(completedJobs);
    for (let i = jobs.length - 1; i >= 0; i--) if (done.has(jobs[i].index)) jobs.splice(i, 1);
  }
  const preflight = new Worker();
  workers.push(preflight);
  for (const courseId of [10504, 10301]) {
    const request = {
      ...example,
      courseId,
      wisdomChecks: false,
      omitFrames: true,
      retainAllFrames: false,
      threads: 1,
      skillData: Object.fromEntries(
        ['200332', '200362'].map((id) => [id, { ...table[id], wisdomCheck: 0 }])
      ),
      horses: Array.from({ length: 12 }, (_, i) => ({
        ...example.horses[0],
        strategy: strategies[i % 4],
        gateIndex: i,
        skills: ['200332', '200362'],
      })),
      seeds: Array.from({ length: 64 }, (_, i) => 700000 + i),
    };
    const replies = await preflight.run(request);
    for (const reply of replies) {
      if (reply.frames) throw Error('Engine does not support results-only batches');
      const straight = new Set(
        reply.skillEvents.filter((e) => String(e.skillId) === '200362').map((e) => e.horseIndex)
      );
      const corner = new Set(
        reply.skillEvents.filter((e) => String(e.skillId) === '200332').map((e) => e.horseIndex)
      );
      if (straight.size !== 12 || corner.size !== (courseId === 10301 ? 0 : 12))
        throw Error('Lottery/geometry preflight failed');
    }
  }
  preflight.close();
  console.log('Lottery and cornerless-course preflight passed (128 races).');
  console.log(
    JSON.stringify({
      skills: candidates.length,
      dynamic: dynamic.length,
      jobs: jobs.length,
      races: (jobs.length * seeds) / 4,
    })
  );
  try {
    await Promise.all(Array.from({ length: workerCount }, workerLoop));
  } catch (e) {
    workers.forEach((w) => w.child.kill());
    throw e;
  }
  for (const skill of Object.values(results))
    for (const contexts of Object.values(skill.contexts))
      for (const cell of Object.values(contexts)) {
        if (cell.source) continue;
        cell.rate = cell.hits / cell.samples;
        cell.interval95 = interval(cell.hits, cell.samples);
        cell.source = 'globalsim';
        cell.scenarioRange = Object.values(cell.byScenario)
          .map(([h, n]) => h / n)
          .sort((a, b) => a - b)
          .filter((_, i, a) => i === 0 || i === a.length - 1);
        delete cell.byScenario;
      }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: sim,
    encoding: 'utf8',
  }).trim();
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    method: {
      engine: 'GlobalSim',
      revision,
      sourceWorktreeStatus: execFileSync('git', ['status', '--short'], {
        cwd: sim,
        encoding: 'utf8',
      }).trim(),
      sourceDiffSha256: crypto
        .createHash('sha256')
        .update(execFileSync('git', ['diff'], { cwd: sim }))
        .digest('hex'),
      workerRecoveries: recoveries,
      workerIsolation: isolated ? 'fresh process per batch' : 'restart every 250 batches',
      auditSubset: audit,
      engineSha256: sha(engine),
      skillTableSha256: crypto.createHash('sha256').update(JSON.stringify(table)).digest('hex'),
      poolSha256: sha(path.join(root, 'public/assets/team-trials-tracks.json')),
      seedsPerCourse: seeds,
      races: raceCount,
      skills: candidates.length,
      fieldSize: 12,
      wisdomChecks: false,
      lotteryOverride:
        'wisdomCheck=0 on every calibration definition; original flags retained for optimizer',
      backgroundSkills: background,
      stats:
        'Speed 1200 +/-140; power 1100 +/-70; guts 800; wisdom 900; stamina 650/900/1100 by distance; mood 0; A aptitudes.',
      limitations: [
        'Illustrative balanced field: three runners per style, rotating gates and four relative-strength scenarios. Not an empirical opponent distribution.',
        'One tested skill per runner plus three background skills; deck-dependent activation rates are conditional on this baseline.',
        'Weather, ground and season sampled independently from workbook marginals; joint observations were not supplied.',
        'Wilson intervals describe Monte Carlo sampling only; they do not measure simulator fidelity or opponent-model uncertainty.',
        'Pool rows are equally weighted, not inferred occurrence frequencies.',
      ],
    },
    skills: results,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result) + '\n');
  console.log(
    JSON.stringify({
      done: true,
      races: raceCount,
      seconds: Math.round((Date.now() - started) / 1000),
      output,
    })
  );
}
if (require.main === module)
  main().catch((e) => {
    workers.forEach((worker) => worker.child.kill());
    console.error(e);
    process.exitCode = 1;
  });
