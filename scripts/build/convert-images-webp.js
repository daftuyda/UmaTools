#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const DEFAULT_INPUT_DIR = path.join(__dirname, '..', '..', 'public', 'assets');
const DEFAULT_QUALITY = 85;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    inputDir: DEFAULT_INPUT_DIR,
    quality: DEFAULT_QUALITY,
    recursive: true,
    dryRun: false,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input-dir') opts.inputDir = argv[++i];
    else if (arg === '--quality') opts.quality = parseInt(argv[++i], 10);
    else if (arg === '--no-recursive') opts.recursive = false;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--overwrite') opts.overwrite = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/build/convert-images-webp.js [options]',
      '',
      'Options:',
      '  --input-dir <path>    Directory to search for images (default: public/assets)',
      '  --quality <number>    WebP quality 0-100 (default: 85)',
      '  --no-recursive        Only convert images in input directory (not subdirs)',
      '  --dry-run             Show what would be converted without converting',
      '  --overwrite           Overwrite existing WebP files',
      '  --help, -h            Show this help message',
    ].join('\n')
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Find all PNG/JPG/JPEG files in a directory
 */
function findImages(dirPath, recursive = true) {
  const images = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && recursive) {
      images.push(...findImages(fullPath, recursive));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        images.push(fullPath);
      }
    }
  }

  return images;
}

// ---------------------------------------------------------------------------
// Image conversion
// ---------------------------------------------------------------------------

/**
 * Convert a single image to WebP format
 */
async function convertToWebP(inputPath, quality, dryRun = false, overwrite = false) {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const basename = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${basename}.webp`);

  // Skip if WebP already exists and not overwriting
  if (!overwrite && fs.existsSync(outputPath)) {
    return { status: 'skipped', reason: 'exists', outputPath };
  }

  if (dryRun) {
    return { status: 'would convert', outputPath };
  }

  try {
    ensureDir(dir);
    await sharp(inputPath)
      .webp({ quality })
      .toFile(outputPath);

    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const savings = ((1 - outputSize / inputSize) * 100).toFixed(1);

    return {
      status: 'converted',
      outputPath,
      inputSize,
      outputSize,
      savings: `${savings}%`,
    };
  } catch (err) {
    return {
      status: 'error',
      outputPath,
      error: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(opts.inputDir)) {
    console.error(`Error: Input directory does not exist: ${opts.inputDir}`);
    process.exit(1);
  }

  console.log('Image conversion settings:');
  console.log(`  Input directory: ${opts.inputDir}`);
  console.log(`  Quality: ${opts.quality}`);
  console.log(`  Recursive: ${opts.recursive}`);
  console.log(`  Dry run: ${opts.dryRun}`);
  console.log(`  Overwrite: ${opts.overwrite}`);
  console.log('');

  const images = findImages(opts.inputDir, opts.recursive);
  console.log(`Found ${images.length} images to process\n`);

  if (images.length === 0) {
    console.log('No images found.');
    return;
  }

  let converted = 0;
  let skipped = 0;
  let errors = 0;
  let totalSavings = 0;
  let totalInputSize = 0;
  let totalOutputSize = 0;

  for (const imagePath of images) {
    const relativePath = path.relative(opts.inputDir, imagePath);
    const result = await convertToWebP(imagePath, opts.quality, opts.dryRun, opts.overwrite);

    if (result.status === 'converted') {
      converted += 1;
      totalInputSize += result.inputSize;
      totalOutputSize += result.outputSize;
      totalSavings += result.inputSize - result.outputSize;
      console.log(`✓ ${relativePath} → ${result.savings} smaller`);
    } else if (result.status === 'would convert') {
      converted += 1;
      console.log(`• ${relativePath} → ${result.outputPath}`);
    } else if (result.status === 'skipped') {
      skipped += 1;
      console.log(`- ${relativePath} (already exists)`);
    } else if (result.status === 'error') {
      errors += 1;
      console.error(`✗ ${relativePath}: ${result.error}`);
    }
  }

  console.log('');
  console.log('Summary:');
  if (opts.dryRun) {
    console.log(`  Would convert: ${converted}`);
  } else {
    console.log(`  Converted: ${converted}`);
    if (converted > 0) {
      const avgSavings = ((1 - totalOutputSize / totalInputSize) * 100).toFixed(1);
      console.log(`  Total savings: ${(totalSavings / 1024 / 1024).toFixed(2)} MB (${avgSavings}%)`);
    }
  }
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);

  if (errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
