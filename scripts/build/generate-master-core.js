const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../public/assets/master');
for (const server of ['global', 'jp']) {
  const data = JSON.parse(fs.readFileSync(path.join(root, `${server}.json`), 'utf8'));
  const skills = data.skills.map(({ id, name, grade_value, need_skill_point }) => ({
    id,
    name,
    grade_value,
    need_skill_point,
  }));
  fs.writeFileSync(
    path.join(root, `${server}-core.json`),
    JSON.stringify({ ...data, skills }) + '\n'
  );
}
