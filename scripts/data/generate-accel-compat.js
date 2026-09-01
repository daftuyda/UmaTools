#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'generate-accel-compat.py');
const args = [scriptPath, ...process.argv.slice(2)];

const pythonCmd = process.env.PYTHON || 'python';
const result = spawnSync(pythonCmd, args, { stdio: 'inherit' });

if (result.error) {
  console.error(
    `[accel-compat] Failed to launch Python (${pythonCmd}). ` +
      'Install Python 3 or set the PYTHON environment variable.'
  );
  console.error(`[accel-compat] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
