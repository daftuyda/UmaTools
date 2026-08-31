const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── Sprite coordinate maps (mirrored from js/rating-shared.js) ──────────────

const BASE_GAME_RANK_SPRITE_MAP = {
  G: { x: 7, y: 1893, w: 148, h: 149 },
  'G+': { x: 7, y: 1735, w: 148, h: 149 },
  F: { x: 7, y: 1577, w: 148, h: 149 },
  'F+': { x: 7, y: 1419, w: 148, h: 149 },
  E: { x: 7, y: 1261, w: 148, h: 149 },
  'E+': { x: 7, y: 1103, w: 148, h: 149 },
  D: { x: 7, y: 945, w: 148, h: 149 },
  'D+': { x: 7, y: 787, w: 148, h: 149 },
  C: { x: 7, y: 629, w: 148, h: 149 },
  'C+': { x: 7, y: 471, w: 148, h: 149 },
  B: { x: 7, y: 313, w: 148, h: 149 },
  'B+': { x: 165, y: 471, w: 148, h: 149 },
  A: { x: 323, y: 629, w: 148, h: 149 },
  'A+': { x: 481, y: 787, w: 148, h: 149 },
  S: { x: 639, y: 945, w: 148, h: 150 },
  'S+': { x: 797, y: 1103, w: 148, h: 149 },
  SS: { x: 954, y: 1261, w: 149, h: 150 },
  'SS+': { x: 1112, y: 1419, w: 149, h: 149 },
};

const HIGH_RANK_SPRITE_GRID = {
  UG: [[10,8],[11,9],[12,10],[1,10],[2,11],[3,12],[12,21],[4,13],[11,21],[3,14]],
  UF: [[10,23],[9,16],[8,16],[7,16],[6,16],[5,16],[4,16],[3,16],[2,16],[1,16]],
  UE: [[8,17],[8,18],[8,19],[8,20],[8,21],[8,22],[8,23],[8,24],[7,17],[6,17]],
  UD: [[5,17],[4,17],[3,17],[2,17],[1,17],[7,18],[7,19],[7,20],[7,21],[7,22]],
  UC: [[7,23],[7,24],[6,18],[5,18],[4,18],[3,18],[2,18],[1,18],[6,19],[6,20]],
  UB: [[6,21],[6,22],[6,23],[6,24],[5,19],[4,19],[3,19],[2,19],[1,19],[5,20]],
  UA: [[5,21],[5,22],[5,23],[5,24],[4,20],[3,20],[2,20],[1,20],[4,21],[4,22]],
  US: [[4,23],[4,24],[3,21],[2,21],[1,21],[3,22],[3,23],[3,24],[2,22],[1,22]],
  LG: [[2,23],[2,24],[1,0],[12,1],[11,1],[10,1],[9,1],[8,1],[7,1],[6,1],[5,1],[4,1],[2,1],[1,1],[12,2],[11,2],[10,2],[9,2],[8,2],[7,2],[6,2],[5,2],[3,2],[2,2],[1,2]],
  LF: [[12,3],[11,3],[10,3],[9,3],[8,3],[7,3],[6,3],[4,3],[3,3],[2,3],[1,3],[12,4],[11,4],[10,4],[9,4],[8,4],[7,4],[5,4],[4,4],[3,4],[2,4],[1,4],[12,5],[11,5],[10,5]],
  LE: [[9,5],[8,5],[6,5],[5,5],[4,5],[3,5],[2,5],[1,5],[12,6],[11,6],[10,6],[9,6],[7,6],[6,6],[5,6],[4,6],[3,6],[2,6],[1,6],[12,7],[11,7],[10,7],[8,7],[7,7],[6,7]],
  LD: [[5,7],[4,7],[3,7],[2,7],[1,7],[12,8],[11,8],[9,8],[8,8],[7,8],[6,8],[5,8],[4,8],[3,8],[2,8],[1,8],[12,9],[10,9],[9,9],[8,9],[7,9],[6,9],[5,9],[4,9],[3,9]],
  LC: [[1,9],[1,11],[11,10],[10,10],[9,10],[8,10],[7,10],[6,10],[5,10],[4,10],[3,10],[2,9],[12,11],[11,11],[10,11],[9,11],[8,11],[7,11],[6,11],[5,11],[4,11],[3,11],[2,10],[12,12],[11,12]],
  LB: [[10,12],[9,12],[8,12],[7,12],[6,12],[5,12],[4,12],[2,12],[1,12],[12,13],[12,14],[12,15],[12,16],[12,17],[12,18],[12,19],[12,20],[12,22],[12,23],[12,24],[11,13],[10,13],[9,13],[8,13],[7,13]],
  LA: [[6,13],[5,13],[3,13],[2,13],[1,13],[11,14],[11,15],[11,16],[11,17],[11,18],[11,19],[11,20],[11,22],[11,23],[11,24],[10,14],[9,14],[8,14],[7,14],[6,14],[5,14],[4,14],[2,14],[1,14],[10,15]],
  LS: [[10,16],[10,17],[10,18],[10,19],[10,20],[10,21],[10,22],[10,24],[9,15],[8,15],[7,15],[6,15],[5,15],[4,15],[3,15],[2,15],[1,15],[9,17],[9,18],[9,19],[9,20],[9,21],[9,22],[9,23],[9,24]],
};

