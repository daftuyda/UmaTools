// Each provider publishes only after its complete staging pipeline validates.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const OUTPUTS = {
  gametora: [
    'skills_all.json',
    'skills_core.json',
    'uma_data.json',
    'support_card.json',
    'support_hints.json',
    'races.json',
    'accel_skills_compat.json',
  ],
  gamewith: ['uma_skills.csv', 'uma_skills_jp.csv'],
  master: [
    'master/global.json',
    'master/global-core.json',
    'master/jp-core.json',
    'accel_skills_compat.json',
  ],
};

function validate(source, previous, files) {
  for (const file of files) {
    const raw = fs.readFileSync(path.join(source, file), 'utf8');
    let count, oldCount;
    const old = fs.existsSync(path.join(previous, file))
      ? fs.readFileSync(path.join(previous, file), 'utf8')
      : null;
    if (file.endsWith('.json')) {
      const value = JSON.parse(raw),
        prior = old ? JSON.parse(old) : null;
      count = (Array.isArray(value) ? value : value.skills)?.length;
      oldCount = (Array.isArray(prior) ? prior : prior?.skills)?.length;
    } else {
      const parse = require('../../public/js/skill-data.js').parseCSV;
      count = parse(raw).length - 1;
      oldCount = old ? parse(old).length - 1 : 0;
    }
    if (!count || (oldCount && count < oldCount * 0.7))
      throw new Error(
        `Refusing empty or sharply reduced dataset: ${file} (${oldCount || 0} -> ${count})`
      );
  }
}

function refresh(provider) {
  if (!OUTPUTS[provider]) throw new Error('Choose gametora, gamewith or master');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'umatools-refresh-'));
  function run(command, args) {
    const result = spawnSync(command, args, { cwd: stage, stdio: 'inherit' });
    if (result.error || result.status !== 0)
      throw new Error(`${command} failed: ${result.error || result.status}`);
  }
  const node = (...args) => run(process.execPath, args);
  const python = (...args) => run(process.env.PYTHON || 'python', args);
  try {
    for (const dir of ['scripts', 'public/js', 'public/assets'])
      fs.cpSync(path.join(ROOT, dir), path.join(stage, dir), { recursive: true });
    if (provider === 'gametora') {
      node('scripts/data/gametora.js', '--what', 'all', '--server', 'global');
      node('scripts/build/generate-skills-core.js');
    } else if (provider === 'gamewith') node('scripts/data/gamewith-skills.js');
    else {
      python('scripts/data/download-master.py');
      node('scripts/build/generate-master-core.js');
    }
    if (provider !== 'gamewith')
      python('scripts/data/generate-accel-compat.py', '--mdb', 'public/assets/master/jp.json');
    const stagedAssets = path.join(stage, 'public/assets'),
      assets = path.join(ROOT, 'public/assets');
    const files = [...OUTPUTS[provider]];
    // Keep referenced thumbnails with the catalog that introduces them.
    if (provider === 'gametora')
      for (const dir of ['character_thumbs', 'support_thumbs']) {
        for (const file of fs.readdirSync(path.join(stagedAssets, dir)))
          files.push(`${dir}/${file}`);
      }
    validate(stagedAssets, assets, OUTPUTS[provider]);
    const backups = new Map();
    try {
      for (const file of files) {
        const target = path.join(assets, file),
          content = fs.readFileSync(path.join(stagedAssets, file));
        const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
        if (old?.equals(content)) continue;
        backups.set(target, old);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target + '.refresh-tmp', content);
        fs.renameSync(target + '.refresh-tmp', target);
      }
    } catch (error) {
      for (const [file, old] of backups) {
        if (old) fs.writeFileSync(file, old);
        else fs.rmSync(file, { force: true });
        fs.rmSync(file + '.refresh-tmp', { force: true });
      }
      throw error;
    }
    console.log(`${provider}: validated and published ${backups.size} changed files`);
  } finally {
    // mkdtemp created this exact task-owned directory; never accept a user path here.
    fs.rmSync(stage, { recursive: true, force: true });
  }
}
if (require.main === module) {
  try {
    if (process.argv[2] === 'all') {
      let successes = 0;
      for (const provider of ['gametora', 'gamewith', 'master']) {
        try {
          refresh(provider);
          successes += 1;
        } catch (error) {
          console.error(`${provider}: retaining previous data: ${error.message}`);
        }
      }
      if (!successes) throw new Error('Every provider failed');
    } else refresh(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { validate, OUTPUTS };
