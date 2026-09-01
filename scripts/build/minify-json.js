const fs = require('fs');
const path = require('path');

// Categorize skill based on iconid
function categorizeSkill(skill) {
  const iconid = skill.iconid;

  // Evo skills - iconid >= 1010000
  if (iconid >= 1010000) return 'evo';

  // Main skills are 20xxx range
  if (iconid >= 20000 && iconid < 30000) {
    const tensDigit = Math.floor((iconid % 100) / 10);
    const lastDigit = iconid % 10;

    // x1x = speed/acceleration
    if (tensDigit === 1) {
      // Last digit 1 or 3 = golden (unique/gold versions)
      if (lastDigit === 1 || lastDigit === 3) return 'golden';
      // Others = blue (normal versions)
      return 'blue';
    }

    // x2x = stamina/recovery = green
    if (tensDigit === 2) return 'green';

    // x3x, x4x, x9x = debuff/gate = red
    if (tensDigit === 3 || tensDigit === 4 || tensDigit === 9) return 'red';

    // x5x, x6x = other green/stamina types
    if (tensDigit === 5 || tensDigit === 6) return 'green';

    // Default for 20xxx
    return 'blue';
  }

  // Other ranges - not categorized into chunks
  return null;
}

// Split skills_all.json into category chunks
function splitSkillsFile() {
  const skillsPath = path.join(__dirname, '..', '..', 'public', 'assets', 'skills_all.json');
  if (!fs.existsSync(skillsPath)) {
    console.log('skills_all.json: skipped (not found)');
    return;
  }

  const allSkills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
  const categories = {
    golden: [],
    blue: [],
    green: [],
    red: [],
    evo: []
  };

  allSkills.forEach(skill => {
    const cat = categorizeSkill(skill);
    if (cat && categories[cat]) {
      categories[cat].push(skill);
    }
  });

  let totalAfter = 0;

  Object.entries(categories).forEach(([cat, skills]) => {
    const filename = `skills_${cat}.json`;
    const filepath = path.join(__dirname, '..', '..', 'public', 'assets', filename);
    const content = JSON.stringify(skills);
    fs.writeFileSync(filepath, content);
    const size = fs.statSync(filepath).size;
    totalAfter += size;
    console.log(`${filename}: ${skills.length} skills, ${size} bytes`);
  });

  const beforeSize = fs.statSync(skillsPath).size;

  console.log(`\nskills_all.json: ${beforeSize} bytes`);
  console.log(`Total chunks: ${totalAfter} bytes`);
  console.log(`Skills categorized: ${Object.values(categories).reduce((sum, arr) => sum + arr.length, 0)} / ${allSkills.length}`);
}

// Minify other JSON files
const files = ['support_hints.json', 'uma_data.json', 'support_card.json', 'races.json'];

console.log('=== Splitting skills_all.json ===');
splitSkillsFile();

console.log('\n=== Minifying other files ===');
for (const file of files) {
  const p = path.join(__dirname, '..', '..', 'public', 'assets', file);
  if (!fs.existsSync(p)) {
    console.log(`${file}: skipped (not found)`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = fs.statSync(p).size;
  fs.writeFileSync(p, JSON.stringify(data));
  const after = fs.statSync(p).size;
  const pct = Math.round((1 - after / before) * 100);
  console.log(`${file}: ${before} -> ${after} (${pct}% reduction)`);
}