const CELL_X = 6;
const CELL_Y = 155;
const CELL_STEP = 158;
const CELL_W = 150;
const CELL_H = 153;

// Build the full sprite map (same logic as rating-shared.js)
function buildSpriteMap() {
  const map = { ...BASE_GAME_RANK_SPRITE_MAP };
  for (const [family, cells] of Object.entries(HIGH_RANK_SPRITE_GRID)) {
    cells.forEach(([row, col], idx) => {
      const label = idx === 0 ? family : `${family}${idx}`;
      map[label] = {
        x: CELL_X + col * CELL_STEP,
        y: CELL_Y + (row - 1) * CELL_STEP,
        w: CELL_W,
        h: CELL_H,
      };
    });
  }
  return map;
}

// All 298 badge labels in rank order
const BADGE_LABELS = [
  'G','G+','F','F+','E','E+','D','D+','C','C+','B','B+','A','A+','S','S+','SS','SS+',
  ...['UG','UF','UE','UD','UC','UB','UA','US'].flatMap(f =>
    [f, ...Array.from({ length: 9 }, (_, i) => `${f}${i + 1}`)]
  ),
  ...['LG','LF','LE','LD','LC','LB','LA','LS'].flatMap(f =>
    [f, ...Array.from({ length: 24 }, (_, i) => `${f}${i + 1}`)]
  ),
];

async function main() {
  const root = path.join(__dirname, '..', '..');
  const spritePath = path.join(root, 'public', 'assets', 'Rank_tex.png');
  const outDir = path.join(root, 'badges');

  if (!fs.existsSync(spritePath)) {
    console.error(`Sprite sheet not found: ${spritePath}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const spriteMap = buildSpriteMap();
  const sprite = sharp(spritePath);
  const { width, height } = await sprite.metadata();
  console.log(`Sprite sheet: ${width}x${height}`);
  console.log(`Exporting ${BADGE_LABELS.length} badges to ${outDir}\n`);

  let exported = 0;
  let skipped = 0;

  for (const label of BADGE_LABELS) {
    const rect = spriteMap[label];
    if (!rect) {
      console.warn(`  SKIP ${label} (no sprite coordinates)`);
      skipped++;
      continue;
    }

    const outFile = path.join(outDir, `${label}.png`);
    await sharp(spritePath)
      .extract({ left: rect.x, top: rect.y, width: rect.w, height: rect.h })
      .toFile(outFile);

    exported++;
    if (exported % 50 === 0) {
      console.log(`  ...${exported} exported`);
    }
  }

  console.log(`\nDone: ${exported} exported, ${skipped} skipped`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
